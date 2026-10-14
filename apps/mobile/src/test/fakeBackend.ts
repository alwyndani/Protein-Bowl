/**
 * In-memory stand-in for the backend's /auth/mobile/* + /auth/me + a protected probe route. It mirrors the REAL contract
 * (envelope shape, error codes, rotation, reuse detection) closely enough to exercise the client; the real server behaviour is
 * proven by the backend suite (server/src/tests/p11a*.test.ts). Test support only - never imported by production code.
 */
export interface FakeUser {
  id: string;
  email: string;
  password: string;
  roles: string[];
  fullName: string;
  status: 'ACTIVE' | 'SUSPENDED';
}

export interface LoggedRequest {
  path: string;
  method: string;
  headers: Record<string, string>;
  body: any;
  credentials?: string;
}

type Fault = 'timeout' | 'network' | number | 'hang' | { status: number; code: string };

export class FakeBackend {
  users = new Map<string, FakeUser>();
  refreshTokens = new Map<string, { userId: string; revoked: boolean }>();
  accessTokens = new Map<string, string>(); // access token -> userId
  log: LoggedRequest[] = [];
  protected counter = 0;
  protected faults = new Map<string, Fault[]>();
  /** Force the protected probe to answer 401 even for a valid token. */
  alwaysUnauthorized = false;
  /** Resolve hook letting a test hold a response (for ordering / concurrency). */
  delayMs = 0;

  addUser(partial: Partial<FakeUser> & { email: string }): FakeUser {
    const user: FakeUser = { id: `u${++this.counter}`, password: 'Password-123', roles: ['CUSTOMER'], fullName: 'Test Customer', status: 'ACTIVE', ...partial };
    this.users.set(user.email, user);
    return user;
  }

  protected gates = new Map<string, Array<Promise<void>>>();

  /** The NEXT request to `path` is received now but only PROCESSED (token checked, answered) when the returned function is called. */
  gateNext(path: string): () => void {
    let release!: () => void;
    const p = new Promise<void>((r) => (release = r));
    this.gates.set(path, [...(this.gates.get(path) ?? []), p]);
    return release;
  }

  failNext(path: string, ...faults: Fault[]) {
    this.faults.set(path, [...(this.faults.get(path) ?? []), ...faults]);
  }

  count(path: string): number {
    return this.log.filter((r) => r.path === path).length;
  }

  /** Make an access token expire (the server forgets it) without touching refresh tokens. */
  expireAccessTokens() {
    this.accessTokens.clear();
  }

  private issue(user: FakeUser) {
    const access = `access-${++this.counter}`;
    const refresh = `refresh-${++this.counter}-${'x'.repeat(40)}`;
    this.accessTokens.set(access, user.id);
    this.refreshTokens.set(refresh, { userId: user.id, revoked: false });
    return { accessToken: access, refreshToken: refresh, refreshTokenExpiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString() };
  }

  protected userView(u: FakeUser) {
    return { id: u.id, email: u.email, roles: u.roles, status: u.status, customerProfile: { fullName: u.fullName } };
  }

  protected respond(status: number, body: unknown, headers: Record<string, string> = {}) {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
      text: async () => text
    } as unknown as Response;
  }

  protected err(status: number, error: string, message = 'server message that must never be shown') {
    return this.respond(status, { success: false, error, message });
  }

  fetch = (url: string, init: RequestInit = {}): Promise<Response> => {
    const path = url.replace(/^https?:\/\/[^/]+\/api\/v1/, '');
    const headers: Record<string, string> = {};
    Object.entries((init.headers ?? {}) as Record<string, string>).forEach(([k, v]) => (headers[k] = v));
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    this.log.push({ path, method: init.method ?? 'GET', headers, body, credentials: init.credentials });

    const fault = this.faults.get(path)?.shift();
    const signal = init.signal as AbortSignal | undefined;
    const waitAbort = () =>
      new Promise<Response>((_res, rej) => {
        signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    if (fault === 'hang') return waitAbort();
    if (fault === 'timeout') return waitAbort();
    if (fault === 'network') return Promise.reject(new TypeError('Network request failed'));
    if (fault && typeof fault === 'object') return Promise.resolve(this.err(fault.status, fault.code));
    if (typeof fault === 'number') return Promise.resolve(fault >= 500 ? this.respond(fault, '<html>bad gateway</html>') : this.err(fault, 'FAULT'));

    const run = () => this.route(path, headers, body);
    const gate = this.gates.get(path)?.shift();
    if (gate) return gate.then(run); // processed only when released (deterministic ordering, no timers)
    return this.delayMs > 0 ? new Promise((r) => setTimeout(() => r(run()), this.delayMs)) : Promise.resolve(run());
  };

  protected bearer(headers: Record<string, string>): FakeUser | null {
    const h = headers.Authorization;
    if (!h?.startsWith('Bearer ')) return null;
    const id = this.accessTokens.get(h.slice(7));
    return id ? [...this.users.values()].find((u) => u.id === id) ?? null : null;
  }

  protected route(path: string, headers: Record<string, string>, body: any): Response {
    switch (path) {
      case '/auth/mobile/login': {
        const u = this.users.get(body.email);
        if (!u || u.password !== body.password) return this.err(401, 'INVALID_CREDENTIALS');
        if (u.status !== 'ACTIVE') return this.err(403, 'ACCOUNT_INACTIVE');
        if (!u.roles.every((r) => r === 'CUSTOMER')) return this.err(403, 'CUSTOMER_APP_ONLY');
        return this.respond(200, { success: true, data: { user: this.userView(u), ...this.issue(u) } });
      }
      case '/auth/mobile/register': {
        if (this.users.has(body.email)) return this.err(409, 'EMAIL_EXISTS');
        const u = this.addUser({ email: body.email, password: body.password, fullName: body.fullName });
        return this.respond(201, { success: true, data: { user: this.userView(u), ...this.issue(u) } });
      }
      case '/auth/mobile/refresh': {
        const rec = this.refreshTokens.get(body.refreshToken);
        if (!rec) return this.err(401, 'TOKEN_INVALID');
        if (rec.revoked) {
          this.refreshTokens.forEach((v) => {
            if (v.userId === rec.userId) v.revoked = true;
          });
          return this.err(401, 'TOKEN_REUSED');
        }
        const u = [...this.users.values()].find((x) => x.id === rec.userId)!;
        if (u.status !== 'ACTIVE') return this.err(401, 'ACCOUNT_INACTIVE');
        if (!u.roles.every((r) => r === 'CUSTOMER')) return this.err(403, 'CUSTOMER_APP_ONLY');
        rec.revoked = true;
        return this.respond(200, { success: true, data: this.issue(u) });
      }
      case '/auth/mobile/logout': {
        const rec = this.refreshTokens.get(body.refreshToken);
        if (rec) rec.revoked = true;
        return this.respond(200, { success: true, data: null });
      }
      case '/auth/me': {
        const u = this.bearer(headers);
        if (!u) return this.err(401, 'UNAUTHORIZED');
        return this.respond(200, { success: true, data: { user: this.userView(u) } });
      }
      case '/probe': {
        const u = this.bearer(headers);
        if (!u || this.alwaysUnauthorized) return this.err(401, 'UNAUTHORIZED');
        return this.respond(200, { success: true, data: { ok: true, userId: u.id } });
      }
      default:
        return this.err(404, 'NOT_FOUND');
    }
  }
}
