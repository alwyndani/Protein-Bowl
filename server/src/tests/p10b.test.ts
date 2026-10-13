import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import app from '../app.js';
import { Prisma, PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getPaymentProvider } from '../modules/payment/providerRegistry.js';
import { MockPaymentProvider } from '../modules/payment/mock.provider.js';
import { PaymentReconciliationService } from '../modules/payment/paymentReconciliation.service.js';
import { addDays, businessDate, dateFromString, dateToString, lockRow } from '../modules/mess/messPolicy.js';
import { MessMealService, pauseDeadline, serviceInstant, withinPauseWindow } from '../modules/mess/messMeal.service.js';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const mock = getPaymentProvider() as MockPaymentProvider;
const PASSWORD = 'P10b#Admin-Pass-2026-xyz';
const sign = (userId: string, email: string, roles: RoleEnum[]) => jwt.sign({ userId, email, roles }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('P10B - Kerala Mess meals: generation, calendar, pause/resume, kitchen demand and batches', () => {
  const ts = Date.now();
  let seq = 0;
  type Who = { id: string; email: string; profileId?: string; token: string };
  const who: Record<string, Who> = {};
  let step = '';
  let branchA: { id: string };
  let branchB: { id: string };
  let spA1: { id: string };
  let spA2: { id: string };
  let spB: { id: string };
  let plan: { id: string };
  const today = businessDate();
  const key = () => `p10b-${ts}-${++seq}-${randomUUID().slice(0, 8)}`;
  const DAYS = 4;
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

  async function mkUser(label: string, roles: RoleEnum[], branches: string[] = []): Promise<Who> {
    const email = `p10b_${label}_${ts}@test.com`;
    const customer = roles.includes(RoleEnum.CUSTOMER) || roles.includes(RoleEnum.MESS_CUSTOMER);
    const staff = !customer && roles.some((r) => r !== RoleEnum.SUPER_ADMIN);
    const u = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(PASSWORD, 4),
        roles: { create: roles.map((role) => ({ role })) },
        ...(customer ? { customerProfile: { create: { fullName: `P10B ${label}`, referralCode: `PB-10B${label.toUpperCase()}${ts}` } } } : {}),
        ...(staff ? { employeeProfile: { create: { employeeCode: `P10B-${label}-${ts}`, fullName: label, designation: 'Test', assignedBranchId: branches[0] ?? null } } } : {})
      },
      include: { customerProfile: true, employeeProfile: true }
    });
    if (u.employeeProfile) for (const b of branches) await prisma.employeeBranchAssignment.create({ data: { employeeProfileId: u.employeeProfile.id, branchId: b } });
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
  const admin = (method: 'post' | 'put' | 'patch', path: string, body: unknown = {}) => send(method, `/api/v1/admin${path}`, who.admin.token, body, { step });

  async function mkPlan(over: Record<string, unknown> = {}) {
    const c = await admin('post', '/mess/plans', {
      code: `P10B-${ts}-${++seq}`, name: 'P10B Plan', durationDays: DAYS, basePrice: '400.00', taxRate: '0.0500', mealSlots: ['BREAKFAST', 'LUNCH'], pauseCutoffHours: 2, maxPauses: 2, minStartLeadDays: 0,
      slotTimes: { BREAKFAST: '08:00', LUNCH: '13:00' }, ...over
    });
    expect(c.status, JSON.stringify(c.body)).toBe(201);
    const a = await admin('post', `/mess/plans/${c.body.data.plan.id}/activate`, { expectedVersion: c.body.data.plan.version });
    expect(a.status, JSON.stringify(a.body)).toBe(200);
    return a.body.data.plan as { id: string; version: number };
  }
  async function approve(label: string, spId: string) {
    const put = await send('put', '/api/v1/mess/account', who[label].token, { servicePointId: spId, roomNumber: `${++seq}` });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    expect((await admin('post', `/mess/accounts/${put.body.data.account.id}/approve`, { expectedServicePointId: spId })).status).toBe(200);
  }
  async function reset(label: string) {
    await prisma.messSubscription.updateMany({ where: { messAccount: { customerProfileId: who[label].profileId! }, status: { in: ['PENDING_PAYMENT', 'ACTIVE'] } }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
  }
  /** Buys + pays a subscription starting `startOffset` days from today (default: today). Returns it with its meals. */
  async function activeSub(label: string, startOffset = 0, planId = plan.id) {
    return await (startOffset === 0 ? morning(() => activeSubAt(label, startOffset, planId)) : activeSubAt(label, startOffset, planId));
  }
  async function activeSubAt(label: string, startOffset: number, planId: string) {
    await reset(label);
    const b = await send('post', '/api/v1/mess/subscriptions', who[label].token, { planId, startDate: addDays(today, startOffset) }, { key: key() });
    expect(b.status, JSON.stringify(b.body)).toBe(201);
    const sub = b.body.data.subscription as { id: string; purchaseOrder: { id: string } };
    const s = await send('post', `/api/v1/orders/${sub.purchaseOrder.id}/payment-attempts`, who[label].token, {});
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    const pi = mock.simulatePayment(s.body.data.providerOrderId, { status: 'CAPTURED' });
    const v = await send('post', `/api/v1/orders/${sub.purchaseOrder.id}/payment-attempts/${s.body.data.attemptId}/verify`, who[label].token, { providerOrderId: s.body.data.providerOrderId, providerPaymentId: pi.providerPaymentId, signature: mock.signCheckout(s.body.data.providerOrderId, pi.providerPaymentId) });
    expect(v.status, JSON.stringify(v.body)).toBe(200);
    return { sub, attemptId: s.body.data.attemptId as string, providerOrderId: s.body.data.providerOrderId as string, pi, label };
  }
  const mealsOf = (subId: string) => prisma.messMeal.findMany({ where: { messSubscriptionId: subId }, orderBy: [{ mealDate: 'asc' }, { serviceAt: 'asc' }] });
  const mealAt = async (subId: string, date: string, slot: string) => prisma.messMeal.findFirstOrThrow({ where: { messSubscriptionId: subId, mealDate: dateFromString(date), slot } });
  const pauseReq = (label: string, subId: string, mealId: string) => send('post', `/api/v1/mess/subscriptions/${subId}/meals/${mealId}/pause`, who[label].token, {});
  const resumeReq = (label: string, subId: string, mealId: string) => send('post', `/api/v1/mess/subscriptions/${subId}/meals/${mealId}/resume`, who[label].token, {});
  const start = (label: string, body: Record<string, unknown>) => send('post', '/api/v1/mess/kitchen/batches', who[label].token, body);
  const ready = (label: string, id: string, body: unknown = {}) => send('post', `/api/v1/mess/kitchen/batches/${id}/ready`, who[label].token, body);
  /** Tests must not depend on the wall clock: move a subscription's TODAY meals to a service time comfortably before the pause cutoff. */
  const openToday = (subId: string) => prisma.messMeal.updateMany({ where: { messSubscriptionId: subId, mealDate: dateFromString(today) }, data: { serviceAt: new Date(Date.now() + 10 * 3_600_000) } });
  const subRow = (id: string) => prisma.messSubscription.findUniqueOrThrow({ where: { id } });
  async function quiesce() {
    await prisma.payment.updateMany({ where: { provider: { not: null } }, data: { nextAttemptAt: null, lockedUntil: null, lockedBy: null } });
    await prisma.paymentWebhookEvent.updateMany({ where: { status: { in: ['RECEIVED', 'RETRY_PENDING'] } }, data: { status: 'IGNORED', ignoredReason: 'TEST_CLEANUP', lockedUntil: null } });
    await prisma.refund.updateMany({ where: { status: { in: ['REQUESTED', 'SUBMITTING', 'UNKNOWN', 'PROCESSING'] } }, data: { nextAttemptAt: null, lockedUntil: null, lockedBy: null } });
  }

  beforeAll(async () => {
    await mkUser('admin', [RoleEnum.SUPER_ADMIN]);
    await mkUser('md', [RoleEnum.MD]);
    for (const l of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']) await mkUser(l, [RoleEnum.CUSTOMER]);
    await mkUser('legacy', [RoleEnum.MESS_CUSTOMER]);
    branchA = await prisma.kitchenBranch.create({ data: { code: `P10B-A-${ts}`, name: 'P10B Branch A', address: 'A', city: 'Kochi' } });
    branchB = await prisma.kitchenBranch.create({ data: { code: `P10B-B-${ts}`, name: 'P10B Branch B', address: 'B', city: 'Kochi' } });
    await mkUser('chef', [RoleEnum.CHEF], [branchA.id]);
    await mkUser('chef2', [RoleEnum.CHEF], [branchA.id]);
    await mkUser('chefB', [RoleEnum.CHEF], [branchB.id]);
    await mkUser('driver', [RoleEnum.DELIVERY], [branchA.id]);
    const r = await request(app).post('/api/v1/admin/step-up').set(bearer(who.admin.token)).send({ password: PASSWORD });
    step = r.body.data.stepUpToken;
    const mkSp = async (code: string, branchId: string) => {
      const x = await admin('post', '/mess/service-points', { code: `${code}-${ts}`, name: `Hostel ${code}`, addressLine: '1 Campus Road', city: 'Kochi', postalCode: '682001', branchId });
      expect(x.status, JSON.stringify(x.body)).toBe(201);
      return x.body.data.servicePoint as { id: string };
    };
    spA1 = await mkSp('A1', branchA.id);
    spA2 = await mkSp('A2', branchA.id);
    spB = await mkSp('B1', branchB.id);
    plan = await mkPlan();
    for (const l of ['c1', 'c2', 'c3']) await approve(l, spA1.id);
    await approve('c4', spA2.id);
    await approve('c5', spB.id);
    await approve('c6', spA1.id);
    await quiesce();
  });
  beforeEach(() => {
    mock.reset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await quiesce();
    await prisma.$disconnect();
  });

  // =============================================================================================== A. pure time rules
  describe('A. Asia/Kolkata time rules (pure)', () => {
    it('1. serviceAt is the business date + snapshotted HH:mm in Asia/Kolkata (+05:30), persisted as an instant', () => {
      expect(serviceInstant('2026-10-12', '00:00').toISOString()).toBe('2026-10-11T18:30:00.000Z');
      expect(serviceInstant('2026-10-12', '08:00').toISOString()).toBe('2026-10-12T02:30:00.000Z');
      expect(serviceInstant('2026-10-12', '23:59').toISOString()).toBe('2026-10-12T18:29:00.000Z');
    });

    it('2. IST midnight boundary: the business date flips at 18:30:00Z, never at UTC midnight', () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2026-10-12T18:29:59.999Z'));
        expect(businessDate()).toBe('2026-10-12');
        vi.setSystemTime(new Date('2026-10-12T18:30:00.000Z'));
        expect(businessDate()).toBe('2026-10-13');
        vi.setSystemTime(new Date('2026-10-12T00:00:00.000Z')); // UTC midnight is 05:30 IST: still the same business date
        expect(businessDate()).toBe('2026-10-12');
        vi.setSystemTime(new Date('2026-10-11T23:59:59.000Z')); // 05:29:59 IST on the 12th
        expect(businessDate()).toBe('2026-10-12');
      } finally {
        vi.useRealTimers();
      }
    });

    it('3. the pause window is STRICTLY before serviceAt - cutoff: closed exactly at the boundary instant', () => {
      const service = serviceInstant('2026-10-12', '13:00');
      const deadline = pauseDeadline(service, 2);
      expect(deadline.toISOString()).toBe('2026-10-12T05:30:00.000Z');
      expect(withinPauseWindow(deadline.getTime() - 1, service, 2)).toBe(true);
      expect(withinPauseWindow(deadline.getTime(), service, 2)).toBe(false);
      expect(withinPauseWindow(deadline.getTime() + 1, service, 2)).toBe(false);
      expect(withinPauseWindow(service.getTime() - 1, service, 0)).toBe(true); // cutoff 0 = the service instant itself
      expect(withinPauseWindow(service.getTime(), service, 0)).toBe(false);
    });
  });

  // =============================================================================================== B. slot times + plan
  describe('B. slot service times on plans and the subscription snapshot', () => {
    const planPost = (over: Record<string, unknown>) => admin('post', '/mess/plans', { code: `P10B-${ts}-${++seq}`, name: 'x plan', durationDays: 3, basePrice: '10', taxRate: '0.05', mealSlots: ['BREAKFAST', 'LUNCH'], pauseCutoffHours: 1, maxPauses: 1, minStartLeadDays: 0, slotTimes: { BREAKFAST: '08:00', LUNCH: '13:00' }, ...over });

    it('4. strict HH:mm validation and exact slot coverage; an incomplete or extra mapping is refused', async () => {
      for (const bad of [{ BREAKFAST: '8:00', LUNCH: '13:00' }, { BREAKFAST: '24:00', LUNCH: '13:00' }, { BREAKFAST: '08:60' }, { BREAKFAST: '08:00', DINNER: '19:00' }, { SNACK: '10:00' }, { BREAKFAST: 800 }]) {
        expect((await planPost({ slotTimes: bad })).status, JSON.stringify(bad)).toBe(422);
      }
    });

    it('5. a plan cannot ACTIVATE without valid slotTimes (missing, a missing slot, or an extra disabled slot)', async () => {
      for (const st of [undefined, { LUNCH: '13:00' }, { BREAKFAST: '08:00', LUNCH: '13:00', DINNER: '19:00' }]) {
        const c = await planPost({ slotTimes: st });
        if (c.status !== 201) {
          expect(c.status).toBe(422); // the extra-slot mapping is refused already at creation
          continue;
        }
        const a = await admin('post', `/mess/plans/${c.body.data.plan.id}/activate`, { expectedVersion: 1 });
        expect(a.status, JSON.stringify(st)).toBe(422);
        expect(a.body.error).toBe('PLAN_INCOMPLETE');
      }
    });

    it('6. an ACTIVE plan cannot lose its times, and changing the slots requires matching times', async () => {
      const p = await mkPlan();
      expect((await admin('patch', `/mess/plans/${p.id}`, { expectedVersion: p.version, slotTimes: null })).status).toBe(422);
      expect((await admin('patch', `/mess/plans/${p.id}`, { expectedVersion: p.version, mealSlots: ['BREAKFAST', 'LUNCH', 'DINNER'] })).status).toBe(422);
      const ok = await admin('patch', `/mess/plans/${p.id}`, { expectedVersion: p.version, mealSlots: ['BREAKFAST', 'LUNCH', 'DINNER'], slotTimes: { BREAKFAST: '07:30', LUNCH: '12:30', DINNER: '19:30' } });
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      expect(ok.body.data.plan.slotTimes).toEqual({ BREAKFAST: '07:30', LUNCH: '12:30', DINNER: '19:30' });
    });

    it('7. a P10A-era plan WITHOUT times is not sold (hidden from the public list, purchase refused)', async () => {
      const legacy = await mkPlan();
      await prisma.messSubscriptionPlan.update({ where: { id: legacy.id }, data: { slotTimes: Prisma.DbNull } });
      expect((await get(`/api/v1/mess/plans`)).body.data.some((x: { id: string }) => x.id === legacy.id)).toBe(false);
      await reset('c6');
      const b = await send('post', '/api/v1/mess/subscriptions', who.c6.token, { planId: legacy.id, startDate: addDays(today, 1) }, { key: key() });
      expect(b.status).toBe(409);
      expect(b.body.error).toBe('PLAN_NOT_AVAILABLE');
    });
  });

  // =============================================================================================== C. generation
  describe('C. generation: complete, atomic, idempotent', () => {
    it('8. activation generates the COMPLETE entitlement with exact snapshots and serviceAt instants', async () => {
      const { sub } = await activeSub('c1', 1);
      const row = await subRow(sub.id);
      expect(row.status).toBe('ACTIVE');
      expect(row.mealsGeneratedAt).toBeTruthy();
      expect(row.slotTimes).toEqual({ BREAKFAST: '08:00', LUNCH: '13:00' });
      const meals = await mealsOf(sub.id);
      expect(meals).toHaveLength(DAYS * 2);
      expect(meals).toHaveLength(row.totalMealsAllowed);
      expect(new Set(meals.map((m) => `${dateToString(m.mealDate)}|${m.slot}`)).size).toBe(meals.length);
      for (const m of meals) {
        expect(m).toMatchObject({ status: 'SCHEDULED', branchId: branchA.id, servicePointId: spA1.id, batchId: null });
        expect(m.serviceAt.toISOString()).toBe(serviceInstant(dateToString(m.mealDate), m.slot === 'LUNCH' ? '13:00' : '08:00').toISOString());
      }
      expect(dateToString(meals[0].mealDate)).toBe(addDays(today, 1));
      expect(dateToString(meals[meals.length - 1].mealDate)).toBe(dateToString(row.endDate));
    });

    it('9. a meal is not a commerce Order: the purchase is the only order, no Payment/Refund/wallet row is created by generation', async () => {
      const { sub } = await activeSub('c1', 1);
      expect(await prisma.order.count({ where: { customerProfileId: who.c1.profileId!, orderType: 'MESS_SUBSCRIPTION', messSubscription: { id: sub.id } } })).toBe(1);
      expect(await prisma.refund.count({ where: { order: { messSubscription: { id: sub.id } } } })).toBe(0);
      expect(await prisma.walletAccount.count({ where: { customerProfileId: who.c1.profileId! } })).toBe(0);
    });

    it('10. replay is safe: generating again and a duplicate settlement create nothing', async () => {
      const a = await activeSub('c2', 1);
      const before = await mealsOf(a.sub.id);
      const again = await prisma.$transaction((tx) => MessMealService.generateInTx(tx, a.sub.id));
      expect(again.created).toBe(0);
      const h = mock.buildWebhook('payment.captured', a.pi, { eventId: `evt_${ts}_c10` });
      await request(app).post('/api/v1/payments/webhook').set({ ...h.headers, 'content-type': 'application/octet-stream' }).send(h.raw);
      expect((await mealsOf(a.sub.id)).map((m) => m.id)).toEqual(before.map((m) => m.id));
    });

    it('11. parallel generation produces exactly one set', async () => {
      const a = await activeSub('c3', 1);
      await prisma.messMeal.deleteMany({ where: { messSubscriptionId: a.sub.id } });
      await prisma.messSubscription.update({ where: { id: a.sub.id }, data: { mealsGeneratedAt: null } });
      const results = await Promise.all([1, 2, 3, 4].map(() => prisma.$transaction((tx) => MessMealService.generateInTx(tx, a.sub.id)).catch((e) => e)));
      expect(results.filter((r) => r instanceof Error)).toHaveLength(0);
      expect(results.reduce((n, r) => n + (r as { created: number }).created, 0)).toBe(DAYS * 2);
      expect(await prisma.messMeal.count({ where: { messSubscriptionId: a.sub.id } })).toBe(DAYS * 2);
    });

    it('12. a generation failure fails the SETTLEMENT safely: the capture is not lost, nothing is activated, and the retry succeeds', async () => {
      await reset('c4');
      const b = await send('post', '/api/v1/mess/subscriptions', who.c4.token, { planId: plan.id, startDate: addDays(today, 1) }, { key: key() });
      const sub = b.body.data.subscription;
      const s = await send('post', `/api/v1/orders/${sub.purchaseOrder.id}/payment-attempts`, who.c4.token, {});
      const pi = mock.simulatePayment(s.body.data.providerOrderId, { status: 'CAPTURED' });
      const verify = () => send('post', `/api/v1/orders/${sub.purchaseOrder.id}/payment-attempts/${s.body.data.attemptId}/verify`, who.c4.token, { providerOrderId: s.body.data.providerOrderId, providerPaymentId: pi.providerPaymentId, signature: mock.signCheckout(s.body.data.providerOrderId, pi.providerPaymentId) });
      vi.spyOn(MessMealService, 'generateInTx').mockRejectedValueOnce(new Error('simulated generation failure'));
      const failed = await verify();
      expect(failed.status).toBeGreaterThanOrEqual(400);
      expect(await subRow(sub.id)).toMatchObject({ status: 'PENDING_PAYMENT', mealsGeneratedAt: null });
      expect(await prisma.messMeal.count({ where: { messSubscriptionId: sub.id } })).toBe(0);
      expect(await prisma.order.findUniqueOrThrow({ where: { id: sub.purchaseOrder.id } })).toMatchObject({ status: 'PENDING', paymentStatus: 'PENDING' }); // rolled back as a unit, no FAILED state invented
      expect(await prisma.refund.count({ where: { orderId: sub.purchaseOrder.id } })).toBe(0);
      const retry = await verify(); // the capture still exists at the provider: the retry (like the webhook retry / reconciliation) settles it
      expect(retry.status, JSON.stringify(retry.body)).toBe(200);
      expect((await subRow(sub.id)).status).toBe('ACTIVE');
      expect(await prisma.messMeal.count({ where: { messSubscriptionId: sub.id } })).toBe(DAYS * 2);
    });

    it('13. an entitlement whose count does not match what was purchased rolls back instead of activating short', async () => {
      await reset('c4');
      const b = await send('post', '/api/v1/mess/subscriptions', who.c4.token, { planId: plan.id, startDate: addDays(today, 1) }, { key: key() });
      const sub = b.body.data.subscription;
      await prisma.messSubscription.update({ where: { id: sub.id }, data: { totalMealsAllowed: DAYS * 2 + 1, mealsRemaining: DAYS * 2 + 1 } });
      const s = await send('post', `/api/v1/orders/${sub.purchaseOrder.id}/payment-attempts`, who.c4.token, {});
      const pi = mock.simulatePayment(s.body.data.providerOrderId, { status: 'CAPTURED' });
      const v = await send('post', `/api/v1/orders/${sub.purchaseOrder.id}/payment-attempts/${s.body.data.attemptId}/verify`, who.c4.token, { providerOrderId: s.body.data.providerOrderId, providerPaymentId: pi.providerPaymentId, signature: mock.signCheckout(s.body.data.providerOrderId, pi.providerPaymentId) });
      expect(v.status).toBeGreaterThanOrEqual(400);
      expect((await subRow(sub.id)).status).toBe('PENDING_PAYMENT');
      expect(await prisma.messMeal.count({ where: { messSubscriptionId: sub.id } })).toBe(0);
      await prisma.messSubscription.update({ where: { id: sub.id }, data: { totalMealsAllowed: DAYS * 2, mealsRemaining: DAYS * 2 } });
    });

    it('14. plan edits after purchase never change the subscription snapshot or its meals', async () => {
      const p = await mkPlan();
      const a = await activeSub('c5', 1, p.id);
      const before = (await mealsOf(a.sub.id)).map((m) => m.serviceAt.toISOString());
      const edit = await admin('patch', `/mess/plans/${p.id}`, { expectedVersion: p.version, slotTimes: { BREAKFAST: '06:00', LUNCH: '11:00' } });
      expect(edit.status, JSON.stringify(edit.body)).toBe(200);
      expect((await subRow(a.sub.id)).slotTimes).toEqual({ BREAKFAST: '08:00', LUNCH: '13:00' });
      expect((await mealsOf(a.sub.id)).map((m) => m.serviceAt.toISOString())).toEqual(before);
    });
  });

  // =============================================================================================== D. legacy backfill
  describe('D. P10A-era ACTIVE subscriptions: CLI backfill', () => {
    async function legacySub(label: string) {
      const a = await activeSub(label, 1);
      // turn it into a P10A-era subscription: no snapshot, no meals (raw legacy shape)
      await prisma.messMeal.deleteMany({ where: { messSubscriptionId: a.sub.id } });
      await prisma.messSubscription.update({ where: { id: a.sub.id }, data: { slotTimes: Prisma.DbNull, mealsGeneratedAt: null } });
      return a.sub.id;
    }

    it('15. backfill copies the plan\'s current valid times ONCE, generates the full set, and never touches money', async () => {
      const id = await legacySub('c6');
      const order = await prisma.order.findFirstOrThrow({ where: { messSubscription: { id } } });
      const r = await MessMealService.backfillSubscription(id);
      expect(r).toMatchObject({ changed: true, created: DAYS * 2, copiedSlotTimes: true });
      const row = await subRow(id);
      expect(row.slotTimes).toEqual({ BREAKFAST: '08:00', LUNCH: '13:00' });
      expect(row.mealsGeneratedAt).toBeTruthy();
      expect(await prisma.messMeal.count({ where: { messSubscriptionId: id } })).toBe(DAYS * 2);
      const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(after.netAmount.toString()).toBe(order.netAmount.toString());
      expect(after.taxAmount.toString()).toBe(order.taxAmount.toString());
      expect(after.paymentStatus).toBe(order.paymentStatus);
      expect(await prisma.auditLog.count({ where: { action: 'MESS_SLOT_TIMES_BACKFILLED', entityId: id } })).toBe(1);
    });

    it('16. re-running creates nothing, copies nothing and a later plan edit never changes the snapshot', async () => {
      const id = await legacySub('c6');
      await MessMealService.backfillSubscription(id);
      const p = await subRow(id);
      await prisma.messSubscriptionPlan.update({ where: { id: p.planId }, data: { slotTimes: { BREAKFAST: '05:00', LUNCH: '10:00' } } });
      const again = await MessMealService.backfillSubscription(id);
      expect(again).toMatchObject({ changed: false, created: 0, copiedSlotTimes: false });
      expect((await subRow(id)).slotTimes).toEqual({ BREAKFAST: '08:00', LUNCH: '13:00' });
      expect(await prisma.messMeal.count({ where: { messSubscriptionId: id } })).toBe(DAYS * 2);
      await prisma.messSubscriptionPlan.update({ where: { id: p.planId }, data: { slotTimes: { BREAKFAST: '08:00', LUNCH: '13:00' } } });
    });

    it('17. it refuses when the plan has no valid times (nothing is invented) and for a non-ACTIVE subscription', async () => {
      const id = await legacySub('c6');
      const planId = (await subRow(id)).planId;
      await prisma.messSubscriptionPlan.update({ where: { id: planId }, data: { slotTimes: { LUNCH: '13:00' } } });
      await expect(MessMealService.backfillSubscription(id)).rejects.toMatchObject({ errorCode: 'MESS_SLOT_TIMES_MISSING' });
      expect(await prisma.messMeal.count({ where: { messSubscriptionId: id } })).toBe(0);
      expect((await subRow(id)).slotTimes).toBeNull();
      await prisma.messSubscriptionPlan.update({ where: { id: planId }, data: { slotTimes: { BREAKFAST: '08:00', LUNCH: '13:00' } } });
      await prisma.messSubscription.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      await expect(MessMealService.backfillSubscription(id)).rejects.toMatchObject({ errorCode: 'MESS_NOT_ACTIVE' });
    });

    it('18. parallel backfills produce exactly one set', async () => {
      const id = await legacySub('c6');
      const rs = await Promise.all([1, 2, 3].map(() => MessMealService.backfillSubscription(id).catch((e) => e)));
      expect(rs.filter((r) => r instanceof Error)).toHaveLength(0);
      expect(await prisma.messMeal.count({ where: { messSubscriptionId: id } })).toBe(DAYS * 2);
      expect(await prisma.auditLog.count({ where: { action: 'MESS_SLOT_TIMES_BACKFILLED', entityId: id } })).toBe(1);
    });

    it('19. there is no HTTP endpoint for generation or backfill', async () => {
      for (const p of ['/api/v1/mess/generate-meals', '/api/v1/admin/mess/generate-meals', '/api/v1/admin/mess/backfill', '/api/v1/mess/kitchen/generate']) {
        expect((await send('post', p, who.admin.token, {}, { step })).status, p).toBe(404);
      }
    });
  });

  // =============================================================================================== E. calendar + pause/resume
  describe('E. calendar, pause and resume (lifetime allowance, forfeit, cutoff)', () => {
    let a: Awaited<ReturnType<typeof activeSub>>;
    beforeAll(async () => {
      a = await activeSub('c1', 1);
    });

    it('20. the customer calendar is safe, complete and operational only', async () => {
      const r = await get(`/api/v1/mess/subscriptions/${a.sub.id}/meals`, who.c1.token);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.data.subscription).toMatchObject({ status: 'ACTIVE', pausesUsed: 0, maxPauses: 2, mealsReady: true });
      const m = r.body.data.meals[0];
      expect(Object.keys(m).sort()).toEqual(['canPause', 'canResume', 'date', 'forfeitIfPaused', 'id', 'kitchenState', 'reason', 'serviceAt', 'slot', 'status']);
      expect(m).toMatchObject({ status: 'SCHEDULED', kitchenState: 'NOT_STARTED', canPause: true, canResume: false, forfeitIfPaused: true });
      const text = JSON.stringify(r.body);
      for (const f of ['batchId', 'branchId', 'servicePointId', 'providerPaymentId', 'planSnapshot', 'customerProfileId', 'actorUserId', 'pausesUsedAfter']) expect(text, f).not.toContain(f);
    });

    it('21. foreign / unknown subscription or meal -> the same 404; wrong pairing 404; legacy role 403; staff 403', async () => {
      const meal = await mealAt(a.sub.id, addDays(today, 1), 'LUNCH');
      expect((await get(`/api/v1/mess/subscriptions/${a.sub.id}/meals`, who.c2.token)).status).toBe(404);
      expect((await pauseReq('c2', a.sub.id, meal.id)).status).toBe(404);
      expect((await resumeReq('c2', a.sub.id, meal.id)).status).toBe(404);
      expect((await pauseReq('c1', a.sub.id, randomUUID())).status).toBe(404);
      const other = await activeSub('c2', 1);
      const otherMeal = (await mealsOf(other.sub.id))[0];
      expect((await pauseReq('c1', a.sub.id, otherMeal.id)).status).toBe(404); // a meal of ANOTHER subscription
      expect((await pauseReq('legacy', a.sub.id, meal.id)).status).toBe(403);
      for (const l of ['chef', 'admin', 'md', 'driver']) expect((await pauseReq(l, a.sub.id, meal.id)).status, l).toBe(403);
      expect((await prisma.messMeal.findUniqueOrThrow({ where: { id: meal.id } })).status).toBe('SCHEDULED');
    });

    it('22. pause is strict (no body fields), forfeits the meal and changes NOTHING financial or about the term', async () => {
      const meal = await mealAt(a.sub.id, addDays(today, 1), 'LUNCH');
      const subBefore = await subRow(a.sub.id);
      const orderBefore = await prisma.order.findFirstOrThrow({ where: { messSubscription: { id: a.sub.id } } });
      expect((await send('post', `/api/v1/mess/subscriptions/${a.sub.id}/meals/${meal.id}/pause`, who.c1.token, { refund: true })).status).toBe(422);
      expect((await send('post', `/api/v1/mess/subscriptions/${a.sub.id}/meals/${meal.id}/pause`, who.c1.token, { status: 'PAUSED' })).status).toBe(422);
      const r = await pauseReq('c1', a.sub.id, meal.id);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.data).toMatchObject({ changed: true, status: 'PAUSED', pausesUsed: 1, maxPauses: 2 });
      const subAfter = await subRow(a.sub.id);
      expect(subAfter.totalPausesUsed).toBe(1);
      expect(subAfter.endDate.toISOString()).toBe(subBefore.endDate.toISOString());
      expect(subAfter.totalMealsAllowed).toBe(subBefore.totalMealsAllowed);
      expect(subAfter.mealsRemaining).toBe(subBefore.mealsRemaining);
      const orderAfter = await prisma.order.findUniqueOrThrow({ where: { id: orderBefore.id } });
      expect([orderAfter.status, orderAfter.paymentStatus, orderAfter.netAmount.toString()]).toEqual([orderBefore.status, orderBefore.paymentStatus, orderBefore.netAmount.toString()]);
      expect(await prisma.refund.count({ where: { orderId: orderBefore.id } })).toBe(0);
      expect(await prisma.walletTransaction.count({ where: { walletAccount: { customerProfileId: who.c1.profileId! } } })).toBe(0);
      expect(await prisma.mealPauseRequest.count({ where: { messSubscriptionId: a.sub.id } })).toBe(0);
      expect(await prisma.messMeal.count({ where: { messSubscriptionId: a.sub.id } })).toBe(DAYS * 2); // no replacement meal was appended
    });

    it('23. a repeated pause is an idempotent replay: no counter change, no second event', async () => {
      const meal = await mealAt(a.sub.id, addDays(today, 1), 'LUNCH');
      const r = await pauseReq('c1', a.sub.id, meal.id);
      expect(r.body.data).toMatchObject({ changed: false, status: 'PAUSED', pausesUsed: 1 });
      expect((await subRow(a.sub.id)).totalPausesUsed).toBe(1);
      expect(await prisma.messMealEvent.count({ where: { mealId: meal.id, action: 'PAUSE' } })).toBe(1);
    });

    it('24. resume restores the meal but NEVER the allowance; pause -> resume -> pause consumes TWO', async () => {
      const meal = await mealAt(a.sub.id, addDays(today, 1), 'LUNCH');
      const res = await resumeReq('c1', a.sub.id, meal.id);
      expect(res.body.data).toMatchObject({ changed: true, status: 'SCHEDULED', pausesUsed: 1 });
      expect((await subRow(a.sub.id)).totalPausesUsed).toBe(1);
      expect((await resumeReq('c1', a.sub.id, meal.id)).body.data.changed).toBe(false); // replay
      const again = await pauseReq('c1', a.sub.id, meal.id);
      expect(again.body.data).toMatchObject({ changed: true, pausesUsed: 2 });
      expect(await prisma.messMealEvent.count({ where: { mealId: meal.id } })).toBe(3); // PAUSE, RESUME, PAUSE
      const events = await prisma.messMealEvent.findMany({ where: { mealId: meal.id }, orderBy: { createdAt: 'asc' } });
      expect(events.map((e) => `${e.action}:${e.pausesUsedAfter}`)).toEqual(['PAUSE:1', 'RESUME:1', 'PAUSE:2']);
      expect(events.every((e) => e.actorUserId === who.c1.id)).toBe(true);
    });

    it('25. the lifetime limit holds: a further pause is refused even though a resume could "free" a meal; resume still works', async () => {
      const other = await mealAt(a.sub.id, addDays(today, 2), 'LUNCH');
      const r = await pauseReq('c1', a.sub.id, other.id);
      expect(r.status).toBe(409);
      expect(r.body.error).toBe('PAUSE_LIMIT_REACHED');
      expect((await subRow(a.sub.id)).totalPausesUsed).toBe(2);
      const paused = await mealAt(a.sub.id, addDays(today, 1), 'LUNCH');
      expect((await resumeReq('c1', a.sub.id, paused.id)).body.data.changed).toBe(true);
      expect((await pauseReq('c1', a.sub.id, other.id)).status).toBe(409); // still 2 of 2
      const cal = await get(`/api/v1/mess/subscriptions/${a.sub.id}/meals`, who.c1.token);
      expect(cal.body.data.meals.find((m: { id: string }) => m.id === other.id)).toMatchObject({ canPause: false, reason: 'PAUSE_LIMIT_REACHED' });
    });

    it('26. the DB refuses a pause counter above the snapshotted allowance', async () => {
      await expect(prisma.messSubscription.update({ where: { id: a.sub.id }, data: { totalPausesUsed: 3 } })).rejects.toThrow();
    });

    it('27. cutoff: allowed strictly before serviceAt - cutoff, refused at and after it (pause AND resume)', async () => {
      const b = await activeSub('c3', 1);
      const [m1, m2] = await mealsOf(b.sub.id);
      const cutMs = 2 * 3_600_000;
      await prisma.messMeal.update({ where: { id: m1.id }, data: { serviceAt: new Date(Date.now() + cutMs + 3000) } });
      expect((await pauseReq('c3', b.sub.id, m1.id)).status).toBe(200);
      await prisma.messMeal.update({ where: { id: m1.id }, data: { serviceAt: new Date(Date.now() + cutMs - 3000) } });
      const late = await resumeReq('c3', b.sub.id, m1.id);
      expect(late.status).toBe(409);
      expect(late.body.error).toBe('PAUSE_CUTOFF_PASSED');
      expect((await prisma.messMeal.findUniqueOrThrow({ where: { id: m1.id } })).status).toBe('PAUSED');
      await prisma.messMeal.update({ where: { id: m2.id }, data: { serviceAt: new Date(Date.now() + cutMs - 3000) } });
      const refused = await pauseReq('c3', b.sub.id, m2.id);
      expect(refused.status).toBe(409);
      expect(refused.body.error).toBe('PAUSE_CUTOFF_PASSED');
      expect((await subRow(b.sub.id)).totalPausesUsed).toBe(1); // a refused pause consumed nothing
    });

    it('28. an inactive (cancelled) subscription cannot pause or resume', async () => {
      const b = await activeSub('c3', 1);
      const meal = (await mealsOf(b.sub.id))[0];
      await prisma.messSubscription.update({ where: { id: b.sub.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      const r = await pauseReq('c3', b.sub.id, meal.id);
      expect(r.status).toBe(409);
      expect(r.body.error).toBe('SUBSCRIPTION_NOT_ACTIVE');
    });
  });

  // =============================================================================================== F. pause concurrency
  describe('F. pause concurrency', () => {
    it('29. parallel pauses of different meals never exceed maxPauses and write exactly one event each', async () => {
      const a = await activeSub('c2', 2);
      const meals = await mealsOf(a.sub.id);
      const rs = await Promise.all(meals.slice(0, 6).map((m) => pauseReq('c2', a.sub.id, m.id)));
      expect(rs.filter((r) => r.status === 200)).toHaveLength(2);
      expect(rs.filter((r) => r.status === 409).every((r) => r.body.error === 'PAUSE_LIMIT_REACHED')).toBe(true);
      expect((await subRow(a.sub.id)).totalPausesUsed).toBe(2);
      expect(await prisma.messMealEvent.count({ where: { messSubscriptionId: a.sub.id } })).toBe(2);
      expect(await prisma.messMeal.count({ where: { messSubscriptionId: a.sub.id, status: 'PAUSED' } })).toBe(2);
    });

    it('30. parallel pauses of the SAME meal: one changes, the rest replay; the counter moves once', async () => {
      const a = await activeSub('c2', 2);
      const meal = (await mealsOf(a.sub.id))[0];
      const rs = await Promise.all([1, 2, 3, 4].map(() => pauseReq('c2', a.sub.id, meal.id)));
      expect(rs.every((r) => r.status === 200)).toBe(true);
      expect(rs.filter((r) => r.body.data.changed)).toHaveLength(1);
      expect((await subRow(a.sub.id)).totalPausesUsed).toBe(1);
      expect(await prisma.messMealEvent.count({ where: { mealId: meal.id } })).toBe(1);
    });

    it('31. pause racing with resume on one meal ends consistent (status matches the event history and the counter)', async () => {
      const a = await activeSub('c2', 2);
      const meal = (await mealsOf(a.sub.id))[0];
      await pauseReq('c2', a.sub.id, meal.id);
      const [r1, r2] = await Promise.all([resumeReq('c2', a.sub.id, meal.id), pauseReq('c2', a.sub.id, meal.id)]);
      expect(r1.status).toBeLessThan(500);
      expect(r2.status).toBeLessThan(500);
      const events = await prisma.messMealEvent.findMany({ where: { mealId: meal.id }, orderBy: { createdAt: 'asc' } });
      const last = events[events.length - 1];
      const now = await prisma.messMeal.findUniqueOrThrow({ where: { id: meal.id } });
      expect(now.status).toBe(last.action === 'PAUSE' ? 'PAUSED' : 'SCHEDULED');
      expect((await subRow(a.sub.id)).totalPausesUsed).toBe(events.filter((e) => e.action === 'PAUSE').length);
    });
  });

  // =============================================================================================== G. kitchen demand + batches
  describe('G. kitchen demand and batches', () => {
    let s1: Awaited<ReturnType<typeof activeSub>>; // service point A1
    let s2: Awaited<ReturnType<typeof activeSub>>; // service point A1
    let s3: Awaited<ReturnType<typeof activeSub>>; // service point A2
    let sB: Awaited<ReturnType<typeof activeSub>>; // branch B
    beforeAll(async () => {
      for (const l of ['c1', 'c2', 'c3', 'c4', 'c5']) await reset(l);
      s1 = await activeSub('c1', 0);
      s2 = await activeSub('c2', 0);
      s3 = await activeSub('c4', 0);
      sB = await activeSub('c5', 0);
      for (const x of [s1, s2, s3, sB]) await openToday(x.sub.id);
      expect((await pauseReq('c2', s2.sub.id, (await mealAt(s2.sub.id, today, 'LUNCH')).id)).status).toBe(200); // one paused lunch: excluded from demand
    });
    const chefDemand = (label = 'chef', q = '') => get(`/api/v1/mess/kitchen/demand${q}`, who[label].token);

    it('32. CHEF demand = eligible SCHEDULED meals grouped by branch/date/slot/service point, with NO customer data', async () => {
      const r = await chefDemand('chef', `?branchId=${branchA.id}`);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      const lunch = r.body.data.groups.find((g: { mealDate: string; slot: string }) => g.mealDate === today && g.slot === 'LUNCH');
      expect(lunch.total).toBe(2); // s1 + s3 (s2 paused)
      const byName = Object.fromEntries(lunch.servicePoints.map((x: { servicePoint: { name: string }; mealCount: number }) => [x.servicePoint.name, x.mealCount]));
      expect(byName).toEqual({ 'Hostel A1': 1, 'Hostel A2': 1 });
      expect(lunch).toMatchObject({ batchStatus: null, canStart: true });
      const breakfast = r.body.data.groups.find((g: { mealDate: string; slot: string }) => g.mealDate === today && g.slot === 'BREAKFAST');
      expect(breakfast.total).toBe(3);
      const text = JSON.stringify(r.body);
      for (const f of ['P10B c1', 'P10B c2', '@test.com', 'roomNumber', 'phone', 'studentIdCard', 'customerProfileId', 'messAccount']) expect(text, f).not.toContain(f);
    });

    it('33. visibility window: today..today+7 only; future days are informational (canStart=false); the past is not shown', async () => {
      const r = await chefDemand('chef', `?branchId=${branchA.id}`);
      const dates = [...new Set(r.body.data.groups.map((g: { mealDate: string }) => g.mealDate))] as string[];
      expect(dates.every((d) => d >= today && d <= addDays(today, 7))).toBe(true);
      const future = r.body.data.groups.find((g: { mealDate: string }) => g.mealDate > today);
      expect(future?.canStart ?? false).toBe(false);
      const wide = await chefDemand('chef', `?branchId=${branchA.id}&from=2020-01-01&to=2099-01-01`);
      expect(wide.body.data.from).toBe(today);
      expect(wide.body.data.to).toBe(addDays(today, 7));
    });

    it('34. branch isolation: a CHEF sees only own branches; a foreign branch is 403; SUPER_ADMIN/MD need an explicit branch; others are refused', async () => {
      expect((await chefDemand('chefB', `?branchId=${branchA.id}`)).status).toBe(403);
      const own = await chefDemand('chefB');
      expect(own.status).toBe(200);
      expect(own.body.data.groups.every((g: { branch: { id: string } }) => g.branch.id === branchB.id)).toBe(true);
      expect((await chefDemand('admin')).status).toBe(400);
      expect((await chefDemand('md')).status).toBe(400);
      expect((await chefDemand('admin', `?branchId=${branchA.id}`)).status).toBe(200);
      expect((await chefDemand('md', `?branchId=${branchA.id}`)).status).toBe(200);
      for (const l of ['c1', 'driver', 'legacy']) expect((await chefDemand(l, `?branchId=${branchA.id}`)).status, l).toBe(403);
      expect((await get('/api/v1/mess/kitchen/demand')).status).toBe(401);
    });

    it('35. SUPER_ADMIN, MD, customers and drivers can NEVER start or ready a batch; CHEF of another branch is refused', async () => {
      const body = { branchId: branchA.id, mealDate: today, slot: 'LUNCH' };
      for (const l of ['admin', 'md', 'c1', 'driver', 'legacy']) expect((await start(l, body)).status, l).toBe(403);
      expect((await start('chefB', body)).status).toBe(403);
      expect(await prisma.messMealBatch.count({ where: { branchId: branchA.id } })).toBe(0);
    });

    it('36. only TODAY may start: a future date and a past date are refused; strict body', async () => {
      for (const d of [addDays(today, 1), addDays(today, -1), addDays(today, 7)]) {
        const r = await start('chef', { branchId: branchA.id, mealDate: d, slot: 'LUNCH' });
        expect(r.status, d).toBe(409);
        expect(r.body.error).toBe('BATCH_DATE_NOT_TODAY');
      }
      expect((await start('chef', { branchId: branchA.id, mealDate: today, slot: 'SNACK' })).status).toBe(422);
      expect((await start('chef', { branchId: branchA.id, mealDate: today, slot: 'LUNCH', mealCount: 99 })).status).toBe(422);
      expect(await prisma.messMealBatch.count({ where: { branchId: branchA.id } })).toBe(0);
    });

    it('37. starting freezes the exact eligible membership atomically, with a service-point breakdown derived from the attached meals', async () => {
      const r = await start('chef', { branchId: branchA.id, mealDate: today, slot: 'LUNCH' });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      const b = r.body.data.batch;
      expect(b).toMatchObject({ status: 'PREPARING', mealCount: 2, slot: 'LUNCH', mealDate: today });
      expect(Object.fromEntries(b.servicePoints.map((x: { servicePoint: { name: string }; mealCount: number }) => [x.servicePoint.name, x.mealCount]))).toEqual({ 'Hostel A1': 1, 'Hostel A2': 1 });
      const attached = await prisma.messMeal.findMany({ where: { batchId: b.id } });
      expect(attached).toHaveLength(2);
      expect(attached.every((m) => m.status === 'SCHEDULED' && m.slot === 'LUNCH' && dateToString(m.mealDate) === today && m.branchId === branchA.id)).toBe(true);
      // the paused meal and the other branch's meal were NOT attached; the breakfast batch does not exist
      expect((await mealAt(s2.sub.id, today, 'LUNCH')).batchId).toBeNull();
      expect((await mealAt(sB.sub.id, today, 'LUNCH')).batchId).toBeNull();
      expect(await prisma.messMealBatch.count({ where: { branchId: branchA.id } })).toBe(1);
      expect((await prisma.messMealBatch.findUniqueOrThrow({ where: { id: b.id } })).mealCount).toBe(2);
    });

    it('38. the breakdown is a snapshot: later account / service-point changes never alter it', async () => {
      const before = (await get(`/api/v1/mess/kitchen/batches?branchId=${branchA.id}`, who.chef.token)).body.data.batches[0];
      await prisma.messAccount.updateMany({ where: { customerProfileId: who.c4.profileId! }, data: { servicePointId: spA1.id } });
      await prisma.messServicePoint.update({ where: { id: spA2.id }, data: { name: 'Hostel A2 renamed' } });
      const after = (await get(`/api/v1/mess/kitchen/batches?branchId=${branchA.id}`, who.chef.token)).body.data.batches[0];
      expect(after.servicePoints.map((x: { mealCount: number }) => x.mealCount).sort()).toEqual(before.servicePoints.map((x: { mealCount: number }) => x.mealCount).sort());
      expect(after.mealCount).toBe(2);
      await prisma.messServicePoint.update({ where: { id: spA2.id }, data: { name: 'Hostel A2' } });
      await prisma.messAccount.updateMany({ where: { customerProfileId: who.c4.profileId! }, data: { servicePointId: spA2.id } });
    });

    it('39. a replay or a second CHEF gets the SAME batch (changed:false); no duplicate batch exists', async () => {
      const again = await start('chef', { branchId: branchA.id, mealDate: today, slot: 'LUNCH' });
      const other = await start('chef2', { branchId: branchA.id, mealDate: today, slot: 'LUNCH' });
      expect([again.status, other.status]).toEqual([200, 200]);
      expect([again.body.data.changed, other.body.data.changed]).toEqual([false, false]);
      expect(await prisma.messMealBatch.count({ where: { branchId: branchA.id, mealDate: dateFromString(today), slot: 'LUNCH' } })).toBe(1);
    });

    it('40. two CHEFs starting the same NEW batch in parallel: exactly one creates it, membership attached once', async () => {
      const [r1, r2] = await Promise.all([start('chef', { branchId: branchA.id, mealDate: today, slot: 'BREAKFAST' }), start('chef2', { branchId: branchA.id, mealDate: today, slot: 'BREAKFAST' })]);
      expect([r1.status, r2.status].sort()).toEqual([200, 201]);
      const batch = await prisma.messMealBatch.findFirstOrThrow({ where: { branchId: branchA.id, mealDate: dateFromString(today), slot: 'BREAKFAST' } });
      expect(batch.mealCount).toBe(3);
      expect(await prisma.messMeal.count({ where: { batchId: batch.id } })).toBe(3);
      expect(await prisma.messMealBatch.count({ where: { branchId: branchA.id, slot: 'BREAKFAST', mealDate: dateFromString(today) } })).toBe(1);
    });

    it('41. attached meals are FROZEN: pause and resume are refused, demand no longer counts them, the calendar shows the kitchen state', async () => {
      const meal = await mealAt(s1.sub.id, today, 'LUNCH');
      for (const f of [pauseReq, resumeReq]) {
        const r = await f('c1', s1.sub.id, meal.id);
        expect(r.status).toBe(409);
        expect(r.body.error).toBe('MEAL_FROZEN');
      }
      expect((await prisma.messMeal.findUniqueOrThrow({ where: { id: meal.id } })).status).toBe('SCHEDULED');
      const d = await chefDemand('chef', `?branchId=${branchA.id}`);
      expect(d.body.data.groups.find((g: { mealDate: string; slot: string }) => g.mealDate === today && g.slot === 'LUNCH')).toBeUndefined();
      const cal = await get(`/api/v1/mess/subscriptions/${s1.sub.id}/meals`, who.c1.token);
      expect(cal.body.data.meals.find((m: { id: string }) => m.id === meal.id)).toMatchObject({ kitchenState: 'IN_PREPARATION', canPause: false, canResume: false, reason: 'MEAL_FROZEN' });
    });

    it('42. READY: CHEF of the branch only, idempotent, no reverse; the meals stay SCHEDULED (NOT fulfilled), the subscription stays ACTIVE', async () => {
      const batch = await prisma.messMealBatch.findFirstOrThrow({ where: { branchId: branchA.id, mealDate: dateFromString(today), slot: 'LUNCH' } });
      for (const l of ['admin', 'md', 'c1', 'driver']) expect((await ready(l, batch.id)).status, l).toBe(403);
      expect((await ready('chefB', batch.id)).status).toBe(404);
      expect((await ready('chef', batch.id, { status: 'DELIVERED' })).status).toBe(422);
      expect((await ready('chef', randomUUID())).status).toBe(404);
      const r = await ready('chef', batch.id);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.data).toMatchObject({ changed: true });
      expect(r.body.data.batch).toMatchObject({ status: 'READY', mealCount: 2 });
      expect((await ready('chef2', batch.id)).body.data.changed).toBe(false);
      const meals = await prisma.messMeal.findMany({ where: { batchId: batch.id } });
      expect(meals.every((m) => m.status === 'SCHEDULED' && m.consumedAt === null)).toBe(true);
      expect(await prisma.messMeal.count({ where: { status: { in: ['FULFILLED', 'CONSUMED'] }, messSubscriptionId: { in: [s1.sub.id, s2.sub.id, s3.sub.id] } } })).toBe(0);
      expect((await subRow(s1.sub.id)).status).toBe('ACTIVE');
      const cal = await get(`/api/v1/mess/subscriptions/${s1.sub.id}/meals`, who.c1.token);
      expect(cal.body.data.meals.find((m: { id: string }) => m.id === meals.find((x) => x.messSubscriptionId === s1.sub.id)!.id).kitchenState).toBe('READY');
      expect(await prisma.messMealBatch.findUniqueOrThrow({ where: { id: batch.id } })).toMatchObject({ status: 'READY' });
    });

    it('43. a start with no eligible meals is 409; READY never creates delivery rows, refunds or wallet movements', async () => {
      const none = await start('chef', { branchId: branchB.id, mealDate: today, slot: 'DINNER' });
      expect([409, 403]).toContain(none.status);
      expect(await prisma.deliveryAssignment.count({ where: { order: { messSubscription: { id: { in: [s1.sub.id, s2.sub.id] } } } } })).toBe(0);
      expect(await prisma.refund.count({ where: { order: { messSubscription: { id: { in: [s1.sub.id, s2.sub.id, s3.sub.id] } } } } })).toBe(0);
      expect(await prisma.walletTransaction.count({ where: { walletAccount: { customerProfileId: { in: [who.c1.profileId!, who.c2.profileId!] } } } })).toBe(0);
    });

    it('44. branch B has its own kitchen: its meals appear only to chefB, and chefB starts them', async () => {
      const d = await chefDemand('chefB');
      expect(d.body.data.groups.find((g: { mealDate: string; slot: string }) => g.mealDate === today && g.slot === 'LUNCH').total).toBe(1);
      const r = await start('chefB', { branchId: branchB.id, mealDate: today, slot: 'LUNCH' });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body.data.batch.mealCount).toBe(1);
    });
  });

  // =============================================================================================== H. cancellation + races
  describe('H. cancellation interaction and races', () => {
    it('45. cancelling an unstarted ACTIVE subscription cancels its meals in the same transaction and refunds in full (P10A rule)', async () => {
      const a = await activeSub('c3', 3);
      const c = await send('post', `/api/v1/mess/subscriptions/${a.sub.id}/cancel`, who.c3.token, { reasonCode: 'CHANGED_MIND' });
      expect(c.status, JSON.stringify(c.body)).toBe(200);
      expect((await mealsOf(a.sub.id)).every((m) => m.status === 'CANCELLED')).toBe(true);
      expect(await prisma.refund.count({ where: { orderId: a.sub.purchaseOrder.id } })).toBe(1);
      const meal = (await mealsOf(a.sub.id))[0];
      expect((await pauseReq('c3', a.sub.id, meal.id)).status).toBe(409);
      const d = await get(`/api/v1/mess/kitchen/demand?branchId=${branchA.id}&to=${addDays(today, 7)}`, who.chef.token);
      expect(JSON.stringify(d.body)).not.toContain(a.sub.id);
    });

    it('46. a subscription with ANY meal attached to a kitchen batch cannot be cancelled by the customer OR SUPER_ADMIN', async () => {
      const dinner = await mkPlan({ mealSlots: ['DINNER'], slotTimes: { DINNER: '19:30' } });
      const a = await activeSub('c6', 0, dinner.id);
      await quiesce();
      const batchStart = await start('chef', { branchId: branchA.id, mealDate: today, slot: 'DINNER' });
      expect(batchStart.status, JSON.stringify(batchStart.body)).toBe(201);
      expect((await mealAt(a.sub.id, today, 'DINNER')).batchId).toBeTruthy();
      const c = await send('post', `/api/v1/mess/subscriptions/${a.sub.id}/cancel`, who.c6.token, { reasonCode: 'CHANGED_MIND' });
      expect(c.status).toBe(409);
      const ad = await admin('post', `/mess/subscriptions/${a.sub.id}/cancel`, { reasonCode: 'OPERATIONAL_ISSUE' });
      expect(ad.status).toBe(409);
      expect((await subRow(a.sub.id)).status).toBe('ACTIVE');
      expect(await prisma.refund.count({ where: { orderId: a.sub.purchaseOrder.id } })).toBe(0);
    });

    it('47. a meal is either paused or attached, never both: pause racing batch start has exactly one winner', async () => {
      const dinner = await mkPlan({ mealSlots: ['DINNER'], slotTimes: { DINNER: '19:30' } });
      const a = await activeSub('c5', 0, dinner.id);
      await openToday(a.sub.id);
      const meal = await mealAt(a.sub.id, today, 'DINNER');
      const [p, st] = await Promise.all([pauseReq('c5', a.sub.id, meal.id), start('chefB', { branchId: branchB.id, mealDate: today, slot: 'DINNER' })]);
      const m = await prisma.messMeal.findUniqueOrThrow({ where: { id: meal.id } });
      expect(m.status === 'PAUSED' && m.batchId !== null, 'paused AND attached').toBe(false);
      if (p.status === 200) {
        expect(m).toMatchObject({ status: 'PAUSED', batchId: null });
        expect(st.status).toBe(409); // nothing left to attach
      } else {
        expect(p.status).toBe(409);
        expect(p.body.error).toBe('MEAL_FROZEN');
        expect(m.batchId).toBeTruthy();
        expect([200, 201]).toContain(st.status);
      }
    });

    it('48. cancellation racing with a batch start never leaves a batched meal on a cancelled subscription', async () => {
      // a fresh branch: today's batches of branches A/B already exist, and a same-day purchase may not start on a slot whose batch has started (same-day rule)
      const branchC = await prisma.kitchenBranch.create({ data: { code: `P10B-C-${ts}`, name: 'P10B Branch C', address: 'C', city: 'Kochi' } });
      const spC = await admin('post', '/mess/service-points', { code: `C1-${ts}`, name: 'Hostel C1', addressLine: '1 Campus Road', city: 'Kochi', postalCode: '682001', branchId: branchC.id });
      expect(spC.status, JSON.stringify(spC.body)).toBe(201);
      await mkUser('chefC', [RoleEnum.CHEF], [branchC.id]);
      await mkUser('c7', [RoleEnum.CUSTOMER]);
      await approve('c7', spC.body.data.servicePoint.id);
      const b = await activeSub('c7', 0);
      const [c, st] = await Promise.all([send('post', `/api/v1/mess/subscriptions/${b.sub.id}/cancel`, who.c7.token, { reasonCode: 'CHANGED_MIND' }), start('chefC', { branchId: branchC.id, mealDate: today, slot: 'BREAKFAST' })]);
      expect([c.status, st.status].every((x) => x < 500)).toBe(true);
      const row = await subRow(b.sub.id);
      const attached = await prisma.messMeal.count({ where: { messSubscriptionId: b.sub.id, batchId: { not: null } } });
      if (row.status === 'CANCELLED') expect(attached, 'a batched meal on a cancelled subscription').toBe(0);
      else expect(c.status).toBe(409); // the batch won: the cancellation was refused
      expect(await prisma.messMeal.count({ where: { messSubscriptionId: b.sub.id, status: 'CANCELLED', batchId: { not: null } } })).toBe(0);
    });

    it('49. a late payment (start date passed) still cancels with a full refund and creates NO meals (P10A guarantee preserved)', async () => {
      await reset('c6');
      const b = await send('post', '/api/v1/mess/subscriptions', who.c6.token, { planId: plan.id, startDate: addDays(today, 2) }, { key: key() });
      const sub = b.body.data.subscription;
      const s = await send('post', `/api/v1/orders/${sub.purchaseOrder.id}/payment-attempts`, who.c6.token, {});
      await prisma.messSubscription.update({ where: { id: sub.id }, data: { startDate: dateFromString(addDays(today, -1)), endDate: dateFromString(addDays(today, 2)) } });
      const pi = mock.simulatePayment(s.body.data.providerOrderId, { status: 'CAPTURED' });
      const v = await send('post', `/api/v1/orders/${sub.purchaseOrder.id}/payment-attempts/${s.body.data.attemptId}/verify`, who.c6.token, { providerOrderId: s.body.data.providerOrderId, providerPaymentId: pi.providerPaymentId, signature: mock.signCheckout(s.body.data.providerOrderId, pi.providerPaymentId) });
      expect(v.status).toBe(200);
      expect(await subRow(sub.id)).toMatchObject({ status: 'CANCELLED', mealsGeneratedAt: null });
      expect(await prisma.messMeal.count({ where: { messSubscriptionId: sub.id } })).toBe(0);
      expect(await prisma.refund.count({ where: { orderId: sub.purchaseOrder.id } })).toBe(1);
    });
  });

  // =============================================================================================== K. same-day purchase vs meal / batch eligibility
  describe('K. a same-day start must be fully serviceable at trusted activation (first entitlement date)', () => {
    let wseq = 0;
    const atInstant = async <T>(iso: string, fn: () => Promise<T>): Promise<T> => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(iso));
      try {
        return await fn();
      } finally {
        vi.useRealTimers();
      }
    };
    /** Pins Date alone to a time of the business day in IST (timers stay real). The customers' tokens are long-lived, so a later clock never invalidates them. */
    const atIst = <T>(hhmm: string, fn: () => Promise<T>) => atInstant(`${today}T${hhmm}:00+05:30`, fn);
    const longLived = async (label: string, roles: RoleEnum[], branches: string[] = []) => {
      const w = await mkUser(label, roles, branches);
      w.token = jwt.sign({ userId: w.id, email: w.email, roles }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '2d' });
      return w;
    };
    /** A private branch (batches are unique per branch+date+slot and persist for the day), its service point, one CHEF and two customers: `a` (activated early) and `b` (the purchase under test). */
    async function world() {
      const n = ++wseq;
      const branch = await prisma.kitchenBranch.create({ data: { code: `P10B-K${n}-${ts}`, name: `K${n}`, address: 'K', city: 'Kochi' } });
      const spr = await admin('post', '/mess/service-points', { code: `K${n}-${ts}`, name: `Hostel K${n}`, addressLine: '1 Campus Road', city: 'Kochi', postalCode: '682001', branchId: branch.id });
      expect(spr.status, JSON.stringify(spr.body)).toBe(201);
      const chef = `kchef${n}`;
      const a = `ka${n}`;
      const b = `kb${n}`;
      await longLived(chef, [RoleEnum.CHEF], [branch.id]);
      for (const l of [a, b]) {
        await longLived(l, [RoleEnum.CUSTOMER]);
        await approve(l, spr.body.data.servicePoint.id);
      }
      return { branch, sp: spr.body.data.servicePoint.id as string, chef, a, b };
    }
    type World = Awaited<ReturnType<typeof world>>;
    const buyReq = (label: string, startDate = today, planId = plan.id) => send('post', '/api/v1/mess/subscriptions', who[label].token, { planId, startDate }, { key: key() });
    async function buyOk(label: string, startDate = today, planId = plan.id) {
      const r = await buyReq(label, startDate, planId);
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      return r.body.data.subscription as { id: string; purchaseOrder: { id: string } };
    }
    async function sessionFor(label: string, sub: { id: string; purchaseOrder: { id: string } }) {
      const s = await send('post', `/api/v1/orders/${sub.purchaseOrder.id}/payment-attempts`, who[label].token, {});
      expect(s.status, JSON.stringify(s.body)).toBe(200);
      return { sub, label, attemptId: s.body.data.attemptId as string, providerOrderId: s.body.data.providerOrderId as string };
    }
    const capture = (c: { providerOrderId: string }) => mock.simulatePayment(c.providerOrderId, { status: 'CAPTURED' });
    const verifyReq = (c: { label: string; sub: { id: string; purchaseOrder: { id: string } }; attemptId: string; providerOrderId: string }, pi: { providerPaymentId: string }) =>
      send('post', `/api/v1/orders/${c.sub.purchaseOrder.id}/payment-attempts/${c.attemptId}/verify`, who[c.label].token, { providerOrderId: c.providerOrderId, providerPaymentId: pi.providerPaymentId, signature: mock.signCheckout(c.providerOrderId, pi.providerPaymentId) });
    const hookReq = (pi: Parameters<MockPaymentProvider['buildWebhook']>[1], eventId: string) => {
      const h = mock.buildWebhook('payment.captured', pi, { eventId });
      return request(app).post('/api/v1/payments/webhook').set({ ...h.headers, 'content-type': 'application/octet-stream' }).send(h.raw);
    };
    /** Early customer `a` is activated for today BEFORE any slot (06:00 IST) so the branch has real meals to prepare. */
    async function activateEarly(w: World) {
      return await atIst('06:00', async () => {
        const sub = await buyOk(w.a);
        const c = await sessionFor(w.a, sub);
        expect((await verifyReq(c, capture(c))).status).toBe(200);
        expect((await subRow(sub.id)).status).toBe('ACTIVE');
        return sub;
      });
    }
    const startBatch = (w: World, slot: string) => start(w.chef, { branchId: w.branch.id, mealDate: today, slot });
    const dueRefund = (id: string) => prisma.refund.update({ where: { id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    /** Everything that must hold after a same-day capture was refused, whichever path settled it. */
    async function expectRefusedOutcome(c: { sub: { id: string; purchaseOrder: { id: string } } }, pi: { providerPaymentId: string }, cause?: 'SERVICE_TIME_PASSED' | 'BATCH_STARTED') {
      expect(await prisma.order.findUniqueOrThrow({ where: { id: c.sub.purchaseOrder.id } })).toMatchObject({ status: 'CANCELLED', paymentStatus: 'PAID' });
      const sub = await subRow(c.sub.id);
      expect(sub).toMatchObject({ status: 'CANCELLED', activatedAt: null, mealsGeneratedAt: null, cancellationReasonCode: 'START_DAY_UNAVAILABLE' });
      expect(dateToString(sub.startDate)).toBe(today); // the dates never move
      expect(sub.totalMealsAllowed).toBe(DAYS * 2); // nothing is reduced
      expect(await prisma.messMeal.count({ where: { messSubscriptionId: c.sub.id } })).toBe(0); // no partial / stranded meal
      const ledger = await prisma.providerPayment.findMany({ where: { providerPaymentId: pi.providerPaymentId } });
      expect(ledger).toHaveLength(1);
      expect(ledger[0].reconciliationStatus).toBe('APPLIED'); // the capture is recorded exactly once, never FAILED
      const refunds = await prisma.refund.findMany({ where: { orderId: c.sub.purchaseOrder.id } });
      expect(refunds).toHaveLength(1);
      expect(refunds[0]).toMatchObject({ trigger: 'MESS_START_DAY_UNAVAILABLE', reasonCode: 'START_DAY_UNAVAILABLE', requestedByKind: 'SYSTEM' });
      expect(Number(refunds[0].amount)).toBe(420);
      const audit = await prisma.auditLog.findMany({ where: { action: 'MESS_START_DAY_UNAVAILABLE_REFUNDED', entityId: c.sub.id } });
      expect(audit).toHaveLength(1);
      if (cause) expect(audit[0].payload).toMatchObject({ cause });
      expect(await prisma.auditLog.count({ where: { action: 'MESS_SUBSCRIPTION_ACTIVATED', entityId: c.sub.id } })).toBe(0);
      expect(await prisma.auditLog.count({ where: { action: 'MESS_LATE_PAYMENT_REFUNDED', entityId: c.sub.id } })).toBe(0);
      const events = await prisma.orderEvent.findMany({ where: { orderId: c.sub.purchaseOrder.id }, orderBy: { createdAt: 'asc' } });
      expect(events.map((e) => `${e.fromStatus ?? '-'}>${e.toStatus}`)).toEqual(['->PENDING', 'PENDING>CONFIRMED', 'CONFIRMED>CANCELLED']);
      return refunds[0];
    }
    async function finishRefund(refundId: string, orderId: string) {
      await dueRefund(refundId);
      await PaymentReconciliationService.runOnce({ workerId: 'p10b-k-1' });
      const pr = [...mock.refunds.values()].find((r) => r.receipt === refundId);
      expect(pr, 'the provider received the refund').toBeTruthy();
      expect(mock.refundCreateCalls).toBe(1); // exactly ONE provider refund submission
      mock.setRefundStatus(pr!.providerRefundId, 'PROCESSED');
      await dueRefund(refundId);
      await PaymentReconciliationService.runOnce({ workerId: 'p10b-k-2' });
      expect((await prisma.refund.findUniqueOrThrow({ where: { id: refundId } })).status).toBe('PROCESSED');
      expect(await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({ status: 'CANCELLED', paymentStatus: 'REFUNDED' });
      expect(mock.refundCreateCalls).toBe(1);
    }
    beforeEach(async () => {
      await quiesce();
    });

    it('56. A: a same-day start with every first-day slot still in the future and no batch activates with the COMPLETE entitlement', async () => {
      const w = await world();
      await atIst('06:00', async () => {
        const sub = await buyOk(w.b);
        const c = await sessionFor(w.b, sub);
        expect((await verifyReq(c, capture(c))).status).toBe(200);
        const row = await subRow(sub.id);
        expect(row).toMatchObject({ status: 'ACTIVE' });
        expect(row.mealsGeneratedAt).toBeTruthy();
        const meals = await mealsOf(sub.id);
        expect(meals).toHaveLength(DAYS * 2);
        expect(meals.filter((m) => dateToString(m.mealDate) === today).map((m) => m.slot).sort()).toEqual(['BREAKFAST', 'LUNCH']);
        expect(meals.every((m) => m.status === 'SCHEDULED' && m.batchId === null)).toBe(true);
      });
    });

    it('57. B: a first-day slot whose service time has passed refuses the purchase BEFORE any order or money exists; the whole entitlement is refused', async () => {
      const w = await world();
      await atIst('09:00', async () => {
        const r = await buyReq(w.b);
        expect(r.status).toBe(409);
        expect(r.body.error).toBe('MESS_START_DAY_UNAVAILABLE');
        expect(JSON.stringify(r.body)).not.toMatch(/batch|branch/i); // no internal identifiers
      });
      expect(await prisma.messSubscription.count({ where: { messAccount: { customerProfileId: who[w.b].profileId! } } })).toBe(0);
      expect(await prisma.order.count({ where: { customerProfileId: who[w.b].profileId! } })).toBe(0);
    });

    it('58. exact serviceAt boundary: at the service instant the slot is unavailable; one millisecond earlier it is still available', async () => {
      const w = await world();
      await atInstant(`${today}T08:00:00.000+05:30`, async () => expect((await buyReq(w.b)).status).toBe(409));
      await atInstant(new Date(new Date(`${today}T08:00:00.000+05:30`).getTime() - 1).toISOString(), async () => expect((await buyReq(w.b)).status).toBe(201));
    });

    it('59. C/D: a PREPARING or READY batch of a required slot refuses the same-day purchase (no internal ids in the error)', async () => {
      const w = await world();
      await activateEarly(w);
      const st = await startBatch(w, 'LUNCH');
      expect(st.status, JSON.stringify(st.body)).toBe(201);
      await atIst('07:00', async () => {
        const r = await buyReq(w.b);
        expect(r.status).toBe(409);
        expect(r.body.error).toBe('MESS_START_DAY_UNAVAILABLE');
        expect(JSON.stringify(r.body)).not.toContain(st.body.data.batch.id);
      });
      expect((await ready(w.chef, st.body.data.batch.id)).status).toBe(200); // READY: still refused
      await atIst('07:00', async () => expect((await buyReq(w.b)).status).toBe(409));
    });

    it('60. E: a mixed first day (BREAKFAST passed, LUNCH still open) refuses the WHOLE entitlement: breakfast is never silently omitted', async () => {
      const w = await world();
      await atIst('09:00', async () => {
        expect((await buyReq(w.b)).status).toBe(409);
        const lunchOnly = await mkPlan({ mealSlots: ['LUNCH'], slotTimes: { LUNCH: '13:00' } });
        expect((await buyReq(w.b, today, lunchOnly.id)).status).toBe(201); // only a plan WITHOUT the passed slot is purchasable today
      });
      expect(await prisma.messSubscription.count({ where: { messAccount: { customerProfileId: who[w.b].profileId! }, totalMealsAllowed: { not: DAYS } } })).toBe(0);
    });

    it('61. F: a future start date is unaffected, even after every slot of today has passed and a batch exists', async () => {
      const w = await world();
      await activateEarly(w);
      expect((await startBatch(w, 'LUNCH')).status).toBe(201);
      await atIst('23:00', async () => {
        const sub = await buyOk(w.b, addDays(today, 1));
        const c = await sessionFor(w.b, sub);
        expect((await verifyReq(c, capture(c))).status).toBe(200);
        expect((await subRow(sub.id)).status).toBe('ACTIVE');
        expect(await prisma.messMeal.count({ where: { messSubscriptionId: sub.id } })).toBe(DAYS * 2);
      });
    });

    it('62. a payment session cannot be opened (or reused) once a first-day slot is no longer possible', async () => {
      const w = await world();
      const sub = await atIst('07:00', () => buyOk(w.b));
      await atIst('07:00', async () => expect((await sessionFor(w.b, sub)).providerOrderId).toBeTruthy());
      await atIst('09:00', async () => {
        const s = await send('post', `/api/v1/orders/${sub.purchaseOrder.id}/payment-attempts`, who[w.b].token, {});
        expect(s.status).toBe(409);
        expect(s.body.error).toBe('MESS_START_DAY_UNAVAILABLE');
      });
    });

    it('63. G: payment opened while valid, service time passes before the capture settles: recorded, never activated, ONE full refund, refunded exactly once', async () => {
      const w = await world();
      const c = await atIst('07:00', async () => sessionFor(w.b, await buyOk(w.b)));
      const pi = capture(c);
      const v = await atIst('09:00', () => verifyReq(c, pi));
      expect(v.status, JSON.stringify(v.body)).toBe(200);
      const refund = await expectRefusedOutcome(c, pi, 'SERVICE_TIME_PASSED');
      await finishRefund(refund.id, c.sub.purchaseOrder.id);
    });

    it('64. H: payment opened while valid, CHEF starts the batch through the real API before the capture: never activated, no stranded meal, ONE full refund', async () => {
      const w = await world();
      await activateEarly(w);
      const c = await atIst('06:30', async () => sessionFor(w.b, await buyOk(w.b)));
      const st = await startBatch(w, 'LUNCH');
      expect(st.status, JSON.stringify(st.body)).toBe(201);
      expect(st.body.data.batch.mealCount).toBe(1); // only a's meal
      const pi = capture(c);
      const v = await atIst('07:00', () => verifyReq(c, pi));
      expect(v.status, JSON.stringify(v.body)).toBe(200);
      const refund = await expectRefusedOutcome(c, pi, 'BATCH_STARTED');
      expect(await prisma.messMeal.count({ where: { batchId: st.body.data.batch.id } })).toBe(1); // the frozen batch is untouched
      await finishRefund(refund.id, c.sub.purchaseOrder.id);
    });

    it('65. I: a webhook capture after the batch started: identical outcome; the same event and a new event change nothing (no duplicate refund)', async () => {
      const w = await world();
      await activateEarly(w);
      const c = await atIst('06:30', async () => sessionFor(w.b, await buyOk(w.b)));
      expect((await startBatch(w, 'LUNCH')).status).toBe(201);
      const pi = capture(c);
      await atIst('07:00', async () => {
        expect((await hookReq(pi, `evt_${ts}_k65`)).status).toBe(200);
        await PaymentReconciliationService.runOnce({ workerId: 'p10b-k65' });
      });
      const refund = await expectRefusedOutcome(c, pi, 'BATCH_STARTED');
      await atIst('07:05', async () => {
        expect((await hookReq(pi, `evt_${ts}_k65`)).status).toBe(200); // N: replay
        expect((await hookReq(pi, `evt_${ts}_k65b`)).status).toBe(200);
        await PaymentReconciliationService.runOnce({ workerId: 'p10b-k65b' });
        expect((await verifyReq(c, pi)).status).toBeLessThan(500); // and a late browser verification of the same capture
      });
      expect(await prisma.refund.count({ where: { orderId: c.sub.purchaseOrder.id } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { action: 'MESS_START_DAY_UNAVAILABLE_REFUNDED', entityId: c.sub.id } })).toBe(1);
      await finishRefund(refund.id, c.sub.purchaseOrder.id);
    });

    it('66. K: reconciliation discovers the capture (no webhook, no browser) after the batch started: identical outcome', async () => {
      const w = await world();
      await activateEarly(w);
      const c = await atIst('06:30', async () => sessionFor(w.b, await buyOk(w.b)));
      expect((await startBatch(w, 'LUNCH')).status).toBe(201);
      const pi = capture(c);
      await prisma.payment.update({ where: { id: c.attemptId }, data: { nextAttemptAt: new Date(Date.now() - 1000), lockedUntil: null } });
      await atIst('07:00', () => PaymentReconciliationService.runOnce({ workerId: 'p10b-k66' }));
      const refund = await expectRefusedOutcome(c, pi, 'BATCH_STARTED');
      await atIst('07:00', () => PaymentReconciliationService.runOnce({ workerId: 'p10b-k66b' }));
      expect(await prisma.refund.count({ where: { orderId: c.sub.purchaseOrder.id } })).toBe(1);
      await finishRefund(refund.id, c.sub.purchaseOrder.id);
    });

    it('67. L: settlement WINS before the batch freezes: the newly generated meal is attached when the batch starts', async () => {
      const w = await world();
      await activateEarly(w);
      const c = await atIst('06:30', async () => sessionFor(w.b, await buyOk(w.b)));
      const v = await atIst('06:40', () => verifyReq(c, capture(c)));
      expect(v.status, JSON.stringify(v.body)).toBe(200);
      expect((await subRow(c.sub.id)).status).toBe('ACTIVE');
      const st = await startBatch(w, 'LUNCH');
      expect(st.status, JSON.stringify(st.body)).toBe(201);
      expect(st.body.data.batch.mealCount).toBe(2); // a's meal AND b's freshly generated meal
      expect((await mealAt(c.sub.id, today, 'LUNCH')).batchId).toBe(st.body.data.batch.id);
      expect((await mealAt(c.sub.id, today, 'BREAKFAST')).batchId).toBeNull(); // its own slot has not started
    });

    it('68. M: the batch WINS: the same-day subscription never becomes ACTIVE and leaves no meal behind (covered end to end by test 64)', async () => {
      const w = await world();
      await activateEarly(w);
      const c = await atIst('06:30', async () => sessionFor(w.b, await buyOk(w.b)));
      const st = await startBatch(w, 'LUNCH');
      const pi = capture(c);
      await atIst('07:00', () => verifyReq(c, pi));
      expect((await subRow(c.sub.id)).status).not.toBe('ACTIVE');
      expect(await prisma.messMeal.count({ where: { messSubscriptionId: c.sub.id } })).toBe(0);
      expect(await prisma.messMeal.count({ where: { batchId: st.body.data.batch.id } })).toBe(1);
    });

    it('69. the (branch, date, slot) batch key is a real mutual-exclusion lock: batch start and settlement both WAIT while it is held, then proceed', async () => {
      const w = await world();
      await activateEarly(w);
      const c = await atIst('06:30', async () => sessionFor(w.b, await buyOk(w.b)));
      let release!: () => void;
      const held = new Promise<void>((r) => (release = r));
      let locked!: () => void;
      const lockedP = new Promise<void>((r) => (locked = r));
      const holder = prisma.$transaction(
        async (tx) => {
          await lockRow.batchKey(tx, w.branch.id, today, 'LUNCH');
          locked();
          await held;
        },
        { timeout: 20000 }
      );
      await lockedP;
      let startDone = false;
      let verifyDone = false;
      const pi = capture(c);
      const sP = startBatch(w, 'LUNCH').then((r) => ((startDone = true), r));
      const vP = atIst('06:40', () => verifyReq(c, pi)).then((r) => ((verifyDone = true), r));
      await new Promise((r) => setTimeout(r, 700));
      expect(startDone, 'batch start must wait for the key').toBe(false);
      expect(verifyDone, 'settlement must wait for the key').toBe(false);
      release();
      await holder;
      const [s, v] = await Promise.all([sP, vP]);
      expect(s.status, JSON.stringify(s.body)).toBeLessThan(300);
      expect(v.status, JSON.stringify(v.body)).toBe(200);
      // whichever went first, the invariant: never ACTIVE + a SCHEDULED unattached meal under an existing batch for that slot
      const sub = await subRow(c.sub.id);
      const lunch = await prisma.messMeal.findFirst({ where: { messSubscriptionId: c.sub.id, mealDate: dateFromString(today), slot: 'LUNCH' } });
      const batch = await prisma.messMealBatch.findFirstOrThrow({ where: { branchId: w.branch.id, mealDate: dateFromString(today), slot: 'LUNCH' } });
      if (sub.status === 'ACTIVE') expect(lunch?.batchId).toBe(batch.id);
      else expect(lunch).toBeNull();
    });

    it('70. I/J: webhook and browser settlement racing a batch start never leave ACTIVE + a stranded SCHEDULED meal under a frozen batch', async () => {
      for (const mode of ['webhook', 'verify', 'webhook', 'verify'] as const) {
        const w = await world();
        await activateEarly(w);
        const c = await atIst('06:30', async () => sessionFor(w.b, await buyOk(w.b)));
        const pi = capture(c);
        const [settle, st] = await atIst('07:00', () => Promise.all([mode === 'webhook' ? hookReq(pi, `evt_${ts}_k70_${wseq}`) : verifyReq(c, pi), startBatch(w, 'LUNCH')]));
        expect(settle.status, JSON.stringify(settle.body)).toBeLessThan(500);
        expect(st.status, JSON.stringify(st.body)).toBeLessThan(500);
        await atIst('07:00', () => PaymentReconciliationService.runOnce({ workerId: `p10b-k70-${wseq}` }));
        const sub = await subRow(c.sub.id);
        const batch = await prisma.messMealBatch.findFirstOrThrow({ where: { branchId: w.branch.id, mealDate: dateFromString(today), slot: 'LUNCH' } });
        const lunch = await prisma.messMeal.findFirst({ where: { messSubscriptionId: c.sub.id, mealDate: dateFromString(today), slot: 'LUNCH' } });
        if (sub.status === 'ACTIVE') {
          expect(lunch?.batchId, `${mode}: ACTIVE but its lunch meal is not in the frozen batch`).toBe(batch.id);
          expect(batch.mealCount).toBe(2);
          expect(await prisma.messMeal.count({ where: { batchId: batch.id } })).toBe(2);
        } else {
          expect(sub.status).toBe('CANCELLED');
          expect(lunch).toBeNull();
          expect(await prisma.messMeal.count({ where: { messSubscriptionId: c.sub.id } })).toBe(0);
          expect(await prisma.refund.count({ where: { orderId: c.sub.purchaseOrder.id } })).toBe(1);
          expect(batch.mealCount).toBe(1);
        }
      }
    }, 60000);

    it('71. O: a DIRECT order can never use the new system cancellation source (nor any Mess source)', async () => {
      const { OrderTransitionService } = await import('../modules/order/orderTransition.service.js');
      const direct = await prisma.order.create({ data: { orderNumber: `P10B-KD-${ts}`, totalAmount: 100, netAmount: 105, customerProfileId: who.c6.profileId!, status: 'CONFIRMED', paymentStatus: 'PAID', paymentMethod: 'ONLINE', orderType: 'DIRECT' } });
      for (const source of ['MESS_START_DAY_UNAVAILABLE', 'MESS_LATE_PAYMENT'] as const) {
        await expect(OrderTransitionService.transition({ orderId: direct.id, to: 'CANCELLED', actor: { kind: 'SYSTEM', source }, refundIntentId: randomUUID() })).rejects.toMatchObject({ errorCode: 'ORDER_TRANSITION_FORBIDDEN' });
      }
      expect((await prisma.order.findUniqueOrThrow({ where: { id: direct.id } })).status).toBe('CONFIRMED');
    });

    it('72. P: the P10A START_DATE_PASSED protection is unchanged (a past start date still refunds with its own trigger and reason)', async () => {
      const w = await world();
      const c = await atIst('06:30', async () => sessionFor(w.b, await buyOk(w.b, addDays(today, 3))));
      await prisma.messSubscription.update({ where: { id: c.sub.id }, data: { startDate: dateFromString(addDays(today, -1)), endDate: dateFromString(addDays(today, DAYS - 2)) } });
      const v = await verifyReq(c, capture(c));
      expect(v.status, JSON.stringify(v.body)).toBe(200);
      const refunds = await prisma.refund.findMany({ where: { orderId: c.sub.purchaseOrder.id } });
      expect(refunds).toHaveLength(1);
      expect(refunds[0]).toMatchObject({ trigger: 'MESS_START_DATE_PASSED', reasonCode: 'START_DATE_PASSED' });
      expect((await subRow(c.sub.id)).cancellationReasonCode).toBe('START_DATE_PASSED');
    });

    it('73. the same-day check lives in ONE place and the batch key lock order is documented in code: purchase, session, settlement and batch start all use it', () => {
      const code = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
      for (const f of ['modules/mess/messPurchase.service.ts', 'modules/payment/paymentSession.service.ts', 'modules/mess/messActivation.service.ts']) expect(code(f), f).toContain('firstDayProblem');
      expect(code('modules/mess/messKitchen.service.ts')).toContain('lockRow.batchKey');
      expect(code('modules/mess/messActivation.service.ts')).toMatch(/Order -> session -> ProviderPayment[^\n]*MessSubscription -> batch keys/);
    });
  });

  // =============================================================================================== I. DB integrity
  describe('I. database integrity', () => {
    it('50. a batched meal can never be paused/cancelled; batch and event vocabularies are enforced; completion is never set', async () => {
      const a = await activeSub('c5', 1);
      const meal = (await mealsOf(a.sub.id))[0];
      const batch = await prisma.messMealBatch.create({ data: { branchId: branchB.id, mealDate: dateFromString(addDays(today, 30)), slot: 'LUNCH', mealCount: 1, startedByUserId: who.chefB.id } });
      await prisma.messMeal.update({ where: { id: meal.id }, data: { batchId: batch.id } });
      await expect(prisma.messMeal.update({ where: { id: meal.id }, data: { status: 'PAUSED' } })).rejects.toThrow();
      await expect(prisma.messMeal.update({ where: { id: meal.id }, data: { status: 'CANCELLED' } })).rejects.toThrow();
      await expect(prisma.messMeal.update({ where: { id: meal.id }, data: { status: 'MAYBE' } })).rejects.toThrow();
      await expect(prisma.messMealBatch.update({ where: { id: batch.id }, data: { status: 'READY' } })).rejects.toThrow(); // READY needs readyAt + readyBy
      await expect(prisma.messMealBatch.create({ data: { branchId: branchB.id, mealDate: dateFromString(addDays(today, 30)), slot: 'LUNCH', mealCount: 1, startedByUserId: who.chefB.id } })).rejects.toThrow(); // unique branch+date+slot
      await expect(prisma.messMealEvent.create({ data: { messSubscriptionId: a.sub.id, mealId: meal.id, action: 'REFUND', actorUserId: who.c5.id, pausesUsedAfter: 0 } })).rejects.toThrow();
      await prisma.messMeal.update({ where: { id: meal.id }, data: { batchId: null } });
      await prisma.messMealBatch.delete({ where: { id: batch.id } });
    });

    it('51. P10B never completes a subscription: nothing in the Mess meal/kitchen code sets COMPLETED, and no subscription became COMPLETED', async () => {
      expect(await prisma.messSubscription.count({ where: { status: 'COMPLETED', messAccount: { customerProfile: { fullName: { startsWith: 'P10B ' } } } } })).toBe(0);
    });
  });

  // =============================================================================================== J. static guarantees
  describe('J. static guarantees', () => {
    const dir = join(__dirname, '..', 'modules', 'mess');
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const src = (f: string) => strip(readFileSync(join(dir, f), 'utf8'));

    it('52. the meal and kitchen modules do no financial work, create no commerce Order and never complete a subscription or fulfil a meal', () => {
      for (const f of ['messMeal.service.ts', 'messKitchen.service.ts', 'messKitchen.routes.ts']) {
        const s = src(f);
        expect(s, f).not.toMatch(/prisma\.order\.|tx\.order\.|\.payment\.|providerPayment|\.refund\.|walletAccount|walletTransaction|PaymentProvider|RefundService/);
        expect(s, f).not.toMatch(/COMPLETED|FULFILLED'|MEAL_STATUS\.FULFILLED|CONSUMED'/);
        expect(s, f).not.toMatch(/\bCOD\b|cash|refundAmount/i);
        expect(s, f).not.toMatch(/deliveryAssignment|kitchenOrderTicket|orderTransition/i);
      }
    });

    it('53. the append-only evidence table is only ever inserted into (no update / delete anywhere in production code)', () => {
      const root = join(__dirname, '..');
      const hits: string[] = [];
      const walk = (d: string) => {
        for (const n of readdirSync(d, { withFileTypes: true })) {
          const p = join(d, n.name);
          if (n.isDirectory()) {
            if (n.name !== 'tests') walk(p);
          } else if (n.name.endsWith('.ts') && /messMealEvent\.(update|updateMany|delete|deleteMany|upsert)/.test(strip(readFileSync(p, 'utf8')))) hits.push(n.name);
        }
      };
      walk(root);
      expect(hits).toEqual([]);
    });

    it('54. the Mess kitchen has its own permission pair: CHEF holds write, SUPER_ADMIN and MD hold read only', () => {
      const perms = readFileSync(join(__dirname, '..', 'authz', 'permissions.ts'), 'utf8');
      expect(perms).toMatch(/\[RoleEnum\.CHEF\]: \[[^\]]*'mess:kitchen:write'/);
      expect(perms.match(/mess:kitchen:write/g)).toHaveLength(2); // the type + CHEF only
    });

    it('55. calendar pause actions are generation-independent: there is no HTTP route that generates meals', () => {
      for (const f of ['mess.routes.ts', 'messAdmin.routes.ts', 'messKitchen.routes.ts']) expect(src(f), f).not.toMatch(/generateInTx|backfillSubscription/);
    });
  });
});

