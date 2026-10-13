import * as SecureStore from 'expo-secure-store';
import { SessionManager } from '../src/auth/sessionManager';
import { secureSessionStorage, SESSION_KEY, SecureStorageError, SessionStorage } from '../src/auth/secureSession';
import { FakeBackend } from '../src/test/fakeBackend';
import { ApiError } from '../src/api/ApiError';

const store: Map<string, string> = (SecureStore as any).__store;
const BASE = 'https://api.test/api/v1';
const CLIENT = 'protein-bowl-mobile/1.0.0 (android)';

function setup(opts: { storage?: SessionStorage; timeoutMs?: number } = {}) {
  const backend = new FakeBackend();
  const cleared = jest.fn();
  const manager = new SessionManager({
    storage: opts.storage ?? secureSessionStorage,
    baseUrl: BASE,
    clientHeader: CLIENT,
    timeoutMs: opts.timeoutMs ?? 200,
    fetchImpl: backend.fetch as unknown as typeof fetch,
    onSessionCleared: cleared
  });
  return { backend, manager, cleared };
}

const stored = () => (store.has(SESSION_KEY) ? JSON.parse(store.get(SESSION_KEY)!) : null);

describe('P11A mobile session: sign in / register', () => {
  it('1. login persists ONLY the refresh credential in SecureStore; the access token and profile are never stored', async () => {
    const { backend, manager } = setup();
    backend.addUser({ email: 'a@b.test' });
    await manager.signIn('a@b.test', 'Password-123');
    expect(manager.getState().status).toBe('signedIn');
    const s = stored();
    expect(Object.keys(s).sort()).toEqual(['expiresAt', 'refreshToken']);
    expect(s.refreshToken).toMatch(/^refresh-/);
    const raw = [...store.values()].join('|');
    expect(raw).not.toMatch(/access-/);
    expect(raw).not.toMatch(/a@b\.test|CUSTOMER|Test Customer|Password-123/);
    expect(store.size).toBe(1);
  });

  it('2. uses WHEN_UNLOCKED_THIS_DEVICE_ONLY and stores under the versioned key', async () => {
    const { backend, manager } = setup();
    backend.addUser({ email: 'a@b.test' });
    await manager.signIn('a@b.test', 'Password-123');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(SESSION_KEY, expect.any(String), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  });

  it('3. auth requests carry the client contract, omit cookies and send NO Authorization header', async () => {
    const { backend, manager } = setup();
    backend.addUser({ email: 'a@b.test' });
    await manager.signIn('a@b.test', 'Password-123');
    const req = backend.log.find((r) => r.path === '/auth/mobile/login')!;
    expect(req.headers['X-PB-Client']).toBe(CLIENT);
    expect(req.credentials).toBe('omit');
    expect(req.headers.Authorization).toBeUndefined();
    expect(req.headers.Cookie).toBeUndefined();
  });

  it('4. register signs the new customer in and persists the credential', async () => {
    const { backend, manager } = setup();
    await manager.register({ email: 'new@b.test', password: 'Password-123', fullName: 'New Person' });
    const st = manager.getState();
    expect(st.status).toBe('signedIn');
    if (st.status === 'signedIn') expect(st.user.fullName).toBe('New Person');
    expect(stored().refreshToken).toBeTruthy();
    expect(backend.count('/auth/mobile/register')).toBe(1);
  });

  it('5. wrong password / duplicate email surface normalised ApiErrors and persist nothing', async () => {
    const { backend, manager } = setup();
    backend.addUser({ email: 'a@b.test' });
    await expect(manager.signIn('a@b.test', 'nope')).rejects.toMatchObject({ status: 401 });
    await expect(manager.register({ email: 'a@b.test', password: 'Password-123', fullName: 'Dup Dup' })).rejects.toMatchObject({ status: 409, code: 'EMAIL_EXISTS' });
    expect(store.size).toBe(0);
    expect(manager.getState().status).toBe('restoring'); // untouched until restore() runs
  });

  it('6. a non-CUSTOMER account is refused (server 403 CUSTOMER_APP_ONLY): no session, nothing stored', async () => {
    const { backend, manager } = setup();
    backend.addUser({ email: 'chef@b.test', roles: ['CHEF'] });
    backend.addUser({ email: 'legacy@b.test', roles: ['MESS_CUSTOMER'] });
    for (const email of ['chef@b.test', 'legacy@b.test']) {
      await expect(manager.signIn(email, 'Password-123')).rejects.toMatchObject({ status: 403, code: 'CUSTOMER_APP_ONLY' });
    }
    expect(store.size).toBe(0);
    expect(manager.getState().status).not.toBe('signedIn');
  });

  it('7. defence in depth: if a server ever returned a staff session, the app revokes it and never stores it', async () => {
    const { backend, manager } = setup();
    const staff = backend.addUser({ email: 'chef@b.test', roles: ['CHEF'] });
    const realFetch = backend.fetch;
    const lying = ((url: string, init: RequestInit) => {
      if (url.endsWith('/auth/mobile/login')) {
        const body = {
          success: true,
          data: { user: { id: staff.id, email: staff.email, roles: ['CHEF'], customerProfile: null }, accessToken: 'a', refreshToken: 'r'.repeat(40), refreshTokenExpiresAt: new Date(Date.now() + 1e9).toISOString() }
        };
        return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(body) } as unknown as Response);
      }
      return realFetch(url, init);
    }) as unknown as typeof fetch;
    const m = new SessionManager({ storage: secureSessionStorage, baseUrl: BASE, clientHeader: CLIENT, fetchImpl: lying });
    await expect(m.signIn('chef@b.test', 'Password-123')).rejects.toMatchObject({ code: 'CUSTOMER_APP_ONLY' });
    expect(store.size).toBe(0);
    expect(backend.count('/auth/mobile/logout')).toBe(1);
  });

  it('8. malformed login response is rejected without storing anything', async () => {
    const { manager } = setup();
    const m = new SessionManager({
      storage: secureSessionStorage,
      baseUrl: BASE,
      clientHeader: CLIENT,
      fetchImpl: (async () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ success: true, data: { accessToken: 1 } }) })) as any
    });
    await expect(m.signIn('a@b.test', 'x')).rejects.toMatchObject({ kind: 'malformed' });
    expect(store.size).toBe(0);
    void manager;
  });

  it('9. without secure storage the app refuses to hold a session and revokes the one just created (no fallback)', async () => {
    const { backend, manager } = setup({
      storage: {
        read: async () => null,
        write: async () => {
          throw new SecureStorageError();
        },
        clear: async () => undefined
      }
    });
    backend.addUser({ email: 'a@b.test' });
    await expect(manager.signIn('a@b.test', 'Password-123')).rejects.toBeInstanceOf(SecureStorageError);
    expect(manager.getState().status).not.toBe('signedIn');
    expect(backend.count('/auth/mobile/logout')).toBe(1);
  });
});

