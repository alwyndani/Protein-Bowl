import { ApiClient } from '../api/apiClient';
import { ApiError } from '../api/ApiError';
import { AuthState, CustomerUser, MobileSession, SignedOutReason, isCustomerOnly, parseSession, parseUser } from './authTypes';
import { SecureStorageError, SessionStorage } from './secureSession';

export interface SessionManagerOptions {
  storage: SessionStorage;
  baseUrl: string;
  clientHeader: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Called whenever the authenticated session ends: clear the query cache and any temporary state here. */
  onSessionCleared?: () => void;
}

export interface SignOutResult {
  /** The server confirmed the refresh token was revoked. When false the device session is STILL cleared. */
  serverConfirmed: boolean;
  /** The SecureStore credential was deleted. */
  localCleared: boolean;
}

const REASON_BY_CODE: Record<string, SignedOutReason> = {
  TOKEN_REUSED: 'session_revoked',
  TOKEN_INVALID: 'session_expired',
  TOKEN_REQUIRED: 'session_expired',
  ACCOUNT_INACTIVE: 'account_inactive',
  CUSTOMER_APP_ONLY: 'customer_only',
  APP_VERSION_UNSUPPORTED: 'update_required'
};

/**
 * Customer mobile session (P11A). Framework-free so it is fully unit-testable.
 *
 *  - the access token lives in MEMORY only; the refresh token is persisted ONLY in SecureStore (no fallback);
 *  - refresh is SINGLE-FLIGHT: concurrent callers share one request, so one refresh token is never sent twice in parallel;
 *  - the rotated refresh token is PERSISTED before the new access token is released to any waiting request;
 *  - an AMBIGUOUS refresh failure (timeout / lost connection / 5xx) is never replayed automatically: the server may already have
 *    rotated the token (replaying it would be TOKEN_REUSED, which revokes every session). The state becomes `recovery` and the
 *    user decides. There is no replay-grace behaviour anywhere;
 *  - sign-out always clears the device session, even if the server could not be reached.
 */
