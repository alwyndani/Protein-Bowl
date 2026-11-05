import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import app from '../app.js';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { hashToken } from '../utils/hash.js';
import { NON_ASSIGNABLE_ROLES } from '../authz/roleScopes.js';
import { RETIRED_ROLES } from '../authz/approvedRoles.js';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const SECRET = process.env.JWT_ACCESS_SECRET || 'test_access_secret_key_1234567890_super_secret';
const PASSWORD = 'Adm1n-Strong#Pass-2026';
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const sign = (userId: string, email: string, roles: RoleEnum[]) => jwt.sign({ userId, email, roles }, SECRET, { expiresIn: '15m' });

describe('Role simplification, Stage 2 - backend authorization', () => {
  const ts = Date.now();
  let n = 0;
  const users: Record<string, { id: string; email: string; token: string }> = {};
  let branch: { id: string };
  let stepUpToken = '';

  async function makeUser(key: string, roles: RoleEnum[], opts: { status?: 'ACTIVE' | 'PENDING' | 'DEACTIVATED'; branch?: boolean } = {}) {
    const email = `rs2_${key}_${++n}_${ts}@test.com`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        status: opts.status ?? 'ACTIVE',
        roles: { create: roles.map((role) => ({ role })) },
        ...(roles.some((r) => r !== RoleEnum.CUSTOMER) && roles.length > 0
          ? {
              employeeProfile: {
                create: {
                  employeeCode: `RS2-${key.toUpperCase()}-${n}-${ts}`,
                  fullName: `RS2 ${key}`,
                  designation: 'Tester',
                  assignedBranchId: opts.branch ? branch.id : null,
                  branchAssignments: opts.branch ? { create: [{ branchId: branch.id }] } : undefined
                }
              }
            }
          : {}),
        ...(roles.includes(RoleEnum.CUSTOMER) ? { customerProfile: { create: { fullName: `RS2 ${key}`, referralCode: `PB-R2${n}${ts}` } } } : {})
      }
    });
    users[key] = { id: user.id, email, token: sign(user.id, email, roles) };
    return user;
  }

  beforeAll(async () => {
    branch = await prisma.kitchenBranch.create({ data: { code: `rs2-${ts}`, name: 'RS2 Branch', address: 'A', city: 'Kochi' } });
    await makeUser('admin', [RoleEnum.SUPER_ADMIN]);
    await makeUser('customer', [RoleEnum.CUSTOMER]);
    await makeUser('chef', [RoleEnum.CHEF], { branch: true });
    await makeUser('md', [RoleEnum.MD], { branch: true });
    await makeUser('pos', [RoleEnum.POS], { branch: true });
    await makeUser('fmcg', [RoleEnum.BAKERY_FMCG], { branch: true });
    await makeUser('tepache', [RoleEnum.TEPACHE_ERP], { branch: true });
    await makeUser('aggregator', [RoleEnum.SWIGGY_ZOMATO], { branch: true });
    await makeUser('messCustomer', [RoleEnum.MESS_CUSTOMER]);
    await makeUser('roleless', []);
    await makeUser('chefAndPos', [RoleEnum.CHEF, RoleEnum.POS], { branch: true });
    await makeUser('target', [RoleEnum.NUTRITIONIST]);
    const su = await request(app).post('/api/v1/admin/step-up').set(bearer(users.admin.token)).send({ password: PASSWORD });
    stepUpToken = su.body.data.stepUpToken;
  });

  const admin = () => ({ ...bearer(users.admin.token), 'X-Step-Up-Token': stepUpToken });

  describe('fail closed: no approved role', () => {
    it('an ACTIVE account without any role cannot log in', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({ email: users.roleless.email, password: PASSWORD });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('NO_APPROVED_ROLE');
      expect(JSON.stringify(res.body)).not.toMatch(/accessToken|refreshToken/);
    });

    it('an ACTIVE account holding only a retired role cannot log in', async () => {
      for (const key of ['md', 'pos', 'fmcg', 'tepache', 'aggregator', 'messCustomer']) {
        const res = await request(app).post('/api/v1/auth/login').send({ email: users[key].email, password: PASSWORD });
        expect([key, res.status, res.body.error]).toEqual([key, 403, 'NO_APPROVED_ROLE']);
      }
    });

    it('a still-valid access token of a role-less or retired-only account is refused on every protected route', async () => {
      for (const key of ['roleless', 'md', 'pos', 'fmcg', 'tepache', 'aggregator', 'messCustomer']) {
        for (const path of ['/api/v1/auth/me', '/api/v1/orders/my-orders', '/api/v1/admin/payments', '/api/v1/kds/orders']) {
          const res = await request(app).get(path).set(bearer(users[key].token));
          expect([key, path, res.status, res.body.error]).toEqual([key, path, 403, 'NO_APPROVED_ROLE']);
        }
      }
    });

    it('refresh for a role-less account issues nothing and revokes its sessions', async () => {
      const raw = crypto.randomBytes(32).toString('hex');
      await prisma.refreshToken.create({ data: { userId: users.roleless.id, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + 3600_000) } });
      const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: raw });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('NO_APPROVED_ROLE');
      expect(JSON.stringify(res.body)).not.toMatch(/accessToken/);
      expect(await prisma.refreshToken.count({ where: { userId: users.roleless.id, revokedAt: null } })).toBe(0);
    });

    it('the mobile routes also refuse a retired-only account before any session exists', async () => {
      const res = await request(app)
        .post('/api/v1/auth/mobile/login')
        .set('X-PB-Client', 'protein-bowl-mobile/1.0.0 (android)')
        .send({ email: users.messCustomer.email, password: PASSWORD });
      expect(res.status).toBe(403);
      expect(['NO_APPROVED_ROLE', 'CUSTOMER_APP_ONLY']).toContain(res.body.error);
      expect(await prisma.refreshToken.count({ where: { userId: users.messCustomer.id } })).toBe(0);
    });

    it('an inactive account is still refused as before (existing check not weakened)', async () => {
      const inactive = await makeUser('inactiveChef', [RoleEnum.CHEF], { status: 'DEACTIVATED', branch: true });
      const res = await request(app).get('/api/v1/auth/me').set(bearer(users.inactiveChef.token));
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('ACCOUNT_INACTIVE');
      expect(inactive.id).toBeTruthy();
    });
  });

  describe('retired role values never authorize', () => {
    it('a retired role next to an approved one is dropped: the account keeps only its approved authority', async () => {
      const me = await request(app).get('/api/v1/auth/me').set(bearer(users.chefAndPos.token));
      expect(me.status).toBe(200);
      expect(me.body.data.user?.roles ?? me.body.data.roles).toEqual(['CHEF']);
    });

    it('the removed modules no longer exist', async () => {
      for (const [method, path] of [['get', '/api/v1/pos/transactions'], ['post', '/api/v1/pos/transaction'], ['get', '/api/v1/fmcg/batches'], ['get', '/api/v1/tepache/tanks'], ['post', '/api/v1/tepache/bottle-returns']] as const) {
        const res = await (request(app) as any)[method](path).set(bearer(users.admin.token)).send({});
        expect([path, res.status]).toEqual([path, 404]);
      }
    });

    it('public registration accepts only CUSTOMER', async () => {
      for (const requestedRole of ['MESS_CUSTOMER', 'MD', 'DELIVERY', 'POS', 'BAKERY_FMCG', 'TEPACHE_ERP', 'SWIGGY_ZOMATO', 'SUPER_ADMIN', 'CHEF']) {
        const res = await request(app).post('/api/v1/auth/register').send({ email: `reg_${requestedRole}_${ts}@test.com`, password: 'Password123!', fullName: 'Reg Test', requestedRole });
        expect([requestedRole, res.status]).toEqual([requestedRole, 422]);
      }
      expect(await prisma.user.count({ where: { email: { startsWith: 'reg_' , endsWith: `_${ts}@test.com` } } })).toBe(0);
    });

    it('administration APIs refuse to assign any retired role, and the catalogue lists them as non-assignable', async () => {
      for (const role of RETIRED_ROLES) expect(NON_ASSIGNABLE_ROLES).toContain(role as RoleEnum);
      for (const role of RETIRED_ROLES) {
        const res = await request(app).post(`/api/v1/admin/staff/${users.target.id}/roles`).set(admin()).send({ role });
        expect([role, res.status, res.body.error]).toEqual([role, 403, 'ROLE_NOT_ASSIGNABLE']);
      }
      const roles = await prisma.userRoleAssignment.findMany({ where: { userId: users.target.id } });
      expect(roles.map((r) => r.role)).toEqual(['NUTRITIONIST']);
    });

    it('creating staff with a retired role is refused and creates nothing', async () => {
      for (const role of ['MD', 'POS', 'DELIVERY', 'BAKERY_FMCG', 'TEPACHE_ERP', 'SWIGGY_ZOMATO', 'MESS_CUSTOMER']) {
        const email = `rs2_create_${role}_${ts}@test.com`;
        const res = await request(app).post('/api/v1/admin/staff').set(admin()).send({ email, fullName: 'Retired Role', designation: 'Tester', roles: [role], branchIds: [branch.id] });
        expect([role, res.status]).toEqual([role, 403]);
        expect(await prisma.user.count({ where: { email } })).toBe(0);
      }
    });

    it('an invitation for an account that holds only retired roles cannot be accepted', async () => {
      const user = await makeUser('pendingMd', [RoleEnum.MD], { status: 'PENDING', branch: true });
      const raw = crypto.randomBytes(32).toString('hex');
      await prisma.staffInvitation.create({ data: { userId: user.id, tokenHash: crypto.createHash('sha256').update(raw).digest('hex'), expiresAt: new Date(Date.now() + 3600_000) } });
      const res = await request(app).post('/api/v1/auth/staff/accept-invite').send({ token: raw, password: 'Staff-Strong#Pass-2026' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_INVITATION');
      expect((await prisma.user.findUnique({ where: { id: user.id } }))!.status).toBe('PENDING');
    });
  });

  describe('role-less accounts cannot be reactivated through administration', () => {
    it('activating a deactivated staff account that holds no approved role is refused (NO_ROLE_ASSIGNED)', async () => {
      const u = await makeUser('deactivatedRetired', [RoleEnum.POS], { status: 'DEACTIVATED', branch: true });
      const res = await request(app).post(`/api/v1/admin/staff/${u.id}/activate`).set(admin()).send({ reason: 'Stage 2 test of reactivation' });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('NO_ROLE_ASSIGNED');
      expect((await prisma.user.findUnique({ where: { id: u.id } }))!.status).toBe('DEACTIVATED');
    });
  });

  describe('former MD monitoring views are SUPER_ADMIN-only', () => {
    it('SUPER_ADMIN can read them', async () => {
      const paths = [
        '/api/v1/admin/payments',
        '/api/v1/admin/refunds',
        '/api/v1/admin/mess/accounts'
      ];
      for (const path of paths) {
        const res = await request(app).get(path).set(bearer(users.admin.token));
        expect([path, res.status]).toEqual([path, 200]);
      }
      // branch-scoped monitors need an explicit, existing branch
      const monitor = await request(app).get(`/api/v1/delivery/monitor?branchId=${branch.id}`).set(bearer(users.admin.token));
      expect(monitor.status).toBe(200);
      const messMonitor = await request(app).get(`/api/v1/mess/delivery/monitor?branchId=${branch.id}`).set(bearer(users.admin.token));
      expect(messMonitor.status).toBe(200);
      const kitchen = await request(app).get(`/api/v1/kds/orders?branchId=${branch.id}`).set(bearer(users.admin.token));
      expect(kitchen.status).toBe(200);
    });

    it('no other approved role can read them', async () => {
      for (const key of ['customer', 'chef']) {
        for (const path of ['/api/v1/admin/payments', '/api/v1/admin/refunds', '/api/v1/admin/mess/accounts']) {
          const res = await request(app).get(path).set(bearer(users[key].token));
          expect([key, path, res.status]).toEqual([key, path, 403]);
        }
        const monitor = await request(app).get(`/api/v1/delivery/monitor?branchId=${branch.id}`).set(bearer(users[key].token));
        expect([key, monitor.status]).toEqual([key, 403]);
      }
    });

    it('the retired MD / HRM / finance / CMS endpoints no longer exist (404 for everyone, including SUPER_ADMIN)', async () => {
      for (const path of ['/api/v1/md/metrics', '/api/v1/hrm/employees', '/api/v1/finance/transactions', '/api/v1/cms/banners', '/api/v1/cms/media']) {
        for (const token of [users.admin.token, users.chef.token, users.customer.token]) {
          const res = await request(app).get(path).set(bearer(token));
          expect([path, res.status]).toEqual([path, 404]);
        }
        expect([path, (await request(app).get(path)).status]).toEqual([path, 404]);
      }
    });
  });

  describe('retained functionality for the approved roles is untouched', () => {
    it('CUSTOMER keeps customer endpoints; staff and SUPER_ADMIN keep being refused there', async () => {
      expect((await request(app).get('/api/v1/orders/my-orders').set(bearer(users.customer.token))).status).toBe(200);
      expect((await request(app).get('/api/v1/cart').set(bearer(users.customer.token))).status).toBe(200);
      expect((await request(app).get('/api/v1/orders/my-orders').set(bearer(users.admin.token))).status).toBe(403);
      expect((await request(app).get('/api/v1/orders/my-orders').set(bearer(users.chef.token))).status).toBe(403);
    });

    it('CHEF keeps the kitchen queue for its own branch', async () => {
      const res = await request(app).get('/api/v1/kds/orders').set(bearer(users.chef.token));
      expect(res.status).toBe(200);
    });

    it('the public catalog is unaffected', async () => {
      expect((await request(app).get('/api/v1/products')).status).toBe(200);
    });
  });
});