describe('P11A mobile session: restoration', () => {
  async function signedInPair() {
    const ctx = setup();
    ctx.backend.addUser({ email: 'a@b.test' });
    await ctx.manager.signIn('a@b.test', 'Password-123');
    const credential = store.get(SESSION_KEY)!;
    // a fresh "app launch" over the same device storage
    const launch = setup();
    launch.backend.users = ctx.backend.users;
    launch.backend.refreshTokens = ctx.backend.refreshTokens;
    launch.backend.accessTokens = ctx.backend.accessTokens;
    return { ...launch, credential };
  }

  it('10. no stored credential -> signed out, no network call', async () => {
    const { backend, manager } = setup();
    await manager.restore();
    expect(manager.getState()).toEqual({ status: 'signedOut', reason: 'none' });
    expect(backend.log.length).toBe(0);
  });

  it('11. stored credential -> refresh + /auth/me + CUSTOMER -> signed in; the rotated token replaces the stored one', async () => {
    const { manager, backend, credential } = await signedInPair();
    const before = JSON.parse(credential).refreshToken;
    await manager.restore();
    expect(manager.getState().status).toBe('signedIn');
    expect(backend.log.map((r) => r.path)).toEqual(['/auth/mobile/refresh', '/auth/me']);
    expect(stored().refreshToken).not.toBe(before);
    expect(backend.log[0].body).toEqual({ refreshToken: before });
  });

  it('12. restoration never trusts a cached role: /auth/me deciding non-customer ends the session and revokes it', async () => {
    const { manager, backend } = await signedInPair();
    const real = backend.fetch;
    const m2 = new SessionManager({
      storage: secureSessionStorage,
      baseUrl: BASE,
      clientHeader: CLIENT,
      fetchImpl: (async (url: string, init: RequestInit) => {
        if (url.endsWith('/auth/me')) {
          return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ success: true, data: { user: { id: 'x', email: 'a@b.test', roles: ['CUSTOMER', 'CHEF'] } } }) };
        }
        return real(url, init);
      }) as any
    });
    await m2.restore();
    expect(m2.getState()).toEqual({ status: 'signedOut', reason: 'customer_only' });
    expect(store.size).toBe(0);
    expect(backend.count('/auth/mobile/logout')).toBe(1);
  });

  it('13. a locally expired credential is cleared without any network call', async () => {
    store.set(SESSION_KEY, JSON.stringify({ refreshToken: 'old'.repeat(20), expiresAt: new Date(Date.now() - 1000).toISOString() }));
    const { manager, backend } = setup();
    await manager.restore();
    expect(manager.getState()).toEqual({ status: 'signedOut', reason: 'session_expired' });
    expect(store.size).toBe(0);
    expect(backend.log.length).toBe(0);
  });

  it.each([
    ['unknown token', 'TOKEN_INVALID', 'session_expired'],
    ['reused token', 'TOKEN_REUSED', 'session_revoked'],
    ['inactive account', 'ACCOUNT_INACTIVE', 'account_inactive'],
    ['lost customer authority', 'CUSTOMER_APP_ONLY', 'customer_only'],
    ['unsupported app version', 'APP_VERSION_UNSUPPORTED', 'update_required']
  ])('14. refresh rejected (%s) -> credential cleared, signed out with the right reason', async (_n, code, reason) => {
    const { manager, cleared } = await signedInPair();
    const status = code === 'APP_VERSION_UNSUPPORTED' ? 426 : code === 'CUSTOMER_APP_ONLY' ? 403 : 401;
    (manager as any).api.fetchImpl = async () =>
      ({ ok: false, status, headers: { get: () => null }, text: async () => JSON.stringify({ success: false, error: code, message: 'x' }) }) as any;
    await manager.restore();
    expect(manager.getState()).toEqual({ status: 'signedOut', reason });
    expect(store.size).toBe(0);
    expect(cleared).toHaveBeenCalled();
  });

  it('15. revoked token against the (fake) server: restore ends signed out', async () => {
    const { manager, backend } = await signedInPair();
    backend.refreshTokens.forEach((v) => (v.revoked = true));
    await manager.restore();
    expect(manager.getState()).toEqual({ status: 'signedOut', reason: 'session_revoked' });
    expect(store.size).toBe(0);
  });

  it('16. inactive account on restore', async () => {
    const { manager, backend } = await signedInPair();
    [...backend.users.values()][0].status = 'SUSPENDED';
    await manager.restore();
    expect(manager.getState()).toEqual({ status: 'signedOut', reason: 'account_inactive' });
    expect(store.size).toBe(0);
  });

  it('17. stale authenticated UI is never shown: state is `restoring` while restoration runs', async () => {
    const { manager, backend } = await signedInPair();
    backend.delayMs = 20;
    const seen: string[] = [];
    manager.subscribe(() => seen.push(manager.getState().status));
    await manager.restore();
    expect(seen[0]).toBe('restoring');
    expect(seen[seen.length - 1]).toBe('signedIn');
    expect(seen.indexOf('signedIn')).toBeGreaterThan(0);
  });
});

