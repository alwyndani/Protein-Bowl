import { ApiClient } from '../src/api/apiClient';
import { ApiError } from '../src/api/ApiError';
import { messageForError, messageForSignedOut } from '../src/copy/errorCopy';
import { resolveConfig, clientHeader, ConfigError } from '../src/config/appConfig';
import { SecureStorageError } from '../src/auth/secureSession';

const res = (status: number, body: string, headers: Record<string, string> = {}) =>
  ({ ok: status >= 200 && status < 300, status, headers: { get: (n: string) => headers[n.toLowerCase()] ?? null }, text: async () => body }) as unknown as Response;

function client(fetchImpl: jest.Mock, extra: Partial<ConstructorParameters<typeof ApiClient>[0]> = {}) {
  return new ApiClient({
    baseUrl: 'https://api.test/api/v1',
    clientHeader: 'protein-bowl-mobile/1.0.0 (ios)',
    timeoutMs: 40,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    getAccessToken: () => 'tok',
    refreshSession: async () => {
      throw new Error('no refresh in this test');
    },
    ...extra
  });
}

describe('P11A typed API client', () => {
  it('returns the envelope data and sends Bearer + client contract + omit credentials', async () => {
    const f = jest.fn(async () => res(200, JSON.stringify({ success: true, data: { a: 1 } })));
    expect(await client(f).request('/x')).toEqual({ a: 1 });
    const init = (f.mock.calls[0] as any)[1];
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.headers['X-PB-Client']).toBe('protein-bowl-mobile/1.0.0 (ios)');
    expect(init.credentials).toBe('omit');
  });

  it('times out (AbortController) -> ApiError timeout', async () => {
    const f = jest.fn((_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal!.addEventListener('abort', () => rej(new Error('aborted')))));
    await expect(client(f as any).request('/x')).rejects.toMatchObject({ kind: 'timeout', code: 'TIMEOUT' });
  });

  it('offline -> ApiError network', async () => {
    const f = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(client(f).request('/x')).rejects.toMatchObject({ kind: 'network' });
  });

  it('non-JSON error body is handled safely (no throw from JSON.parse)', async () => {
    const f = jest.fn(async () => res(502, '<html>Bad gateway</html>'));
    const e: any = await client(f).request('/x').catch((x: any) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ kind: 'http', status: 502, code: 'UNKNOWN_ERROR' });
    expect(e.ambiguous).toBe(true);
  });

  it('malformed 2xx (not the envelope / not JSON) -> malformed', async () => {
    for (const body of ['not json', '{"ok":true}', '[]', '']) {
      const f = jest.fn(async () => res(200, body));
      await expect(client(f).request('/x')).rejects.toMatchObject({ kind: 'malformed' });
    }
  });

  it.each([
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [409, 'CONFLICT'],
    [410, 'MESS_ENDPOINT_RETIRED'],
    [422, 'VALIDATION_ERROR'],
    [429, 'TOO_MANY_REQUESTS'],
    [500, 'INTERNAL_SERVER_ERROR']
  ])('maps HTTP %s to a normalised ApiError carrying the server code', async (status, code) => {
    const f = jest.fn(async () => res(status as number, JSON.stringify({ success: false, error: code, message: 'raw server text' }), { 'retry-after': '30' }));
    const e: any = await client(f).request('/x').catch((x: any) => x);
    expect(e).toMatchObject({ kind: 'http', status, code });
    expect(String(e.message)).not.toContain('raw server text');
    if (status === 429) expect(e.retryAfterSeconds).toBe(30);
  });

  it('never auto-retries a non-idempotent request after a network failure or 5xx', async () => {
    const f = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(client(f).request('/orders', { method: 'POST', body: { a: 1 } })).rejects.toBeDefined();
    expect(f).toHaveBeenCalledTimes(1);
    const g = jest.fn(async () => res(503, ''));
    await expect(client(g).request('/orders', { method: 'POST', body: { a: 1 } })).rejects.toBeDefined();
    expect(g).toHaveBeenCalledTimes(1);
  });

  it('401: refreshes once and retries the request once with the new token', async () => {
    const f = jest
      .fn()
      .mockResolvedValueOnce(res(401, JSON.stringify({ success: false, error: 'UNAUTHORIZED' })))
      .mockResolvedValueOnce(res(200, JSON.stringify({ success: true, data: 'ok' })));
    const refresh = jest.fn(async () => 'new-token');
    expect(await client(f, { refreshSession: refresh }).request('/x')).toBe('ok');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect((f.mock.calls[1] as any)[1].headers.Authorization).toBe('Bearer new-token');
  });

  it('403 / 404 / 409 are NOT refresh triggers', async () => {
    for (const s of [403, 404, 409]) {
      const refresh = jest.fn(async () => 't');
      const f = jest.fn(async () => res(s, JSON.stringify({ success: false, error: 'X' })));
      await client(f, { refreshSession: refresh }).request('/x').catch(() => undefined);
      expect(refresh).not.toHaveBeenCalled();
      expect(f).toHaveBeenCalledTimes(1);
    }
  });

  it('auth:false never sends a token and never refreshes', async () => {
    const refresh = jest.fn(async () => 't');
    const f = jest.fn(async () => res(401, JSON.stringify({ success: false, error: 'INVALID_CREDENTIALS' })));
    await client(f, { refreshSession: refresh }).request('/auth/mobile/login', { method: 'POST', body: {}, auth: false }).catch(() => undefined);
    expect(refresh).not.toHaveBeenCalled();
    expect((f.mock.calls[0] as any)[1].headers.Authorization).toBeUndefined();
  });
});

