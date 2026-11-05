import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from './apiClient';
import { AuthService } from './authService';

/**
 * Session refresh. The refresh cookie ROTATES, so two concurrent refreshes must never both be sent (found while investigating the 401s in the
 * browser console: the session restore ran twice under React StrictMode, and a second request that met an expired token at the same moment was
 * handed the 401 without a refresh). One refresh serves everybody; a visitor with no session gets exactly one 401 from it (expected).
 */
const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const urls = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map((c) => String(c[0]).replace(/^.*\/api\/v1/, ''));

describe('ApiClient / AuthService refresh', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    ApiClient.setAccessToken(null);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    ApiClient.setAccessToken(null);
  });

  it('simultaneous session restores (StrictMode double effect) send ONE refresh and share its result', async () => {
    fetchMock.mockImplementation(() => json(200, { success: true, data: { accessToken: 'tok-1' } }));
    const [a, b] = await Promise.all([AuthService.refresh(), AuthService.refresh()]);
    expect(urls(fetchMock)).toEqual(['/auth/refresh']);
    expect(a).toEqual({ success: true, data: { accessToken: 'tok-1' } });
    expect(b).toEqual(a);
    expect(ApiClient.getAccessToken()).toBe('tok-1');
  });

  it('a visitor with no session: one refresh, one 401, no token, success:false (the 401 is the expected "not signed in" answer, not hidden)', async () => {
    fetchMock.mockImplementation(() => json(401, { success: false, error: 'UNAUTHORIZED' }));
    const [a, b] = await Promise.all([AuthService.refresh(), AuthService.refresh()]);
    expect(urls(fetchMock)).toEqual(['/auth/refresh']);
    expect(a.success).toBe(false);
    expect(b.success).toBe(false);
    expect(ApiClient.getAccessToken()).toBeNull();
    // the in-flight slot is released: a later attempt (for example after sign-in elsewhere) really asks again
    await AuthService.refresh();
    expect(urls(fetchMock)).toEqual(['/auth/refresh', '/auth/refresh']);
  });

  it('two requests that meet an expired token at the same moment share ONE refresh and BOTH are retried with the new token', async () => {
    ApiClient.setAccessToken('expired');
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/auth/refresh')) return json(200, { success: true, data: { accessToken: 'fresh' } });
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      return auth === 'Bearer fresh' ? json(200, { success: true, data: { ok: u } }) : json(401, { success: false, error: 'TOKEN_EXPIRED' });
    });
    const [x, y] = await Promise.all([ApiClient.request('/cart'), ApiClient.request('/customers/me/profile')]);
    expect(x.success).toBe(true);
    expect(y.success).toBe(true);
    expect(urls(fetchMock).filter((u) => u === '/auth/refresh')).toHaveLength(1);
    expect(urls(fetchMock).filter((u) => u === '/cart')).toHaveLength(2); // original + one retry, never more
    expect(urls(fetchMock).filter((u) => u === '/customers/me/profile')).toHaveLength(2);
  });

  it('when the refresh fails the request keeps its 401, the token is cleared and there is no retry loop', async () => {
    ApiClient.setAccessToken('expired');
    fetchMock.mockImplementation((url: string) => (String(url).endsWith('/auth/refresh') ? json(401, { success: false, error: 'UNAUTHORIZED' }) : json(401, { success: false, error: 'TOKEN_EXPIRED' })));
    const res = await ApiClient.request('/cart');
    expect(res.success).toBe(false);
    expect(res.httpStatus).toBe(401);
    expect(ApiClient.getAccessToken()).toBeNull();
    expect(urls(fetchMock)).toEqual(['/cart', '/auth/refresh']);
  });

  it('NO INFINITE LOOP: when the refresh succeeds but the retried request is STILL 401 (for example the account lost access), there is exactly one refresh and one retry', async () => {
    ApiClient.setAccessToken('expired');
    fetchMock.mockImplementation((url: string) => (String(url).endsWith('/auth/refresh') ? json(200, { success: true, data: { accessToken: 'fresh' } }) : json(401, { success: false, error: 'UNAUTHORIZED' })));
    const res = await ApiClient.request('/cart');
    expect(res.success).toBe(false);
    expect(res.httpStatus).toBe(401);
    expect(urls(fetchMock)).toEqual(['/cart', '/auth/refresh', '/cart']); // original, one refresh, ONE retry, then stop
  });

  it('an expired session never loops: many requests in a row each cost at most one refresh attempt and one failed answer', async () => {
    ApiClient.setAccessToken('expired');
    fetchMock.mockImplementation((url: string) => (String(url).endsWith('/auth/refresh') ? json(401, { success: false, error: 'UNAUTHORIZED' }) : json(401, { success: false, error: 'TOKEN_EXPIRED' })));
    const results = await Promise.all([ApiClient.request('/cart'), ApiClient.request('/orders/my-orders'), ApiClient.request('/customers/me/profile')]);
    expect(results.every((r) => !r.success && r.httpStatus === 401)).toBe(true);
    expect(urls(fetchMock).filter((u) => u === '/auth/refresh')).toHaveLength(1); // shared by the three
    expect(fetchMock.mock.calls.length).toBe(4); // 3 originals + 1 shared refresh; no retries because the refresh failed
  });

  it('LOGOUT during a refresh: the late refresh result belongs to the ended session and does NOT bring the token back', async () => {
    let release!: (r: Response) => void;
    fetchMock.mockImplementation((url: string) => {
      if (String(url).endsWith('/auth/refresh')) return new Promise<Response>((resolve) => { release = resolve; });
      return json(200, { success: true }); // /auth/logout
    });
    const refreshing = ApiClient.refreshAccessToken();
    await AuthService.logout(); // signs out while the refresh is still on its way
    release(new Response(JSON.stringify({ success: true, data: { accessToken: 'late-token' } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await expect(refreshing).resolves.toBe(false);
    expect(ApiClient.getAccessToken()).toBeNull();
    expect(urls(fetchMock)).toContain('/auth/logout');
  });

  it('logout clears the token even when the logout request fails, and a refresh started AFTER the logout works normally', async () => {
    ApiClient.setAccessToken('tok');
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('offline')));
    await AuthService.logout();
    expect(ApiClient.getAccessToken()).toBeNull();
    fetchMock.mockImplementation(() => json(200, { success: true, data: { accessToken: 'new-login' } }));
    await expect(ApiClient.refreshAccessToken()).resolves.toBe(true);
    expect(ApiClient.getAccessToken()).toBe('new-login');
  });

  it('login and refresh endpoints never trigger a refresh of their own', async () => {
    fetchMock.mockImplementation(() => json(401, { success: false, error: 'INVALID_CREDENTIALS' }));
    await ApiClient.request('/auth/login', { method: 'POST', body: '{}' });
    expect(urls(fetchMock)).toEqual(['/auth/login']);
  });

  it('a network failure during refresh resolves false (no throw, token cleared)', async () => {
    ApiClient.setAccessToken('x');
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(ApiClient.refreshAccessToken()).resolves.toBe(false);
    expect(ApiClient.getAccessToken()).toBeNull();
  });
});