describe('P11A mobile session: ambiguous refresh failure (no replay)', () => {
  async function launched() {
    const a = setup();
    a.backend.addUser({ email: 'a@b.test' });
    await a.manager.signIn('a@b.test', 'Password-123');
    const b = setup({ timeoutMs: 50 });
    b.backend.users = a.backend.users;
    b.backend.refreshTokens = a.backend.refreshTokens;
    b.backend.accessTokens = a.backend.accessTokens;
    return b;
  }

  it.each([['timeout' as const], ['network' as const], [502], [503]])('18. refresh fault %s -> recovery state, credential KEPT, exactly ONE refresh request (never replayed)', async (fault) => {
    const { manager, backend } = await launched();
    const tokenBefore = stored().refreshToken;
    backend.failNext('/auth/mobile/refresh', fault);
    await manager.restore();
    expect(manager.getState()).toEqual({ status: 'recovery' });
    expect(backend.count('/auth/mobile/refresh')).toBe(1);
    expect(stored().refreshToken).toBe(tokenBefore);
    await new Promise((r) => setTimeout(r, 120));
    expect(backend.count('/auth/mobile/refresh')).toBe(1); // still no automatic replay
  });

  it('19. 429 on refresh is also a recovery state (the credential is kept)', async () => {
    const { manager, backend } = await launched();
    backend.failNext('/auth/mobile/refresh', 429);
    await manager.restore();
    expect(manager.getState()).toEqual({ status: 'recovery' });
    expect(stored()).not.toBeNull();
  });

  it('20. recovery is user-driven: "try again" sends one more refresh and succeeds when the first never reached the server', async () => {
    const { manager, backend } = await launched();
    backend.failNext('/auth/mobile/refresh', 'network');
    await manager.restore();
    expect(manager.getState().status).toBe('recovery');
    await manager.restore();
    expect(manager.getState().status).toBe('signedIn');
    expect(backend.count('/auth/mobile/refresh')).toBe(2);
  });

  it('21. if the first refresh WAS processed (lost response), the user retry is TOKEN_REUSED -> signed out, all sessions revoked (no grace window)', async () => {
    const { manager, backend } = await launched();
    // the server processes the rotation, but the response is lost
    const real = backend.fetch;
    let lose = true;
    (manager as any).api.fetchImpl = async (url: string, init: RequestInit) => {
      const res = await real(url, init);
      if (lose && url.endsWith('/auth/mobile/refresh')) {
        lose = false;
        throw new TypeError('Network request failed');
      }
      return res;
    };
    await manager.restore();
    expect(manager.getState().status).toBe('recovery');
    await manager.restore();
    expect(manager.getState()).toEqual({ status: 'signedOut', reason: 'session_revoked' });
    expect(store.size).toBe(0);
    expect([...backend.refreshTokens.values()].every((t) => t.revoked)).toBe(true);
  });

  it('22. "sign in again" from recovery clears the device session', async () => {
    const { manager, backend } = await launched();
    backend.failNext('/auth/mobile/refresh', 'timeout');
    await manager.restore();
    await manager.abandonSession();
    expect(manager.getState().status).toBe('signedOut');
    expect(store.size).toBe(0);
  });
});

