import * as SecureStore from 'expo-secure-store';
import { SessionManager } from '../src/auth/sessionManager';
import { secureSessionStorage, SESSION_KEY } from '../src/auth/secureSession';
import { FakeBackend } from '../src/test/fakeBackend';

/**
 * P11B review: the late-401 rule of ApiClient.request. State/token comparison under test (src/api/apiClient.ts):
 *
 *   const used = auth ? getAccessToken() : null;          // the access token THIS request was sent with
 *   ... send(used) -> 401 ...
 *   const current = getAccessToken();                      // the session's access token NOW
 *   if (current && current !== used) -> retry ONCE with `current`, NO refresh   (a concurrent refresh already replaced the token)
 *   else                              -> refreshSession() (single-flight), retry ONCE with the fresh token
 *
 * The tests below are ordered with an explicit gate (no timers): a request is received, held, and only processed after the refresh.
 */
const store: Map<string, string> = (SecureStore as any).__store;
const BASE = 'https://api.test/api/v1';

async function signedIn() {
  const backend = new FakeBackend();
  backend.addUser({ email: 'a@b.test' });
  const manager = new SessionManager({ storage: secureSessionStorage, baseUrl: BASE, clientHeader: 'protein-bowl-mobile/1.0.0 (android)', timeoutMs: 200, fetchImpl: backend.fetch as unknown as typeof fetch });
  await manager.signIn('a@b.test', 'Password-123');
  backend.log.length = 0;
  return { backend, manager };
}

const probeTokens = (b: FakeBackend) => b.log.filter((r) => r.path === '/probe').map((r) => r.headers.Authorization);