export class SessionManager {
  readonly api: ApiClient;
  private state: AuthState = { status: 'restoring' };
  private accessToken: string | null = null;
  private refreshInFlight: Promise<string> | null = null;
  private restoreInFlight: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly opts: SessionManagerOptions) {
    this.api = new ApiClient({
      baseUrl: opts.baseUrl,
      clientHeader: opts.clientHeader,
      timeoutMs: opts.timeoutMs,
      fetchImpl: opts.fetchImpl,
      getAccessToken: () => this.accessToken,
      refreshSession: () => this.refreshAccessToken()
    });
  }

  getState = (): AuthState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private setState(next: AuthState) {
    this.state = next;
    this.listeners.forEach((l) => l());
  }

  // ---------------------------------------------------------------- restoration

  /** App launch (and the recovery "try again" action): refresh the stored credential, fetch /auth/me, require CUSTOMER. */
  restore(): Promise<void> {
    if (!this.restoreInFlight) {
      this.restoreInFlight = this.doRestore().finally(() => {
        this.restoreInFlight = null;
      });
    }
    return this.restoreInFlight;
  }

  private async doRestore(): Promise<void> {
    this.setState({ status: 'restoring' });
    let stored;
    try {
      stored = await this.opts.storage.read();
    } catch {
      { await this.endSession('storage_unavailable'); return; }
    }
    if (!stored) { await this.endSession('none'); return; }
    if (Date.parse(stored.expiresAt) <= Date.now()) { await this.endSession('session_expired'); return; }

    try {
      await this.refreshAccessToken();
    } catch {
      return; // refreshAccessToken already moved to signedOut / recovery
    }

    let user: CustomerUser | null;
    try {
      user = parseUser((await this.api.request<{ user?: unknown }>('/auth/me')).user);
    } catch (e) {
      // The refresh succeeded and the rotated token is already persisted, so a later retry is safe.
      if (e instanceof ApiError && (e.ambiguous || e.status === 429)) {
        this.accessToken = null;
        this.setState({ status: 'recovery' });
        return;
      }
      if (this.state.status === 'signedOut') return;
      { await this.endSession('session_expired'); return; }
    }
    if (!user || !isCustomerOnly(user)) {
      await this.bestEffortServerLogout();
      { await this.endSession('customer_only'); return; }
    }
    this.setState({ status: 'signedIn', user });
  }

  // ------------------------------------------------------------------- refresh

  refreshAccessToken(): Promise<string> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.doRefresh().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  private async doRefresh(): Promise<string> {
    let stored;
    try {
      stored = await this.opts.storage.read();
    } catch (e) {
      await this.endSession('storage_unavailable');
      throw e;
    }
    if (!stored) {
      await this.endSession('session_expired');
      throw new ApiError('http', 401, 'TOKEN_REQUIRED');
    }

    let session: MobileSession | null;
    try {
      const data = await this.api.request<unknown>('/auth/mobile/refresh', { method: 'POST', body: { refreshToken: stored.refreshToken }, auth: false });
      session = parseSession(data);
      if (!session) throw new ApiError('malformed', 200, 'MALFORMED_RESPONSE');
    } catch (e) {
      if (e instanceof ApiError && !e.ambiguous && e.status !== 429) {
        // A definitive answer: the server rejected this session. End it locally.
        await this.endSession(REASON_BY_CODE[e.code] ?? 'session_expired');
      } else {
        // Ambiguous (timeout / network / 5xx / unreadable) or rate limited: DO NOT replay the same token automatically.
        this.accessToken = null;
        this.setState({ status: 'recovery' });
      }
      throw e;
    }

    // Persist the rotated token BEFORE the new access token is released to any waiting request.
    try {
      await this.opts.storage.write({ refreshToken: session.refreshToken, expiresAt: session.refreshTokenExpiresAt });
    } catch (e) {
      await this.serverLogout(session.refreshToken);
      await this.endSession('storage_unavailable');
      throw e;
    }
    this.accessToken = session.accessToken;
    return session.accessToken;
  }

  // ------------------------------------------------------------ sign in / up

  async signIn(email: string, password: string): Promise<void> {
    const data = await this.api.request<unknown>('/auth/mobile/login', { method: 'POST', body: { email, password }, auth: false });
    await this.establish(data);
  }

  async register(input: { email: string; password: string; fullName: string; phone?: string }): Promise<void> {
    const data = await this.api.request<unknown>('/auth/mobile/register', {
      method: 'POST',
      body: { email: input.email, password: input.password, fullName: input.fullName, ...(input.phone ? { phone: input.phone } : {}) },
      auth: false
    });
    await this.establish(data);
  }

  private async establish(data: unknown): Promise<void> {
    const session = parseSession(data);
    if (!session || !session.user) throw new ApiError('malformed', 200, 'MALFORMED_RESPONSE');
    if (!isCustomerOnly(session.user)) {
      await this.serverLogout(session.refreshToken);
      throw new ApiError('http', 403, 'CUSTOMER_APP_ONLY');
    }
    try {
      await this.opts.storage.write({ refreshToken: session.refreshToken, expiresAt: session.refreshTokenExpiresAt });
    } catch (e) {
      // Without secure storage the app refuses to hold a session: revoke the one just created and fail honestly.
      await this.serverLogout(session.refreshToken);
      throw e instanceof SecureStorageError ? e : new SecureStorageError();
    }
    this.accessToken = session.accessToken;
    this.setState({ status: 'signedIn', user: session.user });
  }

  // ------------------------------------------------------------------ sign out

  async signOut(): Promise<SignOutResult> {
    let stored = null;
    try {
      stored = await this.opts.storage.read();
    } catch {
      /* nothing readable to revoke */
    }
    let serverConfirmed = true;
    if (stored) {
      serverConfirmed = await this.serverLogout(stored.refreshToken);
    }
    const localCleared = await this.endSession(serverConfirmed ? 'none' : 'server_unconfirmed');
    return { serverConfirmed, localCleared };
  }

  /** Recovery screen action "Sign in again": drop the device session (best effort revoke) without further network replay of a refresh. */
  async abandonSession(): Promise<SignOutResult> {
    return this.signOut();
  }

  private async serverLogout(refreshToken: string): Promise<boolean> {
    try {
      await this.api.request('/auth/mobile/logout', { method: 'POST', body: { refreshToken }, auth: false });
      return true;
    } catch {
      return false;
    }
  }

  private async bestEffortServerLogout() {
    try {
      const stored = await this.opts.storage.read();
      if (stored) await this.serverLogout(stored.refreshToken);
    } catch {
      /* ignore */
    }
  }

  /** Clears every local trace of the session and moves to signed out. Returns whether the SecureStore credential was deleted. */
  private async endSession(reason: SignedOutReason): Promise<boolean> {
    this.accessToken = null;
    let cleared = true;
    try {
      await this.opts.storage.clear();
    } catch {
      cleared = false;
    }
    try {
      this.opts.onSessionCleared?.();
    } catch {
      /* a failing cleanup callback must never keep the session alive */
    }
    this.setState({ status: 'signedOut', reason });
    return cleared;
  }
}