describe('P11A customer-safe error copy', () => {
  const http = (status: number, code = 'X') => new ApiError('http', status, code);
  it('never contains server text, codes or stack traces', () => {
    const all = [
      new ApiError('network', 0, 'NETWORK_ERROR'),
      new ApiError('timeout', 0, 'TIMEOUT'),
      new ApiError('malformed', 200, 'MALFORMED_RESPONSE'),
      http(400),
      http(401),
      http(403, 'CUSTOMER_APP_ONLY'),
      http(403, 'ACCOUNT_INACTIVE'),
      http(404),
      http(409, 'EMAIL_EXISTS'),
      http(409),
      http(410),
      http(422),
      http(426),
      http(429),
      http(500),
      http(503),
      new SecureStorageError(),
      new Error('stack at C:\\secret'),
      'weird'
    ];
    for (const e of all) {
      const m = messageForError(e, 'signIn');
      expect(m.length).toBeGreaterThan(10);
      expect(m).not.toMatch(/CUSTOMER_APP_ONLY|EMAIL_EXISTS|NETWORK_ERROR|Error:|at C:|undefined|\[object/);
    }
  });
  it('maps the important statuses to distinct, actionable copy', () => {
    expect(messageForError(http(401, 'INVALID_CREDENTIALS'), 'signIn')).toBe('Incorrect email or password.');
    expect(messageForError(http(409, 'EMAIL_EXISTS'), 'register')).toMatch(/already exists/);
    expect(messageForError(http(429), 'signIn')).toMatch(/wait/);
    expect(messageForError(http(500))).toMatch(/trouble/);
    expect(messageForError(new ApiError('network', 0, 'N'))).toMatch(/offline/);
    expect(messageForError(http(410))).toMatch(/no longer available/);
    expect(messageForError(http(403, 'CUSTOMER_APP_ONLY'))).toMatch(/customer accounts only/);
  });
  it('signed-out reasons have copy (none -> no notice)', () => {
    expect(messageForSignedOut('none')).toBeNull();
    for (const r of ['session_expired', 'session_revoked', 'account_inactive', 'customer_only', 'update_required', 'storage_unavailable', 'server_unconfirmed'] as const) {
      expect(messageForSignedOut(r)).toBeTruthy();
    }
  });
});

describe('P11A environment configuration', () => {
  const ok = { isDev: true, platform: 'android', appVersion: '1.0.0' };
  it('requires an explicit API URL (no hard-coded fallback)', () => {
    expect(() => resolveConfig({}, ok)).toThrow(ConfigError);
    expect(() => resolveConfig({ apiUrl: '   ' }, ok)).toThrow(ConfigError);
  });
  it('development may use http; the trailing slash is normalised', () => {
    const c = resolveConfig({ apiUrl: 'http://10.0.2.2:5000/api/v1/', appEnv: 'development' }, ok);
    expect(c).toMatchObject({ apiBaseUrl: 'http://10.0.2.2:5000/api/v1', environment: 'development' });
  });
  it('production requires HTTPS (explicit env OR any non-dev build)', () => {
    expect(() => resolveConfig({ apiUrl: 'http://api.example.com', appEnv: 'production' }, ok)).toThrow(/https/i);
    expect(() => resolveConfig({ apiUrl: 'http://api.example.com' }, { ...ok, isDev: false })).toThrow(/https/i);
    expect(resolveConfig({ apiUrl: 'https://api.example.com/api/v1', appEnv: 'production' }, ok).environment).toBe('production');
  });
  it('rejects malformed URLs, credentials in the URL, unsupported platforms and bad versions', () => {
    expect(() => resolveConfig({ apiUrl: 'not a url' }, ok)).toThrow(ConfigError);
    expect(() => resolveConfig({ apiUrl: 'ftp://x.test' }, ok)).toThrow(ConfigError);
    expect(() => resolveConfig({ apiUrl: 'https://user:pw@x.test' }, ok)).toThrow(/credentials/);
    expect(() => resolveConfig({ apiUrl: 'https://x.test' }, { ...ok, platform: 'web' })).toThrow(ConfigError);
    expect(() => resolveConfig({ apiUrl: 'https://x.test' }, { ...ok, appVersion: '1.0' })).toThrow(ConfigError);
    expect(() => resolveConfig({ apiUrl: 'https://x.test' }, { ...ok, appVersion: null })).toThrow(ConfigError);
  });
  it('builds the strict client contract header the backend parses', () => {
    expect(clientHeader({ appVersion: '2.10.3', platform: 'ios' })).toBe('protein-bowl-mobile/2.10.3 (ios)');
    expect(clientHeader({ appVersion: '1.0.0', platform: 'android' })).toMatch(/^protein-bowl-mobile\/\d+\.\d+\.\d+ \((android|ios)\)$/);
  });
});
