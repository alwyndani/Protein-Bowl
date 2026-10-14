import { ApiError } from './ApiError';

export interface ApiClientOptions {
  baseUrl: string;
  /** Value of the X-PB-Client contract header (identification + version gating only). */
  clientHeader: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Current in-memory access token, if any. */
  getAccessToken: () => string | null;
  /**
   * Single-flight session refresh. Resolves with the NEW access token, or rejects when the session could not be refreshed
   * (the session layer has then already moved to signed-out / recovery). Never called for auth endpoints.
   */
  refreshSession: () => Promise<string>;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Extra headers, e.g. x-idempotency-key for a future financial POST. */
  headers?: Record<string, string>;
  /** false for the mobile auth endpoints: no Bearer header and NEVER a refresh-and-retry (no recursion). */
  auth?: boolean;
}

export const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * The one typed mobile API client.
 *  - cookies are never used (credentials: 'omit'): the refresh token travels only in the body of /auth/mobile/*;
 *  - a 401 on an authenticated request triggers ONE single-flight refresh and AT MOST ONE retry of the original request;
 *  - nothing is retried automatically otherwise: a timeout / network failure surfaces as an ApiError the UI offers to retry by hand,
 *    so a non-idempotent request can never be silently repeated.
 */
export class ApiClient {
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: ApiClientOptions) {
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = opts.fetchImpl ?? ((...args) => fetch(...args));
  }

  /** Returns the envelope's `data`. Throws ApiError for every failure. */
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const auth = options.auth !== false;
    const used = auth ? this.opts.getAccessToken() : null;
    try {
      return await this.send<T>(path, options, used);
    } catch (err) {
      if (!(err instanceof ApiError) || !auth || err.kind !== 'http' || err.status !== 401) throw err;
      // A 401 for a token that a concurrent refresh has ALREADY replaced: retry once with the current token, no second refresh.
      const current = this.opts.getAccessToken();
      if (current && current !== used) return await this.send<T>(path, options, current);
      let fresh: string;
      try {
        fresh = await this.opts.refreshSession();
      } catch {
        // The session layer already decided (signed out or recovery). Surface the original 401 without looping.
        throw err;
      }
      return await this.send<T>(path, options, fresh); // the single retry; a second 401 is final
    }
  }

  private async send<T>(path: string, options: RequestOptions, accessToken: string | null): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-PB-Client': this.opts.clientHeader,
      ...(options.headers ?? {})
    };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    let res: Response;
    let text: string;
    try {
      res = await this.fetchImpl(`${this.opts.baseUrl}${path}`, {
        method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        credentials: 'omit',
        signal: controller.signal
      });
      text = await res.text();
    } catch {
      throw timedOut ? new ApiError('timeout', 0, 'TIMEOUT') : new ApiError('network', 0, 'NETWORK_ERROR');
    } finally {
      clearTimeout(timer);
    }

    let json: unknown = undefined;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
    }
    const envelope = json && typeof json === 'object' ? (json as Record<string, unknown>) : null;

    if (!res.ok) {
      const code = envelope && typeof envelope.error === 'string' ? envelope.error : 'UNKNOWN_ERROR';
      const retryAfter = Number(res.headers?.get?.('retry-after'));
      throw new ApiError('http', res.status, code.slice(0, 64), Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined);
    }
    if (!envelope || envelope.success !== true) throw new ApiError('malformed', res.status, 'MALFORMED_RESPONSE');
    return envelope.data as T;
  }
}