describe('P11B review - refresh concurrency invariants (no timing dependence)', () => {
  it('A. two simultaneous 401s for the SAME expired token trigger exactly ONE refresh; both succeed', async () => {
    const { backend, manager } = await signedIn();
    backend.expireAccessTokens();
    const [a, b] = await Promise.all([manager.api.request('/probe'), manager.api.request('/probe')]);
    expect(a).toMatchObject({ ok: true });
    expect(b).toMatchObject({ ok: true });
    expect(backend.count('/auth/mobile/refresh')).toBe(1);
    expect(backend.refreshTokens.size).toBe(2); // the login token + exactly ONE rotation
  });

  it('B. a LATE 401 for the OLD access token after a successful rotation retries ONCE with the CURRENT token and does NOT rotate again', async () => {
    const { backend, manager } = await signedIn();
    backend.expireAccessTokens(); // T0 is no longer valid
    const release = backend.gateNext('/probe'); // R1: received with T0, but only answered after the refresh
    const r1 = manager.api.request<{ ok: boolean }>('/probe');
    const r2 = await manager.api.request<{ ok: boolean }>('/probe'); // R2 gets its 401 immediately, refreshes (T0 -> T1) and succeeds
    expect(r2.ok).toBe(true);
    expect(backend.count('/auth/mobile/refresh')).toBe(1);
    release(); // now R1's request is evaluated by the server: T0 is invalid -> 401 (a "late" 401 for an already-replaced token)
    expect((await r1).ok).toBe(true);

    expect(backend.count('/auth/mobile/refresh')).toBe(1); // STILL one: the late 401 did not consume / rotate the new refresh token
    expect(backend.refreshTokens.size).toBe(2); // login + ONE rotation (a second rotation would make it 3)
    const t = probeTokens(backend);
    expect(t.length).toBe(4); // R1(T0), R2(T0), R2 retry(T1), R1 retry(T1)
    expect(t[0]).toBe(t[1]);
    expect(t[2]).toBe(t[3]);
    expect(t[2]).not.toBe(t[0]);
    expect(manager.getState().status).toBe('signedIn');
  });

  it('C. a genuine 401 while using the CURRENT token (the token itself expired) still takes the normal refresh path', async () => {
    const { backend, manager } = await signedIn();
    backend.expireAccessTokens();
    await manager.api.request('/probe'); // refresh #1 (T0 -> T1)
    backend.expireAccessTokens(); // the CURRENT token expires later
    await manager.api.request('/probe'); // used === current -> refresh #2 (T1 -> T2)
    expect(backend.count('/auth/mobile/refresh')).toBe(2);
    expect(backend.refreshTokens.size).toBe(3);
  });

  it('D/E. retry is bounded: a late 401 whose current-token retry ALSO fails is final (no refresh, no loop); an always-401 server causes 1 refresh and 2 attempts', async () => {
    const { backend, manager } = await signedIn();
    backend.expireAccessTokens();
    const release = backend.gateNext('/probe');
    const r1 = manager.api.request('/probe').catch((e) => e);
    await manager.api.request('/probe'); // refresh -> T1
    backend.alwaysUnauthorized = true; // the server now rejects even the current token
    release();
    const err: any = await r1;
    expect(err).toMatchObject({ kind: 'http', status: 401 });
    expect(backend.count('/auth/mobile/refresh')).toBe(1); // the late-401 path never refreshes
    expect(probeTokens(backend).length).toBe(4); // R1 T0, R2 T0, R2 retry T1, R1 retry T1 - and nothing more

    backend.log.length = 0;
    await expect(manager.api.request('/probe')).rejects.toMatchObject({ status: 401 });
    expect(probeTokens(backend).length).toBe(2); // one attempt + ONE retry
    expect(backend.count('/auth/mobile/refresh')).toBe(1); // exactly one refresh for the genuine 401
  });

  it('F/G/H/I. concurrent requests with a REVOKED / reused refresh token produce ONE refresh request, no replacement session, and a signed-out state', async () => {
    const { backend, manager } = await signedIn();
    backend.expireAccessTokens();
    backend.refreshTokens.forEach((t) => (t.revoked = true));
    const before = backend.refreshTokens.size;
    const results = await Promise.all([1, 2, 3].map(() => manager.api.request('/probe').catch((e) => e)));
    for (const r of results) expect(r).toMatchObject({ status: 401 });
    expect(backend.count('/auth/mobile/refresh')).toBe(1); // single-flight even when the refresh FAILS
    expect(backend.refreshTokens.size).toBe(before); // nothing was issued
    expect(backend.accessTokens.size).toBe(0);
    expect(manager.getState()).toEqual({ status: 'signedOut', reason: 'session_revoked' }); // TOKEN_REUSED semantics unchanged
    expect(store.size).toBe(0);
  });

  it('I. concurrent requests with an AMBIGUOUS refresh failure: one refresh request, recovery state, the credential is kept and never replayed', async () => {
    const { backend, manager } = await signedIn();
    backend.expireAccessTokens();
    backend.failNext('/auth/mobile/refresh', 'network');
    const results = await Promise.all([1, 2, 3].map(() => manager.api.request('/probe').catch((e) => e)));
    for (const r of results) expect(r).toMatchObject({ status: 401 });
    expect(backend.count('/auth/mobile/refresh')).toBe(1);
    expect(manager.getState().status).toBe('recovery');
    expect(store.has(SESSION_KEY)).toBe(true);
  });

  it('J/K/L. throughout, the access token is never persisted, only the refresh credential is stored, and nothing is logged', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined));
    const { backend, manager } = await signedIn();
    backend.expireAccessTokens();
    const release = backend.gateNext('/probe');
    const r1 = manager.api.request('/probe');
    await manager.api.request('/probe');
    release();
    await r1;
    const raw = [...store.values()].join('|');
    expect(store.size).toBe(1);
    expect(raw).not.toMatch(/access-/);
    expect(Object.keys(JSON.parse(store.get(SESSION_KEY)!)).sort()).toEqual(['expiresAt', 'refreshToken']);
    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    spies.forEach((s) => s.mockRestore());
    expect(logged).not.toMatch(/refresh-|access-|Bearer/);
  });

  it('F. rotation stays server-authoritative: the client never mints or edits tokens, it only stores what /auth/mobile/refresh returned', async () => {
    const { backend, manager } = await signedIn();
    backend.expireAccessTokens();
    await manager.api.request('/probe');
    const stored = JSON.parse(store.get(SESSION_KEY)!).refreshToken as string;
    const live = [...backend.refreshTokens.entries()].filter(([, v]) => !v.revoked).map(([k]) => k);
    expect(live).toEqual([stored]); // the ONLY live server token is exactly the one persisted
  });
});