describe('P11A mobile session: single-flight refresh', () => {
  async function signedIn() {
    const ctx = setup();
    ctx.backend.addUser({ email: 'a@b.test' });
    await ctx.manager.signIn('a@b.test', 'Password-123');
    return ctx;
  }

  it('23. N concurrent 401s share ONE refresh request; every request is retried exactly once and succeeds', async () => {
    const { manager, backend } = await signedIn();
    backend.expireAccessTokens();
    backend.delayMs = 15;
    const results = await Promise.all(Array.from({ length: 6 }, () => manager.api.request<{ ok: boolean }>('/probe')));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(backend.count('/auth/mobile/refresh')).toBe(1);
    expect(backend.count('/probe')).toBe(12); // 6 first attempts (401) + 6 single retries
  });

  it('24. the rotated refresh token is persisted BEFORE any waiting request is retried with the new access token', async () => {
    const { manager, backend } = await signedIn();
    backend.expireAccessTokens();
    const order: string[] = [];
    (SecureStore.setItemAsync as jest.Mock).mockImplementationOnce(async (k: string, v: string) => {
      await new Promise((r) => setTimeout(r, 30));
      store.set(k, v);
      order.push('persisted');
    });
    const real = backend.fetch;
    (manager as any).api.fetchImpl = (url: string, init: RequestInit) => {
      if (url.endsWith('/probe')) order.push('probe');
      return real(url, init);
    };
    await manager.api.request('/probe');
    expect(order).toEqual(['probe', 'persisted', 'probe']);
  });

  it('25. a request is retried AT MOST once: a persistent 401 ends after 1 refresh and 2 attempts', async () => {
    const { manager, backend } = await signedIn();
    backend.alwaysUnauthorized = true;
    await expect(manager.api.request('/probe')).rejects.toMatchObject({ status: 401 });
    expect(backend.count('/probe')).toBe(2);
    expect(backend.count('/auth/mobile/refresh')).toBe(1);
  });

  it('26. NO recursive refresh: a 401 on the refresh endpoint itself never triggers another refresh; the session ends', async () => {
    const { manager, backend } = await signedIn();
    backend.expireAccessTokens();
    backend.refreshTokens.forEach((v) => (v.revoked = true));
    await expect(manager.api.request('/probe')).rejects.toMatchObject({ status: 401 });
    expect(backend.count('/auth/mobile/refresh')).toBe(1);
    expect(manager.getState().status).toBe('signedOut');
  });

  it('27. auth endpoints never carry a Bearer token and are never refreshed-and-retried', async () => {
    const { manager, backend } = await signedIn();
    backend.failNext('/auth/mobile/login', 401);
    await expect(manager.signIn('a@b.test', 'Password-123')).rejects.toMatchObject({ status: 401 });
    expect(backend.count('/auth/mobile/refresh')).toBe(0);
    expect(backend.log.filter((r) => r.path.startsWith('/auth/mobile')).every((r) => !r.headers.Authorization)).toBe(true);
  });

  it('28. an ambiguous refresh during a request surfaces the original 401 once and puts the session in recovery (no loop)', async () => {
    const { manager, backend } = await signedIn();
    backend.expireAccessTokens();
    backend.failNext('/auth/mobile/refresh', 'network');
    await expect(manager.api.request('/probe')).rejects.toMatchObject({ status: 401 });
    expect(manager.getState().status).toBe('recovery');
    expect(backend.count('/auth/mobile/refresh')).toBe(1);
    expect(backend.count('/probe')).toBe(1);
  });
});

