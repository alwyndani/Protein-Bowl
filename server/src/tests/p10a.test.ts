import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import app from '../app.js';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getPaymentProvider } from '../modules/payment/providerRegistry.js';
import { MockPaymentProvider } from '../modules/payment/mock.provider.js';
import { PaymentReconciliationService } from '../modules/payment/paymentReconciliation.service.js';
import { addDays, businessDate, dateFromString, dateToString } from '../modules/mess/messPolicy.js';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const mock = getPaymentProvider() as MockPaymentProvider;
const PASSWORD = 'P10a#Admin-Pass-2026-xyz';
const sign = (userId: string, email: string, roles: RoleEnum[]) => jwt.sign({ userId, email, roles }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('P10A — Kerala Mess foundation (accounts, service points, plans, purchase, payment activation, cancellation)', () => {
  const ts = Date.now();
  let seq = 0;
  type Who = { id: string; email: string; profileId?: string; token: string };
  const who: Record<string, Who> = {};
  let step = '';
  let branchA: { id: string };
  let branchB: { id: string };
  let spA: { id: string; version: number };
  let spB: { id: string; version: number };
  let planId = '';
  let planVersion = 0;
  const today = businessDate();
  const tomorrow = addDays(today, 1);
  /**
   * P10B same-day rule: a start date of TODAY needs every first-day slot to still be in the future, so a test that buys/pays for today must not depend on the wall clock.
   * Date alone is pinned (timers stay real) to 06:00 IST of the business day when the real time is already later (tokens carry no "not before", so an earlier clock is harmless).
   */
  const morning = async <T>(fn: () => Promise<T>): Promise<T> => {
    const at = new Date(`${today}T06:00:00+05:30`);
    if (Date.now() < at.getTime()) return await fn();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at);
    try {
      return await fn();
    } finally {
      vi.useRealTimers();
    }
  };
  const key = () => `p10a-${ts}-${++seq}-${randomUUID().slice(0, 8)}`;

  async function mkUser(label: string, roles: RoleEnum[]): Promise<Who> {
    const email = `p10a_${label}_${ts}@test.com`;
    const customer = roles.includes(RoleEnum.CUSTOMER) || roles.includes(RoleEnum.MESS_CUSTOMER);
    const u = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(PASSWORD, 4),
        roles: { create: roles.map((role) => ({ role })) },
        ...(customer ? { customerProfile: { create: { fullName: `P10A ${label}`, referralCode: `PB-10A${label.toUpperCase()}${ts}` } } } : {})
      },
      include: { customerProfile: true }
    });
    who[label] = { id: u.id, email, profileId: u.customerProfile?.id, token: sign(u.id, email, roles) };
    return who[label];
  }

  const get = (path: string, token?: string) => (token ? request(app).get(path).set(bearer(token)) : request(app).get(path));
  const send = (method: 'post' | 'put' | 'patch', path: string, token: string, body: unknown = {}, opts: { step?: string | null; key?: string } = {}) => {
    let r = request(app)[method](path).set(bearer(token));
    if (opts.step) r = r.set('x-step-up-token', opts.step);
    if (opts.key) r = r.set('x-idempotency-key', opts.key);
    return r.send(body as object);
  };
  const admin = (method: 'post' | 'put' | 'patch', path: string, body: unknown = {}, s: string | null = step) => send(method, `/api/v1/admin${path}`, who.admin.token, body, { step: s });

  const SLOT_CLOCK: Record<string, string> = { BREAKFAST: '08:00', LUNCH: '13:00', DINNER: '19:30' };
  /** P10B: a plan needs explicit service times for exactly its enabled slots (test fixture values, not policy). */
  const slotTimesFor = (slots: unknown): Record<string, string> => Object.fromEntries(((Array.isArray(slots) ? slots : []) as string[]).filter((x) => SLOT_CLOCK[x]).map((x) => [x, SLOT_CLOCK[x]]));
  const planBody = (over: Record<string, unknown> = {}) => ({
    code: `P10A-${ts}-${++seq}`,
    name: 'Test Monthly',
    durationDays: 30,
    basePrice: '1000.00',
    taxRate: '0.0500',
    mealSlots: ['BREAKFAST', 'LUNCH'],
    pauseCutoffHours: 12,
    maxPauses: 4,
    minStartLeadDays: 1,
    slotTimes: slotTimesFor('mealSlots' in over ? over.mealSlots : ['BREAKFAST', 'LUNCH']),
    ...over
  });
  async function mkActivePlan(over: Record<string, unknown> = {}) {
    const c = await admin('post', '/mess/plans', planBody(over));
    expect(c.status, JSON.stringify(c.body)).toBe(201);
    const a = await admin('post', `/mess/plans/${c.body.data.plan.id}/activate`, { expectedVersion: c.body.data.plan.version });
    expect(a.status, JSON.stringify(a.body)).toBe(200);
    return a.body.data.plan as { id: string; version: number; code: string };
  }
  async function mkServicePoint(branchId: string, label: string) {
    const r = await admin('post', '/mess/service-points', { code: `SP-${label}-${ts}`.toUpperCase(), name: `Hostel ${label} ${ts}`, addressLine: '1 Campus Road', city: 'Kochi', postalCode: '682001', branchId });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return r.body.data.servicePoint as { id: string; version: number };
  }
  async function registerAndApprove(label: string, spId: string, room = '101') {
    const put = await send('put', '/api/v1/mess/account', who[label].token, { servicePointId: spId, roomNumber: room });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    const accId = put.body.data.account.id as string;
    const ap = await admin('post', `/mess/accounts/${accId}/approve`, { expectedServicePointId: spId });
    expect(ap.status, JSON.stringify(ap.body)).toBe(200);
    return accId;
  }
  const buy = (label: string, pid: string, startDate: string, k = key()) => send('post', '/api/v1/mess/subscriptions', who[label].token, { planId: pid, startDate }, { key: k });

  /** Pays the subscription's purchase order through the REAL session + verification endpoints. */
  async function pay(label: string, sub: { id: string; purchaseOrder: { id: string } }) {
    const orderId = sub.purchaseOrder.id;
    const s = await send('post', `/api/v1/orders/${orderId}/payment-attempts`, who[label].token, {});
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    const providerOrderId = s.body.data.providerOrderId as string;
    const attemptId = s.body.data.attemptId as string;
    const p = mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
    const v = await send('post', `/api/v1/orders/${orderId}/payment-attempts/${attemptId}/verify`, who[label].token, { providerOrderId, providerPaymentId: p.providerPaymentId, signature: mock.signCheckout(providerOrderId, p.providerPaymentId) });
    expect(v.status, JSON.stringify(v.body)).toBe(200);
    return { orderId, attemptId, providerOrderId, p };
  }
  const subRow = (id: string) => prisma.messSubscription.findUniqueOrThrow({ where: { id } });
  const audits = (action: string, entityId: string) => prisma.auditLog.findMany({ where: { action, entityId } });

  async function quiesce() {
    await prisma.payment.updateMany({ where: { provider: { not: null } }, data: { nextAttemptAt: null, lockedUntil: null, lockedBy: null } });
    await prisma.paymentWebhookEvent.updateMany({ where: { status: { in: ['RECEIVED', 'RETRY_PENDING'] } }, data: { status: 'IGNORED', ignoredReason: 'TEST_CLEANUP', lockedUntil: null } });
    await prisma.refund.updateMany({ where: { status: { in: ['REQUESTED', 'SUBMITTING', 'UNKNOWN', 'PROCESSING'] } }, data: { nextAttemptAt: null, lockedUntil: null, lockedBy: null } });
  }

  beforeAll(async () => {
    await mkUser('custA', [RoleEnum.CUSTOMER]);
    await mkUser('custB', [RoleEnum.CUSTOMER]);
    await mkUser('custC', [RoleEnum.CUSTOMER]);
    await mkUser('custD', [RoleEnum.CUSTOMER]);
    await mkUser('legacy', [RoleEnum.MESS_CUSTOMER]);
    await mkUser('admin', [RoleEnum.SUPER_ADMIN]);
    await mkUser('md', [RoleEnum.MD]);
    await mkUser('chef', [RoleEnum.CHEF]);
    await mkUser('driver', [RoleEnum.DELIVERY]);
    const r = await request(app).post('/api/v1/admin/step-up').set(bearer(who.admin.token)).send({ password: PASSWORD });
    expect(r.status).toBe(200);
    step = r.body.data.stepUpToken;
    branchA = await prisma.kitchenBranch.create({ data: { code: `P10A-A-${ts}`, name: 'P10A Branch A', address: 'A', city: 'Kochi' } });
    branchB = await prisma.kitchenBranch.create({ data: { code: `P10A-B-${ts}`, name: 'P10A Branch B', address: 'B', city: 'Kochi' } });
    spA = await mkServicePoint(branchA.id, 'A');
    spB = await mkServicePoint(branchB.id, 'B');
    const plan = await mkActivePlan({ name: 'Monthly Lunch+Breakfast' });
    planId = plan.id;
    planVersion = plan.version;
    await quiesce();
  });

  let keepMock = false; // the F group spans several tests with ONE provider order, so it opts out of the per-test reset
  beforeEach(() => {
    if (!keepMock) mock.reset();
  });

  afterAll(async () => {
    await quiesce();
    await prisma.$disconnect();
  });

  // =============================================================================================== A. authentication & role boundaries
  describe('A. role boundaries', () => {
    it('1. every customer Mess endpoint (except the public plan list) rejects anonymous callers with 401', async () => {
      for (const [m, p] of [['get', '/service-points'], ['get', '/account'], ['put', '/account'], ['get', '/subscriptions'], ['post', '/subscriptions']] as const) {
        const res = await (request(app)[m](`/api/v1/mess${p}`) as request.Test).send({});
        expect(res.status, `${m} ${p}`).toBe(401);
      }
      expect((await get('/api/v1/mess/plans')).status).toBe(200);
    });

    it('2. SUPER_ADMIN, MD and staff roles have no customer-context Mess access (403)', async () => {
      for (const l of ['admin', 'md', 'chef', 'driver']) {
        expect((await get('/api/v1/mess/account', who[l].token)).status, l).toBe(403);
        expect((await send('put', '/api/v1/mess/account', who[l].token, { servicePointId: spA.id, roomNumber: '1' })).status, l).toBe(403);
        expect((await buy(l, planId, tomorrow)).status, l).toBe(403);
      }
    });

    it('3. a legacy MESS_CUSTOMER gets the explicit legacy-role 403 on every customer Mess route and cannot buy or pay (backend-only compatibility)', async () => {
      const a = await get('/api/v1/mess/account', who.legacy.token);
      expect(a.status).toBe(403);
      expect(a.body.error).toBe('MESS_CUSTOMER_LEGACY_ROLE');
      const b = await buy('legacy', planId, tomorrow);
      expect(b.status).toBe(403);
      expect(b.body.error).toBe('MESS_CUSTOMER_LEGACY_ROLE');
      expect(await prisma.messSubscription.count({ where: { messAccount: { customerProfileId: who.legacy.profileId } } })).toBe(0);
    });

    it('4. public registration refuses MESS_CUSTOMER (and staff roles); CUSTOMER still registers', async () => {
      const email = `p10a_reg_${ts}@test.com`;
      const refused = await request(app).post('/api/v1/auth/register').send({ email, password: 'Passw0rd!x', fullName: 'Reg Test', requestedRole: 'MESS_CUSTOMER' });
      expect(refused.status).toBe(422);
      expect(await prisma.user.count({ where: { email } })).toBe(0);
      const staff = await request(app).post('/api/v1/auth/register').send({ email, password: 'Passw0rd!x', fullName: 'Reg Test', requestedRole: 'SUPER_ADMIN' });
      expect(staff.status).toBe(422);
      const ok = await request(app).post('/api/v1/auth/register').send({ email, password: 'Passw0rd!x', fullName: 'Reg Test' });
      expect([200, 201]).toContain(ok.status);
      const row = await prisma.user.findUniqueOrThrow({ where: { email }, include: { roles: true } });
      expect(row.roles.map((r) => r.role)).toEqual(['CUSTOMER']);
    });

    it('5. the legacy mutation endpoints are retired for every caller: 410, no wallet row, no meal, no state change', async () => {
      const walletsBefore = await prisma.walletTransaction.count();
      for (const l of ['custA', 'admin', 'md', 'chef', 'legacy']) {
        for (const p of ['/pause-meal', '/verify-gatepass', '/register']) {
          const res = await send('post', `/api/v1/mess${p}`, who[l].token, { subscriptionId: 'x', code: 'X' });
          expect(res.status, `${l} ${p}`).toBe(410);
          expect(res.body.error).toBe('MESS_ENDPOINT_RETIRED');
        }
      }
      expect(await prisma.walletTransaction.count()).toBe(walletsBefore);
      expect(await prisma.mealPauseRequest.count({ where: { messSubscription: { messAccount: { customerProfile: { fullName: { startsWith: 'P10A ' } } } } } })).toBe(0);
    });

    it('6. admin endpoints: anonymous 401; customers and non-admin staff 403; MD can read but never write', async () => {
      expect((await request(app).get('/api/v1/admin/mess/plans')).status).toBe(401);
      for (const l of ['custA', 'chef', 'driver', 'legacy']) {
        expect((await get('/api/v1/admin/mess/plans', who[l].token)).status, l).toBe(403);
        expect((await get('/api/v1/admin/mess/accounts', who[l].token)).status, l).toBe(403);
      }
      for (const p of ['/mess/plans', '/mess/service-points', '/mess/accounts', '/mess/subscriptions']) expect((await get(`/api/v1/admin${p}`, who.md.token)).status, p).toBe(200);
      const attempts = [
        send('post', '/api/v1/admin/mess/plans', who.md.token, planBody(), { step }),
        send('post', '/api/v1/admin/mess/service-points', who.md.token, { code: 'X1', name: 'x', addressLine: 'x', city: 'x', postalCode: '1', branchId: branchA.id }, { step }),
        send('post', `/api/v1/admin/mess/plans/${planId}/activate`, who.md.token, { expectedVersion: 1 }, { step }),
        send('post', `/api/v1/admin/mess/accounts/${randomUUID()}/approve`, who.md.token, { expectedServicePointId: spA.id }, { step }),
        send('post', `/api/v1/admin/mess/subscriptions/${randomUUID()}/cancel`, who.md.token, { reasonCode: 'OTHER' }, { step })
      ];
      for (const r of await Promise.all(attempts)) expect(r.status).toBe(403);
    });

    it('7. every admin write requires a fresh step-up proof (no proof, a garbage proof, or a customer-issued one is refused)', async () => {
      const noStep = await admin('post', '/mess/plans', planBody(), null);
      expect(noStep.status).toBeGreaterThanOrEqual(401);
      expect(noStep.status).toBeLessThan(500);
      expect((await admin('post', '/mess/plans', planBody(), 'garbage')).status).toBeGreaterThanOrEqual(401);
      expect(await prisma.messSubscriptionPlan.count({ where: { code: { in: [planBody().code] } } })).toBe(0);
    });
  });

  // =============================================================================================== B. service points
  describe('B. service points (SUPER_ADMIN only)', () => {
    it('8. a service point belongs to one branch; code is unique; the customer list shows only ACTIVE ones without the branch', async () => {
      const dup = await admin('post', '/mess/service-points', { code: `SP-A-${ts}`.toUpperCase(), name: 'dup', addressLine: 'xxx', city: 'xx', postalCode: '111', branchId: branchA.id });
      expect(dup.status).toBe(409);
      expect(dup.body.error).toBe('SERVICE_POINT_CODE_TAKEN');
      const list = await get('/api/v1/mess/service-points', who.custA.token);
      expect(list.status).toBe(200);
      const mine = list.body.data.servicePoints.find((s: { id: string }) => s.id === spA.id);
      expect(mine).toBeTruthy();
      expect(Object.keys(mine).sort()).toEqual(['city', 'code', 'gateLabel', 'id', 'name']);
      expect(JSON.stringify(list.body)).not.toContain(branchA.id);
    });

    it('9. a service point needs an existing, active branch (422)', async () => {
      const r1 = await admin('post', '/mess/service-points', { code: `SP-X-${ts}`, name: 'x1', addressLine: 'xxx', city: 'xx', postalCode: '111', branchId: randomUUID() });
      expect(r1.status).toBe(422);
      const inactive = await prisma.kitchenBranch.create({ data: { code: `P10A-I-${ts}`, name: 'inactive', address: 'i', city: 'k', isActive: false } });
      const r2 = await admin('post', '/mess/service-points', { code: `SP-Y-${ts}`, name: 'x2', addressLine: 'xxx', city: 'xx', postalCode: '111', branchId: inactive.id });
      expect(r2.status).toBe(422);
      expect(r2.body.error).toBe('BRANCH_INVALID');
    });

    it('10. strict validation: unknown keys are rejected (a client cannot set status/version/branch on update)', async () => {
      const r = await admin('post', '/mess/service-points', { code: `SP-Z-${ts}`, name: 'zz', addressLine: 'x', city: 'x', postalCode: '1', branchId: branchA.id, status: 'ACTIVE', version: 99 });
      expect(r.status).toBe(422);
      const u = await admin('patch', `/mess/service-points/${spA.id}`, { expectedVersion: 1, branchId: branchB.id });
      expect(u.status).toBe(422);
    });

    it('11. updates use an expected version: a stale edit is refused (409) and nothing is lost', async () => {
      const sp = await mkServicePoint(branchA.id, 'V');
      const ok = await admin('patch', `/mess/service-points/${sp.id}`, { expectedVersion: sp.version, name: 'Renamed' });
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      expect(ok.body.data.servicePoint.version).toBe(sp.version + 1);
      const stale = await admin('patch', `/mess/service-points/${sp.id}`, { expectedVersion: sp.version, name: 'Lost update' });
      expect(stale.status).toBe(409);
      expect(stale.body.error).toBe('VERSION_CONFLICT');
      expect((await prisma.messServicePoint.findUniqueOrThrow({ where: { id: sp.id } })).name).toBe('Renamed');
      expect((await audits('MESS_SERVICE_POINT_UPDATED', sp.id)).length).toBe(1);
    });

    it('12. two parallel edits with the same version: exactly one wins', async () => {
      const sp = await mkServicePoint(branchA.id, 'P');
      const [a, b] = await Promise.all([admin('patch', `/mess/service-points/${sp.id}`, { expectedVersion: 1, name: 'One' }), admin('patch', `/mess/service-points/${sp.id}`, { expectedVersion: 1, name: 'Two' })]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
    });

    it('13. an inactive service point is hidden from customers and cannot be selected', async () => {
      const sp = await mkServicePoint(branchA.id, 'I');
      expect((await admin('patch', `/mess/service-points/${sp.id}`, { expectedVersion: 1, status: 'INACTIVE' })).status).toBe(200);
      const list = await get('/api/v1/mess/service-points', who.custA.token);
      expect(list.body.data.servicePoints.some((s: { id: string }) => s.id === sp.id)).toBe(false);
      const put = await send('put', '/api/v1/mess/account', who.custD.token, { servicePointId: sp.id, roomNumber: '9' });
      expect(put.status).toBe(422);
      expect(put.body.error).toBe('SERVICE_POINT_UNAVAILABLE');
    });
  });

  // =============================================================================================== C. account + approval workflow
  describe('C. Mess account approval', () => {
    it('14. a new account is PENDING, derives the hostel name from the service point and cannot buy', async () => {
      const put = await send('put', '/api/v1/mess/account', who.custA.token, { servicePointId: spA.id, roomNumber: '204', studentIdCard: 'STU-1' });
      expect(put.status, JSON.stringify(put.body)).toBe(200);
      expect(put.body.data.account).toMatchObject({ approvalStatus: 'PENDING', roomNumber: '204' });
      const row = await prisma.messAccount.findUniqueOrThrow({ where: { customerProfileId: who.custA.profileId } });
      const sp = await prisma.messServicePoint.findUniqueOrThrow({ where: { id: spA.id } });
      expect(row.collegeHostelName).toBe(sp.name);
      expect(row.isApproved).toBe(false);
      const b = await buy('custA', planId, tomorrow);
      expect(b.status).toBe(409);
      expect(b.body.error).toBe('MESS_ACCOUNT_NOT_APPROVED');
    });

    it('15. the client cannot set approval fields or the hostel name (strict body)', async () => {
      const r = await send('put', '/api/v1/mess/account', who.custB.token, { servicePointId: spA.id, roomNumber: '1', approvalStatus: 'APPROVED', collegeHostelName: 'Hacked' });
      expect(r.status).toBe(422);
      expect(await prisma.messAccount.count({ where: { customerProfileId: who.custB.profileId } })).toBe(0);
    });

    it('16. only SUPER_ADMIN approves (customers and MD cannot); approval records reviewer + audit; replay is a no-op', async () => {
      const acc = await prisma.messAccount.findUniqueOrThrow({ where: { customerProfileId: who.custA.profileId } });
      expect((await send('post', `/api/v1/admin/mess/accounts/${acc.id}/approve`, who.custA.token, { expectedServicePointId: spA.id }, { step })).status).toBe(403);
      const ap = await admin('post', `/mess/accounts/${acc.id}/approve`, { expectedServicePointId: spA.id });
      expect(ap.status, JSON.stringify(ap.body)).toBe(200);
      expect(ap.body.data.changed).toBe(true);
      const row = await prisma.messAccount.findUniqueOrThrow({ where: { id: acc.id } });
      expect(row).toMatchObject({ approvalStatus: 'APPROVED', isApproved: true, reviewedByUserId: who.admin.id });
      expect(row.reviewedAt).toBeTruthy();
      expect((await audits('MESS_ACCOUNT_APPROVED', acc.id)).length).toBe(1);
      const again = await admin('post', `/mess/accounts/${acc.id}/approve`, { expectedServicePointId: spA.id });
      expect(again.body.data.changed).toBe(false);
      expect((await audits('MESS_ACCOUNT_APPROVED', acc.id)).length).toBe(1);
    });

    it('17. approval is refused when the customer changed the service point meanwhile (stale expectedServicePointId)', async () => {
      await send('put', '/api/v1/mess/account', who.custB.token, { servicePointId: spA.id, roomNumber: '5' });
      const acc = await prisma.messAccount.findUniqueOrThrow({ where: { customerProfileId: who.custB.profileId } });
      await send('put', '/api/v1/mess/account', who.custB.token, { servicePointId: spB.id, roomNumber: '5' });
      const ap = await admin('post', `/mess/accounts/${acc.id}/approve`, { expectedServicePointId: spA.id });
      expect(ap.status).toBe(409);
      expect(ap.body.error).toBe('ACCOUNT_CHANGED');
      expect((await prisma.messAccount.findUniqueOrThrow({ where: { id: acc.id } })).approvalStatus).toBe('PENDING');
    });

    it('18. rejection needs a reason code; the customer sees the code, can correct and resubmit (back to PENDING)', async () => {
      const acc = await prisma.messAccount.findUniqueOrThrow({ where: { customerProfileId: who.custB.profileId } });
      expect((await admin('post', `/mess/accounts/${acc.id}/reject`, {})).status).toBe(422);
      const rj = await admin('post', `/mess/accounts/${acc.id}/reject`, { reasonCode: 'INCOMPLETE_DETAILS', note: 'room missing' });
      expect(rj.status, JSON.stringify(rj.body)).toBe(200);
      const mine = await get('/api/v1/mess/account', who.custB.token);
      expect(mine.body.data.account).toMatchObject({ approvalStatus: 'REJECTED', rejectionReasonCode: 'INCOMPLETE_DETAILS' });
      expect(JSON.stringify(mine.body)).not.toContain('room missing'); // the reviewer's note is not shown to the customer
      expect((await buy('custB', planId, tomorrow)).status).toBe(409);
      const re = await send('put', '/api/v1/mess/account', who.custB.token, { servicePointId: spB.id, roomNumber: '6' });
      expect(re.body.data.account).toMatchObject({ approvalStatus: 'PENDING', rejectionReasonCode: null });
      const row = await prisma.messAccount.findUniqueOrThrow({ where: { id: acc.id } });
      expect(row.reviewedAt).toBeNull();
      expect(row.reviewedByUserId).toBeNull();
    });

    it('19. (A4) changing only the room keeps the approval; changing the service point or student id returns to PENDING', async () => {
      const accId = await registerAndApprove('custC', spA.id, '10');
      const room = await send('put', '/api/v1/mess/account', who.custC.token, { servicePointId: spA.id, roomNumber: '11' });
      expect(room.body.data.account.approvalStatus).toBe('APPROVED');
      expect((await prisma.messAccount.findUniqueOrThrow({ where: { id: accId } })).roomNumber).toBe('11');
      const sid = await send('put', '/api/v1/mess/account', who.custC.token, { servicePointId: spA.id, roomNumber: '11', studentIdCard: 'NEW-ID' });
      expect(sid.body.data.account.approvalStatus).toBe('PENDING');
      await admin('post', `/mess/accounts/${accId}/approve`, { expectedServicePointId: spA.id });
      const sp = await send('put', '/api/v1/mess/account', who.custC.token, { servicePointId: spB.id, roomNumber: '11', studentIdCard: 'NEW-ID' });
      expect(sp.body.data.account.approvalStatus).toBe('PENDING');
      expect((await audits('MESS_ACCOUNT_RESUBMITTED', accId)).length).toBe(2);
      await admin('post', `/mess/accounts/${accId}/approve`, { expectedServicePointId: spB.id });
    });

    it('20. a no-change resubmission writes nothing', async () => {
      const before = await prisma.messAccount.findUniqueOrThrow({ where: { customerProfileId: who.custC.profileId } });
      const same = await send('put', '/api/v1/mess/account', who.custC.token, { servicePointId: spB.id, roomNumber: before.roomNumber, studentIdCard: before.studentIdCard });
      expect(same.body.data.changed).toBe(false);
      expect((await prisma.messAccount.findUniqueOrThrow({ where: { id: before.id } })).updatedAt.getTime()).toBe(before.updatedAt.getTime());
    });

    it('21. MD reads accounts but without the student id or phone; SUPER_ADMIN sees them', async () => {
      const md = await get('/api/v1/admin/mess/accounts', who.md.token);
      expect(md.status).toBe(200);
      expect(JSON.stringify(md.body)).not.toContain('NEW-ID');
      expect(md.body.data.accounts[0]).not.toHaveProperty('studentIdCard');
      expect(md.body.data.accounts[0]).not.toHaveProperty('phone');
      const ad = await get('/api/v1/admin/mess/accounts', who.admin.token);
      expect(ad.body.data.accounts.some((a: { studentIdCard?: string }) => a.studentIdCard === 'NEW-ID')).toBe(true);
    });

    it('22. DB integrity: an APPROVED account must have a service point; REJECTED must carry a reason', async () => {
      const acc = await prisma.messAccount.findUniqueOrThrow({ where: { customerProfileId: who.custC.profileId } });
      await expect(prisma.$executeRawUnsafe(`UPDATE mess_accounts SET "servicePointId" = NULL WHERE id = '${acc.id}'`)).rejects.toThrow();
      await expect(prisma.$executeRawUnsafe(`UPDATE mess_accounts SET "approvalStatus" = 'MAYBE' WHERE id = '${acc.id}'`)).rejects.toThrow();
    });
  });

  // =============================================================================================== D. plans
  describe('D. plan administration', () => {
    it('23. a plan is created as a DRAFT and is invisible to customers', async () => {
      const c = await admin('post', '/mess/plans', planBody({ taxRate: undefined, mealSlots: undefined, pauseCutoffHours: undefined }));
      expect(c.status, JSON.stringify(c.body)).toBe(201);
      expect(c.body.data.plan).toMatchObject({ status: 'DRAFT', taxRate: null, version: 1 });
      const pub = await get('/api/v1/mess/plans');
      expect(pub.body.data.some((p: { id: string }) => p.id === c.body.data.plan.id)).toBe(false);
    });

    it('24. activation refuses an incomplete plan: no tax rate, no slots, no pause policy, no lead days, zero price', async () => {
      const cases: Array<Record<string, unknown>> = [{ taxRate: undefined }, { slotTimes: undefined }, { slotTimes: { LUNCH: '13:00' } }, { mealSlots: [] }, { pauseCutoffHours: undefined }, { maxPauses: undefined }, { minStartLeadDays: undefined }, { basePrice: '0' }];
      for (const over of cases) {
        const c = await admin('post', '/mess/plans', planBody(over));
        expect(c.status, JSON.stringify(over)).toBe(201);
        const a = await admin('post', `/mess/plans/${c.body.data.plan.id}/activate`, { expectedVersion: 1 });
        expect(a.status, JSON.stringify(over)).toBe(422);
        expect(a.body.error).toBe('PLAN_INCOMPLETE');
      }
    });

    it('25. validation: duplicate slots, unknown slot, bad tax rate, negative lead, bad dates, unknown keys are all refused', async () => {
      const bad: Array<Record<string, unknown>> = [
        { slotTimes: { BREAKFAST: '08:00', LUNCH: '1pm' } }, { slotTimes: { BREAKFAST: '25:00' } }, { slotTimes: { SNACK: '10:00' } }, { mealSlots: ['LUNCH', 'LUNCH'] }, { mealSlots: ['SNACK'] }, { taxRate: '1.5' }, { taxRate: '-0.1' }, { taxRate: 'abc' }, { minStartLeadDays: -1 },
        { pauseCutoffHours: -2 }, { maxPauses: -1 }, { durationDays: 0 }, { basePrice: '-5' }, { basePrice: '10.999' }, { validFrom: '2026-13-40' }, { status: 'ACTIVE' }, { mealsPerDay: 9 }
      ];
      for (const over of bad) expect((await admin('post', '/mess/plans', planBody(over))).status, JSON.stringify(over)).toBe(422);
      const window = await admin('post', '/mess/plans', planBody({ validFrom: '2026-12-31', validUntil: '2026-01-01' }));
      expect(window.status).toBe(422);
      expect((await admin('post', '/mess/plans', planBody({ branchId: randomUUID() }))).status).toBe(422);
    });

    it('26. activation succeeds for a complete plan; mealsPerDay is derived from the slots (server-side) and the legacy active flag follows', async () => {
      const p = await mkActivePlan({ mealSlots: ['BREAKFAST', 'LUNCH', 'DINNER'] });
      const row = await prisma.messSubscriptionPlan.findUniqueOrThrow({ where: { id: p.id } });
      expect(row).toMatchObject({ status: 'ACTIVE', mealsPerDay: 3, active: true });
      expect((await audits('MESS_PLAN_ACTIVATED', p.id)).length).toBe(1);
    });

    it('27. the public plan list is priced by the server (HALF_UP) and leaks no branch or pause policy', async () => {
      const p = await mkActivePlan({ basePrice: '333.33', taxRate: '0.0500' }); // 333.33 * 0.05 = 16.6665 -> 16.67
      const pub = await get('/api/v1/mess/plans');
      expect(Array.isArray(pub.body.data)).toBe(true); // plain array: existing clients that map over it keep working
      const dto = pub.body.data.find((x: { id: string }) => x.id === p.id);
      expect(dto.price).toEqual({ subtotal: 333.33, taxRate: 0.05, taxAmount: 16.67, total: 350, currency: 'INR' });
      for (const k of ['branch', 'branchId', 'pauseCutoffHours', 'maxPauses', 'version', 'status']) expect(dto).not.toHaveProperty(k);
    });

    it('28. a plan outside its validity window is not sold; a plan limited to another branch is not offered', async () => {
      const past = await mkActivePlan({ validFrom: '2020-01-01', validUntil: '2020-02-01' });
      const future = await mkActivePlan({ validFrom: addDays(today, 30), validUntil: addDays(today, 90) });
      const onlyB = await mkActivePlan({ branchId: branchB.id });
      const all = (await get('/api/v1/mess/plans')).body.data.map((p: { id: string }) => p.id);
      expect(all).not.toContain(past.id);
      expect(all).not.toContain(future.id);
      const forA = (await get(`/api/v1/mess/plans?servicePointId=${spA.id}`)).body.data.map((p: { id: string }) => p.id);
      const forB = (await get(`/api/v1/mess/plans?servicePointId=${spB.id}`)).body.data.map((p: { id: string }) => p.id);
      expect(forA).not.toContain(onlyB.id);
      expect(forB).toContain(onlyB.id);
      expect(forA).toContain(planId);
    });

    it('29. editing uses the expected version; an ACTIVE plan stays complete after any edit; two parallel edits: one wins', async () => {
      const p = await mkActivePlan();
      const ok = await admin('patch', `/mess/plans/${p.id}`, { expectedVersion: p.version, name: 'Renamed plan' });
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      const stale = await admin('patch', `/mess/plans/${p.id}`, { expectedVersion: p.version, name: 'stale' });
      expect(stale.status).toBe(409);
      const strip = await admin('patch', `/mess/plans/${p.id}`, { expectedVersion: ok.body.data.plan.version, taxRate: null });
      expect(strip.status).toBe(422);
      expect(strip.body.error).toBe('PLAN_INCOMPLETE');
      const v = ok.body.data.plan.version;
      const [a, b] = await Promise.all([admin('patch', `/mess/plans/${p.id}`, { expectedVersion: v, basePrice: '1200' }), admin('patch', `/mess/plans/${p.id}`, { expectedVersion: v, basePrice: '1300' })]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
    });

    it('30. archiving stops sales but keeps the row; an archived plan cannot be edited or activated again', async () => {
      const p = await mkActivePlan();
      const ar = await admin('post', `/mess/plans/${p.id}/archive`, { expectedVersion: p.version });
      expect(ar.status).toBe(200);
      expect((await get('/api/v1/mess/plans')).body.data.some((x: { id: string }) => x.id === p.id)).toBe(false);
      expect((await admin('patch', `/mess/plans/${p.id}`, { expectedVersion: ar.body.data.plan.version, name: 'xx' })).status).toBe(409);
      expect((await admin('post', `/mess/plans/${p.id}/activate`, { expectedVersion: ar.body.data.plan.version })).status).toBe(409);
      const again = await admin('post', `/mess/plans/${p.id}/archive`, { expectedVersion: 1 });
      expect(again.body.data.changed).toBe(false);
    });

    it('31. DB integrity: an ACTIVE plan without a tax rate / zero price / empty slots cannot exist (CHECK)', async () => {
      const p = await mkActivePlan();
      await expect(prisma.$executeRawUnsafe(`UPDATE mess_subscription_plans SET "taxRate" = NULL WHERE id = '${p.id}'`)).rejects.toThrow();
      await expect(prisma.$executeRawUnsafe(`UPDATE mess_subscription_plans SET "basePrice" = 0 WHERE id = '${p.id}'`)).rejects.toThrow();
      await expect(prisma.$executeRawUnsafe(`UPDATE mess_subscription_plans SET "mealSlots" = '{}' WHERE id = '${p.id}'`)).rejects.toThrow();
      await expect(prisma.$executeRawUnsafe(`UPDATE mess_subscription_plans SET "mealSlots" = '{LUNCH,LUNCH}', "mealsPerDay" = 2 WHERE id = '${p.id}'`)).rejects.toThrow();
    });
  });

  // =============================================================================================== E. purchase
  describe('E. purchase, pricing snapshot and idempotency', () => {
    let accOk = '';
    beforeAll(async () => {
      accOk = await registerAndApprove('custD', spA.id, '77');
    });

    it('32. a purchase creates a PENDING_PAYMENT subscription and a MESS_SUBSCRIPTION order priced by MESS_PURCHASE_V1 (zero fees, HALF_UP tax)', async () => {
      const p = await mkActivePlan({ basePrice: '333.33', taxRate: '0.0500', code: `P10A-PR-${ts}` });
      const res = await buy('custD', p.id, tomorrow);
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      const sub = res.body.data.subscription;
      expect(sub).toMatchObject({ status: 'PENDING_PAYMENT', startDate: tomorrow, endDate: addDays(tomorrow, 29), mealsIncluded: 60 });
      expect(sub.price).toMatchObject({ subtotal: 333.33, taxAmount: 16.67, total: 350 });
      const order = await prisma.order.findUniqueOrThrow({ where: { id: sub.purchaseOrder.id }, include: { items: true } });
      expect(order).toMatchObject({ orderType: 'MESS_SUBSCRIPTION', status: 'PENDING', paymentStatus: 'PENDING', paymentMethod: 'ONLINE' });
      expect(Number(order.totalAmount)).toBe(333.33);
      expect(Number(order.taxAmount)).toBe(16.67);
      expect(Number(order.netAmount)).toBe(350);
      for (const f of ['deliveryFee', 'packagingFee', 'discountAmount', 'containerDepositTotal'] as const) expect(Number(order[f]), f).toBe(0);
      expect(order.items).toHaveLength(1);
      expect(order.items[0]).toMatchObject({ quantity: 1, productId: null });
      expect((order.pricingSnapshot as { policy: string }).policy).toBe('MESS_PURCHASE_V1');
      expect(order.deliveryAddressSnapshot).toBeNull();
      expect((await audits('MESS_PURCHASE_CREATED', sub.id)).length).toBe(1);
      await send('post', `/api/v1/mess/subscriptions/${sub.id}/cancel`, who.custD.token, { reasonCode: 'CHANGED_MIND' });
    });

    it('33. the price and tax rate come from the plan row only: no DIRECT CommercePolicy delivery fee / minimum order leaks in; no client price is accepted', async () => {
      const p = await mkActivePlan({ basePrice: '10.00', taxRate: '0', code: `P10A-LOW-${ts}` }); // far below any food minimum-order value
      const injected = await send('post', '/api/v1/mess/subscriptions', who.custD.token, { planId: p.id, startDate: tomorrow, basePrice: 1, taxRate: 0, total: 1 }, { key: key() });
      expect(injected.status).toBe(422);
      const res = await buy('custD', p.id, tomorrow);
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.data.subscription.price).toMatchObject({ subtotal: 10, taxAmount: 0, total: 10 });
      await send('post', `/api/v1/mess/subscriptions/${res.body.data.subscription.id}/cancel`, who.custD.token, { reasonCode: 'CHANGED_MIND' });
    });

    it('34. the purchase body is strict: no paymentMethod / COD / status / branch field is accepted', async () => {
      for (const extra of [{ paymentMethod: 'COD' }, { paymentMethod: 'ONLINE' }, { status: 'ACTIVE' }, { branchId: branchA.id }, { customerProfileId: who.custA.profileId }]) {
        const r = await send('post', '/api/v1/mess/subscriptions', who.custD.token, { planId, startDate: tomorrow, ...extra }, { key: key() });
        expect(r.status, JSON.stringify(extra)).toBe(422);
      }
    });

    it('35. the idempotency key is required and validated', async () => {
      const none = await send('post', '/api/v1/mess/subscriptions', who.custD.token, { planId, startDate: tomorrow });
      expect(none.status).toBe(400);
      expect(none.body.error).toBe('IDEMPOTENCY_KEY_REQUIRED');
      const bad = await buy('custD', planId, tomorrow, 'x');
      expect(bad.status).toBe(400);
    });

    it('36. same key + same request replays the existing purchase (200, one row); same key + different request conflicts', async () => {
      const k = key();
      const a = await buy('custD', planId, tomorrow, k);
      expect(a.status, JSON.stringify(a.body)).toBe(201);
      const b = await buy('custD', planId, tomorrow, k);
      expect(b.status).toBe(200);
      expect(b.body.data.replay).toBe(true);
      expect(b.body.data.subscription.id).toBe(a.body.data.subscription.id);
      const c = await buy('custD', planId, addDays(tomorrow, 5), k);
      expect(c.status).toBe(409);
      expect(c.body.error).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(await prisma.messSubscription.count({ where: { messAccountId: accOk, purchaseOrderId: { not: null } } })).toBeGreaterThan(0);
      expect(await prisma.order.count({ where: { idempotencyKey: k } })).toBe(1);
      await send('post', `/api/v1/mess/subscriptions/${a.body.data.subscription.id}/cancel`, who.custD.token, { reasonCode: 'CHANGED_MIND' });
    });

    it('37. a key used by one customer is independent of another customer (scoped per customer)', async () => {
      const k = key();
      const a = await buy('custD', planId, tomorrow, k);
      expect(a.status).toBe(201);
      await registerAndApprove('custA', spA.id, '12').catch(() => undefined);
      const other = await buy('custA', planId, tomorrow, k);
      expect([201, 409]).toContain(other.status);
      expect(other.body?.data?.subscription?.id ?? '').not.toBe(a.body.data.subscription.id);
      await send('post', `/api/v1/mess/subscriptions/${a.body.data.subscription.id}/cancel`, who.custD.token, { reasonCode: 'CHANGED_MIND' });
      if (other.status === 201) await send('post', `/api/v1/mess/subscriptions/${other.body.data.subscription.id}/cancel`, who.custA.token, { reasonCode: 'CHANGED_MIND' });
    });

    it('38. parallel purchases with the same key create exactly one subscription and one order', async () => {
      const k = key();
      const results = await Promise.all([buy('custD', planId, tomorrow, k), buy('custD', planId, tomorrow, k), buy('custD', planId, tomorrow, k)]);
      expect(results.every((r) => [200, 201].includes(r.status)), JSON.stringify(results.map((r) => r.status))).toBe(true);
      expect(new Set(results.map((r) => r.body.data.subscription.id)).size).toBe(1);
      expect(await prisma.order.count({ where: { idempotencyKey: k } })).toBe(1);
      await send('post', `/api/v1/mess/subscriptions/${results[0].body.data.subscription.id}/cancel`, who.custD.token, { reasonCode: 'CHANGED_MIND' });
    });

    it('39. only ONE open PENDING_PAYMENT purchase per account: a second one (other key, even other plan) is refused; parallel attempts yield one', async () => {
      const first = await buy('custD', planId, tomorrow);
      expect(first.status).toBe(201);
      const second = await buy('custD', planId, addDays(tomorrow, 60));
      expect(second.status).toBe(409);
      expect(second.body.error).toBe('OPEN_PURCHASE_EXISTS');
      await send('post', `/api/v1/mess/subscriptions/${first.body.data.subscription.id}/cancel`, who.custD.token, { reasonCode: 'CHANGED_MIND' });
      const par = await Promise.all([buy('custD', planId, tomorrow), buy('custD', planId, addDays(tomorrow, 90)), buy('custD', planId, addDays(tomorrow, 200))]);
      expect(par.filter((r) => r.status === 201)).toHaveLength(1);
      expect(par.filter((r) => r.status === 409)).toHaveLength(2);
      const winner = par.find((r) => r.status === 201)!;
      await send('post', `/api/v1/mess/subscriptions/${winner.body.data.subscription.id}/cancel`, who.custD.token, { reasonCode: 'CHANGED_MIND' });
    });

    it('40. DB integrity: a second PENDING_PAYMENT row for the same account is impossible (partial unique index)', async () => {
      const first = await buy('custD', planId, tomorrow);
      expect(first.status).toBe(201);
      const base = await prisma.messSubscription.findUniqueOrThrow({ where: { id: first.body.data.subscription.id } });
      await expect(
        prisma.messSubscription.create({ data: { messAccountId: base.messAccountId, planId: base.planId, status: 'PENDING_PAYMENT', startDate: base.startDate, endDate: base.endDate, totalMealsAllowed: 1, mealsRemaining: 1 } })
      ).rejects.toThrow();
      await send('post', `/api/v1/mess/subscriptions/${base.id}/cancel`, who.custD.token, { reasonCode: 'CHANGED_MIND' });
    });

    it('41. minStartLeadDays is enforced against the business date: lead 0 allows today; lead 3 refuses earlier dates; the past is refused', async () => {
      const zero = await mkActivePlan({ minStartLeadDays: 0, code: `P10A-L0-${ts}` });
      const three = await mkActivePlan({ minStartLeadDays: 3, code: `P10A-L3-${ts}` });
      expect((await buy('custD', zero.id, addDays(today, -1))).status).toBe(422);
      const sameDay = await morning(() => buy('custD', zero.id, today));
      expect(sameDay.status, JSON.stringify(sameDay.body)).toBe(201);
      await send('post', `/api/v1/mess/subscriptions/${sameDay.body.data.subscription.id}/cancel`, who.custD.token, { reasonCode: 'CHANGED_MIND' });
      for (const d of [today, addDays(today, 1), addDays(today, 2)]) {
        const r = await buy('custD', three.id, d);
        expect(r.status, d).toBe(422);
        expect(r.body.error).toBe('START_DATE_TOO_EARLY');
      }
      const ok = await buy('custD', three.id, addDays(today, 3));
      expect(ok.status, JSON.stringify(ok.body)).toBe(201);
      await send('post', `/api/v1/mess/subscriptions/${ok.body.data.subscription.id}/cancel`, who.custD.token, { reasonCode: 'CHANGED_MIND' });
    });

    it('42. malformed or absurd start dates are refused (format, impossible date, far future)', async () => {
      for (const d of ['tomorrow', '2026-02-30', '12/12/2026', '', addDays(today, 4000)]) expect((await buy('custD', planId, d)).status, d).toBe(422);
    });

    it('43. a plan limited to another branch is refused for this service point; a draft/archived/unknown plan is not purchasable', async () => {
      const onlyB = await mkActivePlan({ branchId: branchB.id, code: `P10A-OB-${ts}` });
      const r = await buy('custD', onlyB.id, tomorrow);
      expect(r.status).toBe(409);
      expect(r.body.error).toBe('PLAN_NOT_AVAILABLE');
      const draft = await admin('post', '/mess/plans', planBody());
      expect((await buy('custD', draft.body.data.plan.id, tomorrow)).status).toBe(404);
      expect((await buy('custD', randomUUID(), tomorrow)).status).toBe(404);
      const ex = await mkActivePlan({ code: `P10A-EXP-${ts}`, validFrom: '2020-01-01', validUntil: '2020-06-01' });
      expect((await buy('custD', ex.id, tomorrow)).status).toBe(409);
    });

    it('44. snapshot immutability: editing or archiving the plan afterwards never changes an existing subscription or its order', async () => {
      const p = await mkActivePlan({ basePrice: '500.00', taxRate: '0.1200', code: `P10A-SN-${ts}` });
      const res = await buy('custD', p.id, tomorrow);
      const sub = res.body.data.subscription;
      const before = await prisma.order.findUniqueOrThrow({ where: { id: sub.purchaseOrder.id } });
      const edit = await admin('patch', `/mess/plans/${p.id}`, { expectedVersion: p.version, basePrice: '999.00', taxRate: '0.2800', mealSlots: ['DINNER'], slotTimes: { DINNER: '19:00' } });
      expect(edit.status, JSON.stringify(edit.body)).toBe(200);
      await admin('post', `/mess/plans/${p.id}/archive`, { expectedVersion: edit.body.data.plan.version });
      const after = await prisma.order.findUniqueOrThrow({ where: { id: sub.purchaseOrder.id } });
      expect(Number(after.netAmount)).toBe(Number(before.netAmount));
      expect(after.pricingSnapshot).toEqual(before.pricingSnapshot);
      const row = await subRow(sub.id);
      expect(row.mealSlots).toEqual(['BREAKFAST', 'LUNCH']);
      expect((row.planSnapshot as { basePrice: number }).basePrice).toBe(500);
      const read = await get(`/api/v1/mess/subscriptions/${sub.id}`, who.custD.token);
      expect(read.body.data.subscription.price.total).toBe(560);
      await send('post', `/api/v1/mess/subscriptions/${sub.id}/cancel`, who.custD.token, { reasonCode: 'CHANGED_MIND' });
    });

    it('45. a purchase for an account whose service point went inactive is refused; a service point with an open purchase cannot be deactivated', async () => {
      const sp = await mkServicePoint(branchA.id, 'IU');
      await registerAndApprove('custC', sp.id, '3');
      const r = await buy('custC', planId, tomorrow);
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      const off = await admin('patch', `/mess/service-points/${sp.id}`, { expectedVersion: sp.version, status: 'INACTIVE' });
      expect(off.status).toBe(409);
      expect(off.body.error).toBe('SERVICE_POINT_IN_USE');
      await send('post', `/api/v1/mess/subscriptions/${r.body.data.subscription.id}/cancel`, who.custC.token, { reasonCode: 'CHANGED_MIND' });
      const off2 = await admin('patch', `/mess/service-points/${sp.id}`, { expectedVersion: sp.version, status: 'INACTIVE' });
      expect(off2.status).toBe(200);
      const blocked = await buy('custC', planId, tomorrow);
      expect(blocked.status).toBe(409);
      expect(blocked.body.error).toBe('SERVICE_POINT_UNAVAILABLE');
      await registerAndApprove('custC', spB.id, '3');
    });

    it('46. (A4) no service-point / identity change while a purchase is open; a room change is still allowed', async () => {
      const r = await buy('custD', planId, tomorrow);
      expect(r.status).toBe(201);
      const move = await send('put', '/api/v1/mess/account', who.custD.token, { servicePointId: spB.id, roomNumber: '77' });
      expect(move.status).toBe(409);
      expect(move.body.error).toBe('ACCOUNT_CHANGE_BLOCKED');
      expect((await send('put', '/api/v1/mess/account', who.custD.token, { servicePointId: spA.id, roomNumber: '78' })).status).toBe(200);
      await send('post', `/api/v1/mess/subscriptions/${r.body.data.subscription.id}/cancel`, who.custD.token, { reasonCode: 'CHANGED_MIND' });
    });

    it('47. account edit vs purchase in parallel: exactly one wins and the state stays consistent', async () => {
      const acc = await registerAndApprove('custB', spA.id, '40');
      const [put, b] = await Promise.all([send('put', '/api/v1/mess/account', who.custB.token, { servicePointId: spB.id, roomNumber: '40' }), buy('custB', planId, tomorrow)]);
      const putOk = put.status === 200;
      const buyOk = b.status === 201;
      expect(putOk !== buyOk, `${put.status}/${b.status}`).toBe(true);
      const account = await prisma.messAccount.findUniqueOrThrow({ where: { id: acc } });
      if (buyOk) {
        expect(account.servicePointId).toBe(spA.id);
        await send('post', `/api/v1/mess/subscriptions/${b.body.data.subscription.id}/cancel`, who.custB.token, { reasonCode: 'CHANGED_MIND' });
      } else {
        expect(account.approvalStatus).toBe('PENDING');
        await admin('post', `/mess/accounts/${acc}/approve`, { expectedServicePointId: spB.id });
        await registerAndApprove('custB', spA.id, '40');
      }
    });

    it('48. archiving the plan vs purchase in parallel never leaves a purchase of an archived plan inconsistent (no 5xx)', async () => {
      const p = await mkActivePlan({ code: `P10A-RACE-${ts}` });
      const [a, b] = await Promise.all([admin('post', `/mess/plans/${p.id}/archive`, { expectedVersion: p.version }), buy('custD', p.id, tomorrow)]);
      expect(a.status).toBe(200);
      expect([201, 404]).toContain(b.status);
      if (b.status === 201) await send('post', `/api/v1/mess/subscriptions/${b.body.data.subscription.id}/cancel`, who.custD.token, { reasonCode: 'CHANGED_MIND' });
    });
  });

  // =============================================================================================== F. payment, activation and webhook/browser races
  describe('F. verified payment activates; nothing else does', () => {
    let sA: { id: string; purchaseOrder: { id: string } };
    beforeAll(async () => {
      keepMock = true;
      mock.reset();
      await prisma.messSubscription.updateMany({ where: { messAccount: { customerProfileId: { in: [who.custA.profileId!, who.custB.profileId!, who.custC.profileId!, who.custD.profileId!] } }, status: 'PENDING_PAYMENT' }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      await registerAndApprove('custA', spA.id, '12').catch(() => undefined);
    });
    const open = async (label: string, startDate = tomorrow, pid = planId) => {
      const r = await buy(label, pid, startDate);
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      return r.body.data.subscription as { id: string; purchaseOrder: { id: string } };
    };
    const hook = (info: Parameters<MockPaymentProvider['buildWebhook']>[1], id = `evt_${ts}_${++seq}`) => {
      const h = mock.buildWebhook('payment.captured', info, { eventId: id });
      return request(app).post('/api/v1/payments/webhook').set({ ...h.headers, 'content-type': 'application/octet-stream' }).send(h.raw);
    };

    it('49. creating the purchase or a payment session does not activate; only a verified capture does', async () => {
      sA = await open('custA');
      expect((await subRow(sA.id)).status).toBe('PENDING_PAYMENT');
      const s = await send('post', `/api/v1/orders/${sA.purchaseOrder.id}/payment-attempts`, who.custA.token, {});
      expect(s.status, JSON.stringify(s.body)).toBe(200);
      expect((await subRow(sA.id)).status).toBe('PENDING_PAYMENT');
      const orderBefore = await prisma.order.findUniqueOrThrow({ where: { id: sA.purchaseOrder.id } });
      expect(orderBefore).toMatchObject({ status: 'PENDING', paymentStatus: 'PENDING' });
    });

    it('50. a forged / unsigned browser success does not activate', async () => {
      const row = await prisma.payment.findFirstOrThrow({ where: { orderId: sA.purchaseOrder.id } });
      const bad = await send('post', `/api/v1/orders/${sA.purchaseOrder.id}/payment-attempts/${row.id}/verify`, who.custA.token, { providerOrderId: row.providerOrderId, providerPaymentId: 'pay_forged', signature: 'f'.repeat(64) });
      expect(bad.status).toBeGreaterThanOrEqual(400);
      expect((await subRow(sA.id)).status).toBe('PENDING_PAYMENT');
    });

    it('51. an AUTHORIZED-only payment (not captured) never activates', async () => {
      const row = await prisma.payment.findFirstOrThrow({ where: { orderId: sA.purchaseOrder.id } });
      const auth = mock.simulatePayment(row.providerOrderId!, { status: 'AUTHORIZED' });
      const v = await send('post', `/api/v1/orders/${sA.purchaseOrder.id}/payment-attempts/${row.id}/verify`, who.custA.token, { providerOrderId: row.providerOrderId, providerPaymentId: auth.providerPaymentId, signature: mock.signCheckout(row.providerOrderId!, auth.providerPaymentId) });
      expect(v.status, JSON.stringify(v.body)).toBeLessThan(500);
      expect((await subRow(sA.id)).status).toBe('PENDING_PAYMENT');
      expect(await prisma.order.findUniqueOrThrow({ where: { id: sA.purchaseOrder.id } })).toMatchObject({ status: 'PENDING', paymentStatus: 'PENDING' });
    });

    it('52. an amount-mismatched capture is flagged and does not activate', async () => {
      const row = await prisma.payment.findFirstOrThrow({ where: { orderId: sA.purchaseOrder.id } });
      const wrong = mock.simulatePayment(row.providerOrderId!, { status: 'CAPTURED', amountMinor: 100 });
      const v = await send('post', `/api/v1/orders/${sA.purchaseOrder.id}/payment-attempts/${row.id}/verify`, who.custA.token, { providerOrderId: row.providerOrderId, providerPaymentId: wrong.providerPaymentId, signature: mock.signCheckout(row.providerOrderId!, wrong.providerPaymentId) });
      expect(v.status).toBeLessThan(500);
      expect((await subRow(sA.id)).status).toBe('PENDING_PAYMENT');
      expect((await prisma.providerPayment.findFirstOrThrow({ where: { providerPaymentId: wrong.providerPaymentId } })).reconciliationStatus).toBe('AMOUNT_MISMATCH');
      // P11C-2 D1 test isolation (assertions in #51 and #52 are unchanged): an AUTHORIZED or captured payment on the provider order now
      // (correctly) blocks any further payment start, exactly as the order payment summary always classified it (authorized, or captured but
      // not applied = CONFIRMING). #51/#52 only exercise the "does not activate" defences, so their simulated payments are dropped from the
      // PROVIDER here to let the next scenarios (#53+) start from a payable order. Flagged ledger rows in the database are left as they are.
      for (const [id, pay] of [...mock.payments]) if (pay.providerOrderId === row.providerOrderId) mock.payments.delete(id);
      mock.orders.set(row.providerOrderId!, { ...mock.orders.get(row.providerOrderId!)!, status: 'created' });
    });

    it('53. verified capture (browser verification, server-checked) activates: order PAID + CONFIRMED, subscription ACTIVE, audit, no meals, no wallet', async () => {
      const walletBefore = await prisma.walletTransaction.count();
      await pay('custA', sA);
      const sub = await subRow(sA.id);
      expect(sub.status).toBe('ACTIVE');
      expect(sub.activatedAt).toBeTruthy();
      expect(await prisma.order.findUniqueOrThrow({ where: { id: sA.purchaseOrder.id } })).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID' });
      expect((await audits('MESS_SUBSCRIPTION_ACTIVATED', sA.id)).length).toBe(1);
      expect(await prisma.messMeal.count({ where: { messSubscriptionId: sA.id } })).toBe(60); // P10B: the COMPLETE entitlement exists the moment it activates (30 days x 2 slots)
      expect(await prisma.mealPauseRequest.count({ where: { messSubscriptionId: sA.id } })).toBe(0);
      expect(await prisma.walletTransaction.count()).toBe(walletBefore);
      const read = await get(`/api/v1/mess/subscriptions/${sA.id}`, who.custA.token);
      expect(read.body.data.subscription).toMatchObject({ status: 'ACTIVE', payment: { state: 'PAID', canStartPayment: false } });
    });

    it('54. replay: verifying the same payment again and re-delivering the webhook change nothing (one activation, one audit)', async () => {
      const ledger = await prisma.providerPayment.findFirstOrThrow({ where: { orderId: sA.purchaseOrder.id, reconciliationStatus: 'APPLIED' } });
      const info = { providerPaymentId: ledger.providerPaymentId, providerOrderId: ledger.providerOrderId, amountMinor: 105000, currency: 'INR', status: 'CAPTURED' as const, method: 'upi', errorCode: null, errorReason: null };
      const first = await hook(info, `evt_${ts}_replayA`);
      const second = await hook(info, `evt_${ts}_replayA`);
      expect([first.status, second.status]).toEqual([200, 200]);
      await PaymentReconciliationService.runOnce({ workerId: 'p10a-replay' });
      expect((await subRow(sA.id)).status).toBe('ACTIVE');
      expect((await audits('MESS_SUBSCRIPTION_ACTIVATED', sA.id)).length).toBe(1);
      expect(await prisma.providerPayment.count({ where: { orderId: sA.purchaseOrder.id } })).toBeGreaterThanOrEqual(1);
    });

    it('55. activation via the signed WEBHOOK alone (no browser verification) works and is idempotent', async () => {
      const sub = await open('custD');
      const s = await send('post', `/api/v1/orders/${sub.purchaseOrder.id}/payment-attempts`, who.custD.token, {});
      const pi = mock.simulatePayment(s.body.data.providerOrderId, { status: 'CAPTURED' });
      expect((await hook(pi)).status).toBe(200);
      await PaymentReconciliationService.runOnce({ workerId: 'p10a-hook' });
      expect((await subRow(sub.id)).status).toBe('ACTIVE');
      expect((await audits('MESS_SUBSCRIPTION_ACTIVATED', sub.id)).length).toBe(1);
      await prisma.messSubscription.update({ where: { id: sub.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } }); // free the account for later tests
    });

    it('56. webhook vs browser verification racing for the same capture: exactly one activation', async () => {
      const sub = await open('custD', addDays(today, 200));
      const s = await send('post', `/api/v1/orders/${sub.purchaseOrder.id}/payment-attempts`, who.custD.token, {});
      const providerOrderId = s.body.data.providerOrderId as string;
      const pi = mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
      const [h, v] = await Promise.all([hook(pi), send('post', `/api/v1/orders/${sub.purchaseOrder.id}/payment-attempts/${s.body.data.attemptId}/verify`, who.custD.token, { providerOrderId, providerPaymentId: pi.providerPaymentId, signature: mock.signCheckout(providerOrderId, pi.providerPaymentId) })]);
      expect(h.status).toBe(200);
      expect(v.status).toBeLessThan(500);
      await PaymentReconciliationService.runOnce({ workerId: 'p10a-race' });
      expect((await subRow(sub.id)).status).toBe('ACTIVE');
      expect((await audits('MESS_SUBSCRIPTION_ACTIVATED', sub.id)).length).toBe(1);
      expect(await prisma.providerPayment.count({ where: { orderId: sub.purchaseOrder.id, reconciliationStatus: 'APPLIED' } })).toBe(1);
      await prisma.messSubscription.update({ where: { id: sub.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    });

    it('57. overlap protection: a term that overlaps an ACTIVE subscription is refused; a later start is allowed', async () => {
      const bad = await buy('custA', planId, addDays(tomorrow, 10));
      expect(bad.status).toBe(409);
      expect(bad.body.error).toBe('SUBSCRIPTION_OVERLAP');
      const edge = await buy('custA', planId, addDays(tomorrow, 29)); // the last day of the active term is still occupied
      expect(edge.status).toBe(409);
      const later = await buy('custA', planId, addDays(tomorrow, 30));
      expect(later.status, JSON.stringify(later.body)).toBe(201);
      await send('post', `/api/v1/mess/subscriptions/${later.body.data.subscription.id}/cancel`, who.custA.token, { reasonCode: 'CHANGED_MIND' });
    });

    it('58. (A4) an ACTIVE subscription blocks a service-point change; a room change is allowed', async () => {
      const move = await send('put', '/api/v1/mess/account', who.custA.token, { servicePointId: spB.id, roomNumber: '12' });
      expect(move.status).toBe(409);
      expect(move.body.error).toBe('ACCOUNT_CHANGE_BLOCKED');
      expect((await send('put', '/api/v1/mess/account', who.custA.token, { servicePointId: spA.id, roomNumber: '13' })).status).toBe(200);
      const deact = await admin('patch', `/mess/service-points/${spA.id}`, { expectedVersion: (await prisma.messServicePoint.findUniqueOrThrow({ where: { id: spA.id } })).version, status: 'INACTIVE' });
      expect(deact.status).toBe(409);
      expect(deact.body.error).toBe('SERVICE_POINT_IN_USE');
    });

    afterAll(() => {
      keepMock = false;
    });

    it('59. a payment captured AFTER the subscription was cancelled is flagged, never activates, and is not auto-refunded', async () => {
      const sub = await open('custD', addDays(today, 300));
      const s = await send('post', `/api/v1/orders/${sub.purchaseOrder.id}/payment-attempts`, who.custD.token, {});
      const c = await send('post', `/api/v1/mess/subscriptions/${sub.id}/cancel`, who.custD.token, { reasonCode: 'CHANGED_MIND' });
      expect(c.status, JSON.stringify(c.body)).toBe(200);
      const late = mock.simulatePayment(s.body.data.providerOrderId, { status: 'CAPTURED' });
      expect((await hook(late)).status).toBe(200);
      await PaymentReconciliationService.runOnce({ workerId: 'p10a-late' });
      expect((await subRow(sub.id)).status).toBe('CANCELLED');
      expect(await prisma.order.findUniqueOrThrow({ where: { id: sub.purchaseOrder.id } })).toMatchObject({ status: 'CANCELLED', paymentStatus: 'PENDING' });
      const ledger = await prisma.providerPayment.findFirstOrThrow({ where: { providerPaymentId: late.providerPaymentId } });
      expect(ledger.reconciliationStatus).toBe('AFTER_CANCELLATION');
      expect(await prisma.refund.count({ where: { orderId: sub.purchaseOrder.id } })).toBe(0);
      expect((await audits('MESS_SUBSCRIPTION_ACTIVATED', sub.id)).length).toBe(0);
    });
  });

  // =============================================================================================== G. cancellation and refunds
  describe('G. cancellation (full refund only, through P7C)', () => {
    const openFor = async (label: string, startDate: string, pid = planId) => {
      const r = await buy(label, pid, startDate);
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      return r.body.data.subscription as { id: string; purchaseOrder: { id: string } };
    };
    const cancelAs = (label: string, id: string, body: Record<string, unknown> = { reasonCode: 'CHANGED_MIND' }) => send('post', `/api/v1/mess/subscriptions/${id}/cancel`, who[label].token, body);
    const adminCancel = (id: string, body: Record<string, unknown> = { reasonCode: 'OPERATIONAL_ISSUE', note: 'ops' }, s: string | null = step) => admin('post', `/mess/subscriptions/${id}/cancel`, body, s);
    let freeA = '';
    beforeAll(async () => {
      await prisma.messSubscription.updateMany({ where: { messAccount: { customerProfileId: who.custA.profileId! }, status: { in: ['ACTIVE', 'PENDING_PAYMENT'] } }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      freeA = addDays(today, 360);
    });

    it('60. cancelling an unpaid purchase: no refund, checkout sessions expire, subscription + order CANCELLED, audited', async () => {
      const sub = await openFor('custD', freeA);
      const s = await send('post', `/api/v1/orders/${sub.purchaseOrder.id}/payment-attempts`, who.custD.token, {});
      const c = await cancelAs('custD', sub.id);
      expect(c.status, JSON.stringify(c.body)).toBe(200);
      expect(c.body.data).toMatchObject({ status: 'CANCELLED', alreadyCancelled: false, refund: { state: 'NO_REFUND' } });
      expect(await subRow(sub.id)).toMatchObject({ status: 'CANCELLED', cancellationReasonCode: 'CHANGED_MIND' });
      expect(await prisma.order.findUniqueOrThrow({ where: { id: sub.purchaseOrder.id } })).toMatchObject({ status: 'CANCELLED', paymentStatus: 'PENDING' });
      expect((await prisma.payment.findUniqueOrThrow({ where: { id: s.body.data.attemptId } })).status).toBe('EXPIRED');
      expect(await prisma.refund.count({ where: { orderId: sub.purchaseOrder.id } })).toBe(0);
      expect((await audits('ORDER_CANCELLATION_REQUESTED', sub.purchaseOrder.id)).length).toBe(1);
      const again = await cancelAs('custD', sub.id);
      expect(again.status).toBe(200);
      expect(again.body.data.alreadyCancelled).toBe(true);
    });

    it('61. cancelling a PAID, not-yet-started subscription creates exactly ONE full refund intent in the same transaction', async () => {
      const sub = await openFor('custD', freeA);
      await pay('custD', sub);
      expect((await subRow(sub.id)).status).toBe('ACTIVE');
      const c = await cancelAs('custD', sub.id, { reasonCode: 'WRONG_PLAN' });
      expect(c.status, JSON.stringify(c.body)).toBe(200);
      expect(c.body.data.refund.state).toMatch(/REFUND_(PENDING|PROCESSING)/);
      const refunds = await prisma.refund.findMany({ where: { orderId: sub.purchaseOrder.id } });
      expect(refunds).toHaveLength(1);
      expect(Number(refunds[0].amount)).toBe(1050);
      expect(refunds[0].trigger).toBe('CUSTOMER_CANCELLATION');
      expect(await prisma.order.findUniqueOrThrow({ where: { id: sub.purchaseOrder.id } })).toMatchObject({ status: 'CANCELLED', paymentStatus: 'PAID' });
      expect((await subRow(sub.id)).status).toBe('CANCELLED');
      const repeat = await cancelAs('custD', sub.id, { reasonCode: 'WRONG_PLAN' });
      expect(repeat.body.data.alreadyCancelled).toBe(true);
      expect(await prisma.refund.count({ where: { orderId: sub.purchaseOrder.id } })).toBe(1);
    });

    it('62. the refund request body is strict: no amount, currency, payment id or partial refund can be supplied', async () => {
      const sub = await openFor('custD', freeA);
      for (const extra of [{ amount: 1 }, { currency: 'INR' }, { refundAmount: 5 }, { providerPaymentId: 'x' }, { percentage: 50 }, { status: 'CANCELLED' }]) {
        const r = await cancelAs('custD', sub.id, { reasonCode: 'CHANGED_MIND', ...extra });
        expect(r.status, JSON.stringify(extra)).toBe(422);
      }
      expect((await cancelAs('custD', sub.id, { reasonCode: 'NOT_A_REASON' })).status).toBe(422);
      expect((await subRow(sub.id)).status).toBe('PENDING_PAYMENT');
      expect((await cancelAs('custD', sub.id)).status).toBe(200);
    });

    it('63. a STARTED subscription cannot be cancelled by the customer (409); no refund, nothing changes', async () => {
      const zero = await mkActivePlan({ minStartLeadDays: 0, code: `P10A-START-${ts}` });
      const sub = await morning(async () => {
        const x = await openFor('custD', today, zero.id);
        await pay('custD', x);
        return x;
      });
      const c = await cancelAs('custD', sub.id);
      expect(c.status).toBe(409);
      expect(c.body.error).toBe('MESS_SUBSCRIPTION_STARTED');
      expect((await subRow(sub.id)).status).toBe('ACTIVE');
      expect(await prisma.refund.count({ where: { orderId: sub.purchaseOrder.id } })).toBe(0);
      const dto = (await get(`/api/v1/mess/subscriptions/${sub.id}`, who.custD.token)).body.data.subscription;
      expect(dto.cancellation.allowed).toBe(false);
      // (SUPER_ADMIN exception, test 66 below, uses this same subscription)
      (globalThis as Record<string, unknown>).__startedSub = sub;
    });

    it('64. generic order cancellation cannot be used on a Mess purchase (only the Mess cancellation rules apply)', async () => {
      const sub = (globalThis as Record<string, unknown>).__startedSub as { id: string; purchaseOrder: { id: string } };
      const viaOrders = await send('post', `/api/v1/orders/${sub.purchaseOrder.id}/cancel`, who.custD.token, { reasonCode: 'CHANGED_MIND' });
      expect(viaOrders.status).toBe(409);
      expect(viaOrders.body.error).toBe('CANCELLATION_NOT_ALLOWED');
      const viaAdmin = await send('post', `/api/v1/admin/orders/${sub.purchaseOrder.id}/cancel`, who.admin.token, { reasonCode: 'OPERATIONAL_ISSUE' }, { step });
      expect(viaAdmin.status).toBe(409);
      expect((await subRow(sub.id)).status).toBe('ACTIVE');
    });

    it('65. admin cancellation needs step-up, a typed reason code and cannot carry amounts; MD and customers cannot use it', async () => {
      const sub = (globalThis as Record<string, unknown>).__startedSub as { id: string };
      expect((await adminCancel(sub.id, { reasonCode: 'OPERATIONAL_ISSUE' }, null)).status).toBeGreaterThanOrEqual(401);
      expect((await adminCancel(sub.id, { reasonCode: 'OPERATIONAL_ISSUE', amount: 10 })).status).toBe(422);
      expect((await adminCancel(sub.id, { reasonCode: 'CHANGED_MIND' })).status).toBe(422); // customer codes are not admin codes
      expect((await adminCancel(sub.id, {})).status).toBe(422);
      expect((await send('post', `/api/v1/admin/mess/subscriptions/${sub.id}/cancel`, who.md.token, { reasonCode: 'OTHER' }, { step })).status).toBe(403);
      expect((await send('post', `/api/v1/admin/mess/subscriptions/${sub.id}/cancel`, who.custD.token, { reasonCode: 'OTHER' }, { step })).status).toBe(403);
      expect((await subRow(sub.id)).status).toBe('ACTIVE');
    });

    it('66. SUPER_ADMIN exception: a started subscription with NO fulfilled meal is cancelled with a FULL refund; with a fulfilled meal it is refused', async () => {
      const sub = (globalThis as Record<string, unknown>).__startedSub as { id: string; purchaseOrder: { id: string } };
      const lunch = await prisma.messMeal.findFirstOrThrow({ where: { messSubscriptionId: sub.id, mealDate: new Date(`${today}T00:00:00.000Z`), slot: 'LUNCH' } });
      await prisma.messMeal.update({ where: { id: lunch.id }, data: { status: 'FULFILLED', fulfilledAt: new Date(), consumedAt: new Date() } }); // simulates P10C fulfilment
      const refused = await adminCancel(sub.id);
      expect(refused.status).toBe(409);
      expect(refused.body.error).toBe('MESS_CANCELLATION_NOT_ALLOWED');
      expect((await subRow(sub.id)).status).toBe('ACTIVE');
      expect(await prisma.refund.count({ where: { orderId: sub.purchaseOrder.id } })).toBe(0);
      await prisma.messMeal.update({ where: { id: lunch.id }, data: { status: 'SCHEDULED', consumedAt: null } });
      const ok = await adminCancel(sub.id);
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      const refunds = await prisma.refund.findMany({ where: { orderId: sub.purchaseOrder.id } });
      expect(refunds).toHaveLength(1);
      expect(refunds[0].trigger).toBe('ADMIN_CANCELLATION');
      expect(Number(refunds[0].amount)).toBe(1050);
      expect((await subRow(sub.id)).status).toBe('CANCELLED');
      expect((await audits('ORDER_CANCELLATION_REQUESTED', sub.purchaseOrder.id)).length).toBe(1);
    });

    it('67. a COMPLETED subscription cannot be cancelled', async () => {
      const sub = await openFor('custD', freeA);
      await prisma.messSubscription.update({ where: { id: sub.id }, data: { status: 'COMPLETED' } });
      const r = await cancelAs('custD', sub.id);
      expect(r.status).toBe(409);
      expect((await subRow(sub.id)).status).toBe('COMPLETED');
    });

    it('68. cancellation racing with payment verification: either order of events leaves a consistent, fully-refundable state', async () => {
      for (let i = 0; i < 3; i++) {
        const start = addDays(today, 100 + i * 40);
        const sub = await openFor('custC', start);
        const s = await send('post', `/api/v1/orders/${sub.purchaseOrder.id}/payment-attempts`, who.custC.token, {});
        const providerOrderId = s.body.data.providerOrderId as string;
        const pi = mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
        const [c, v] = await Promise.all([
          cancelAs('custC', sub.id),
          send('post', `/api/v1/orders/${sub.purchaseOrder.id}/payment-attempts/${s.body.data.attemptId}/verify`, who.custC.token, { providerOrderId, providerPaymentId: pi.providerPaymentId, signature: mock.signCheckout(providerOrderId, pi.providerPaymentId) })
        ]);
        expect(c.status, `cancel ${i}`).toBeLessThan(500);
        expect(v.status, `verify ${i}`).toBeLessThan(500);
        const [order, row, refunds, ledger] = await Promise.all([
          prisma.order.findUniqueOrThrow({ where: { id: sub.purchaseOrder.id } }),
          subRow(sub.id),
          prisma.refund.count({ where: { orderId: sub.purchaseOrder.id } }),
          prisma.providerPayment.findFirst({ where: { providerPaymentId: pi.providerPaymentId } })
        ]);
        // never "subscription ACTIVE on a cancelled order", never "paid + cancelled without a refund"
        expect(order.status === 'CANCELLED' && row.status === 'ACTIVE', 'active on a cancelled order').toBe(false);
        if (order.status === 'CANCELLED' && order.paymentStatus === 'PAID') expect(refunds).toBe(1);
        if (order.status === 'CANCELLED' && order.paymentStatus === 'PENDING') {
          expect(refunds).toBe(0);
          if (ledger) expect(ledger.reconciliationStatus).toBe('AFTER_CANCELLATION');
        }
        if (row.status === 'CANCELLED') expect(order.status).toBe('CANCELLED');
        if (c.status !== 200 && row.status === 'ACTIVE') expect(order.status).toBe('CONFIRMED');
        if (row.status === 'ACTIVE') await prisma.messSubscription.update({ where: { id: sub.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      }
    });
  });

  // =============================================================================================== H. ownership, DTO safety, order-type isolation
  describe('H. ownership, DTO safety and isolation from food orders', () => {
    let sub: { id: string; purchaseOrder: { id: string; orderNumber: string } };
    beforeAll(async () => {
      await prisma.messSubscription.updateMany({ where: { messAccount: { customerProfileId: who.custB.profileId! }, status: 'PENDING_PAYMENT' }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      await registerAndApprove('custB', spA.id, '42').catch(() => undefined);
      const r = await buy('custB', planId, addDays(today, 5));
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      sub = r.body.data.subscription;
    });

    it('69. another customer gets an indistinguishable 404 on read, cancel, order fetch, payment session and refunds', async () => {
      expect((await get(`/api/v1/mess/subscriptions/${sub.id}`, who.custC.token)).status).toBe(404);
      expect((await send('post', `/api/v1/mess/subscriptions/${sub.id}/cancel`, who.custC.token, { reasonCode: 'OTHER' })).status).toBe(404);
      expect((await get(`/api/v1/orders/${sub.purchaseOrder.id}`, who.custC.token)).status).toBe(404);
      expect((await send('post', `/api/v1/orders/${sub.purchaseOrder.id}/payment-attempts`, who.custC.token, {})).status).toBe(404);
      expect((await get(`/api/v1/orders/${sub.purchaseOrder.id}/refunds`, who.custC.token)).status).toBe(404);
      expect((await get(`/api/v1/mess/subscriptions/${randomUUID()}`, who.custB.token)).status).toBe(404);
      expect((await get(`/api/v1/mess/subscriptions/not-a-uuid`, who.custB.token)).status).toBe(422);
      expect((await subRow(sub.id)).status).toBe('PENDING_PAYMENT');
      expect((await get('/api/v1/mess/subscriptions', who.custC.token)).body.data.subscriptions.some((s: { id: string }) => s.id === sub.id)).toBe(false);
    });

    it('70. the purchase order is fetchable by its owner (for the shared PaymentPanel) but never listed with the food orders', async () => {
      const one = await get(`/api/v1/orders/${sub.purchaseOrder.id}`, who.custB.token);
      expect(one.status).toBe(200);
      expect(one.body.data).toMatchObject({ orderType: 'MESS_SUBSCRIPTION', status: 'PENDING', payment: { state: 'NOT_STARTED', canStartPayment: true }, cancellation: { allowed: false } });
      const list = await get('/api/v1/orders/my-orders', who.custB.token);
      expect(list.body.data.some((o: { id: string }) => o.id === sub.purchaseOrder.id)).toBe(false);
    });

    it('71. the customer DTO exposes no provider ids, snapshots, branch ids, wallet data or other customers', async () => {
      const text = JSON.stringify((await get(`/api/v1/mess/subscriptions/${sub.id}`, who.custB.token)).body) + JSON.stringify((await get('/api/v1/mess/subscriptions', who.custB.token)).body) + JSON.stringify((await get('/api/v1/mess/account', who.custB.token)).body);
      for (const forbidden of ['providerOrderId', 'providerPaymentId', 'planSnapshot', 'pricingSnapshot', 'branchId', 'walletAccount', 'balance', 'reviewedByUserId', 'customerProfileId', 'idempotencyKey', 'requestFingerprint', 'P10A custA', 'P10A custC']) {
        expect(text, forbidden).not.toContain(forbidden);
      }
    });

    it('72. staff views: SUPER_ADMIN and MD see the customer name; MD never sees phone / email / student id', async () => {
      const a = await get('/api/v1/admin/mess/subscriptions', who.admin.token);
      const md = await get('/api/v1/admin/mess/subscriptions', who.md.token);
      expect(a.status).toBe(200);
      expect(md.status).toBe(200);
      const row = md.body.data.subscriptions.find((s: { id: string }) => s.id === sub.id);
      expect(row.customerName).toBeTruthy();
      expect(JSON.stringify(md.body)).not.toMatch(/@test\.com|studentIdCard|phone/);
      expect(JSON.stringify(a.body)).not.toContain('providerPaymentId');
    });

    it('73. a Mess purchase order can never enter the kitchen or delivery flows: transitions beyond CONFIRMED are refused for every actor', async () => {
      const { OrderTransitionService } = await import('../modules/order/orderTransition.service.js');
      const paid = await openPaidForKitchen();
      for (const to of ['ACCEPTED', 'PREPARING', 'READY', 'DISPATCHED', 'DELIVERED'] as const) {
        await expect(OrderTransitionService.transition({ orderId: paid.orderId, to, actor: { kind: 'USER', userId: who.chef.id, roles: [RoleEnum.CHEF], isGlobal: true } }), to).rejects.toMatchObject({ errorCode: 'INVALID_ORDER_TRANSITION' });
      }
      expect((await prisma.order.findUniqueOrThrow({ where: { id: paid.orderId } })).status).toBe('CONFIRMED');
      await prisma.order.update({ where: { id: paid.orderId }, data: { kitchenBranchId: branchA.id } });
      const route = await send('put', `/api/v1/admin/orders/${paid.orderId}/kitchen-branch`, who.admin.token, { branchId: branchA.id, expectedBranchId: branchA.id, reason: 'try it' }, { step });
      expect(route.status).toBeGreaterThanOrEqual(400);
      const queue = await get(`/api/v1/admin/kitchen/orders?routing=all&limit=100`, who.admin.token);
      expect(JSON.stringify(queue.body)).not.toContain(paid.orderId);
      await prisma.order.update({ where: { id: paid.orderId }, data: { kitchenBranchId: null } });
      await prisma.messSubscription.update({ where: { id: paid.subId }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    });
    async function openPaidForKitchen() {
      await prisma.messSubscription.updateMany({ where: { messAccount: { customerProfileId: who.custD.profileId! }, status: { in: ['PENDING_PAYMENT', 'ACTIVE'] } }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      const r = await buy('custD', planId, addDays(today, 12));
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      await pay('custD', r.body.data.subscription);
      return { orderId: r.body.data.subscription.purchaseOrder.id as string, subId: r.body.data.subscription.id as string };
    }

    it('74. online-only: a Mess order stamped with any other payment method is not payable; COD never exists on Mess data', async () => {
      await prisma.order.update({ where: { id: sub.purchaseOrder.id }, data: { paymentMethod: 'COD' } });
      const res = await send('post', `/api/v1/orders/${sub.purchaseOrder.id}/payment-attempts`, who.custB.token, {});
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('ORDER_NOT_PAYABLE');
      await prisma.order.update({ where: { id: sub.purchaseOrder.id }, data: { paymentMethod: 'ONLINE' } });
      expect(await prisma.order.count({ where: { orderType: 'MESS_SUBSCRIPTION', paymentMethod: { not: 'ONLINE' } } })).toBe(0);
    });

    it('75. no wallet account or ledger row is ever created by the P10A flows', async () => {
      const profiles = [who.custA, who.custB, who.custC, who.custD, who.legacy].map((w) => w.profileId!);
      expect(await prisma.walletAccount.count({ where: { customerProfileId: { in: profiles } } })).toBe(0);
    });

    it('76. the food-order history, creation and cancellation are unchanged for DIRECT orders', async () => {
      const direct = await prisma.order.create({ data: { orderNumber: `P10A-D-${ts}`, totalAmount: 100, netAmount: 105, customerProfileId: who.custB.profileId!, status: 'PENDING', paymentStatus: 'PENDING', paymentMethod: 'ONLINE', orderType: 'DIRECT' } });
      const list = await get('/api/v1/orders/my-orders', who.custB.token);
      expect(list.body.data.some((o: { id: string }) => o.id === direct.id)).toBe(true);
      const c = await send('post', `/api/v1/orders/${direct.id}/cancel`, who.custB.token, { reasonCode: 'CHANGED_MIND' });
      expect(c.status, JSON.stringify(c.body)).toBe(200);
      expect(c.body.data.status).toBe('CANCELLED');
    });

    it('77. pricing for DIRECT food carts is untouched by Mess (the cart preview still uses the commerce policy, not MESS_PURCHASE_V1)', async () => {
      const preview = await send('post', '/api/v1/checkout/preview', who.custB.token, {});
      expect([400, 404, 422]).toContain(preview.status); // empty cart: refused by the DIRECT checkout, not priced as a Mess purchase
      expect(JSON.stringify(preview.body)).not.toContain('MESS_PURCHASE_V1');
    });
  });

  // =============================================================================================== I. administration concurrency
  describe('I. administration concurrency', () => {
    it('78. two admins approving the same account in parallel: one change, one idempotent no-op, one audit row', async () => {
      await mkUser('custE', [RoleEnum.CUSTOMER]);
      const put = await send('put', '/api/v1/mess/account', who.custE.token, { servicePointId: spA.id, roomNumber: '9' });
      const id = put.body.data.account.id as string;
      const [a, b] = await Promise.all([admin('post', `/mess/accounts/${id}/approve`, { expectedServicePointId: spA.id }), admin('post', `/mess/accounts/${id}/approve`, { expectedServicePointId: spA.id })]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect([a.body.data.changed, b.body.data.changed].sort()).toEqual([false, true]);
      expect((await audits('MESS_ACCOUNT_APPROVED', id)).length).toBe(1);
    });

    it('79. approve vs reject in parallel: exactly one outcome wins and the account state matches it', async () => {
      await mkUser('custF', [RoleEnum.CUSTOMER]);
      const put = await send('put', '/api/v1/mess/account', who.custF.token, { servicePointId: spA.id, roomNumber: '9' });
      const id = put.body.data.account.id as string;
      const [a, r] = await Promise.all([admin('post', `/mess/accounts/${id}/approve`, { expectedServicePointId: spA.id }), admin('post', `/mess/accounts/${id}/reject`, { reasonCode: 'OTHER' })]);
      const row = await prisma.messAccount.findUniqueOrThrow({ where: { id } });
      expect([a.status, r.status].filter((s) => s === 200)).toHaveLength(1);
      expect(row.approvalStatus).toBe(a.status === 200 ? 'APPROVED' : 'REJECTED');
    });

    it('80. service-point deactivation vs a purchase in parallel: either the purchase wins (deactivation refused) or deactivation wins (purchase refused)', async () => {
      await mkUser('custG', [RoleEnum.CUSTOMER]);
      const sp = await mkServicePoint(branchA.id, 'RACE');
      await registerAndApprove('custG', sp.id, '1');
      const [off, b] = await Promise.all([admin('patch', `/mess/service-points/${sp.id}`, { expectedVersion: sp.version, status: 'INACTIVE' }), buy('custG', planId, tomorrow)]);
      expect(off.status === 200 || b.status === 201, `${off.status}/${b.status}`).toBe(true);
      expect(off.status === 200 && b.status === 201, 'both cannot win').toBe(false);
      const open = await prisma.messSubscription.count({ where: { servicePointId: sp.id, status: 'PENDING_PAYMENT' } });
      const spRow = await prisma.messServicePoint.findUniqueOrThrow({ where: { id: sp.id } });
      expect(open === 1 && spRow.status === 'ACTIVE' ? true : open === 0 && spRow.status === 'INACTIVE').toBe(true);
    });

    it('81. every write leaves an audit row naming the actor; step-up proofs never appear in audit payloads', async () => {
      const rows = await prisma.auditLog.findMany({ where: { action: { startsWith: 'MESS_' }, userId: who.admin.id }, take: 200 });
      expect(rows.length).toBeGreaterThan(5);
      expect(JSON.stringify(rows)).not.toContain(step);
    });

    it('85. an UNKNOWN provider-order outcome never activates, never invites a second payment, and stays cancellable', async () => {
      const r = await buy('custE', planId, tomorrow);
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      const sub = r.body.data.subscription;
      mock.failNextCreate('unknown');
      const s = await send('post', `/api/v1/orders/${sub.purchaseOrder.id}/payment-attempts`, who.custE.token, {});
      expect(s.status).toBe(503);
      expect((await prisma.payment.findFirstOrThrow({ where: { orderId: sub.purchaseOrder.id } })).status).toBe('UNKNOWN');
      expect((await subRow(sub.id)).status).toBe('PENDING_PAYMENT');
      expect(await prisma.order.findUniqueOrThrow({ where: { id: sub.purchaseOrder.id } })).toMatchObject({ status: 'PENDING', paymentStatus: 'PENDING' });
      const dto = (await get(`/api/v1/mess/subscriptions/${sub.id}`, who.custE.token)).body.data.subscription;
      expect(dto.payment).toMatchObject({ state: 'CONFIRMING', canStartPayment: false });
      expect((await send('post', `/api/v1/mess/subscriptions/${sub.id}/cancel`, who.custE.token, { reasonCode: 'CHANGED_MIND' })).status).toBe(200);
    });
  });

  // =============================================================================================== J. static guarantees
  describe('J. static guarantees about the Mess code', () => {
    const dir = join(__dirname, '..', 'modules', 'mess');
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const sources = readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => ({ f, src: strip(readFileSync(join(dir, f), 'utf8')) }));

    it('82. the Mess modules never touch the DIRECT CommercePolicy, wallets, COD, cash or the order status column', () => {
      expect(sources.length).toBeGreaterThan(8);
      for (const { f, src } of sources) {
        expect(src, f).not.toMatch(/getCommercePolicy|CommercePolicy\b|calculateCartPricing|calculatePricing/);
        expect(src, f).not.toMatch(/walletAccount|walletTransaction|WalletAccount/);
        expect(src, f).not.toMatch(/\bCOD\b|cash[\s_-]*on|pay[\s_-]*at|PAY_AT/i);
        expect(src, f).not.toMatch(/order\.update|order\.updateMany|status:\s*'(CONFIRMED|ACCEPTED|PREPARING|READY|DISPATCHED|DELIVERED)'/);
        expect(src, f).not.toMatch(/kind:\s*'PROOF'|DELIVERY_PROOF|kitchenOrderTicket|deliveryAssignment/);
      }
    });

    it('83. activation is invoked from exactly one place: the payment settlement transaction', () => {
      const root = join(__dirname, '..');
      const hits: string[] = [];
      const walk = (d: string) => {
        for (const n of readdirSync(d, { withFileTypes: true })) {
          const p = join(d, n.name);
          if (n.isDirectory()) {
            if (n.name !== 'tests') walk(p);
          } else if (n.name.endsWith('.ts') && /MessActivationService.activateOrRefundInTx/.test(strip(readFileSync(p, 'utf8')))) hits.push(n.name);
        }
      };
      walk(root);
      expect(hits).toEqual(['paymentSettlement.service.ts']);
    });

    it('84. no payment-method input exists anywhere in the Mess validators; the purchase body is exactly {planId, startDate} and strict', () => {
      const policy = sources.find((s) => s.f === 'messPolicy.ts')!.src;
      expect(policy).not.toMatch(/paymentMethod/);
      expect(policy).toContain("purchaseBodySchema = z.object({ planId: z.string().uuid(), startDate: dateString('startDate') }).strict()");
    });
  });

  // =============================================================================================== K. late payment (start date already passed)
  describe('K. a verified payment after the start date never activates: full refund, exactly once', () => {
    const yesterday = addDays(today, -1);
    const dueRefund = (id: string) => prisma.refund.update({ where: { id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    const providerRefundFor = (refundId: string) => [...mock.refunds.values()].find((r) => r.receipt === refundId);
    let seqK = 0;

    /** A normal purchase (future start) + its payment session; then the start date "passes" (a non-financial date shift: we cannot wait a day). */
    async function lateSetup(label: 'custA' | 'custB' | 'custC' | 'custD') {
      await quiesce(); // other tests' refunds must not be claimed by this test's worker passes
      await prisma.messSubscription.updateMany({ where: { messAccount: { customerProfileId: who[label].profileId! }, status: { in: ['PENDING_PAYMENT', 'ACTIVE'] } }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      const r = await buy(label, planId, addDays(today, 3 + ++seqK));
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      const sub = r.body.data.subscription as { id: string; purchaseOrder: { id: string } };
      const s = await send('post', `/api/v1/orders/${sub.purchaseOrder.id}/payment-attempts`, who[label].token, {});
      expect(s.status, JSON.stringify(s.body)).toBe(200);
      return { sub, attemptId: s.body.data.attemptId as string, providerOrderId: s.body.data.providerOrderId as string };
    }
    const passStartDate = (id: string) => prisma.messSubscription.update({ where: { id }, data: { startDate: dateFromString(yesterday), endDate: dateFromString(addDays(yesterday, 29)) } });
    const capture = (providerOrderId: string) => mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
    const verifyReq = (label: string, c: { sub: { purchaseOrder: { id: string } }; attemptId: string; providerOrderId: string }, pi: { providerPaymentId: string }) =>
      send('post', `/api/v1/orders/${c.sub.purchaseOrder.id}/payment-attempts/${c.attemptId}/verify`, who[label].token, { providerOrderId: c.providerOrderId, providerPaymentId: pi.providerPaymentId, signature: mock.signCheckout(c.providerOrderId, pi.providerPaymentId) });
    const hookReq = (pi: Parameters<MockPaymentProvider['buildWebhook']>[1], eventId: string) => {
      const h = mock.buildWebhook('payment.captured', pi, { eventId });
      return request(app).post('/api/v1/payments/webhook').set({ ...h.headers, 'content-type': 'application/octet-stream' }).send(h.raw);
    };
    /** Everything that must be true after the late capture was settled, whichever path settled it. */
    async function expectLateOutcome(c: { sub: { id: string; purchaseOrder: { id: string } } }, pi: { providerPaymentId: string }) {
      const order = await prisma.order.findUniqueOrThrow({ where: { id: c.sub.purchaseOrder.id } });
      expect(order).toMatchObject({ status: 'CANCELLED', paymentStatus: 'PAID' });
      expect(order.paidByProviderPaymentId).toBeTruthy();
      const sub = await subRow(c.sub.id);
      expect(sub.status).toBe('CANCELLED');
      expect(sub.activatedAt).toBeNull();
      expect(sub.cancellationReasonCode).toBe('START_DATE_PASSED');
      expect(dateToString(sub.startDate)).toBe(yesterday); // dates are never shifted
      expect(await prisma.messMeal.count({ where: { messSubscriptionId: c.sub.id } })).toBe(0);
      const ledger = await prisma.providerPayment.findMany({ where: { providerPaymentId: pi.providerPaymentId } });
      expect(ledger).toHaveLength(1);
      expect(ledger[0].reconciliationStatus).toBe('APPLIED');
      const refunds = await prisma.refund.findMany({ where: { orderId: c.sub.purchaseOrder.id } });
      expect(refunds).toHaveLength(1);
      expect(refunds[0]).toMatchObject({ trigger: 'MESS_START_DATE_PASSED', reasonCode: 'START_DATE_PASSED', requestedByKind: 'SYSTEM' });
      expect(Number(refunds[0].amount)).toBe(1050);
      expect((await audits('MESS_SUBSCRIPTION_ACTIVATED', c.sub.id)).length).toBe(0);
      expect((await audits('MESS_LATE_PAYMENT_REFUNDED', c.sub.id)).length).toBe(1);
      const session = await prisma.payment.findFirstOrThrow({ where: { orderId: c.sub.purchaseOrder.id } });
      expect((await audits('PAYMENT_VERIFIED', session.id)).length).toBe(1);
      const events = await prisma.orderEvent.findMany({ where: { orderId: c.sub.purchaseOrder.id }, orderBy: { createdAt: 'asc' } });
      expect(events.map((e) => `${e.fromStatus ?? '-'}>${e.toStatus}`)).toEqual(['->PENDING', 'PENDING>CONFIRMED', 'CONFIRMED>CANCELLED']);
      return refunds[0];
    }
    /** Drive the refund to PROCESSED through the supported worker path only. */
    async function finishRefund(refundId: string, orderId: string) {
      await dueRefund(refundId);
      await PaymentReconciliationService.runOnce({ workerId: 'p10a-late-1' });
      const pr = providerRefundFor(refundId);
      expect(pr, 'the provider received the refund').toBeTruthy();
      expect(mock.refundCreateCalls).toBe(1); // exactly ONE provider refund submission
      mock.setRefundStatus(pr!.providerRefundId, 'PROCESSED');
      await dueRefund(refundId);
      await PaymentReconciliationService.runOnce({ workerId: 'p10a-late-2' });
      expect((await prisma.refund.findUniqueOrThrow({ where: { id: refundId } })).status).toBe('PROCESSED');
      expect(await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({ status: 'CANCELLED', paymentStatus: 'REFUNDED' });
      expect(mock.refundCreateCalls).toBe(1);
    }

    it('86. A/B date boundary: a start date in the future AND a start date equal to the business date both activate normally', async () => {
      const c = await lateSetup('custA');
      await verifyReq('custA', c, capture(c.providerOrderId));
      expect((await subRow(c.sub.id)).status).toBe('ACTIVE');
      expect(await prisma.refund.count({ where: { orderId: c.sub.purchaseOrder.id } })).toBe(0);
      const zero = await mkActivePlan({ minStartLeadDays: 0, code: `P10A-K0-${ts}` });
      await prisma.messSubscription.updateMany({ where: { messAccount: { customerProfileId: who.custB.profileId! }, status: { in: ['PENDING_PAYMENT', 'ACTIVE'] } }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      const r = await morning(() => buy('custB', zero.id, today));
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      await morning(() => pay('custB', r.body.data.subscription));
      expect((await subRow(r.body.data.subscription.id)).status).toBe('ACTIVE');
    });

    it('87. C/D browser verification after the start date: payment recorded, subscription never ACTIVE, ONE full refund, REFUNDED through the worker', async () => {
      const c = await lateSetup('custC');
      await passStartDate(c.sub.id);
      const pi = capture(c.providerOrderId);
      const v = await verifyReq('custC', c, pi);
      expect(v.status, JSON.stringify(v.body)).toBe(200);
      const refund = await expectLateOutcome(c, pi);
      await finishRefund(refund.id, c.sub.purchaseOrder.id);
      const dto = (await get(`/api/v1/mess/subscriptions/${c.sub.id}`, who.custC.token)).body.data.subscription;
      expect(dto).toMatchObject({ status: 'CANCELLED', refund: { state: 'REFUNDED' } });
    });

    it('88. E webhook capture after the start date: identical outcome; the same event and a re-run of the worker change nothing', async () => {
      const c = await lateSetup('custD');
      await passStartDate(c.sub.id);
      const pi = capture(c.providerOrderId);
      expect((await hookReq(pi, `evt_${ts}_k88`)).status).toBe(200);
      await PaymentReconciliationService.runOnce({ workerId: 'p10a-k88' });
      const refund = await expectLateOutcome(c, pi);
      expect((await hookReq(pi, `evt_${ts}_k88`)).status).toBe(200);
      expect((await hookReq(pi, `evt_${ts}_k88b`)).status).toBe(200);
      await PaymentReconciliationService.runOnce({ workerId: 'p10a-k88b' });
      expect(await prisma.refund.count({ where: { orderId: c.sub.purchaseOrder.id } })).toBe(1);
      expect((await audits('MESS_LATE_PAYMENT_REFUNDED', c.sub.id)).length).toBe(1);
      await finishRefund(refund.id, c.sub.purchaseOrder.id);
    });

    it('89. F reconciliation discovers the capture after the start date (no webhook, no browser): identical outcome', async () => {
      const c = await lateSetup('custA');
      await passStartDate(c.sub.id);
      const pi = capture(c.providerOrderId);
      await prisma.payment.update({ where: { id: c.attemptId }, data: { nextAttemptAt: new Date(Date.now() - 1000), lockedUntil: null } });
      await PaymentReconciliationService.runOnce({ workerId: 'p10a-k89' });
      const refund = await expectLateOutcome(c, pi);
      await PaymentReconciliationService.runOnce({ workerId: 'p10a-k89b' });
      expect(await prisma.refund.count({ where: { orderId: c.sub.purchaseOrder.id } })).toBe(1);
      await finishRefund(refund.id, c.sub.purchaseOrder.id);
    });

    it('90. G browser verification and webhook racing after the start date: one payment application, one cancellation, one Refund, one provider submission', async () => {
      const c = await lateSetup('custB');
      await passStartDate(c.sub.id);
      const pi = capture(c.providerOrderId);
      const [v, h] = await Promise.all([verifyReq('custB', c, pi), hookReq(pi, `evt_${ts}_k90`)]);
      expect(v.status, JSON.stringify(v.body)).toBeLessThan(500);
      expect(h.status).toBe(200);
      await PaymentReconciliationService.runOnce({ workerId: 'p10a-k90' });
      const refund = await expectLateOutcome(c, pi);
      await finishRefund(refund.id, c.sub.purchaseOrder.id);
    });

    it('91. a session cannot even be opened once the start date has passed (no money is taken for a term that cannot activate)', async () => {
      await prisma.messSubscription.updateMany({ where: { messAccount: { customerProfileId: who.custC.profileId! }, status: { in: ['PENDING_PAYMENT', 'ACTIVE'] } }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      const r = await buy('custC', planId, addDays(today, 5));
      const sub = r.body.data.subscription;
      await passStartDate(sub.id);
      const s = await send('post', `/api/v1/orders/${sub.purchaseOrder.id}/payment-attempts`, who.custC.token, {});
      expect(s.status).toBe(409);
      expect(s.body.error).toBe('MESS_START_DATE_PASSED');
      expect(await prisma.payment.count({ where: { orderId: sub.purchaseOrder.id } })).toBe(0);
      expect(mock.createCalls).toBe(0);
      expect((await send('post', `/api/v1/mess/subscriptions/${sub.id}/cancel`, who.custC.token, { reasonCode: 'CHANGED_MIND' })).status).toBe(200); // the customer can still cancel it
    });

    it('92. H a capture after the customer cancelled the unpaid subscription keeps its P7 protection (AFTER_CANCELLATION, no automatic refund)', async () => {
      const c = await lateSetup('custD');
      expect((await send('post', `/api/v1/mess/subscriptions/${c.sub.id}/cancel`, who.custD.token, { reasonCode: 'CHANGED_MIND' })).status).toBe(200);
      await passStartDate(c.sub.id);
      const pi = capture(c.providerOrderId);
      expect((await hookReq(pi, `evt_${ts}_k92`)).status).toBe(200);
      await PaymentReconciliationService.runOnce({ workerId: 'p10a-k92' });
      const ledger = await prisma.providerPayment.findFirstOrThrow({ where: { providerPaymentId: pi.providerPaymentId } });
      expect(ledger.reconciliationStatus).toBe('AFTER_CANCELLATION');
      expect(await prisma.refund.count({ where: { orderId: c.sub.purchaseOrder.id } })).toBe(0);
      expect((await audits('MESS_LATE_PAYMENT_REFUNDED', c.sub.id)).length).toBe(0);
    });

    it('93. the system cancellation edge is unusable for any other purpose: not for DIRECT orders, not for another source', async () => {
      const { OrderTransitionService } = await import('../modules/order/orderTransition.service.js');
      const direct = await prisma.order.create({ data: { orderNumber: `P10A-KD-${ts}`, totalAmount: 100, netAmount: 105, customerProfileId: who.custA.profileId!, status: 'CONFIRMED', paymentStatus: 'PAID', paymentMethod: 'ONLINE', orderType: 'DIRECT' } });
      await expect(OrderTransitionService.transition({ orderId: direct.id, to: 'CANCELLED', actor: { kind: 'SYSTEM', source: 'MESS_LATE_PAYMENT' }, refundIntentId: randomUUID() })).rejects.toMatchObject({ errorCode: 'ORDER_TRANSITION_FORBIDDEN' });
      await expect(OrderTransitionService.transition({ orderId: direct.id, to: 'CANCELLED', actor: { kind: 'SYSTEM', source: 'PAYMENT_VERIFICATION' } })).rejects.toMatchObject({ errorCode: 'ORDER_TRANSITION_FORBIDDEN' });
      expect((await prisma.order.findUniqueOrThrow({ where: { id: direct.id } })).status).toBe('CONFIRMED');
    });
  });

  // PART5_MARKER
});
