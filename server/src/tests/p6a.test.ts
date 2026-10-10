import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import app from '../app.js';
import { PrismaClient, RoleEnum, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuditService } from '../modules/audit/audit.service.js';
import { ROLE_SCOPE, hasMixedIdentity, isStaffRole, STAFF_ROLES, CUSTOMER_ROLES, NON_ASSIGNABLE_ROLES } from '../authz/roleScopes.js';
import { resolveBranchFilter, BranchScope } from '../authz/branchScope.js';
import { findMixedIdentityUserIds } from '../authz/identityAudit.js';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

function signToken(userId: string, email: string, roles: RoleEnum[]) {
  const secret = process.env.JWT_ACCESS_SECRET || 'test_access_secret_key_1234567890_super_secret';
  return jwt.sign({ userId, email, roles }, secret, { expiresIn: '15m' });
}

describe('P6A — staff identity, authorization, branch scope & audit foundation', () => {
  const ts = Date.now();
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  let branchA: { id: string };
  let branchB: { id: string };

  // users
  const u: Record<string, { id: string; email: string; token: string; profileId?: string }> = {};

  // data
  let kotA: any, kotB: any;
  let itemA: any, itemB: any;
  let assignment1: any, assignment2: any;
  let dietRequestId: string;
  let customerProfileId: string;

  async function makeUser(
    key: string,
    roles: RoleEnum[],
    opts: { branches?: string[]; primaryBranch?: string; profile?: boolean; status?: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED'; password?: string } = {}
  ) {
    const email = `p6a_${key}_${ts}@test.com`;
    const passwordHash = await bcrypt.hash(opts.password ?? 'Password123!', 10);
    const wantsProfile = opts.profile ?? roles.some(isStaffRole);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        status: opts.status ?? 'ACTIVE',
        roles: { create: roles.map((role) => ({ role })) },
        ...(wantsProfile && roles.some(isStaffRole)
          ? {
              employeeProfile: {
                create: {
                  employeeCode: `P6A-${key.toUpperCase()}-${ts}`,
                  fullName: `P6A ${key}`,
                  designation: 'Test Staff',
                  assignedBranchId: opts.primaryBranch ?? null
                }
              }
            }
          : {}),
        ...(roles.some((r) => r === RoleEnum.CUSTOMER)
          ? { customerProfile: { create: { fullName: `P6A ${key}`, referralCode: `PB-P6${key.toUpperCase().slice(0, 5)}${ts}` } } }
          : {})
      },
      include: { employeeProfile: true, customerProfile: true }
    });

    for (const branchId of opts.branches ?? []) {
      await prisma.employeeBranchAssignment.create({ data: { employeeProfileId: user.employeeProfile!.id, branchId } });
    }

    u[key] = { id: user.id, email, token: signToken(user.id, email, roles), profileId: user.employeeProfile?.id };
    return user;
  }

  beforeAll(async () => {
    branchA = await prisma.kitchenBranch.create({ data: { code: `p6a-a-${ts}`, name: 'P6A Branch A', address: 'A Street', city: 'Kochi' } });
    branchB = await prisma.kitchenBranch.create({ data: { code: `p6a-b-${ts}`, name: 'P6A Branch B', address: 'B Street', city: 'Kozhikode' } });

    await makeUser('chefA', [RoleEnum.CHEF], { branches: [branchA.id], primaryBranch: branchA.id });
    await makeUser('chefB', [RoleEnum.CHEF], { branches: [branchB.id], primaryBranch: branchB.id });
    await makeUser('chefAB', [RoleEnum.CHEF], { branches: [branchA.id, branchB.id], primaryBranch: branchA.id });
    await makeUser('chefNone', [RoleEnum.CHEF]);
    await makeUser('procA', [RoleEnum.PROCUREMENT], { branches: [branchA.id], primaryBranch: branchA.id });
    await makeUser('posA', [RoleEnum.POS], { branches: [branchA.id], primaryBranch: branchA.id });
    await makeUser('driver1', [RoleEnum.DELIVERY], { branches: [branchA.id], primaryBranch: branchA.id });
    await makeUser('driver2', [RoleEnum.DELIVERY], { branches: [branchA.id], primaryBranch: branchA.id });
    await makeUser('md', [RoleEnum.MD], { branches: [branchA.id] });
    await makeUser('admin', [RoleEnum.SUPER_ADMIN]);
    await makeUser('fmcgA', [RoleEnum.BAKERY_FMCG], { branches: [branchA.id], primaryBranch: branchA.id });
    await makeUser('nutAssigned', [RoleEnum.NUTRITIONIST]);
    await makeUser('nutOther', [RoleEnum.NUTRITIONIST]);
    const customer = await makeUser('customer', [RoleEnum.CUSTOMER]);
    customerProfileId = customer.customerProfile!.id;

    // Operational data in both branches
    const mkOrder = (suffix: string, extra: Record<string, unknown> = {}) =>
      prisma.order.create({ data: { orderNumber: `P6A-${suffix}-${ts}`, totalAmount: 100, netAmount: 100, ...extra } });
    // Since P7A the kitchen can only start an order that is paid, confirmed and routed to a branch (central transition policy),
    // so the Branch A kitchen order is set up in that eligible state. Branch B's ticket is never started (it is denied earlier).
    const eligibleForBranchA = { status: 'CONFIRMED', paymentStatus: 'PAID', paymentMethod: 'ONLINE', kitchenBranchId: branchA.id };
    const [oA, oB, oD1, oD2] = await Promise.all([mkOrder('KA', eligibleForBranchA), mkOrder('KB'), mkOrder('D1'), mkOrder('D2')]);
    kotA = await prisma.kitchenOrderTicket.create({ data: { orderId: oA.id, branchId: branchA.id, kotNumber: `KOT-A-${ts}`, itemsJson: [] } });
    kotB = await prisma.kitchenOrderTicket.create({ data: { orderId: oB.id, branchId: branchB.id, kotNumber: `KOT-B-${ts}`, itemsJson: [] } });

    itemA = await prisma.inventoryItem.create({
      data: { branchId: branchA.id, name: 'P6A Flour A', sku: `P6A-FA-${ts}`, category: 'DRY', unit: 'kg', unitCost: 40, quantityOnHand: 10 }
    });
    itemB = await prisma.inventoryItem.create({
      data: { branchId: branchB.id, name: 'P6A Flour B', sku: `P6A-FB-${ts}`, category: 'DRY', unit: 'kg', unitCost: 40, quantityOnHand: 10 }
    });

    await prisma.pOSTransaction.create({ data: { branchId: branchA.id, transactionNumber: `POS-A-${ts}`, totalAmount: 10, paymentMethod: 'CASH' } });
    await prisma.pOSTransaction.create({ data: { branchId: branchB.id, transactionNumber: `POS-B-${ts}`, totalAmount: 20, paymentMethod: 'CASH' } });

    assignment1 = await prisma.deliveryAssignment.create({ data: { orderId: oD1.id, driverId: u.driver1.profileId!, branchId: branchA.id } });
    assignment2 = await prisma.deliveryAssignment.create({ data: { orderId: oD2.id, driverId: u.driver2.profileId!, branchId: branchA.id } });

    // Diet workflow: customer request claimed by nutAssigned
    await prisma.healthBiometrics.create({ data: { customerProfileId, heightCm: 170, weightKg: 70, goal: 'weight_loss', activityLevel: 'moderate', bmi: 24.2, bmiCategory: 'Normal', bmr: 1600, tdee: 2200, maintenanceCalories: 2200, targetCalories: 1900, macroTargets: { protein: 120, carbs: 200, fat: 60 }, medicalConditions: ['PCOS'] } });
    const created = await request(app).post('/api/v1/diets/requests').set(bearer(u.customer.token)).send({ goal: 'Weight Loss' });
    dietRequestId = created.body.data.id;
    await request(app).post(`/api/v1/diets/requests/${dietRequestId}/claim`).set(bearer(u.nutAssigned.token));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ============================================================
  // Database-authoritative authentication
  // ============================================================
  describe('database-authoritative authentication', () => {
    it('1. an ACTIVE user with a valid token can use an allowed endpoint', async () => {
      const res = await request(app).get('/api/v1/kds/tickets').set(bearer(u.chefA.token));
      expect(res.status).toBe(200);
    });

    it('2. a DEACTIVATED user\'s existing access token is rejected on the next request', async () => {
      const user = await makeUser('deact', [RoleEnum.CHEF], { branches: [branchA.id] });
      expect((await request(app).get('/api/v1/kds/tickets').set(bearer(u.deact.token))).status).toBe(200);

      await prisma.user.update({ where: { id: user.id }, data: { status: 'DEACTIVATED' } });

      const res = await request(app).get('/api/v1/kds/tickets').set(bearer(u.deact.token));
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('ACCOUNT_INACTIVE');
    });

    it('3. a SUSPENDED user\'s existing token is rejected', async () => {
      const user = await makeUser('susp', [RoleEnum.CHEF], { branches: [branchA.id] });
      await prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });
      const res = await request(app).get('/api/v1/kds/tickets').set(bearer(u.susp.token));
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('ACCOUNT_INACTIVE');
    });

    it('4. a soft-deleted user\'s existing token is rejected', async () => {
      const user = await makeUser('softdel', [RoleEnum.CHEF], { branches: [branchA.id] });
      await prisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });
      const res = await request(app).get('/api/v1/kds/tickets').set(bearer(u.softdel.token));
      expect(res.status).toBe(401);
    });

    it('4b. a token for a user that does not exist is rejected', async () => {
      const ghost = signToken('00000000-0000-0000-0000-000000000000', 'ghost@test.com', [RoleEnum.SUPER_ADMIN]);
      const res = await request(app).get('/api/v1/kds/tickets').set(bearer(ghost));
      expect(res.status).toBe(401);
    });

    it('5. a deactivated user cannot refresh; all sessions are revoked and the denial is audited', async () => {
      const password = 'SomeStrongPass#12345';
      const user = await makeUser('refresher', [RoleEnum.CHEF], { branches: [branchA.id], password });

      const login = await request(app).post('/api/v1/auth/login').send({ email: u.refresher.email, password });
      expect(login.status).toBe(200);
      const cookie = (login.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('pb_refresh_token='))!;

      // refresh works while ACTIVE
      const ok = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie.split(';')[0]);
      expect(ok.status).toBe(200);
      const rotatedCookie = (ok.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('pb_refresh_token='))!;

      await prisma.user.update({ where: { id: user.id }, data: { status: 'DEACTIVATED' } });

      const denied = await request(app).post('/api/v1/auth/refresh').set('Cookie', rotatedCookie.split(';')[0]);
      expect(denied.status).toBe(401);
      expect(denied.body.error).toBe('ACCOUNT_INACTIVE');

      const active = await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } });
      expect(active).toBe(0);

      const audit = await prisma.auditLog.findFirst({ where: { action: 'AUTH_REFRESH_DENIED_INACTIVE', entityId: user.id } });
      expect(audit).not.toBeNull();

      // and a fresh login is refused as before
      const relogin = await request(app).post('/api/v1/auth/login').send({ email: u.refresher.email, password });
      expect(relogin.status).toBe(403);
    });

    it('5b. a soft-deleted user cannot refresh or log in', async () => {
      const password = 'AnotherStrongPass#123';
      const user = await makeUser('softdelrefresh', [RoleEnum.CHEF], { branches: [branchA.id], password });
      const login = await request(app).post('/api/v1/auth/login').send({ email: u.softdelrefresh.email, password });
      const cookie = (login.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('pb_refresh_token='))!;
      await prisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });

      const denied = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie.split(';')[0]);
      expect(denied.status).toBe(401);
      const relogin = await request(app).post('/api/v1/auth/login').send({ email: u.softdelrefresh.email, password });
      expect(relogin.status).toBe(403);
    });
  });

  // ============================================================
  // Role freshness
  // ============================================================
  describe('role changes apply on the next request (no waiting for JWT expiry)', () => {
    it('6. removing a role takes effect immediately with the old token', async () => {
      const user = await makeUser('roleRemoved', [RoleEnum.CHEF], { branches: [branchA.id] });
      expect((await request(app).get('/api/v1/kds/tickets').set(bearer(u.roleRemoved.token))).status).toBe(200);

      await prisma.userRoleAssignment.deleteMany({ where: { userId: user.id, role: RoleEnum.CHEF } });

      const res = await request(app).get('/api/v1/kds/tickets').set(bearer(u.roleRemoved.token));
      expect(res.status).toBe(403);
    });

    it('7. assigning a role takes effect immediately with the old token', async () => {
      // Staff-capable account that starts with no operational role.
      const user = await makeUser('roleAdded', [RoleEnum.TRAINER], { branches: [branchA.id], primaryBranch: branchA.id });
      expect((await request(app).get('/api/v1/kds/tickets').set(bearer(u.roleAdded.token))).status).toBe(403);

      await prisma.userRoleAssignment.create({ data: { userId: user.id, role: RoleEnum.CHEF } });

      const res = await request(app).get('/api/v1/kds/tickets').set(bearer(u.roleAdded.token));
      expect(res.status).toBe(200);
    });

    it('7b. roles claimed inside the JWT are never trusted (forged SUPER_ADMIN claim)', async () => {
      const forged = signToken(u.customer.id, u.customer.email, [RoleEnum.SUPER_ADMIN, RoleEnum.CHEF]);
      expect((await request(app).get('/api/v1/kds/tickets').set(bearer(forged))).status).toBe(403);
      expect((await request(app).get('/api/v1/procurement/items').set(bearer(forged))).status).toBe(403);
    });
  });

  // ============================================================
  // KDS branch hardening
  // ============================================================
  describe('KDS branch scope', () => {
    it('8/9/10. Branch A chef sees only Branch A tickets; omitted branchId never means all branches', async () => {
      const res = await request(app).get('/api/v1/kds/tickets').set(bearer(u.chefA.token));
      expect(res.status).toBe(200);
      const ids = res.body.data.map((t: any) => t.id);
      expect(ids).toContain(kotA.id);
      expect(ids).not.toContain(kotB.id);
      expect(res.body.data.every((t: any) => t.branchId === branchA.id)).toBe(true);
    });

    it('8b. Branch A chef cannot request Branch B (403) and the denial is audited', async () => {
      const res = await request(app).get(`/api/v1/kds/tickets?branchId=${branchB.id}`).set(bearer(u.chefA.token));
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('BRANCH_FORBIDDEN');
      const audit = await prisma.auditLog.findFirst({ where: { action: 'BRANCH_ACCESS_DENIED', userId: u.chefA.id } });
      expect(audit).not.toBeNull();
    });

    it('8c. Branch A chef cannot update a Branch B ticket; can update their own branch ticket', async () => {
      const denied = await request(app).patch(`/api/v1/kds/tickets/${kotB.id}/status`).set(bearer(u.chefA.token)).send({ status: 'PREPARING' });
      expect(denied.status).toBe(403);
      expect((await prisma.kitchenOrderTicket.findUnique({ where: { id: kotB.id } }))!.status).toBe('QUEUED');

      const ok = await request(app).patch(`/api/v1/kds/tickets/${kotA.id}/status`).set(bearer(u.chefA.token)).send({ status: 'PREPARING' });
      expect(ok.status).toBe(200);
    });

    it('8d. an invalid KOT status is a 400 (not a 500) and an unknown ticket is a 404', async () => {
      expect((await request(app).patch(`/api/v1/kds/tickets/${kotA.id}/status`).set(bearer(u.chefA.token)).send({ status: 'NOPE' })).status).toBe(400);
      expect((await request(app).patch('/api/v1/kds/tickets/does-not-exist/status').set(bearer(u.chefA.token)).send({ status: 'READY' })).status).toBe(404);
    });

    it('8e. a chef assigned to two branches sees both; a chef with no branch assignment gets 403', async () => {
      const both = await request(app).get('/api/v1/kds/tickets').set(bearer(u.chefAB.token));
      const ids = both.body.data.map((t: any) => t.id);
      expect(ids).toEqual(expect.arrayContaining([kotA.id, kotB.id]));

      const none = await request(app).get('/api/v1/kds/tickets').set(bearer(u.chefNone.token));
      expect(none.status).toBe(403);
      expect(none.body.error).toBe('NO_BRANCH_ASSIGNMENT');
    });

    it('8f. KDS tickets do not expose the full customer profile', async () => {
      const res = await request(app).get('/api/v1/kds/tickets').set(bearer(u.chefA.token));
      const ticket = res.body.data.find((t: any) => t.id === kotA.id);
      expect(Object.keys(ticket.order)).not.toContain('customerProfileId');
      if (ticket.order.customerProfile) {
        expect(Object.keys(ticket.order.customerProfile)).toEqual(['fullName']);
      }
    });
  });

  // ============================================================
  // MD read-only / global scopes
  // ============================================================
  describe('MD is global READ-ONLY; SUPER_ADMIN is global; facility roles are not global', () => {
    it('6b. MD can read tickets across branches but cannot mutate operations', async () => {
      const read = await request(app).get('/api/v1/kds/tickets').set(bearer(u.md.token));
      expect(read.status).toBe(200);
      const ids = read.body.data.map((t: any) => t.id);
      expect(ids).toEqual(expect.arrayContaining([kotA.id, kotB.id]));

      expect((await request(app).patch(`/api/v1/kds/tickets/${kotA.id}/status`).set(bearer(u.md.token)).send({ status: 'READY' })).status).toBe(403);
      expect((await request(app).post('/api/v1/procurement/stock-movement').set(bearer(u.md.token)).send({ inventoryItemId: itemA.id, type: 'PURCHASE_RECEIPT', quantity: 1, unitCost: 1 })).status).toBe(403);
      expect((await request(app).post('/api/v1/pos/transaction').set(bearer(u.md.token)).send({ branchId: branchA.id, totalAmount: 5 })).status).toBe(403);
      expect((await request(app).patch(`/api/v1/delivery/assignments/${assignment1.id}/status`).set(bearer(u.md.token)).send({ status: 'IN_TRANSIT' })).status).toBe(403);
    });

    it('MD can read procurement / POS / delivery across branches', async () => {
      expect((await request(app).get('/api/v1/procurement/items').set(bearer(u.md.token))).status).toBe(200);
      expect((await request(app).get('/api/v1/pos/transactions').set(bearer(u.md.token))).status).toBe(200);
      const del = await request(app).get('/api/v1/delivery/assignments').set(bearer(u.md.token));
      expect(del.status).toBe(200);
      expect(del.body.data.map((a: any) => a.id)).toEqual(expect.arrayContaining([assignment1.id, assignment2.id]));
    });

    it('SUPER_ADMIN reads across branches', async () => {
      const res = await request(app).get('/api/v1/kds/tickets').set(bearer(u.admin.token));
      expect(res.status).toBe(200);
      expect(res.body.data.map((t: any) => t.id)).toEqual(expect.arrayContaining([kotA.id, kotB.id]));
    });

    it('BAKERY_FMCG (facility-scoped) gets no operational global access', async () => {
      expect(ROLE_SCOPE.BAKERY_FMCG).toBe('BRANCH');
      expect(ROLE_SCOPE.TEPACHE_ERP).toBe('BRANCH');
      expect((await request(app).get('/api/v1/kds/tickets').set(bearer(u.fmcgA.token))).status).toBe(403);
    });
  });

  // ============================================================
  // Procurement
  // ============================================================
  describe('procurement branch scope', () => {
    it('11. Branch A procurement sees only Branch A inventory; Branch B filter is rejected', async () => {
      const list = await request(app).get('/api/v1/procurement/items').set(bearer(u.procA.token));
      expect(list.status).toBe(200);
      const ids = list.body.data.map((i: any) => i.id);
      expect(ids).toContain(itemA.id);
      expect(ids).not.toContain(itemB.id);

      const foreign = await request(app).get(`/api/v1/procurement/items?branchId=${branchB.id}`).set(bearer(u.procA.token));
      expect(foreign.status).toBe(403);
    });

    it('11b. stock movements on another branch\'s item are rejected; own-branch movements work', async () => {
      const denied = await request(app)
        .post('/api/v1/procurement/stock-movement')
        .set(bearer(u.procA.token))
        .send({ inventoryItemId: itemB.id, type: 'PURCHASE_RECEIPT', quantity: 5, unitCost: 10 });
      expect(denied.status).toBe(403);
      expect((await prisma.inventoryItem.findUnique({ where: { id: itemB.id } }))!.quantityOnHand).toBe(10);

      const ok = await request(app)
        .post('/api/v1/procurement/stock-movement')
        .set(bearer(u.procA.token))
        .send({ inventoryItemId: itemA.id, type: 'PURCHASE_RECEIPT', quantity: 5, unitCost: 10 });
      expect(ok.status).toBe(201);
      expect((await prisma.inventoryItem.findUnique({ where: { id: itemA.id } }))!.quantityOnHand).toBe(15);

      const missing = await request(app)
        .post('/api/v1/procurement/stock-movement')
        .set(bearer(u.procA.token))
        .send({ inventoryItemId: 'nope', type: 'PURCHASE_RECEIPT', quantity: 5, unitCost: 10 });
      expect(missing.status).toBe(404);
    });
  });

  // ============================================================
  // POS
  // ============================================================
  describe('POS branch scope', () => {
    it('12. Branch A POS lists only Branch A transactions; Branch B filter is rejected', async () => {
      const list = await request(app).get('/api/v1/pos/transactions').set(bearer(u.posA.token));
      expect(list.status).toBe(200);
      expect(list.body.data.length).toBeGreaterThan(0);
      expect(list.body.data.every((t: any) => t.branchId === branchA.id)).toBe(true);

      expect((await request(app).get(`/api/v1/pos/transactions?branchId=${branchB.id}`).set(bearer(u.posA.token))).status).toBe(403);
    });

    it('13. Branch A POS cannot write to Branch B; own/omitted branch works', async () => {
      const denied = await request(app).post('/api/v1/pos/transaction').set(bearer(u.posA.token)).send({ branchId: branchB.id, totalAmount: 50 });
      expect(denied.status).toBe(403);

      const explicit = await request(app).post('/api/v1/pos/transaction').set(bearer(u.posA.token)).send({ branchId: branchA.id, totalAmount: 50 });
      expect(explicit.status).toBe(201);
      expect(explicit.body.data.branchId).toBe(branchA.id);

      const omitted = await request(app).post('/api/v1/pos/transaction').set(bearer(u.posA.token)).send({ totalAmount: 60 });
      expect(omitted.status).toBe(201);
      expect(omitted.body.data.branchId).toBe(branchA.id);
    });

    it('13b. SUPER_ADMIN must name a branch for a POS write and unknown branches are 404', async () => {
      expect((await request(app).post('/api/v1/pos/transaction').set(bearer(u.admin.token)).send({ totalAmount: 5 })).status).toBe(400);
      expect((await request(app).post('/api/v1/pos/transaction').set(bearer(u.admin.token)).send({ branchId: 'missing-branch', totalAmount: 5 })).status).toBe(404);
      expect((await request(app).post('/api/v1/pos/transaction').set(bearer(u.admin.token)).send({ branchId: branchB.id, totalAmount: 5 })).status).toBe(201);
    });
  });

  // ============================================================
  // Delivery
  // ============================================================
  describe('delivery self-scope', () => {
    it('lists only the driver\'s own assignments', async () => {
      const res = await request(app).get('/api/v1/delivery/assignments').set(bearer(u.driver1.token));
      expect(res.status).toBe(200);
      const ids = res.body.data.map((a: any) => a.id);
      expect(ids).toContain(assignment1.id);
      expect(ids).not.toContain(assignment2.id);
    });

    it('15. a driver cannot spoof driverId (or an unassigned branch) to see other work', async () => {
      const spoof = await request(app).get(`/api/v1/delivery/assignments?driverId=${u.driver2.profileId}`).set(bearer(u.driver1.token));
      expect(spoof.status).toBe(403);
      expect(spoof.body.error).toBe('DRIVER_FORBIDDEN');

      const ownId = await request(app).get(`/api/v1/delivery/assignments?driverId=${u.driver1.profileId}`).set(bearer(u.driver1.token));
      expect(ownId.status).toBe(200);

      const foreignBranch = await request(app).get(`/api/v1/delivery/assignments?branchId=${branchB.id}`).set(bearer(u.driver1.token));
      expect(foreignBranch.status).toBe(403);
    });

    it('14. a driver cannot update another driver\'s assignment; can update their own', async () => {
      const denied = await request(app).patch(`/api/v1/delivery/assignments/${assignment2.id}/status`).set(bearer(u.driver1.token)).send({ status: 'DELIVERED' });
      expect(denied.status).toBe(403);
      expect((await prisma.deliveryAssignment.findUnique({ where: { id: assignment2.id } }))!.status).toBe('ASSIGNED');

      const ok = await request(app).patch(`/api/v1/delivery/assignments/${assignment1.id}/status`).set(bearer(u.driver1.token)).send({ status: 'PICKED_UP' });
      expect(ok.status).toBe(200);

      expect((await request(app).patch(`/api/v1/delivery/assignments/${assignment1.id}/status`).set(bearer(u.driver1.token)).send({ status: 'TELEPORTED' })).status).toBe(400);
    });

    it('SUPER_ADMIN may filter and update any delivery', async () => {
      const filtered = await request(app).get(`/api/v1/delivery/assignments?driverId=${u.driver2.profileId}`).set(bearer(u.admin.token));
      expect(filtered.status).toBe(200);
      expect(filtered.body.data.map((a: any) => a.id)).toEqual([assignment2.id]);
      expect((await request(app).patch(`/api/v1/delivery/assignments/${assignment2.id}/status`).set(bearer(u.admin.token)).send({ status: 'PICKED_UP' })).status).toBe(200);
    });
  });

  // ============================================================
  // Health-data least privilege
  // ============================================================
  describe('customer health data is not available to SUPER_ADMIN / MD / unassigned staff', () => {
    const healthUrl = () => `/api/v1/diets/requests/${dietRequestId}/health-profile`;

    it('16. SUPER_ADMIN cannot read an arbitrary customer health profile', async () => {
      const res = await request(app).get(healthUrl()).set(bearer(u.admin.token));
      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).not.toContain('heightCm');
    });

    it('17. MD cannot read a customer health profile', async () => {
      expect((await request(app).get(healthUrl()).set(bearer(u.md.token))).status).toBe(403);
    });

    it('18. the assigned nutritionist retains access, and the access is audited without health data', async () => {
      const res = await request(app).get(healthUrl()).set(bearer(u.nutAssigned.token));
      expect(res.status).toBe(200);
      expect(res.body.data.healthBiometrics.heightCm).toBe(170);

      const audit = await prisma.auditLog.findFirst({ where: { action: 'HEALTH_PROFILE_ACCESSED', userId: u.nutAssigned.id, entityId: dietRequestId } });
      expect(audit).not.toBeNull();
      expect(JSON.stringify(audit!.payload)).not.toMatch(/heightCm|weightKg/);
    });

    it('19. an unassigned nutritionist is denied and the denial is audited', async () => {
      const res = await request(app).get(healthUrl()).set(bearer(u.nutOther.token));
      expect(res.status).toBe(403);
      const audit = await prisma.auditLog.findFirst({ where: { action: 'HEALTH_PROFILE_ACCESS_DENIED', userId: u.nutOther.id, entityId: dietRequestId } });
      expect(audit).not.toBeNull();
    });

    it('SUPER_ADMIN cannot claim a request (to become the "assigned" reader), view the queues, or author plans', async () => {
      expect((await request(app).post(`/api/v1/diets/requests/${dietRequestId}/claim`).set(bearer(u.admin.token))).status).toBe(403);
      expect((await request(app).get('/api/v1/diets/nutritionist/unassigned-queue').set(bearer(u.admin.token))).status).toBe(403);
      expect((await request(app).get('/api/v1/diets/nutritionist/my-claimed-queue').set(bearer(u.admin.token))).status).toBe(403);
      const plan = await request(app)
        .post('/api/v1/diets/plans')
        .set(bearer(u.admin.token))
        .send({
          requestId: dietRequestId,
          targetCalories: 2000,
          proteinGrams: 100,
          carbsGrams: 200,
          fatGrams: 60,
          days: [{ dayNumber: 1, dayName: 'Day 1', meals: [{ mealType: 'Lunch', recipeName: 'Bowl', calories: 500, protein: 40, carbs: 50, fat: 10 }] }]
        });
      expect(plan.status).toBe(403);
      expect((await prisma.dietPlanRequest.findUnique({ where: { id: dietRequestId } }))!.nutritionistId).toBe(u.nutAssigned.id);
    });

    it('the customer and the assigned nutritionist keep their normal workflow', async () => {
      expect((await request(app).get('/api/v1/diets/my-requests').set(bearer(u.customer.token))).status).toBe(200);
      expect((await request(app).get('/api/v1/diets/nutritionist/my-claimed-queue').set(bearer(u.nutAssigned.token))).status).toBe(200);
    });
  });

  // ============================================================
  // /auth/rbac-test
  // ============================================================
  describe('RBAC diagnostic route', () => {
    it('20. /auth/rbac-test does not exist in production', async () => {
      const savedEnv = process.env.NODE_ENV;
      const savedInvite = process.env.INVITE_DELIVERY;
      const savedPayment = { p: process.env.PAYMENT_PROVIDER, k: process.env.RAZORPAY_KEY_ID, s: process.env.RAZORPAY_KEY_SECRET, w: process.env.RAZORPAY_WEBHOOK_SECRET };
      vi.resetModules();
      process.env.NODE_ENV = 'production';
      process.env.INVITE_DELIVERY = 'manual'; // an otherwise valid production configuration
      // P7B: production refuses the mock payment provider, so a production boot needs an explicit (fake, test-only) Razorpay configuration
      process.env.PAYMENT_PROVIDER = 'razorpay';
      process.env.RAZORPAY_KEY_ID = 'rzp_test_dummy';
      process.env.RAZORPAY_KEY_SECRET = 'dummy-secret-for-boot-test';
      process.env.RAZORPAY_WEBHOOK_SECRET = 'dummy-webhook-secret-for-boot-test';
      try {
        const prodApp = (await import('../app.js')).default;
        const res = await request(prodApp).get('/api/v1/auth/rbac-test').set(bearer(u.admin.token));
        expect(res.status).toBe(404);
        const { prisma: prodPrisma } = await import('../config/database.js');
        await prodPrisma.$disconnect();
      } finally {
        process.env.NODE_ENV = savedEnv;
        if (savedInvite === undefined) delete process.env.INVITE_DELIVERY;
        else process.env.INVITE_DELIVERY = savedInvite;
        for (const [key, value] of [['PAYMENT_PROVIDER', savedPayment.p], ['RAZORPAY_KEY_ID', savedPayment.k], ['RAZORPAY_KEY_SECRET', savedPayment.s], ['RAZORPAY_WEBHOOK_SECRET', savedPayment.w]] as const) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
        vi.resetModules();
      }
    });

    it('20b. in development/test it still works for privileged roles', async () => {
      expect((await request(app).get('/api/v1/auth/rbac-test').set(bearer(u.admin.token))).status).toBe(200);
      expect((await request(app).get('/api/v1/auth/rbac-test').set(bearer(u.customer.token))).status).toBe(403);
    });
  });

  // ============================================================
  // Branch assignment model
  // ============================================================
  describe('EmployeeBranchAssignment', () => {
    it('21. the migration backfill creates assignments from the legacy primary branch and is idempotent', async () => {
      const sqlFile = fs.readdirSync(path.resolve(__dirname, '../../prisma/migrations')).find((d) => d.endsWith('p6a_staff_branch_assignment_audit_indexes'))!;
      const sql = fs.readFileSync(path.resolve(__dirname, '../../prisma/migrations', sqlFile, 'migration.sql'), 'utf8');
      const backfill = sql.slice(sql.indexOf('INSERT INTO "employee_branch_assignments"'));

      // legacy-style profile: primary branch set, no assignment row
      const legacy = await prisma.user.create({
        data: {
          email: `p6a_legacy_${ts}@test.com`,
          passwordHash: 'x',
          roles: { create: { role: RoleEnum.CHEF } },
          employeeProfile: { create: { employeeCode: `P6A-LEG-${ts}`, fullName: 'Legacy', designation: 'Chef', assignedBranchId: branchA.id } }
        },
        include: { employeeProfile: true }
      });
      expect(await prisma.employeeBranchAssignment.count({ where: { employeeProfileId: legacy.employeeProfile!.id } })).toBe(0);

      await prisma.$executeRawUnsafe(backfill);
      await prisma.$executeRawUnsafe(backfill); // idempotent

      const rows = await prisma.employeeBranchAssignment.findMany({ where: { employeeProfileId: legacy.employeeProfile!.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0].branchId).toBe(branchA.id);
      // the primary branch column is untouched
      expect((await prisma.employeeProfile.findUnique({ where: { id: legacy.employeeProfile!.id } }))!.assignedBranchId).toBe(branchA.id);
    });

    it('legacy primary-branch-only staff (no assignment rows) still resolve their branch scope', async () => {
      const legacy = await prisma.user.create({
        data: {
          email: `p6a_legacy2_${ts}@test.com`,
          passwordHash: 'x',
          roles: { create: { role: RoleEnum.CHEF } },
          employeeProfile: { create: { employeeCode: `P6A-LEG2-${ts}`, fullName: 'Legacy2', designation: 'Chef', assignedBranchId: branchA.id } }
        }
      });
      const res = await request(app).get('/api/v1/kds/tickets').set(bearer(signToken(legacy.id, legacy.email, [RoleEnum.CHEF])));
      expect(res.status).toBe(200);
      expect(res.body.data.map((t: any) => t.id)).toContain(kotA.id);
    });

    it('22. a duplicate (employee, branch) assignment is prevented', async () => {
      await expect(
        prisma.employeeBranchAssignment.create({ data: { employeeProfileId: u.chefA.profileId!, branchId: branchA.id } })
      ).rejects.toMatchObject({ code: 'P2002' });
    });
  });

  // ============================================================
  // Scope catalogue & pure decision logic
  // ============================================================
  describe('scope catalogue and branch-filter decisions', () => {
    const baseScope = (over: Partial<BranchScope>): BranchScope => ({
      userId: 'u', roles: [], isGlobal: false, isGlobalRead: false, branchIds: [], employeeProfileId: null, ...over
    });

    it('catalogue matches the approved decisions (D2/D3, customer roles are not staff)', () => {
      expect(ROLE_SCOPE.SUPER_ADMIN).toBe('GLOBAL');
      expect(ROLE_SCOPE.MD).toBe('GLOBAL_READ');
      expect(ROLE_SCOPE.NUTRITIONIST).toBe('ASSIGNMENT');
      expect(ROLE_SCOPE.TRAINER).toBe('ASSIGNMENT');
      expect(ROLE_SCOPE.DELIVERY).toBe('BRANCH_SELF');
      for (const r of [RoleEnum.CHEF, RoleEnum.PROCUREMENT, RoleEnum.POS, RoleEnum.BAKERY_FMCG, RoleEnum.TEPACHE_ERP, RoleEnum.SWIGGY_ZOMATO]) {
        expect(ROLE_SCOPE[r]).toBe('BRANCH');
      }
      expect(CUSTOMER_ROLES.every((r) => ROLE_SCOPE[r] === 'CUSTOMER')).toBe(true);
      expect(STAFF_ROLES).not.toContain(RoleEnum.CUSTOMER);
      expect(NON_ASSIGNABLE_ROLES).toEqual(expect.arrayContaining([RoleEnum.SUPER_ADMIN, RoleEnum.CUSTOMER, RoleEnum.MESS_CUSTOMER]));
    });

    it('a branch-scoped caller can never obtain an "all branches" filter', () => {
      const chef = baseScope({ roles: [RoleEnum.CHEF], branchIds: ['A', 'B'] });
      expect(resolveBranchFilter(chef, 'read')).toEqual({ all: false, branchIds: ['A', 'B'] });
      expect(resolveBranchFilter(chef, 'write')).toEqual({ all: false, branchIds: ['A', 'B'] });
      expect(resolveBranchFilter(chef, 'read', 'A')).toEqual({ all: false, branchIds: ['A'] });
      expect(() => resolveBranchFilter(chef, 'read', 'C')).toThrow(/access to the requested branch/);
      expect(() => resolveBranchFilter(baseScope({ roles: [RoleEnum.CHEF] }), 'read')).toThrow(/No branch assignment/);
    });

    it('global read vs global write', () => {
      const md = baseScope({ roles: [RoleEnum.MD], isGlobalRead: true });
      expect(resolveBranchFilter(md, 'read').all).toBe(true);
      expect(() => resolveBranchFilter(md, 'write')).toThrow(/Read-only/);
      const admin = baseScope({ roles: [RoleEnum.SUPER_ADMIN], isGlobal: true });
      expect(resolveBranchFilter(admin, 'write').all).toBe(true);
      expect(resolveBranchFilter(admin, 'write', 'X')).toEqual({ all: false, branchIds: ['X'] });
    });

    it('assignment-scoped and customer-only callers get no branch access', () => {
      expect(() => resolveBranchFilter(baseScope({ roles: [RoleEnum.NUTRITIONIST] }), 'read')).toThrow();
      expect(() => resolveBranchFilter(baseScope({ roles: [RoleEnum.CUSTOMER] }), 'read')).toThrow();
    });
  });

  // ============================================================
  // Audit service
  // ============================================================
  describe('audit service', () => {
    it('23. sanitize redacts sensitive keys at any depth and never leaks values', () => {
      const out: any = AuditService.sanitize({
        action: 'x',
        password: 'p@ss',
        passwordHash: '$2a$hash',
        nested: { refreshToken: 'rt', authorization: 'Bearer abc', deeper: [{ invitationToken: 'inv', safe: 'ok' }] },
        Cookie: 'pb_refresh_token=abc',
        apiKey: 'k',
        note: 'fine'
      });
      const json = JSON.stringify(out);
      for (const secret of ['p@ss', '$2a$hash', '"rt"', 'Bearer abc', 'inv"', 'pb_refresh_token=abc', '"k"']) {
        expect(json).not.toContain(secret);
      }
      expect(out.note).toBe('fine');
      expect(out.nested.deeper[0].safe).toBe('ok');
      expect(out.password).toBe('[REDACTED]');
    });

    it('23b. sanitize handles circular structures, truncation and nulls', () => {
      const a: any = { name: 'a' };
      a.self = a;
      expect(() => AuditService.sanitize(a)).not.toThrow();
      expect((AuditService.sanitize('x'.repeat(2000)) as string).length).toBeLessThan(600);
      expect(AuditService.sanitize(undefined)).toBeNull();
    });

    it('23c. record() persists sanitized payload, actor, IP and user agent; context never includes headers', async () => {
      const row = await AuditService.record({
        actor: { userId: u.admin.id, roles: [RoleEnum.SUPER_ADMIN] },
        action: 'P6A_TEST_EVENT',
        entity: 'Test',
        entityId: 'e1',
        payload: { token: 'secret-token', ok: true },
        context: AuditService.contextFromRequest({ ip: '10.1.2.3', headers: { 'user-agent': 'vitest', authorization: 'Bearer zzz', cookie: 'c=1' } } as any)
      });
      const stored = await prisma.auditLog.findUnique({ where: { id: row.id } });
      expect(stored!.userId).toBe(u.admin.id);
      expect(stored!.role).toBe('SUPER_ADMIN');
      expect(stored!.ipAddress).toBe('10.1.2.3');
      expect(stored!.userAgent).toBe('vitest');
      expect(JSON.stringify(stored)).not.toMatch(/secret-token|Bearer zzz|c=1/);
      expect((stored!.payload as any).ok).toBe(true);
      expect(stored!.createdAt).toBeInstanceOf(Date);
    });

    it('23d. recordSafe never throws on failure', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await expect(
        AuditService.recordSafe({ action: 'X', entity: 'Y' }, { auditLog: { create: async () => { throw new Error('db down'); } } } as any)
      ).resolves.toBeUndefined();
      spy.mockRestore();
    });
  });

  // ============================================================
  // Staff / customer identity separation
  // ============================================================
  describe('staff and customer identities stay separate', () => {
    it('24. mixed-identity detection (pure and database-backed)', async () => {
      expect(hasMixedIdentity([RoleEnum.CUSTOMER, RoleEnum.CHEF])).toBe(true);
      expect(hasMixedIdentity([RoleEnum.MESS_CUSTOMER, RoleEnum.MD])).toBe(true);
      expect(hasMixedIdentity([RoleEnum.CUSTOMER])).toBe(false);
      expect(hasMixedIdentity([RoleEnum.CHEF, RoleEnum.POS])).toBe(false);

      const mixed = await prisma.user.create({
        data: {
          email: `p6a_mixed_${ts}@test.com`,
          passwordHash: 'x',
          roles: { create: [{ role: RoleEnum.CUSTOMER }, { role: RoleEnum.CHEF }] }
        }
      });
      try {
        const ids = await findMixedIdentityUserIds();
        expect(ids).toContain(mixed.id);
        expect(ids).not.toContain(u.chefA.id);
        expect(ids).not.toContain(u.customer.id);
      } finally {
        await prisma.user.delete({ where: { id: mixed.id } });
      }
    });
  });

  // ============================================================
  // Regression: existing flows
  // ============================================================
  describe('existing flows remain functional', () => {
    it('login, /auth/me and refresh work for an active staff user', async () => {
      const password = 'ActiveStaffPass#1234';
      await makeUser('activeStaff', [RoleEnum.POS], { branches: [branchA.id], password });
      const login = await request(app).post('/api/v1/auth/login').send({ email: u.activeStaff.email, password });
      expect(login.status).toBe(200);
      const me = await request(app).get('/api/v1/auth/me').set(bearer(login.body.data.accessToken));
      expect(me.status).toBe(200);
      expect(me.body.data.user.roles).toEqual([RoleEnum.POS]);
      expect(JSON.stringify(me.body)).not.toMatch(/passwordHash/);
    });

    it('customers keep their customer endpoints and are denied operational ones', async () => {
      expect((await request(app).get('/api/v1/cart').set(bearer(u.customer.token))).status).toBe(200);
      expect((await request(app).get('/api/v1/kds/tickets').set(bearer(u.customer.token))).status).toBe(403);
      expect((await request(app).get('/api/v1/delivery/assignments').set(bearer(u.customer.token))).status).toBe(403);
    });
  });
});

// keep the type import used (Prisma namespace is referenced by AuditService typings in this suite)
export type _Unused = Prisma.JsonValue;