describe('P11A mobile session: logout and cleanup', () => {
  it('29. logout revokes server-side, deletes the credential, clears memory and the query cache hook', async () => {
    const { manager, backend, cleared } = setup();
    backend.addUser({ email: 'a@b.test' });
    await manager.signIn('a@b.test', 'Password-123');
    const token = stored().refreshToken;
    const res = await manager.signOut();
    expect(res).toEqual({ serverConfirmed: true, localCleared: true });
    expect(backend.log.filter((r) => r.path === '/auth/mobile/logout')[0].body).toEqual({ refreshToken: token });
    expect(backend.refreshTokens.get(token)!.revoked).toBe(true);
    expect(store.size).toBe(0);
    expect(cleared).toHaveBeenCalled();
    expect(manager.getState()).toEqual({ status: 'signedOut', reason: 'none' });
    // the access token is gone: an authenticated call sends no Bearer header
    await manager.api.request('/probe').catch(() => undefined);
    expect(backend.log.filter((r) => r.path === '/probe').every((r) => !r.headers.Authorization)).toBe(true);
  });

  it('30. logout with the network down STILL clears the device session and says server revocation was not confirmed', async () => {
    const { manager, backend } = setup();
    backend.addUser({ email: 'a@b.test' });
    await manager.signIn('a@b.test', 'Password-123');
    backend.failNext('/auth/mobile/logout', 'network');
    const res = await manager.signOut();
    expect(res.serverConfirmed).toBe(false);
    expect(res.localCleared).toBe(true);
    expect(store.size).toBe(0);
    expect(manager.getState()).toEqual({ status: 'signedOut', reason: 'server_unconfirmed' });
  });

  it('31. after logout the old refresh token cannot be restored (a new app launch is signed out)', async () => {
    const { manager, backend } = setup();
    backend.addUser({ email: 'a@b.test' });
    await manager.signIn('a@b.test', 'Password-123');
    await manager.signOut();
    const again = setup();
    again.backend.users = backend.users;
    again.backend.refreshTokens = backend.refreshTokens;
    await again.manager.restore();
    expect(again.manager.getState()).toEqual({ status: 'signedOut', reason: 'none' });
  });

  it('32. SecureStorage failure while clearing does not keep the in-memory session alive', async () => {
    const { manager, backend } = setup({
      storage: {
        read: async () => ({ refreshToken: 'r'.repeat(40), expiresAt: new Date(Date.now() + 1e9).toISOString() }),
        write: async () => undefined,
        clear: async () => {
          throw new SecureStorageError();
        }
      }
    });
    backend.addUser({ email: 'a@b.test' });
    await manager.signIn('a@b.test', 'Password-123');
    const res = await manager.signOut();
    expect(res.localCleared).toBe(false);
    expect(manager.getState().status).toBe('signedOut');
  });
});

