import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma as appPrisma } from '../config/database.js';
import { hashToken } from '../utils/hash.js';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const CLIENT = 'protein-bowl-mobile/1.0.0 (android)';
const PASSWORD = 'Mobile-Test-Pass-1';

const mobile = (path: string) => request(app).post(`/api/v1/auth/mobile${path}`).set('X-PB-Client', CLIENT);

describe('P11A — customer mobile authentication transport', () => {
  const ts = Date.now();
  const email = (k: string) => `p11a.${k}.${ts}@proteinbowl.test`;
  const users: Record<string, { id: string; email: string }> = {};

  async function makeUser(key: string, roles: RoleEnum[], status: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE') {
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    const u = await prisma.user.create({
      data: { email: email(key), passwordHash, status, roles: { create: roles.map((role) => ({ role })) } }
    });
    users[key] = { id: u.id, email: u.email };
  }

  beforeAll(async () => {
    await makeUser('staff', [RoleEnum.CHEF]);
    await makeUser('admin', [RoleEnum.SUPER_ADMIN]);
    await makeUser('legacy', [RoleEnum.MESS_CUSTOMER]);
    await makeUser('suspended', [RoleEnum.CUSTOMER], 'SUSPENDED');
    await makeUser('norole', []);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function registerMobile(key: string) {
    const res = await mobile('/register').send({ email: email(key), password: PASSWORD, fullName: 'Mobile Customer' });
    return res;
  }

  describe('A. register / login', () => {
    it('1. registers a CUSTOMER and returns the session material in the body (201)', async () => {
      const res = await registerMobile('reg1');
      expect(res.status).toBe(201);
      expect(res.body.data.user.roles).toEqual(['CUSTOMER']);
      expect(typeof res.body.data.accessToken).toBe('string');
      expect(typeof res.body.data.refreshToken).toBe('string');
      expect(res.body.data.refreshToken.length).toBeGreaterThanOrEqual(32);
      expect(new Date(res.body.data.refreshTokenExpiresAt).getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 3600 * 1000);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
    });

    it('2. the stored refresh token is the hashed token of the SAME refresh_tokens table', async () => {
      const res = await registerMobile('reg2');
      const row = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(res.body.data.refreshToken) } });
      expect(row).not.toBeNull();
      expect(row!.revokedAt).toBeNull();
      expect(row!.userId).toBe(res.body.data.user.id);
    });

    it('3. register cannot mint staff / mess roles and rejects unknown fields (strict)', async () => {
      const a = await mobile('/register').send({ email: email('reg3'), password: PASSWORD, fullName: 'X Y', requestedRole: 'CHEF' });
      expect(a.status).toBe(422);
      const b = await mobile('/register').send({ email: email('reg3'), password: PASSWORD, fullName: 'X Y', requestedRole: 'MESS_CUSTOMER' });
      expect(b.status).toBe(422);
      const c = await mobile('/register').send({ email: email('reg3'), password: PASSWORD, fullName: 'X Y', isAdmin: true });
      expect(c.status).toBe(422);
    });

    it('4. register enforces the customer password policy and duplicate email', async () => {
      const weak = await mobile('/register').send({ email: email('reg4'), password: 'short', fullName: 'X Y' });
      expect(weak.status).toBe(422);
      await registerMobile('reg4');
      const dup = await registerMobile('reg4');
      expect(dup.status).toBe(409);
      expect(dup.body.error).toBe('EMAIL_EXISTS');
    });

    it('5. a CUSTOMER can log in (200) and receives a refresh token in the body', async () => {
      await registerMobile('login1');
      const res = await mobile('/login').send({ email: email('login1'), password: PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.data.user.roles).toEqual(['CUSTOMER']);
      expect(res.body.data.refreshToken).toBeTruthy();
    });

    it('6. wrong password / unknown user: the same 401 INVALID_CREDENTIALS', async () => {
      await registerMobile('login2');
      const a = await mobile('/login').send({ email: email('login2'), password: 'Wrong-Password-1' });
      const b = await mobile('/login').send({ email: email('nobody'), password: PASSWORD });
      expect(a.status).toBe(401);
      expect(b.status).toBe(401);
      expect(a.body.error).toBe('INVALID_CREDENTIALS');
      expect(b.body.error).toBe('INVALID_CREDENTIALS');
    });

    it('7. staff, SUPER_ADMIN and legacy MESS_CUSTOMER are refused 403 CUSTOMER_APP_ONLY and NO session is created', async () => {
      for (const key of ['staff', 'admin', 'legacy', 'norole']) {
        const before = await prisma.refreshToken.count({ where: { userId: users[key].id } });
        const res = await mobile('/login').send({ email: users[key].email, password: PASSWORD });
        expect(res.status, key).toBe(403);
        expect(res.body.error, key).toBe('CUSTOMER_APP_ONLY');
        expect(JSON.stringify(res.body)).not.toMatch(/accessToken|refreshToken/);
        expect(await prisma.refreshToken.count({ where: { userId: users[key].id } }), key).toBe(before);
      }
    });

    it('8. a staff account with a WRONG password still gets 401 (the role is not revealed before the password)', async () => {
      const res = await mobile('/login').send({ email: users.staff.email, password: 'Wrong-Password-1' });
      expect(res.status).toBe(401);
    });

    it('9. an inactive account cannot log in (403 ACCOUNT_INACTIVE)', async () => {
      const res = await mobile('/login').send({ email: users.suspended.email, password: PASSWORD });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('ACCOUNT_INACTIVE');
    });

    it('10. the login body is strict (unknown fields refused)', async () => {
      const res = await mobile('/login').send({ email: users.staff.email, password: PASSWORD, role: 'CUSTOMER' });
      expect(res.status).toBe(422);
    });
  });

  describe('B. refresh / rotation / reuse', () => {
    async function session(key: string) {
      await registerMobile(key);
      const res = await mobile('/login').send({ email: email(key), password: PASSWORD });
      return res.body.data as { accessToken: string; refreshToken: string; user: { id: string } };
    }

    it('11. refresh rotates: new tokens in the body, old token revoked, new token stored hashed', async () => {
      const s = await session('rot1');
      const res = await mobile('/refresh').send({ refreshToken: s.refreshToken });
      expect(res.status).toBe(200);
      expect(res.body.data.refreshToken).toBeTruthy();
      expect(res.body.data.refreshToken).not.toBe(s.refreshToken);
      expect(res.body.data.accessToken).toBeTruthy();
      expect(res.body.data.user).toBeUndefined();
      const old = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(s.refreshToken) } });
      expect(old!.revokedAt).not.toBeNull();
      const fresh = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(res.body.data.refreshToken) } });
      expect(fresh!.revokedAt).toBeNull();
      const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${res.body.data.accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body.data.user.roles).toEqual(['CUSTOMER']);
    });

    it('12. reuse of a rotated token => 401 TOKEN_REUSED and ALL the user sessions are revoked (no replay grace)', async () => {
      const s = await session('reuse1');
      const r1 = await mobile('/refresh').send({ refreshToken: s.refreshToken });
      expect(r1.status).toBe(200);
      const replay = await mobile('/refresh').send({ refreshToken: s.refreshToken });
      expect(replay.status).toBe(401);
      expect(replay.body.error).toBe('TOKEN_REUSED');
      const after = await mobile('/refresh').send({ refreshToken: r1.body.data.refreshToken });
      expect(after.status).toBe(401);
      expect(await prisma.refreshToken.count({ where: { userId: s.user.id, revokedAt: null } })).toBe(0);
    });

    it('13. unknown / malformed refresh token => 401 TOKEN_INVALID; missing => 422', async () => {
      const a = await mobile('/refresh').send({ refreshToken: 'not-a-real-token' });
      expect(a.status).toBe(401);
      expect(a.body.error).toBe('TOKEN_INVALID');
      const b = await mobile('/refresh').send({});
      expect(b.status).toBe(422);
      const c = await mobile('/refresh').send({ refreshToken: 'x'.repeat(300) });
      expect(c.status).toBe(422);
    });

    it('14. the refresh token is accepted ONLY from the JSON body (never query or cookie header)', async () => {
      const s = await session('src1');
      const q = await request(app).post(`/api/v1/auth/mobile/refresh?refreshToken=${s.refreshToken}`).set('X-PB-Client', CLIENT).send({});
      expect(q.status).toBe(422);
      const row = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(s.refreshToken) } });
      expect(row!.revokedAt).toBeNull();
    });

    it('15. an expired refresh token => 401 TOKEN_INVALID', async () => {
      const s = await session('exp1');
      await prisma.refreshToken.update({ where: { tokenHash: hashToken(s.refreshToken) }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const res = await mobile('/refresh').send({ refreshToken: s.refreshToken });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('TOKEN_INVALID');
    });

    it('16. a deactivated account: refresh => 401 ACCOUNT_INACTIVE and every session is revoked', async () => {
      const s = await session('inact1');
      await prisma.user.update({ where: { id: s.user.id }, data: { status: 'SUSPENDED' } });
      const res = await mobile('/refresh').send({ refreshToken: s.refreshToken });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('ACCOUNT_INACTIVE');
      expect(await prisma.refreshToken.count({ where: { userId: s.user.id, revokedAt: null } })).toBe(0);
    });

    it('17. a mobile session whose owner LOST customer authority fails safely: 403 CUSTOMER_APP_ONLY, nothing rotated', async () => {
      const s = await session('lost1');
      await prisma.userRoleAssignment.create({ data: { userId: s.user.id, role: RoleEnum.CHEF } });
      const res = await mobile('/refresh').send({ refreshToken: s.refreshToken });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('CUSTOMER_APP_ONLY');
      expect(JSON.stringify(res.body)).not.toMatch(/accessToken|refreshToken"/);
      const row = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(s.refreshToken) } });
      expect(row!.revokedAt).toBeNull();
      expect(await prisma.refreshToken.count({ where: { userId: s.user.id } })).toBe(2); // register + login: no token was added by the refused refresh
    });

    it('18. rotation is ATOMIC: a failure creating the new token leaves the old token un-revoked', async () => {
      const s = await session('atomic1');
      const orig = appPrisma.$transaction.bind(appPrisma);
      const spy = vi.spyOn(appPrisma, '$transaction').mockImplementationOnce(((fn: any) =>
        orig(async (tx: any) =>
          fn(
            new Proxy(tx, {
              get(t, p) {
                if (p === 'refreshToken') {
                  return { update: t.refreshToken.update.bind(t.refreshToken), create: () => Promise.reject(new Error('simulated failure')) };
                }
                return t[p];
              }
            })
          )
        )) as any);
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const res = await mobile('/refresh').send({ refreshToken: s.refreshToken });
      const logged = JSON.stringify(errSpy.mock.calls.map((c) => c.map((x) => (x instanceof Error ? `${x.message}${x.stack}` : String(x)))));
      errSpy.mockRestore();
      spy.mockRestore();
      expect(logged).not.toContain(s.refreshToken); // no raw token is ever logged
      expect(res.status).toBe(500);
      const row = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(s.refreshToken) } });
      expect(row!.revokedAt).toBeNull();
      // the session still works afterwards
      const again = await mobile('/refresh').send({ refreshToken: s.refreshToken });
      expect(again.status).toBe(200);
    });

    it('19. parallel refreshes never 500 and never leave the user without a usable token', async () => {
      const s = await session('par1');
      const results = await Promise.all([1, 2, 3].map(() => mobile('/refresh').send({ refreshToken: s.refreshToken })));
      for (const r of results) expect([200, 401]).toContain(r.status);
      expect(results.some((r) => r.status === 200)).toBe(true);
    });
  });

  describe('C. logout', () => {
    it('20. logout revokes the server session, needs no cookie, and is idempotent', async () => {
      await registerMobile('out1');
      const login = await mobile('/login').send({ email: email('out1'), password: PASSWORD });
      const rt = login.body.data.refreshToken;
      const a = await mobile('/logout').send({ refreshToken: rt });
      expect(a.status).toBe(200);
      const row = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(rt) } });
      expect(row!.revokedAt).not.toBeNull();
      const b = await mobile('/logout').send({ refreshToken: rt });
      expect(b.status).toBe(200);
      const c = await mobile('/logout').send({ refreshToken: 'a-token-that-never-existed' });
      expect(c.status).toBe(200);
      expect(a.body).toEqual(b.body);
      expect(b.body).toEqual(c.body);
    });

    it('21. after logout the refresh token is dead (TOKEN_REUSED when replayed)', async () => {
      await registerMobile('out2');
      const login = await mobile('/login').send({ email: email('out2'), password: PASSWORD });
      await mobile('/logout').send({ refreshToken: login.body.data.refreshToken });
      const res = await mobile('/refresh').send({ refreshToken: login.body.data.refreshToken });
      expect(res.status).toBe(401);
    });

    it('22. logout of one device does not revoke another session of the same user', async () => {
      await registerMobile('out3');
      const a = await mobile('/login').send({ email: email('out3'), password: PASSWORD });
      const b = await mobile('/login').send({ email: email('out3'), password: PASSWORD });
      await mobile('/logout').send({ refreshToken: a.body.data.refreshToken });
      const res = await mobile('/refresh').send({ refreshToken: b.body.data.refreshToken });
      expect(res.status).toBe(200);
    });

    it('23. logout requires a strict body', async () => {
      expect((await mobile('/logout').send({})).status).toBe(422);
    });
  });

  describe('D. browser exclusion, client contract, headers', () => {
    const body = () => ({ email: email('login1'), password: PASSWORD });

    it('24. browser-oriented request context is rejected on EVERY mobile route (Origin, Cookie, Sec-Fetch-*)', async () => {
      const headers: Array<[string, string]> = [
        ['Origin', 'http://localhost:3000'],
        ['Cookie', 'pb_refresh_token=abc'],
        ['Sec-Fetch-Site', 'same-site'],
        ['Sec-Fetch-Mode', 'cors'],
        ['Sec-Fetch-Dest', 'empty']
      ];
      for (const path of ['/register', '/login', '/refresh', '/logout']) {
        for (const [k, v] of headers) {
          const res = await request(app).post(`/api/v1/auth/mobile${path}`).set('X-PB-Client', CLIENT).set(k, v).send(body());
          expect(res.status, `${path} ${k}`).toBe(403);
          expect(res.body.error, `${path} ${k}`).toBe('MOBILE_ROUTE_NOT_FOR_BROWSERS');
          expect(res.headers['set-cookie']).toBeUndefined();
        }
      }
    });

    it('25. a disallowed browser Origin still gets no refresh token (the origin check and the guard both refuse)', async () => {
      const res = await request(app).post('/api/v1/auth/mobile/login').set('X-PB-Client', CLIENT).set('Origin', 'https://evil.example').send(body());
      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).not.toMatch(/refreshToken/);
    });

    it('26. a missing or malformed client contract is refused 400 INVALID_CLIENT_CONTRACT', async () => {
      const bad = [undefined, '', 'protein-bowl-mobile', 'protein-bowl-mobile/1.0 (android)', 'protein-bowl-mobile/1.0.0', 'protein-bowl-mobile/1.0.0 (windows)',
        'protein-bowl-mobile/1.0.0-beta (android)', 'Protein-Bowl-Mobile/1.0.0 (android)', 'protein-bowl-mobile/1.0.0 (android) extra', 'protein-bowl-mobile/99999.0.0 (ios)', 'curl/8'];
      for (const h of bad) {
        let r = request(app).post('/api/v1/auth/mobile/login');
        if (h !== undefined) r = r.set('X-PB-Client', h);
        const res = await r.send(body());
        expect(res.status, String(h)).toBe(400);
        expect(res.body.error, String(h)).toBe('INVALID_CLIENT_CONTRACT');
      }
    });

    it('27. both platform markers are accepted', async () => {
      for (const c of ['protein-bowl-mobile/1.0.0 (android)', 'protein-bowl-mobile/2.10.3 (ios)']) {
        const res = await request(app).post('/api/v1/auth/mobile/login').set('X-PB-Client', c).send(body());
        expect(res.status).toBe(200);
      }
    });

    it('28. mobile responses are Cache-Control: no-store and never set or clear a cookie (success AND error)', async () => {
      const ok = await mobile('/login').send(body());
      const bad = await mobile('/login').send({ email: email('login1'), password: 'Wrong-Password-1' });
      const guard = await request(app).post('/api/v1/auth/mobile/login').send(body());
      const refresh = await mobile('/refresh').send({ refreshToken: 'nope' });
      const logout = await mobile('/logout').send({ refreshToken: 'nope' });
      for (const r of [ok, bad, guard, refresh, logout]) {
        expect(r.headers['cache-control']).toBe('no-store');
        expect(r.headers['set-cookie']).toBeUndefined();
      }
    });

    it('29. the refresh token never appears in an error body, the request is never echoed', async () => {
      const token = 'secret-looking-token-value-1234567890-abcdef';
      const res = await mobile('/refresh').send({ refreshToken: token, extra: 1 });
      expect(JSON.stringify(res.body)).not.toContain(token);
      const res2 = await mobile('/refresh').send({ refreshToken: token });
      expect(JSON.stringify(res2.body)).not.toContain(token);
    });
  });

  describe('E. web auth is unchanged', () => {
    it('30. web register/login/refresh NEVER return a refresh token in the body; the cookie flow is intact', async () => {
      const reg = await request(app).post('/api/v1/auth/register').send({ email: email('web1'), password: PASSWORD, fullName: 'Web User' });
      expect(reg.status).toBe(201);
      expect(Object.keys(reg.body.data).sort()).toEqual(['accessToken', 'user']);
      expect(JSON.stringify(reg.body)).not.toMatch(/refreshToken/i);
      expect(String(reg.headers['set-cookie'])).toMatch(/pb_refresh_token=.*HttpOnly/);

      const login = await request(app).post('/api/v1/auth/login').send({ email: email('web1'), password: PASSWORD });
      expect(login.status).toBe(200);
      expect(Object.keys(login.body.data).sort()).toEqual(['accessToken', 'user']);
      expect(JSON.stringify(login.body)).not.toMatch(/refreshToken/i);
      const cookie = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
      expect(cookie.startsWith('pb_refresh_token=')).toBe(true);

      const refresh = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie).send({});
      expect(refresh.status).toBe(200);
      expect(Object.keys(refresh.body.data)).toEqual(['accessToken']);
      expect(JSON.stringify(refresh.body)).not.toMatch(/refreshToken/i);
      expect(String(refresh.headers['set-cookie'])).toMatch(/pb_refresh_token=.*HttpOnly/);

      const logout = await request(app).post('/api/v1/auth/logout').set('Cookie', (refresh.headers['set-cookie'] as unknown as string[])[0].split(';')[0]).send({});
      expect(logout.status).toBe(200);
      expect(String(logout.headers['set-cookie'])).toMatch(/pb_refresh_token=;/);
    });

    it('31. web login still lets staff sign in (the customer-only rule is mobile-only)', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({ email: users.staff.email, password: PASSWORD });
      expect(res.status).toBe(200);
    });

    it('32. a web cookie cannot be used on the mobile routes, and a mobile token cannot be used through the web cookie contract by mistake', async () => {
      const web = await request(app).post('/api/v1/auth/login').send({ email: email('web1'), password: PASSWORD });
      const cookie = (web.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
      const res = await mobile('/refresh').set('Cookie', cookie).send({});
      expect(res.status).toBe(403);
    });

    it('33. web refresh still accepts the refresh token in the body (pre-existing behaviour kept)', async () => {
      const m = await mobile('/login').send({ email: email('login1'), password: PASSWORD });
      const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: m.body.data.refreshToken });
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toMatch(/refreshToken/i);
    });
  });

  describe('F. audit', () => {
    it('34. mobile login / refresh / logout / refusal are audited WITHOUT tokens or passwords', async () => {
      await registerMobile('aud1');
      const login = await mobile('/login').send({ email: email('aud1'), password: PASSWORD });
      const rt = login.body.data.refreshToken;
      await mobile('/login').send({ email: users.staff.email, password: PASSWORD });
      const r = await mobile('/refresh').send({ refreshToken: rt });
      await mobile('/logout').send({ refreshToken: r.body.data.refreshToken });
      const rows = await prisma.auditLog.findMany({
        where: { action: { startsWith: 'MOBILE_AUTH_' }, createdAt: { gte: new Date(Date.now() - 60_000) } }
      });
      const actions = new Set(rows.map((x) => x.action));
      for (const a of ['MOBILE_AUTH_REGISTER', 'MOBILE_AUTH_LOGIN', 'MOBILE_AUTH_REFRESH', 'MOBILE_AUTH_LOGOUT', 'MOBILE_AUTH_CUSTOMER_APP_REFUSED']) {
        expect(actions.has(a), a).toBe(true);
      }
      const dump = JSON.stringify(rows);
      expect(dump).not.toContain(rt);
      expect(dump).not.toContain(r.body.data.refreshToken);
      expect(dump).not.toContain(login.body.data.accessToken);
      expect(dump).not.toContain(PASSWORD);
    });
  });

  describe('H. pre-commit review: identity invariant, information leaks, ordering', () => {
    const extra: Record<string, { id: string; email: string }> = {};
    async function makeExtra(key: string, roles: RoleEnum[]) {
      const passwordHash = await bcrypt.hash(PASSWORD, 4);
      const u = await prisma.user.create({ data: { email: email(key), passwordHash, roles: { create: roles.map((role) => ({ role })) } } });
      extra[key] = { id: u.id, email: u.email };
    }

    it('36. an anomalous mixed identity (CUSTOMER + staff role, only creatable by direct DB writes) is refused on mobile login, with no session', async () => {
      await makeExtra('mixedChef', [RoleEnum.CUSTOMER, RoleEnum.CHEF]);
      await makeExtra('mixedAdmin', [RoleEnum.CUSTOMER, RoleEnum.SUPER_ADMIN]);
      await makeExtra('mixedLegacy', [RoleEnum.CUSTOMER, RoleEnum.MESS_CUSTOMER]);
      for (const key of ['mixedChef', 'mixedAdmin', 'mixedLegacy']) {
        const res = await mobile('/login').send({ email: extra[key].email, password: PASSWORD });
        expect(res.status, key).toBe(403);
        expect(res.body.error, key).toBe('CUSTOMER_APP_ONLY');
        expect(await prisma.refreshToken.count({ where: { userId: extra[key].id } }), key).toBe(0);
      }
    });

    it('37. a wrong password is indistinguishable for customer, staff, SUPER_ADMIN, legacy MESS_CUSTOMER, mixed and unknown accounts', async () => {
      await registerMobile('leak1');
      const probes = [email('leak1'), users.staff.email, users.admin.email, users.legacy.email, extra.mixedChef.email, email('does-not-exist')];
      const results = [];
      for (const e of probes) {
        const res = await mobile('/login').send({ email: e, password: 'Wrong-Password-1' });
        results.push({ status: res.status, body: res.body, headers: { cc: res.headers['cache-control'], sc: res.headers['set-cookie'] } });
      }
      for (const r of results) expect(r).toEqual(results[0]);
      expect(results[0].status).toBe(401);
      expect(results[0].body.error).toBe('INVALID_CREDENTIALS');
    });

    it('38. browser context + VALID credentials: refused before any session or token-bearing body exists', async () => {
      await registerMobile('order1');
      const before = await prisma.refreshToken.count();
      const login = await request(app).post('/api/v1/auth/mobile/login').set('X-PB-Client', CLIENT).set('Origin', 'http://localhost:3000').send({ email: email('order1'), password: PASSWORD });
      expect(login.status).toBe(403);
      expect(JSON.stringify(login.body)).not.toMatch(/accessToken|refreshToken/);
      const reg = await request(app).post('/api/v1/auth/mobile/register').set('X-PB-Client', CLIENT).set('Sec-Fetch-Mode', 'cors').send({ email: email('order2'), password: PASSWORD, fullName: 'Browser Person' });
      expect(reg.status).toBe(403);
      expect(await prisma.user.count({ where: { email: email('order2') } })).toBe(0);
      expect(await prisma.refreshToken.count()).toBe(before);
    });

    it('39. X-PB-Client is not authentication: with it and no credentials nothing is granted', async () => {
      expect((await mobile('/login').send({})).status).toBe(422);
      expect((await mobile('/refresh').send({ refreshToken: 'x'.repeat(40) })).status).toBe(401);
      const me = await request(app).get('/api/v1/auth/me').set('X-PB-Client', CLIENT);
      expect(me.status).toBe(401);
    });

    it('40. rotation keeps the web contract: a rotated web cookie token reused is still TOKEN_REUSED, and refresh issues exactly one new row per rotation', async () => {
      await request(app).post('/api/v1/auth/register').send({ email: email('webrot'), password: PASSWORD, fullName: 'Web Rot' });
      const login = await request(app).post('/api/v1/auth/login').send({ email: email('webrot'), password: PASSWORD });
      const cookie = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
      const userId = login.body.data.user.id;
      const before = await prisma.refreshToken.count({ where: { userId } });
      const r1 = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie).send({});
      expect(r1.status).toBe(200);
      expect(await prisma.refreshToken.count({ where: { userId } })).toBe(before + 1);
      const reuse = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie).send({});
      expect(reuse.status).toBe(401);
      expect(reuse.body.error).toBe('TOKEN_REUSED');
      expect(await prisma.refreshToken.count({ where: { userId, revokedAt: null } })).toBe(0);
    });
  });

  describe('G. static guarantees', () => {
    it('35. no cookie API is used by the mobile auth code and no hard-coded minimum version exists', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const root = path.resolve(__dirname, '..');
      const files = ['modules/auth/auth.mobile.controller.ts', 'modules/auth/auth.mobile.routes.ts', 'middleware/mobileClient.middleware.ts'];
      for (const f of files) {
        const src = fs.readFileSync(path.join(root, f), 'utf8');
        expect(src, f).not.toMatch(/\.cookie\(|clearCookie|req\.cookies|cookieOptions/);
        expect(src, f).not.toMatch(/console\.(log|info)/);
      }
      const mw = fs.readFileSync(path.join(root, 'middleware/mobileClient.middleware.ts'), 'utf8');
      expect(mw).not.toMatch(/MIN_VERSION\s*=\s*['"]/);
    });
  });
});
