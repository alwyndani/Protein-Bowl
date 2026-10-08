import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import app from '../app.js';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const SECRET = process.env.JWT_ACCESS_SECRET || 'test_access_secret_key_1234567890_super_secret';
const ADMIN_PASSWORD = 'Adm1n-Strong#Pass-2026';
const STAFF_PASSWORD = 'Staff-Strong#Pass-2026';
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const sign = (userId: string, email: string, roles: RoleEnum[]) => jwt.sign({ userId, email, roles }, SECRET, { expiresIn: '15m' });

const SECRET_KEY_PATTERN = /passwordHash|tokenHash|basicSalary|bankAccount|"refreshToken"|\$2[aby]\$/;

describe('P6B — staff administration APIs & secure onboarding', () => {
  const ts = Date.now();
  let counter = 0;
  const email = (label: string) => `p6b_${label}_${++counter}_${ts}@test.com`;

  const users: Record<string, { id: string; email: string; token: string }> = {};
  const stepUps = new Map<string, string>();
  let branchA: { id: string };
  let branchB: { id: string };
  let branchInactive: { id: string };

  async function makeUser(key: string, roles: RoleEnum[], opts: { password?: string; withProfile?: boolean; branchIds?: string[] } = {}) {
    const mail = email(key);
    const user = await prisma.user.create({
      data: {
        email: mail,
        passwordHash: await bcrypt.hash(opts.password ?? ADMIN_PASSWORD, 10),
        status: 'ACTIVE',
        roles: { create: roles.map((role) => ({ role })) },
        ...(opts.withProfile
          ? {
              employeeProfile: {
                create: {
                  employeeCode: `P6B-${key.toUpperCase()}-${ts}-${counter}`,
                  fullName: `P6B ${key}`,
                  designation: 'Tester',
                  assignedBranchId: opts.branchIds?.[0] ?? null,
                  branchAssignments: { create: (opts.branchIds ?? []).map((branchId) => ({ branchId })) }
                }
              }
            }
          : {}),
        ...(roles.includes(RoleEnum.CUSTOMER)
          ? { customerProfile: { create: { fullName: `P6B ${key}`, referralCode: `PB-B${counter}${ts}` } } }
          : {})
      }
    });
    users[key] = { id: user.id, email: mail, token: sign(user.id, mail, roles) };
    return user;
  }

  async function stepUp(key: string): Promise<string> {
    const cached = stepUps.get(key);
    if (cached) return cached;
    const res = await request(app).post('/api/v1/admin/step-up').set(bearer(users[key].token)).send({ password: ADMIN_PASSWORD });
    expect(res.status).toBe(200);
    stepUps.set(key, res.body.data.stepUpToken);
    return res.body.data.stepUpToken;
  }

  async function as(key: string, withStepUp = true) {
    return withStepUp ? { ...bearer(users[key].token), 'X-Step-Up-Token': await stepUp(key) } : bearer(users[key].token);
  }

  /** Create a staff invitation through the real API. */
  async function createStaff(over: Record<string, unknown> = {}, adminKey = 'admin1') {
    const body = {
      email: email('staff'),
      fullName: 'Pending Person',
      designation: 'Line Cook',
      roles: ['CHEF'],
      branchIds: [branchA.id],
      ...over
    };
    const res = await request(app).post('/api/v1/admin/staff').set(await as(adminKey)).send(body);
    return { res, body, staff: res.body?.data?.staff, rawToken: res.body?.data?.invitation?.setupToken as string };
  }

  async function acceptAndLogin(rawToken: string, mail: string, password = STAFF_PASSWORD) {
    const accept = await request(app).post('/api/v1/auth/staff/accept-invite').send({ token: rawToken, password });
    expect(accept.status).toBe(200);
    const login = await request(app).post('/api/v1/auth/login').send({ email: mail, password });
    expect(login.status).toBe(200);
    return { accessToken: login.body.data.accessToken as string, cookie: (login.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('pb_refresh_token='))!.split(';')[0] };
  }

  beforeAll(async () => {
    branchA = await prisma.kitchenBranch.create({ data: { code: `p6b-a-${ts}`, name: 'P6B Branch A', address: 'A St', city: 'Kochi' } });
    branchB = await prisma.kitchenBranch.create({ data: { code: `p6b-b-${ts}`, name: 'P6B Branch B', address: 'B St', city: 'Kochi' } });
    branchInactive = await prisma.kitchenBranch.create({ data: { code: `p6b-x-${ts}`, name: 'P6B Closed', address: 'X St', city: 'Kochi', isActive: false } });

    await makeUser('admin1', [RoleEnum.SUPER_ADMIN]);
    await makeUser('admin2', [RoleEnum.SUPER_ADMIN]);
    await makeUser('md', [RoleEnum.MD], { withProfile: true, branchIds: [branchA.id] });
    await makeUser('chef', [RoleEnum.CHEF], { withProfile: true, branchIds: [branchA.id] });
    await makeUser('pos', [RoleEnum.POS], { withProfile: true, branchIds: [branchA.id] });
    await makeUser('customer', [RoleEnum.CUSTOMER]);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ============================================================ access control
  describe('access control of the admin APIs', () => {
    it('2/3. ordinary staff, MD and customers cannot administer staff; anonymous gets 401', async () => {
      for (const key of ['chef', 'pos', 'md', 'customer']) {
        const list = await request(app).get('/api/v1/admin/staff').set(bearer(users[key].token));
        const create = await request(app)
          .post('/api/v1/admin/staff')
          .set(bearer(users[key].token))
          .send({ email: email('x'), fullName: 'X Y', designation: 'Cook', roles: ['CHEF'], branchIds: [branchA.id] });
        const audit = await request(app).get('/api/v1/admin/audit').set(bearer(users[key].token));
        const branchCreate = await request(app).post('/api/v1/admin/branches').set(bearer(users[key].token)).send({ code: 'zz', name: 'ZZ', address: 'abc', city: 'KC' });
        const stepUpTry = await request(app).post('/api/v1/admin/step-up').set(bearer(users[key].token)).send({ password: ADMIN_PASSWORD });
        expect([list.status, create.status, audit.status, branchCreate.status, stepUpTry.status], key).toEqual([403, 403, 403, 403, 403]);
      }
      expect((await request(app).get('/api/v1/admin/staff')).status).toBe(401);
    });

    it('customers cannot even read branch admin data; MD can read branches but not mutate', async () => {
      expect((await request(app).get('/api/v1/admin/branches').set(bearer(users.customer.token))).status).toBe(403);
      expect((await request(app).get('/api/v1/admin/branches').set(bearer(users.md.token))).status).toBe(200);
      expect((await request(app).get(`/api/v1/admin/branches/${branchA.id}`).set(bearer(users.md.token))).status).toBe(200);
      expect((await request(app).patch(`/api/v1/admin/branches/${branchA.id}`).set(bearer(users.md.token)).send({ name: 'Hacked' })).status).toBe(403);
    });

    it('35. MD cannot read the audit API', async () => {
      expect((await request(app).get('/api/v1/admin/audit').set(bearer(users.md.token))).status).toBe(403);
    });
  });

  // ============================================================ create / invite
  describe('staff creation and invitation', () => {
    let created: Awaited<ReturnType<typeof createStaff>>;

    it('1/4. SUPER_ADMIN creates a PENDING staff account and receives a one-time manual hand-off', async () => {
      created = await createStaff({ roles: ['CHEF'], branchIds: [branchA.id, branchB.id] });
      expect(created.res.status).toBe(201);
      expect(created.staff.status).toBe('PENDING');
      expect(created.staff.roles.map((r: any) => r.role)).toEqual(['CHEF']);
      expect(created.staff.branches.map((b: any) => b.id).sort()).toEqual([branchA.id, branchB.id].sort());
      expect(created.staff.employeeProfile.primaryBranchId).toBe(branchA.id);

      const inv = created.res.body.data.invitation;
      expect(inv.deliveryMode).toBe('manual');
      expect(inv.sentByEmail).toBe(false);
      expect(inv.setupToken).toMatch(/^[0-9a-f]{64}$/);
      expect(inv.setupLink).toContain('#token=' + inv.setupToken);
      expect(inv.note).toMatch(/No email was sent/);
    });

    it('5. only the SHA-256 hash is stored; the raw token never reaches the DB, audit log or later responses', async () => {
      const raw = created.rawToken;
      const rows = await prisma.staffInvitation.findMany({ where: { userId: created.staff.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0].tokenHash).toBe(sha256(raw));
      expect(JSON.stringify(rows)).not.toContain(raw);

      const auditRows = await prisma.auditLog.findMany({ where: { entityId: created.staff.id } });
      expect(auditRows.length).toBeGreaterThanOrEqual(2); // STAFF_CREATED + STAFF_INVITED
      expect(JSON.stringify(auditRows)).not.toContain(raw);

      const detail = await request(app).get(`/api/v1/admin/staff/${created.staff.id}`).set(bearer(users.admin1.token));
      const list = await request(app).get(`/api/v1/admin/staff?q=${encodeURIComponent(created.staff.email)}`).set(bearer(users.admin1.token));
      const audit = await request(app).get(`/api/v1/admin/audit?entityId=${created.staff.id}`).set(bearer(users.admin1.token));
      for (const res of [detail, list, audit]) {
        expect(JSON.stringify(res.body)).not.toContain(raw);
        expect(JSON.stringify(res.body)).not.toContain(sha256(raw));
      }
      expect(detail.body.data.invitation.state).toBe('ACTIVE');
    });

    it('the placeholder credential is unusable: login is refused and it is not a known password', async () => {
      const user = await prisma.user.findUnique({ where: { id: created.staff.id } });
      expect(user!.passwordHash).toMatch(/^\$2[aby]\$/);
      for (const guess of ['Password123!', created.rawToken, 'changeme', created.staff.email]) {
        expect(await bcrypt.compare(guess, user!.passwordHash)).toBe(false);
      }
      const login = await request(app).post('/api/v1/auth/login').send({ email: created.staff.email, password: 'Password123!' });
      expect(login.status).toBe(401);
    });

    it('creation requires step-up and validates input (unknown role, bad id, unknown field, missing branch)', async () => {
      const noStepUp = await request(app).post('/api/v1/admin/staff').set(bearer(users.admin1.token)).send({ email: email('n'), fullName: 'No Step', designation: 'Cook', roles: ['CHEF'], branchIds: [branchA.id] });
      expect(noStepUp.status).toBe(403);
      expect(noStepUp.body.error).toBe('STEP_UP_REQUIRED');

      const h = await as('admin1');
      const base = { email: email('v'), fullName: 'Valid Name', designation: 'Cook', roles: ['CHEF'], branchIds: [branchA.id] };
      expect((await request(app).post('/api/v1/admin/staff').set(h).send({ ...base, roles: ['WIZARD'] })).status).toBe(422);
      expect((await request(app).post('/api/v1/admin/staff').set(h).send({ ...base, roles: [] })).status).toBe(422);
      expect((await request(app).post('/api/v1/admin/staff').set(h).send({ ...base, branchIds: ['not-a-uuid'] })).status).toBe(422);
      expect((await request(app).post('/api/v1/admin/staff').set(h).send({ ...base, isAdmin: true })).status).toBe(422);
      expect((await request(app).post('/api/v1/admin/staff').set(h).send({ ...base, email: 'nope' })).status).toBe(422);
      const noBranch = await request(app).post('/api/v1/admin/staff').set(h).send({ ...base, branchIds: [] });
      expect(noBranch.status).toBe(422);
      expect(noBranch.body.error).toBe('BRANCH_REQUIRED');
      expect((await request(app).post('/api/v1/admin/staff').set(h).send({ ...base, branchIds: ['00000000-0000-4000-8000-000000000000'] })).status).toBe(422);
    });

    it('12-14. SUPER_ADMIN, CUSTOMER and MESS_CUSTOMER cannot be assigned at creation', async () => {
      for (const role of ['SUPER_ADMIN', 'CUSTOMER', 'MESS_CUSTOMER']) {
        const res = await request(app)
          .post('/api/v1/admin/staff')
          .set(await as('admin1'))
          .send({ email: email('bad'), fullName: 'Bad Role', designation: 'Cook', roles: [role], branchIds: [branchA.id] });
        expect(res.status, role).toBe(403);
        expect(res.body.error).toBe('ROLE_NOT_ASSIGNABLE');
      }
    });

    it('duplicate emails (any case) are rejected, and an existing customer cannot be converted to staff', async () => {
      const dupe = await createStaff({ email: created.staff.email.toUpperCase() });
      expect(dupe.res.status).toBe(409);
      const customerDupe = await createStaff({ email: users.customer.email });
      expect(customerDupe.res.status).toBe(409);
    });

    it('an inactive branch cannot be assigned at creation', async () => {
      const res = await createStaff({ branchIds: [branchInactive.id] });
      expect(res.res.status).toBe(409);
      expect(res.res.body.error).toBe('BRANCH_INACTIVE');
    });
  });

  // ============================================================ invitation acceptance
  describe('invitation acceptance', () => {
    it('6/10/39. acceptance activates the account; the staff member can log in; /staff/me shows DB roles and branches', async () => {
      const c = await createStaff({ fullName: 'Asha Kitchen', roles: ['CHEF'], branchIds: [branchA.id] });
      const { accessToken } = await acceptAndLogin(c.rawToken, c.staff.email);

      const user = await prisma.user.findUnique({ where: { id: c.staff.id } });
      expect(user!.status).toBe('ACTIVE');
      const inv = await prisma.staffInvitation.findFirst({ where: { userId: c.staff.id } });
      expect(inv!.usedAt).not.toBeNull();
      expect(await prisma.auditLog.count({ where: { action: 'STAFF_INVITATION_ACCEPTED', entityId: c.staff.id } })).toBe(1);

      const me = await request(app).get('/api/v1/staff/me').set(bearer(accessToken));
      expect(me.status).toBe(200);
      expect(me.body.data.roles.map((r: any) => r.role)).toEqual(['CHEF']);
      expect(me.body.data.branches.map((b: any) => b.id)).toEqual([branchA.id]);
      expect(me.body.data.permissions).toEqual(expect.arrayContaining(['kds:read', 'kds:write']));
      expect(me.body.data.scope).toEqual({ isGlobal: false, isGlobalRead: false });
      expect(JSON.stringify(me.body)).not.toMatch(SECRET_KEY_PATTERN);
      // and the new account really works against P6A branch scope
      expect((await request(app).get('/api/v1/kds/tickets').set(bearer(accessToken))).status).toBe(200);
    });

    it('7. an invitation cannot be reused', async () => {
      const c = await createStaff();
      await acceptAndLogin(c.rawToken, c.staff.email);
      const again = await request(app).post('/api/v1/auth/staff/accept-invite').send({ token: c.rawToken, password: 'Another-Strong#Pass-9' });
      expect(again.status).toBe(400);
      expect(again.body.error).toBe('INVALID_INVITATION');
      // the first password still works, the second never took effect
      expect((await request(app).post('/api/v1/auth/login').send({ email: c.staff.email, password: 'Another-Strong#Pass-9' })).status).toBe(401);
    });

    it('8/9. expired, revoked and unknown invitations all return the same safe error', async () => {
      const expired = await createStaff();
      await prisma.staffInvitation.updateMany({ where: { userId: expired.staff.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const unknownToken = crypto.randomBytes(32).toString('hex');

      const responses = await Promise.all(
        [expired.rawToken, unknownToken].map((token) => request(app).post('/api/v1/auth/staff/accept-invite').send({ token, password: STAFF_PASSWORD }))
      );
      for (const res of responses) {
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('INVALID_INVITATION');
      }
      expect(responses[0].body.message).toBe(responses[1].body.message); // indistinguishable
      expect((await prisma.user.findUnique({ where: { id: expired.staff.id } }))!.status).toBe('PENDING');
      // rejected attempts are audited internally
      expect(await prisma.auditLog.count({ where: { action: 'STAFF_INVITATION_REJECTED', entityId: { not: null } } })).toBeGreaterThan(0);
    });

    it('9b. malformed tokens fail validation without touching accounts', async () => {
      expect((await request(app).post('/api/v1/auth/staff/accept-invite').send({ token: 'short', password: STAFF_PASSWORD })).status).toBe(422);
      expect((await request(app).post('/api/v1/auth/staff/accept-invite').send({ password: STAFF_PASSWORD })).status).toBe(422);
    });

    it('11. the 12-character staff password policy is enforced and a rejected password does not consume the invitation', async () => {
      const c = await createStaff({ fullName: 'Rohan Mehta' });
      const accept = (password: string) => request(app).post('/api/v1/auth/staff/accept-invite').send({ token: c.rawToken, password });

      expect((await accept('Short#1Ab')).status).toBe(422);                               // < 12
      expect((await accept('Password123!')).status).toBe(422);                            // 12 chars but well-known
      expect((await accept('alllowercaseonly')).status).toBe(422);                        // one character class, < 20
      expect((await accept(`${c.staff.email.split('@')[0]}-Zz9!`)).status).toBe(422);     // contains the email name
      expect((await accept('Rohan-Mehta#2026!')).status).toBe(422);                       // contains the person's name

      expect((await prisma.user.findUnique({ where: { id: c.staff.id } }))!.status).toBe('PENDING');
      expect((await prisma.staffInvitation.findFirst({ where: { userId: c.staff.id } }))!.usedAt).toBeNull();

      const ok = await accept('a long quiet passphrase of words');                         // 20+ chars passphrase is allowed
      expect(ok.status).toBe(200);
    });

    it('acceptance revokes sessions that existed before the credential was set', async () => {
      const c = await createStaff();
      const stale = await prisma.refreshToken.create({ data: { userId: c.staff.id, tokenHash: sha256(`stale-${c.staff.id}`), expiresAt: new Date(Date.now() + 86400000) } });
      await request(app).post('/api/v1/auth/staff/accept-invite').send({ token: c.rawToken, password: STAFF_PASSWORD });
      expect((await prisma.refreshToken.findUnique({ where: { id: stale.id } }))!.revokedAt).not.toBeNull();
    });

    it('concurrent acceptance of one invitation succeeds exactly once', async () => {
      const c = await createStaff();
      const results = await Promise.all(
        Array.from({ length: 4 }, (_, i) => request(app).post('/api/v1/auth/staff/accept-invite').send({ token: c.rawToken, password: `Concurrent-Pass#${i}-2026` }))
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 400)).toHaveLength(3);
    });

    it('an invitation for an account that was deleted, deactivated or turned into a mixed identity is rejected', async () => {
      const deleted = await createStaff();
      await prisma.user.update({ where: { id: deleted.staff.id }, data: { deletedAt: new Date() } });
      expect((await request(app).post('/api/v1/auth/staff/accept-invite').send({ token: deleted.rawToken, password: STAFF_PASSWORD })).status).toBe(400);

      const mixed = await createStaff();
      await prisma.userRoleAssignment.create({ data: { userId: mixed.staff.id, role: RoleEnum.CUSTOMER } });
      expect((await request(app).post('/api/v1/auth/staff/accept-invite').send({ token: mixed.rawToken, password: STAFF_PASSWORD })).status).toBe(400);
      expect((await prisma.user.findUnique({ where: { id: mixed.staff.id } }))!.status).toBe('PENDING');
    });
  });

  // ============================================================ reissue
  describe('invitation reissue', () => {
    it('29. reissuing invalidates the old invitation; the new one works', async () => {
      const c = await createStaff();
      const re = await request(app).post(`/api/v1/admin/staff/${c.staff.id}/invitation`).set(await as('admin1'));
      expect(re.status).toBe(200);
      const newToken = re.body.data.invitation.setupToken as string;
      expect(newToken).not.toBe(c.rawToken);
      expect(re.body.data.invitation.deliveryMode).toBe('manual');

      expect((await request(app).post('/api/v1/auth/staff/accept-invite').send({ token: c.rawToken, password: STAFF_PASSWORD })).status).toBe(400);
      expect((await request(app).post('/api/v1/auth/staff/accept-invite').send({ token: newToken, password: STAFF_PASSWORD })).status).toBe(200);

      const rows = await prisma.staffInvitation.findMany({ where: { userId: c.staff.id } });
      expect(rows).toHaveLength(2);
      expect(JSON.stringify(rows)).not.toContain(newToken);
      expect(await prisma.auditLog.count({ where: { action: 'STAFF_INVITATION_REISSUED', entityId: c.staff.id } })).toBe(1);
    });

    it('30. an ACTIVE account cannot be re-credentialed through reissue (no password-reset backdoor)', async () => {
      const res = await request(app).post(`/api/v1/admin/staff/${users.chef.id}/invitation`).set(await as('admin1'));
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('NOT_PENDING');
      expect(await prisma.staffInvitation.count({ where: { userId: users.chef.id } })).toBe(0);
      expect(await prisma.auditLog.count({ where: { action: 'ADMIN_ACTION_DENIED', entityId: users.chef.id } })).toBeGreaterThan(0);
    });
  });

  // ============================================================ list / detail / update
  describe('staff list, detail and update', () => {
    it('31/32. the staff list excludes customers and exposes no secrets or HR data', async () => {
      await prisma.hRMEmployee.create({
        data: { employeeProfileId: (await prisma.employeeProfile.findUnique({ where: { userId: users.chef.id } }))!.id, department: 'Kitchen', basicSalary: 54321, bankAccount: 'ACCT-SECRET-9999' }
      });
      const list = await request(app).get('/api/v1/admin/staff?pageSize=100').set(bearer(users.admin1.token));
      expect(list.status).toBe(200);
      const ids = list.body.data.items.map((s: any) => s.id);
      expect(ids).toContain(users.chef.id);
      expect(ids).not.toContain(users.customer.id);
      expect(JSON.stringify(list.body)).not.toMatch(SECRET_KEY_PATTERN);
      expect(JSON.stringify(list.body)).not.toContain('ACCT-SECRET-9999');
      expect(JSON.stringify(list.body)).not.toContain('54321');

      expect((await request(app).get(`/api/v1/admin/staff/${users.customer.id}`).set(bearer(users.admin1.token))).status).toBe(404);
      const detail = await request(app).get(`/api/v1/admin/staff/${users.chef.id}`).set(bearer(users.admin1.token));
      expect(detail.status).toBe(200);
      expect(JSON.stringify(detail.body)).not.toMatch(SECRET_KEY_PATTERN);
      expect(JSON.stringify(detail.body)).not.toContain('ACCT-SECRET-9999');
    });

    it('server-side filters and pagination work, and unsafe pagination is rejected', async () => {
      const byRole = await request(app).get(`/api/v1/admin/staff?role=POS&branchId=${branchA.id}&pageSize=100`).set(bearer(users.admin1.token));
      expect(byRole.status).toBe(200);
      expect(byRole.body.data.items.every((s: any) => s.roles.some((r: any) => r.role === 'POS'))).toBe(true);
      expect(byRole.body.data.items.map((s: any) => s.id)).toContain(users.pos.id);

      const search = await request(app).get(`/api/v1/admin/staff?q=${encodeURIComponent(users.pos.email)}`).set(bearer(users.admin1.token));
      expect(search.body.data.total).toBe(1);

      const paged = await request(app).get('/api/v1/admin/staff?page=1&pageSize=2').set(bearer(users.admin1.token));
      expect(paged.body.data.items).toHaveLength(2);
      expect(paged.body.data.pageSize).toBe(2);
      expect(paged.body.data.totalPages).toBeGreaterThan(1);

      for (const bad of ['pageSize=1000', 'pageSize=0', 'page=0', 'page=abc', 'status=BOGUS', 'role=WIZARD', 'branchId=nope', 'unknown=1']) {
        expect((await request(app).get(`/api/v1/admin/staff?${bad}`).set(bearer(users.admin1.token))).status, bad).toBe(422);
      }
      expect((await request(app).get('/api/v1/admin/staff/not-a-uuid').set(bearer(users.admin1.token))).status).toBe(422);
    });

    it('update changes only profile metadata, audits before/after, and rejects role/status fields', async () => {
      const c = await createStaff({ fullName: 'Update Target' });
      const uniquePhone = `+91 9${String(ts).slice(-9)}`; // phone is unique; tests leave rows behind between runs
      const upd = await request(app)
        .patch(`/api/v1/admin/staff/${c.staff.id}`)
        .set(bearer(users.admin1.token))
        .send({ fullName: 'Updated Name', designation: 'Sous Chef', shiftTiming: '06:00-14:00', phone: uniquePhone });
      expect(upd.status).toBe(200);
      expect(upd.body.data.employeeProfile.fullName).toBe('Updated Name');
      expect(upd.body.data.phone).toBe(uniquePhone);

      const audit = await prisma.auditLog.findFirst({ where: { action: 'STAFF_UPDATED', entityId: c.staff.id } });
      expect((audit!.payload as any).before.fullName).toBe('Update Target');
      expect((audit!.payload as any).after.fullName).toBe('Updated Name');

      for (const sneaky of [{ roles: ['MD'] }, { status: 'ACTIVE' }, { email: 'x@y.com' }, { branchIds: [branchB.id] }, {}]) {
        expect((await request(app).patch(`/api/v1/admin/staff/${c.staff.id}`).set(bearer(users.admin1.token)).send(sneaky)).status).toBe(422);
      }
      expect((await prisma.user.findUnique({ where: { id: c.staff.id } }))!.status).toBe('PENDING');
    });
  });

  // ============================================================ roles
  describe('role management', () => {
    let target: { id: string; email: string; token: string };

    beforeAll(async () => {
      const c = await createStaff({ roles: ['CHEF', 'POS'], branchIds: [branchA.id] });
      const { accessToken } = await acceptAndLogin(c.rawToken, c.staff.email);
      target = { id: c.staff.id, email: c.staff.email, token: accessToken };
    });

    it('12-14. SUPER_ADMIN / CUSTOMER / MESS_CUSTOMER cannot be assigned or revoked through the role endpoints', async () => {
      for (const role of ['SUPER_ADMIN', 'CUSTOMER', 'MESS_CUSTOMER']) {
        const assign = await request(app).post(`/api/v1/admin/staff/${target.id}/roles`).set(await as('admin1')).send({ role });
        expect(assign.status, role).toBe(403);
        expect(assign.body.error).toBe('ROLE_NOT_ASSIGNABLE');
        const revoke = await request(app).delete(`/api/v1/admin/staff/${target.id}/roles/${role}`).set(await as('admin1'));
        expect(revoke.status, role).toBe(403);
      }
      const roles = (await prisma.userRoleAssignment.findMany({ where: { userId: target.id } })).map((r) => r.role).sort();
      expect(roles).toEqual(['CHEF', 'POS']);
      expect((await request(app).post(`/api/v1/admin/staff/${target.id}/roles`).set(await as('admin1')).send({ role: 'WIZARD' })).status).toBe(422);
    });

    it('15. an administrator cannot change their own roles, branches or deactivate themselves', async () => {
      const self = users.admin1.id;
      const h = await as('admin1');
      for (const res of [
        await request(app).post(`/api/v1/admin/staff/${self}/roles`).set(h).send({ role: 'MD' }),
        await request(app).delete(`/api/v1/admin/staff/${self}/roles/MD`).set(h),
        await request(app).post(`/api/v1/admin/staff/${self}/branches`).set(h).send({ branchId: branchA.id }),
        await request(app).delete(`/api/v1/admin/staff/${self}/branches/${branchA.id}`).set(h),
        await request(app).post(`/api/v1/admin/staff/${self}/deactivate`).set(h).send({ reason: 'self lockout attempt' })
      ]) {
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('SELF_MODIFICATION_FORBIDDEN');
      }
      expect((await prisma.user.findUnique({ where: { id: self } }))!.status).toBe('ACTIVE');
    });

    it('16/17. assigning twice is safe; role changes take effect on the next request with the old token', async () => {
      // CHEF + POS today: POS endpoints work
      expect((await request(app).get('/api/v1/pos/transactions').set(bearer(target.token))).status).toBe(200);

      const revoke = await request(app).delete(`/api/v1/admin/staff/${target.id}/roles/POS`).set(await as('admin1'));
      expect(revoke.status).toBe(200);
      expect(revoke.body.data.changed).toBe(true);
      expect((await request(app).get('/api/v1/pos/transactions').set(bearer(target.token))).status).toBe(403); // same token, immediate

      const assign = await request(app).post(`/api/v1/admin/staff/${target.id}/roles`).set(await as('admin1')).send({ role: 'POS' });
      expect(assign.body.data.changed).toBe(true);
      expect((await request(app).get('/api/v1/pos/transactions').set(bearer(target.token))).status).toBe(200);

      const dupe = await request(app).post(`/api/v1/admin/staff/${target.id}/roles`).set(await as('admin1')).send({ role: 'POS' });
      expect(dupe.status).toBe(200);
      expect(dupe.body.data.changed).toBe(false);
      expect(await prisma.userRoleAssignment.count({ where: { userId: target.id, role: 'POS' } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { action: 'ROLE_ASSIGNED', entityId: target.id } })).toBe(1); // duplicate not audited
    });

    it('revoking an unheld role is a deterministic no-op; the last role cannot be removed', async () => {
      const absent = await request(app).delete(`/api/v1/admin/staff/${target.id}/roles/TRAINER`).set(await as('admin1'));
      expect(absent.status).toBe(200);
      expect(absent.body.data.changed).toBe(false);

      const single = await createStaff({ roles: ['TRAINER'], branchIds: [] });
      const last = await request(app).delete(`/api/v1/admin/staff/${single.staff.id}/roles/TRAINER`).set(await as('admin1'));
      expect(last.status).toBe(409);
      expect(last.body.error).toBe('LAST_ROLE');
    });

    it('42. mixed customer/staff identities stay prohibited', async () => {
      // a customer is invisible to staff administration
      expect((await request(app).post(`/api/v1/admin/staff/${users.customer.id}/roles`).set(await as('admin1')).send({ role: 'CHEF' })).status).toBe(404);
      expect(await prisma.userRoleAssignment.count({ where: { userId: users.customer.id, role: 'CHEF' } })).toBe(0);

      // a (pre-existing, corrupt) mixed account is refused further staff roles
      const mixed = await prisma.user.create({
        data: { email: email('mixed'), passwordHash: 'x', roles: { create: [{ role: RoleEnum.CUSTOMER }, { role: RoleEnum.CHEF }] } }
      });
      const res = await request(app).post(`/api/v1/admin/staff/${mixed.id}/roles`).set(await as('admin1')).send({ role: 'POS' });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('MIXED_IDENTITY');
      await prisma.user.delete({ where: { id: mixed.id } });
    });

    it('non-existent targets and deleted accounts', async () => {
      expect((await request(app).post(`/api/v1/admin/staff/00000000-0000-4000-8000-000000000000/roles`).set(await as('admin1')).send({ role: 'CHEF' })).status).toBe(404);
      const c = await createStaff();
      await prisma.user.update({ where: { id: c.staff.id }, data: { deletedAt: new Date() } });
      expect((await request(app).post(`/api/v1/admin/staff/${c.staff.id}/roles`).set(await as('admin1')).send({ role: 'POS' })).status).toBe(409);
    });
  });

  // ============================================================ branches
  describe('branch assignment', () => {
    let staffId: string;
    let staffToken: string;

    beforeAll(async () => {
      const c = await createStaff({ roles: ['CHEF'], branchIds: [branchA.id] });
      const { accessToken } = await acceptAndLogin(c.rawToken, c.staff.email);
      staffId = c.staff.id;
      staffToken = accessToken;
    });

    it('18/19. assigning works, is reflected immediately, and duplicates create no extra rows', async () => {
      expect((await request(app).get(`/api/v1/kds/tickets?branchId=${branchB.id}`).set(bearer(staffToken))).status).toBe(403);

      const add = await request(app).post(`/api/v1/admin/staff/${staffId}/branches`).set(await as('admin1')).send({ branchId: branchB.id });
      expect(add.status).toBe(200);
      expect(add.body.data.changed).toBe(true);
      expect(add.body.data.branches.map((b: any) => b.id).sort()).toEqual([branchA.id, branchB.id].sort());
      expect((await request(app).get(`/api/v1/kds/tickets?branchId=${branchB.id}`).set(bearer(staffToken))).status).toBe(200);

      const dupe = await request(app).post(`/api/v1/admin/staff/${staffId}/branches`).set(await as('admin1')).send({ branchId: branchB.id });
      expect(dupe.status).toBe(200);
      expect(dupe.body.data.changed).toBe(false);
      const profile = await prisma.employeeProfile.findUnique({ where: { userId: staffId } });
      expect(await prisma.employeeBranchAssignment.count({ where: { employeeProfileId: profile!.id, branchId: branchB.id } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { action: 'BRANCH_ASSIGNED', entityId: staffId } })).toBe(1);
      const list = await request(app).get(`/api/v1/admin/staff/${staffId}/branches`).set(bearer(users.admin1.token));
      expect(list.body.data).toHaveLength(2);
    });

    it('22. an inactive or unknown branch cannot be newly assigned', async () => {
      const inactive = await request(app).post(`/api/v1/admin/staff/${staffId}/branches`).set(await as('admin1')).send({ branchId: branchInactive.id });
      expect(inactive.status).toBe(409);
      expect(inactive.body.error).toBe('BRANCH_INACTIVE');
      expect((await request(app).post(`/api/v1/admin/staff/${staffId}/branches`).set(await as('admin1')).send({ branchId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);
      expect((await request(app).post(`/api/v1/admin/staff/${staffId}/branches`).set(await as('admin1')).send({ branchId: 'nope' })).status).toBe(422);
    });

    it('20/21. removal takes effect immediately and the primary/home branch always stays consistent', async () => {
      const profile = (await prisma.employeeProfile.findUnique({ where: { userId: staffId } }))!;
      expect(profile.assignedBranchId).toBe(branchA.id); // primary = first assigned branch

      // revoke the PRIMARY branch -> primary re-points to the remaining assignment (never left dangling)
      const revokeA = await request(app).delete(`/api/v1/admin/staff/${staffId}/branches/${branchA.id}`).set(await as('admin1'));
      expect(revokeA.status).toBe(200);
      expect((await prisma.employeeProfile.findUnique({ where: { userId: staffId } }))!.assignedBranchId).toBe(branchB.id);
      expect((await request(app).get(`/api/v1/kds/tickets?branchId=${branchA.id}`).set(bearer(staffToken))).status).toBe(403); // same token, immediate
      expect((await request(app).get('/api/v1/kds/tickets').set(bearer(staffToken))).status).toBe(200);

      // revoke the last branch -> primary cleared, access gone
      const revokeB = await request(app).delete(`/api/v1/admin/staff/${staffId}/branches/${branchB.id}`).set(await as('admin1'));
      expect(revokeB.status).toBe(200);
      expect((await prisma.employeeProfile.findUnique({ where: { userId: staffId } }))!.assignedBranchId).toBeNull();
      const denied = await request(app).get('/api/v1/kds/tickets').set(bearer(staffToken));
      expect(denied.status).toBe(403);
      expect(denied.body.error).toBe('NO_BRANCH_ASSIGNMENT');

      // revoking again is a no-op; re-assigning restores primary
      const again = await request(app).delete(`/api/v1/admin/staff/${staffId}/branches/${branchB.id}`).set(await as('admin1'));
      expect(again.body.data.changed).toBe(false);
      await request(app).post(`/api/v1/admin/staff/${staffId}/branches`).set(await as('admin1')).send({ branchId: branchB.id });
      expect((await prisma.employeeProfile.findUnique({ where: { userId: staffId } }))!.assignedBranchId).toBe(branchB.id);
      expect(await prisma.auditLog.count({ where: { action: 'BRANCH_REVOKED', entityId: staffId } })).toBe(2);
    });

    it('legacy primary-only access (no assignment row) is revoked too', async () => {
      const legacy = await prisma.user.create({
        data: {
          email: email('legacy'),
          passwordHash: 'x',
          roles: { create: { role: RoleEnum.CHEF } },
          employeeProfile: { create: { employeeCode: `P6B-LEG-${ts}-${++counter}`, fullName: 'Legacy', designation: 'Chef', assignedBranchId: branchA.id } }
        }
      });
      const token = sign(legacy.id, legacy.email, [RoleEnum.CHEF]);
      expect((await request(app).get('/api/v1/kds/tickets').set(bearer(token))).status).toBe(200);
      const res = await request(app).delete(`/api/v1/admin/staff/${legacy.id}/branches/${branchA.id}`).set(await as('admin1'));
      expect(res.body.data.changed).toBe(true);
      expect((await request(app).get('/api/v1/kds/tickets').set(bearer(token))).status).toBe(403);
    });
  });

  // ============================================================ activation
  describe('deactivation and activation', () => {
    it('23/24. deactivation revokes refresh sessions and kills the old access token on the next request', async () => {
      const c = await createStaff({ roles: ['CHEF'], branchIds: [branchA.id] });
      const session = await acceptAndLogin(c.rawToken, c.staff.email);
      expect((await request(app).get('/api/v1/kds/tickets').set(bearer(session.accessToken))).status).toBe(200);
      expect(await prisma.refreshToken.count({ where: { userId: c.staff.id, revokedAt: null } })).toBeGreaterThan(0);

      const res = await request(app).post(`/api/v1/admin/staff/${c.staff.id}/deactivate`).set(await as('admin1')).send({ reason: 'Left the company' });
      expect(res.status).toBe(200);
      expect(res.body.data.staff.status).toBe('DEACTIVATED');

      expect(await prisma.refreshToken.count({ where: { userId: c.staff.id, revokedAt: null } })).toBe(0);
      const old = await request(app).get('/api/v1/kds/tickets').set(bearer(session.accessToken));
      expect(old.status).toBe(401);
      expect(old.body.error).toBe('ACCOUNT_INACTIVE');
      expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', session.cookie)).status).toBe(401);
      expect((await request(app).post('/api/v1/auth/login').send({ email: c.staff.email, password: STAFF_PASSWORD })).status).toBe(403);

      const audit = await prisma.auditLog.findFirst({ where: { action: 'STAFF_DEACTIVATED', entityId: c.staff.id } });
      expect((audit!.payload as any).reason).toBe('Left the company');
      expect((audit!.payload as any).sessionsRevoked).toBeGreaterThan(0);
    });

    it('requires a reason; deactivating twice is a no-op; reactivation restores access', async () => {
      const c = await createStaff({ roles: ['CHEF'], branchIds: [branchA.id] });
      const session = await acceptAndLogin(c.rawToken, c.staff.email);

      expect((await request(app).post(`/api/v1/admin/staff/${c.staff.id}/deactivate`).set(await as('admin1')).send({})).status).toBe(422);
      expect((await request(app).post(`/api/v1/admin/staff/${c.staff.id}/deactivate`).set(await as('admin1')).send({ reason: 'x' })).status).toBe(422);

      const sus = await request(app).post(`/api/v1/admin/staff/${c.staff.id}/deactivate`).set(await as('admin1')).send({ reason: 'Investigation pending', status: 'SUSPENDED' });
      expect(sus.body.data.staff.status).toBe('SUSPENDED');
      const twice = await request(app).post(`/api/v1/admin/staff/${c.staff.id}/deactivate`).set(await as('admin1')).send({ reason: 'again please' });
      expect(twice.body.data.changed).toBe(false);

      const act = await request(app).post(`/api/v1/admin/staff/${c.staff.id}/activate`).set(await as('admin1')).send({ reason: 'Cleared after review' });
      expect(act.status).toBe(200);
      expect(act.body.data.staff.status).toBe('ACTIVE');
      // the old (revoked-session) access token is valid again only because the account is ACTIVE - new login works
      expect((await request(app).post('/api/v1/auth/login').send({ email: c.staff.email, password: STAFF_PASSWORD })).status).toBe(200);
      expect(session.accessToken).toBeTruthy();
      expect((await request(app).post(`/api/v1/admin/staff/${c.staff.id}/activate`).set(await as('admin1')).send({ reason: 'already active' })).body.data.changed).toBe(false);
    });

    it('activation cannot bypass password setup, pending invitations or soft deletion', async () => {
      const pending = await createStaff();
      const act = await request(app).post(`/api/v1/admin/staff/${pending.staff.id}/activate`).set(await as('admin1')).send({ reason: 'skip the invite' });
      expect(act.status).toBe(409);
      expect(act.body.error).toBe('INVITATION_PENDING');

      // deactivated BEFORE ever accepting: only the unusable placeholder credential exists
      await request(app).post(`/api/v1/admin/staff/${pending.staff.id}/deactivate`).set(await as('admin1')).send({ reason: 'Hiring cancelled' });
      const act2 = await request(app).post(`/api/v1/admin/staff/${pending.staff.id}/activate`).set(await as('admin1')).send({ reason: 'try to revive' });
      expect(act2.status).toBe(409);
      expect(act2.body.error).toBe('PASSWORD_SETUP_INCOMPLETE');
      expect((await prisma.user.findUnique({ where: { id: pending.staff.id } }))!.status).toBe('DEACTIVATED');
      // and the pending invitation was revoked by deactivation
      expect((await request(app).post('/api/v1/auth/staff/accept-invite').send({ token: pending.rawToken, password: STAFF_PASSWORD })).status).toBe(400);

      const deleted = await createStaff();
      await prisma.user.update({ where: { id: deleted.staff.id }, data: { deletedAt: new Date(), status: 'DEACTIVATED' } });
      expect((await request(app).post(`/api/v1/admin/staff/${deleted.staff.id}/activate`).set(await as('admin1')).send({ reason: 'revive deleted' })).status).toBe(409);
    });

    it('26b. a SUPER_ADMIN can be deactivated by another SUPER_ADMIN only while another active admin exists', async () => {
      const spare = await makeUser('spareAdmin', [RoleEnum.SUPER_ADMIN]);
      const res = await request(app).post(`/api/v1/admin/staff/${spare.id}/deactivate`).set(await as('admin1')).send({ reason: 'Rotating administrators' });
      expect(res.status).toBe(200); // admin1/admin2 remain active
    });
  });

  // ============================================================ step-up
  describe('password step-up', () => {
    const sensitive = (id: string) => [
      { name: 'create staff', call: () => request(app).post('/api/v1/admin/staff').send({ email: email('s'), fullName: 'Step Up', designation: 'Cook', roles: ['CHEF'], branchIds: [branchA.id] }) },
      { name: 'assign role', call: () => request(app).post(`/api/v1/admin/staff/${id}/roles`).send({ role: 'POS' }) },
      { name: 'revoke role', call: () => request(app).delete(`/api/v1/admin/staff/${id}/roles/POS`) },
      { name: 'deactivate', call: () => request(app).post(`/api/v1/admin/staff/${id}/deactivate`).send({ reason: 'step up test' }) },
      { name: 'activate', call: () => request(app).post(`/api/v1/admin/staff/${id}/activate`).send({ reason: 'step up test' }) },
      { name: 'reissue invitation', call: () => request(app).post(`/api/v1/admin/staff/${id}/invitation`) },
      { name: 'assign branch', call: () => request(app).post(`/api/v1/admin/staff/${id}/branches`).send({ branchId: branchB.id }) },
      { name: 'revoke branch', call: () => request(app).delete(`/api/v1/admin/staff/${id}/branches/${branchA.id}`) }
    ];

    it('27. every sensitive action is rejected without a step-up proof (and the denial is audited)', async () => {
      const t = await createStaff();
      const before = await prisma.auditLog.count({ where: { action: 'STEP_UP_DENIED' } });
      for (const s of sensitive(t.staff.id)) {
        const res = await s.call().set(bearer(users.admin1.token));
        expect(res.status, s.name).toBe(403);
        expect(res.body.error, s.name).toBe('STEP_UP_REQUIRED');
      }
      expect(await prisma.auditLog.count({ where: { action: 'STEP_UP_DENIED' } })).toBe(before + sensitive(t.staff.id).length);
      expect(await prisma.userRoleAssignment.count({ where: { userId: t.staff.id } })).toBe(1); // nothing changed
    });

    it('28. invalid, expired, foreign, wrong-purpose and credential-stale proofs all fail', async () => {
      const t = await createStaff();
      const call = (header: string | undefined) => {
        const r = request(app).post(`/api/v1/admin/staff/${t.staff.id}/roles`).set(bearer(users.admin1.token)).send({ role: 'POS' });
        return header === undefined ? r : r.set('X-Step-Up-Token', header);
      };

      expect((await call('garbage')).status).toBe(403);

      const claims = { sub: users.admin1.id, purpose: 'admin-step-up', pwf: 'x' };
      const expired = jwt.sign(claims, SECRET, { expiresIn: -10, audience: 'step-up' });
      expect((await call(expired)).status).toBe(403);

      const other = await stepUp('admin2'); // belongs to a different administrator
      expect((await call(other)).status).toBe(403);

      expect((await call(users.admin1.token)).status).toBe(403); // an ACCESS token is not a step-up proof

      const wrongPurpose = jwt.sign({ sub: users.admin1.id, purpose: 'something-else', pwf: 'x' }, SECRET, { expiresIn: 60, audience: 'step-up' });
      expect((await call(wrongPurpose)).status).toBe(403);

      // a real proof stops working once the password changes
      const mutable = await makeUser('mutableAdmin', [RoleEnum.SUPER_ADMIN]);
      const proof = (await request(app).post('/api/v1/admin/step-up').set(bearer(users.mutableAdmin.token)).send({ password: ADMIN_PASSWORD })).body.data.stepUpToken;
      const okCall = () => request(app).post(`/api/v1/admin/staff/${t.staff.id}/roles`).set(bearer(users.mutableAdmin.token)).set('X-Step-Up-Token', proof).send({ role: 'POS' });
      expect((await okCall()).status).toBe(200);
      await prisma.user.update({ where: { id: mutable.id }, data: { passwordHash: await bcrypt.hash('Brand-New#Admin-Pass-77', 10) } });
      expect((await okCall()).status).toBe(403);
    });

    it('28b. a step-up token can never be used as an access token', async () => {
      const proof = await stepUp('admin1');
      expect((await request(app).get('/api/v1/admin/staff').set(bearer(proof))).status).toBe(401);
      expect((await request(app).get('/api/v1/auth/me').set(bearer(proof))).status).toBe(401);
    });

    it('a wrong password is refused and audited without logging the password; the proof is short-lived', async () => {
      const bad = await request(app).post('/api/v1/admin/step-up').set(bearer(users.admin1.token)).send({ password: 'definitely-wrong-password' });
      expect(bad.status).toBe(401);
      expect(bad.body.error).toBe('STEP_UP_FAILED');
      const rows = await prisma.auditLog.findMany({ where: { action: 'STEP_UP_FAILED', userId: users.admin1.id } });
      expect(rows.length).toBeGreaterThan(0);
      expect(JSON.stringify(rows)).not.toContain('definitely-wrong-password');

      const good = await request(app).post('/api/v1/admin/step-up').set(bearer(users.admin1.token)).send({ password: ADMIN_PASSWORD });
      expect(good.body.data.expiresInSeconds).toBeLessThanOrEqual(900);
      const decoded = jwt.decode(good.body.data.stepUpToken) as { exp: number; iat: number; sub: string };
      expect(decoded.exp - decoded.iat).toBe(good.body.data.expiresInSeconds);
      expect(decoded.sub).toBe(users.admin1.id);
      expect((await request(app).post('/api/v1/admin/step-up').set(bearer(users.admin1.token)).send({})).status).toBe(422);
    });

    it('a deactivated administrator\'s proof is useless (authentication fails first)', async () => {
      const victim = await makeUser('soonGone', [RoleEnum.SUPER_ADMIN]);
      const proof = (await request(app).post('/api/v1/admin/step-up').set(bearer(users.soonGone.token)).send({ password: ADMIN_PASSWORD })).body.data.stepUpToken;
      await prisma.user.update({ where: { id: victim.id }, data: { status: 'DEACTIVATED' } });
      const res = await request(app).post('/api/v1/admin/staff').set(bearer(users.soonGone.token)).set('X-Step-Up-Token', proof).send({ email: email('g'), fullName: 'Gone Admin', designation: 'x', roles: ['CHEF'], branchIds: [branchA.id] });
      expect(res.status).toBe(401);
    });
  });

  // ============================================================ branch administration
  describe('branch administration', () => {
    it('36. create / duplicate / read / update / deactivate / reactivate follow the policy', async () => {
      const code = `p6b-new-${ts}`;
      const created = await request(app).post('/api/v1/admin/branches').set(bearer(users.admin1.token)).send({ code, name: 'New Branch', address: '1 New Road', city: 'Thrissur', latitude: 10.5, longitude: 76.2 });
      expect(created.status).toBe(201);
      const id = created.body.data.id;
      expect(created.body.data.isActive).toBe(true);
      expect(created.body.data.staffCount).toBe(0);

      expect((await request(app).post('/api/v1/admin/branches').set(bearer(users.admin1.token)).send({ code, name: 'Dupe', address: '2 Road', city: 'X Town' })).status).toBe(409);
      expect((await request(app).post('/api/v1/admin/branches').set(bearer(users.admin1.token)).send({ code: 'Bad Code!', name: 'Bad', address: '2 Road', city: 'X Town' })).status).toBe(422);
      expect((await request(app).post('/api/v1/admin/branches').set(bearer(users.admin1.token)).send({ code: 'okc', name: 'Bad', address: '2 Road', city: 'X Town', latitude: 999 })).status).toBe(422);

      const upd = await request(app).patch(`/api/v1/admin/branches/${id}`).set(bearer(users.admin1.token)).send({ name: 'Renamed Branch', city: 'Palakkad' });
      expect(upd.status).toBe(200);
      expect(upd.body.data.name).toBe('Renamed Branch');
      expect((await request(app).patch(`/api/v1/admin/branches/${id}`).set(bearer(users.admin1.token)).send({ code: 'changed' })).status).toBe(422); // code is immutable
      expect((await request(app).patch(`/api/v1/admin/branches/${id}`).set(bearer(users.admin1.token)).send({})).status).toBe(422);

      const deact = await request(app).patch(`/api/v1/admin/branches/${id}`).set(bearer(users.admin1.token)).send({ isActive: false });
      expect(deact.status).toBe(200);
      expect(deact.body.data.isActive).toBe(false);
      expect((await request(app).patch(`/api/v1/admin/branches/${id}`).set(bearer(users.admin1.token)).send({ isActive: true })).body.data.isActive).toBe(true);

      const actions = (await prisma.auditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: 'asc' } })).map((a) => a.action);
      expect(actions).toEqual(['BRANCH_CREATED', 'BRANCH_UPDATED', 'BRANCH_DEACTIVATED', 'BRANCH_UPDATED']);
      expect((await request(app).get('/api/v1/admin/branches/not-a-uuid').set(bearer(users.admin1.token))).status).toBe(422);
      expect((await request(app).get('/api/v1/admin/branches/00000000-0000-4000-8000-000000000000').set(bearer(users.admin1.token))).status).toBe(404);
    });

    it('37. a branch with active/pending staff cannot be deactivated; it can once they are reassigned', async () => {
      const b = await prisma.kitchenBranch.create({ data: { code: `p6b-busy-${ts}`, name: 'Busy', address: '9 Road', city: 'Kochi' } });
      const c = await createStaff({ branchIds: [b.id] }); // PENDING staff counts too
      const res = await request(app).patch(`/api/v1/admin/branches/${b.id}`).set(bearer(users.admin1.token)).send({ isActive: false });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('BRANCH_HAS_ACTIVE_STAFF');
      expect((await prisma.kitchenBranch.findUnique({ where: { id: b.id } }))!.isActive).toBe(true);

      await request(app).delete(`/api/v1/admin/staff/${c.staff.id}/branches/${b.id}`).set(await as('admin1'));
      const ok = await request(app).patch(`/api/v1/admin/branches/${b.id}`).set(bearer(users.admin1.token)).send({ isActive: false });
      expect(ok.status).toBe(200);
    });

    it('list/detail expose the staff count and support filters', async () => {
      const list = await request(app).get('/api/v1/admin/branches?isActive=true&q=p6b').set(bearer(users.admin1.token));
      expect(list.status).toBe(200);
      expect(list.body.data.items.every((b: any) => b.isActive)).toBe(true);
      expect(list.body.data.items[0]).toHaveProperty('staffCount');
      expect((await request(app).get('/api/v1/admin/branches?isActive=maybe').set(bearer(users.admin1.token))).status).toBe(422);
    });
  });

  // ============================================================ staff self + catalogue
  describe('/staff/me and the permission catalogue', () => {
    it('38. customers and anonymous callers are rejected', async () => {
      expect((await request(app).get('/api/v1/staff/me').set(bearer(users.customer.token))).status).toBe(403);
      expect((await request(app).get('/api/v1/staff/me')).status).toBe(401);
      expect((await request(app).get('/api/v1/staff/permissions').set(bearer(users.customer.token))).status).toBe(403);
    });

    it('39b. SUPER_ADMIN and MD see their global scopes; the catalogue is descriptive and exposes no secrets', async () => {
      const admin = await request(app).get('/api/v1/staff/me').set(bearer(users.admin1.token));
      expect(admin.body.data.scope).toEqual({ isGlobal: true, isGlobalRead: false });
      expect(admin.body.data.permissions).toEqual(expect.arrayContaining(['staff:admin', 'audit:read']));
      const md = await request(app).get('/api/v1/staff/me').set(bearer(users.md.token));
      expect(md.body.data.scope).toEqual({ isGlobal: false, isGlobalRead: true });
      expect(md.body.data.permissions).not.toContain('staff:admin');
      expect(md.body.data.permissions).not.toContain('audit:read');

      const catalogue = await request(app).get('/api/v1/staff/permissions').set(bearer(users.chef.token));
      expect(catalogue.status).toBe(200);
      const roles = catalogue.body.data.roles.map((r: any) => r.role);
      expect(roles).toContain('CHEF');
      expect(roles).not.toContain('CUSTOMER');
      expect(catalogue.body.data.roles.find((r: any) => r.role === 'SUPER_ADMIN').assignableThroughAdminApi).toBe(false);
    });
  });

  // ============================================================ audit
  describe('audit history', () => {
    it('33. every administrative mutation produced an audit record with the actor', async () => {
      const actions = new Set((await prisma.auditLog.findMany({ where: { userId: users.admin1.id }, select: { action: true } })).map((a) => a.action));
      for (const expected of ['STAFF_CREATED', 'STAFF_INVITED', 'STAFF_INVITATION_REISSUED', 'STAFF_UPDATED', 'STAFF_ACTIVATED', 'STAFF_DEACTIVATED', 'ROLE_ASSIGNED', 'ROLE_REVOKED', 'BRANCH_ASSIGNED', 'BRANCH_REVOKED', 'BRANCH_CREATED', 'BRANCH_UPDATED', 'BRANCH_DEACTIVATED']) {
        expect(actions.has(expected), expected).toBe(true);
      }
      const acceptance = await prisma.auditLog.findFirst({ where: { action: 'STAFF_INVITATION_ACCEPTED' } });
      expect(acceptance).not.toBeNull();
    });

    it('audit rows never contain secrets (passwords, hashes, tokens, headers)', async () => {
      const recent = await prisma.auditLog.findMany({ where: { createdAt: { gte: new Date(ts - 1000) } } });
      expect(recent.length).toBeGreaterThan(20);
      const dump = JSON.stringify(recent);
      for (const secret of [ADMIN_PASSWORD, STAFF_PASSWORD, 'definitely-wrong-password', 'Brand-New#Admin-Pass-77']) expect(dump).not.toContain(secret);
      expect(dump).not.toMatch(/\$2[aby]\$/);
      expect(dump).not.toMatch(/"(password|passwordHash|tokenHash|setupToken|stepUpToken|authorization|cookie)"/i);
    });

    it('34. the audit API is read-only, filterable and paginated; payload is re-sanitized on output', async () => {
      const list = await request(app).get(`/api/v1/admin/audit?action=ROLE_ASSIGNED&pageSize=5`).set(bearer(users.admin1.token));
      expect(list.status).toBe(200);
      expect(list.body.data.items.length).toBeGreaterThan(0);
      expect(list.body.data.items.every((a: any) => a.action === 'ROLE_ASSIGNED')).toBe(true);
      expect(typeof list.body.data.items[0].actor.email).toBe('string'); // actor email joined from the User row
      expect(list.body.data.pageSize).toBe(5);

      // legacy/bad payload with a secret is redacted on the way out
      const bad = await prisma.auditLog.create({ data: { action: 'LEGACY_TEST', entity: 'Test', entityId: `leak-${ts}`, payload: { note: 'ok', password: 'LEAKED-SECRET', nested: { refreshToken: 'LEAKED-RT' } } } });
      const out = await request(app).get(`/api/v1/admin/audit?entityId=leak-${ts}`).set(bearer(users.admin1.token));
      expect(out.body.data.items[0].id).toBe(bad.id);
      expect(JSON.stringify(out.body)).not.toContain('LEAKED-SECRET');
      expect(JSON.stringify(out.body)).not.toContain('LEAKED-RT');
      expect(out.body.data.items[0].payload.note).toBe('ok');

      const byActor = await request(app).get(`/api/v1/admin/audit?actorUserId=${users.admin1.id}&entity=User&from=${new Date(ts - 5000).toISOString()}`).set(bearer(users.admin1.token));
      expect(byActor.body.data.items.every((a: any) => a.actor.userId === users.admin1.id && a.entity === 'User')).toBe(true);

      for (const bad2 of ['pageSize=101', 'page=0', 'actorUserId=nope', 'action=lower_case', 'from=not-a-date', 'unknown=1', `from=${new Date(ts).toISOString()}&to=${new Date(ts - 100000).toISOString()}`]) {
        expect((await request(app).get(`/api/v1/admin/audit?${bad2}`).set(bearer(users.admin1.token))).status, bad2).toBe(422);
      }
      // read-only: there is no write route
      expect((await request(app).post('/api/v1/admin/audit').set(bearer(users.admin1.token)).send({})).status).toBe(404);
      expect((await request(app).delete('/api/v1/admin/audit').set(bearer(users.admin1.token))).status).toBe(404);
    });
  });

  // ============================================================ branch access changes need step-up
  describe('branch assignment/revocation require a valid step-up proof', () => {
    let target: { id: string; profileId: string };
    const attemptedProofs: string[] = [];

    beforeAll(async () => {
      const c = await createStaff({ roles: ['CHEF'], branchIds: [branchA.id] });
      target = { id: c.staff.id, profileId: (await prisma.employeeProfile.findUnique({ where: { userId: c.staff.id } }))!.id };
    });

    const rowCount = (branchId: string) => prisma.employeeBranchAssignment.count({ where: { employeeProfileId: target.profileId, branchId } });
    const assign = (headers: Record<string, string>) => request(app).post(`/api/v1/admin/staff/${target.id}/branches`).set(headers).send({ branchId: branchB.id });
    const revoke = (headers: Record<string, string>) => request(app).delete(`/api/v1/admin/staff/${target.id}/branches/${branchA.id}`).set(headers);

    it('1. branch assignment without step-up is rejected and changes nothing', async () => {
      const res = await assign(bearer(users.admin1.token));
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('STEP_UP_REQUIRED');
      expect(await rowCount(branchB.id)).toBe(0);
    });

    it('3. branch revocation without step-up is rejected and changes nothing', async () => {
      const res = await revoke(bearer(users.admin1.token));
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('STEP_UP_REQUIRED');
      expect(await rowCount(branchA.id)).toBe(1);
      expect((await prisma.employeeProfile.findUnique({ where: { id: target.profileId } }))!.assignedBranchId).toBe(branchA.id);
    });

    it('5. invalid, expired, foreign, wrong-type and credential-stale proofs cannot change branch access', async () => {
      const expired = jwt.sign({ sub: users.admin1.id, purpose: 'admin-step-up', pwf: 'x' }, SECRET, { expiresIn: -10, audience: 'step-up' });
      const foreign = await stepUp('admin2');
      const proofs = ['garbage-proof', expired, foreign, users.admin1.token /* an access token is not a proof */];
      attemptedProofs.push(...proofs);

      for (const proof of proofs) {
        const h = { ...bearer(users.admin1.token), 'X-Step-Up-Token': proof };
        expect((await assign(h)).status).toBe(403);
        expect((await revoke(h)).status).toBe(403);
      }
      expect(await rowCount(branchB.id)).toBe(0);
      expect(await rowCount(branchA.id)).toBe(1);

      // a once-valid proof dies when the password changes
      const mutable = await makeUser('branchStepUpAdmin', [RoleEnum.SUPER_ADMIN]);
      const proof = (await request(app).post('/api/v1/admin/step-up').set(bearer(users.branchStepUpAdmin.token)).send({ password: ADMIN_PASSWORD })).body.data.stepUpToken as string;
      attemptedProofs.push(proof);
      await prisma.user.update({ where: { id: mutable.id }, data: { passwordHash: await bcrypt.hash('Changed#Branch-Admin-Pass-5', 10) } });
      expect((await assign({ ...bearer(users.branchStepUpAdmin.token), 'X-Step-Up-Token': proof })).status).toBe(403);
      expect(await rowCount(branchB.id)).toBe(0);
    });

    it('2. branch assignment with a valid step-up succeeds', async () => {
      const res = await assign(await as('admin1'));
      expect(res.status).toBe(200);
      expect(res.body.data.changed).toBe(true);
      expect(await rowCount(branchB.id)).toBe(1);
    });

    it('4. branch revocation with a valid step-up succeeds', async () => {
      const res = await revoke(await as('admin1'));
      expect(res.status).toBe(200);
      expect(res.body.data.changed).toBe(true);
      expect(await rowCount(branchA.id)).toBe(0);
    });

    it('reads and ordinary profile updates still do NOT need step-up', async () => {
      expect((await request(app).get(`/api/v1/admin/staff/${target.id}/branches`).set(bearer(users.admin1.token))).status).toBe(200);
      expect((await request(app).patch(`/api/v1/admin/staff/${target.id}`).set(bearer(users.admin1.token)).send({ designation: 'Lead Cook' })).status).toBe(200);
    });

    it('denials are audited, and no step-up token (valid, expired or invalid) ever appears in the audit log', async () => {
      expect(await prisma.auditLog.count({ where: { action: 'STEP_UP_DENIED', entityId: { in: ['staff.branch.assign', 'staff.branch.revoke'] } } })).toBeGreaterThanOrEqual(2);
      expect(await prisma.auditLog.count({ where: { action: 'BRANCH_ASSIGNED', entityId: target.id } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { action: 'BRANCH_REVOKED', entityId: target.id } })).toBe(1);

      const dump = JSON.stringify(await prisma.auditLog.findMany());
      const everyProof = [...attemptedProofs, ...stepUps.values()];
      expect(everyProof.length).toBeGreaterThan(5);
      for (const proof of everyProof) expect(dump.includes(proof), 'a step-up token leaked into the audit log').toBe(false);
    });
  });

  // ============================================================ regressions
  describe('existing behaviour is preserved', () => {
    it('login is case-tolerant for lowercase-stored staff emails but never matches another account', async () => {
      const c = await createStaff();
      await acceptAndLogin(c.rawToken, c.staff.email);
      const upper = await request(app).post('/api/v1/auth/login').send({ email: c.staff.email.toUpperCase(), password: STAFF_PASSWORD });
      expect(upper.status).toBe(200);
      expect(upper.body.data.user.id).toBe(c.staff.id);
      expect((await request(app).post('/api/v1/auth/login').send({ email: c.staff.email.toUpperCase(), password: 'wrong-password-123' })).status).toBe(401);
    });

    it('customer registration still only needs the original 8-character policy (staff policy is separate)', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({ email: email('cust'), password: 'eightchr', fullName: 'Plain Customer' });
      expect(res.status).toBe(201);
    });

    it('P6A scope and health least-privilege remain in force for newly created staff', async () => {
      const c = await createStaff({ roles: ['NUTRITIONIST'], branchIds: [] });
      const { accessToken } = await acceptAndLogin(c.rawToken, c.staff.email);
      expect((await request(app).get('/api/v1/diets/nutritionist/unassigned-queue').set(bearer(accessToken))).status).toBe(200);
      expect((await request(app).get('/api/v1/kds/tickets').set(bearer(accessToken))).status).toBe(403);
      expect((await request(app).get('/api/v1/diets/nutritionist/unassigned-queue').set(bearer(users.admin1.token))).status).toBe(403);
    });
  });
});