describe('P11A mobile session: no token logging at runtime', () => {
  it('36. a full lifecycle (sign in, refresh, failed refresh, sign out) never writes a token or password to any console channel', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined));
    const { manager, backend } = setup();
    backend.addUser({ email: 'a@b.test' });
    await manager.signIn('a@b.test', 'Password-123');
    const firstRefresh = stored().refreshToken;
    backend.expireAccessTokens();
    await manager.api.request('/probe');
    backend.failNext('/auth/mobile/logout', 'network');
    await manager.signOut();
    const out = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    spies.forEach((s) => s.mockRestore());
    expect(out).not.toContain(firstRefresh);
    expect(out).not.toMatch(/refresh-|access-|Password-123/);
  });
});

describe('P11A SecureStore wrapper', () => {
  it('33. unreadable stored content is treated as no session and removed', async () => {
    store.set(SESSION_KEY, '{not json');
    expect(await secureSessionStorage.read()).toBeNull();
    expect(store.has(SESSION_KEY)).toBe(false);
  });

  it('34. a SecureStore failure is a SecureStorageError (never a silent fallback)', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keystore unavailable'));
    await expect(secureSessionStorage.read()).rejects.toBeInstanceOf(SecureStorageError);
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error('nope'));
    await expect(secureSessionStorage.write({ refreshToken: 'x', expiresAt: 'y' })).rejects.toBeInstanceOf(SecureStorageError);
  });

  it('35. ApiError semantics', () => {
    expect(new ApiError('network', 0, 'N').ambiguous).toBe(true);
    expect(new ApiError('http', 503, 'X').ambiguous).toBe(true);
    expect(new ApiError('http', 429, 'X').ambiguous).toBe(false);
    expect(new ApiError('http', 429, 'X').retryable).toBe(true);
    expect(new ApiError('http', 409, 'X').retryable).toBe(false);
  });
});
