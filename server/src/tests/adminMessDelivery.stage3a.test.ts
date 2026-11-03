import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
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
import { addDays, businessDate, dateFromString, dateToString, endOfBusinessDate } from '../modules/mess/messPolicy.js';
import { MessCompletionService } from '../modules/mess/messCompletion.service.js';
import { MessDeliveryService } from '../modules/mess/messDelivery.service.js';
import { pauseDeadline, withinPauseWindow } from '../modules/mess/messMeal.service.js';
import { generateHandoverCode, hashHandoverCode } from '../modules/mess/messHandoverCode.js';
import { hashCode as p9HashCode } from '../modules/delivery/deliveryProof.service.js';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const mock = getPaymentProvider() as MockPaymentProvider;
const PASSWORD = 'S3a#Admin-Pass-2026-xyz';
const sign = (userId: string, email: string, roles: RoleEnum[]) => jwt.sign({ userId, email, roles }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '2d' });
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('Stage 3a - SUPER_ADMIN operation of Kerala Mess delivery (claim, dispatch, takeover, handover, failure, retry)', () => {
  const ts = Date.now();
  let seq = 0;
  type Who = { id: string; email: string; profileId?: string; employeeId?: string; token: string };
  const who: Record<string, Who> = {};
  let step = '';
  const today = businessDate();
  const key = () => `s3am-${ts}-${++seq}-${randomUUID().slice(0, 8)}`;
  let plan1: { id: string }; // ONE day  -> ONE meal (LUNCH 13:00)
  let plan2: { id: string }; // two days -> two meals
  let plan5: { id: string }; // five days -> five meals
  let wseq = 0;

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
  const atInstant = async <T>(iso: string, fn: () => Promise<T>): Promise<T> => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(iso));
    try {
      return await fn();
    } finally {
      vi.useRealTimers();
    }
  };

  async function mkUser(label: string, roles: RoleEnum[], branches: string[] = []): Promise<Who> {
    const email = `s3am_${label}_${ts}@test.com`;
    const customer = roles.includes(RoleEnum.CUSTOMER) || roles.includes(RoleEnum.MESS_CUSTOMER);
    const staff = !customer && roles.some((r) => r !== RoleEnum.SUPER_ADMIN);
    const u = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(PASSWORD, 4),
        roles: { create: roles.map((role) => ({ role })) },
        ...(customer ? { customerProfile: { create: { fullName: `S3AM ${label}`, referralCode: `PB-S3M${label.toUpperCase()}${ts}` } } } : {}),
        ...(staff ? { employeeProfile: { create: { employeeCode: `S3AM-${label}-${ts}`, fullName: `Staff ${label}`, designation: 'Test', assignedBranchId: branches[0] ?? null } } } : {})
      },
      include: { customerProfile: true, employeeProfile: true }
    });
    if (u.employeeProfile) for (const b of branches) await prisma.employeeBranchAssignment.create({ data: { employeeProfileId: u.employeeProfile.id, branchId: b } });
    who[label] = { id: u.id, email, profileId: u.customerProfile?.id, employeeId: u.employeeProfile?.id, token: sign(u.id, email, roles) };
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

  async function mkPlan(over: Record<string, unknown> = {}) {
    const c = await admin('post', '/mess/plans', { code: `S3AM-${ts}-${++seq}`, name: 'S3AM Plan', durationDays: 1, basePrice: '100.00', taxRate: '0.0500', mealSlots: ['LUNCH'], pauseCutoffHours: 2, maxPauses: 3, minStartLeadDays: 0, slotTimes: { LUNCH: '13:00' }, ...over });
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

  /** A private world: one branch, two service points, one CHEF, two drivers, residents a1/a2 (service point 1) and b1 (service point 2). */
  async function world() {
    const n = ++wseq;
    const branch = await prisma.kitchenBranch.create({ data: { code: `S3AM-W${n}-${ts}`, name: `W${n}`, address: 'W', city: 'Kochi' } });
    const mkSp = async (tag: string, extra: Record<string, unknown> = {}) => {
      const r = await admin('post', '/mess/service-points', { code: `W${n}${tag}-${ts}`, name: `Hostel W${n}${tag}`, addressLine: `${n} Campus Road`, city: 'Kochi', postalCode: '682001', branchId: branch.id, ...extra });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      return r.body.data.servicePoint as { id: string; version: number; name: string };
    };
    const sp1 = await mkSp('A', { gateLabel: 'Gate 1', deliveryInstructions: 'Ring the bell twice' });
    const sp2 = await mkSp('B');
    const w = { n, branch, sp1, sp2, chef: `wchef${n}`, d1: `wd1${n}`, d2: `wd2${n}`, a1: `wa1${n}`, a2: `wa2${n}`, b1: `wb1${n}` };
    await mkUser(w.chef, [RoleEnum.CHEF], [branch.id]);
    await mkUser(w.d1, [RoleEnum.DELIVERY], [branch.id]);
    await mkUser(w.d2, [RoleEnum.DELIVERY], [branch.id]);
    for (const [l, sp] of [[w.a1, sp1], [w.a2, sp1], [w.b1, sp2]] as const) {
      await mkUser(l, [RoleEnum.CUSTOMER]);
      await approve(l, sp.id);
    }
    return w;
  }
  type World = Awaited<ReturnType<typeof world>>;

  const subRow = (id: string) => prisma.messSubscription.findUniqueOrThrow({ where: { id } });
  const mealAt = (subId: string, date: string, slot = 'LUNCH') => prisma.messMeal.findFirstOrThrow({ where: { messSubscriptionId: subId, mealDate: dateFromString(date), slot } });
  const mealsOf = (subId: string) => prisma.messMeal.findMany({ where: { messSubscriptionId: subId }, orderBy: { mealDate: 'asc' } });

  async function activate(label: string, planId: string, offset = 0) {
    return await (offset === 0 ? morning : (fn: () => Promise<unknown>) => fn())(async () => {
      await prisma.messSubscription.updateMany({ where: { messAccount: { customerProfileId: who[label].profileId! }, status: { in: ['PENDING_PAYMENT', 'ACTIVE'] } }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      const b = await send('post', '/api/v1/mess/subscriptions', who[label].token, { planId, startDate: addDays(today, offset) }, { key: key() });
      expect(b.status, JSON.stringify(b.body)).toBe(201);
      const sub = b.body.data.subscription as { id: string; purchaseOrder: { id: string } };
      const s = await send('post', `/api/v1/orders/${sub.purchaseOrder.id}/payment-attempts`, who[label].token, {});
      expect(s.status, JSON.stringify(s.body)).toBe(200);
      const pi = mock.simulatePayment(s.body.data.providerOrderId, { status: 'CAPTURED' });
      const v = await send('post', `/api/v1/orders/${sub.purchaseOrder.id}/payment-attempts/${s.body.data.attemptId}/verify`, who[label].token, { providerOrderId: s.body.data.providerOrderId, providerPaymentId: pi.providerPaymentId, signature: mock.signCheckout(s.body.data.providerOrderId, pi.providerPaymentId) });
      expect(v.status, JSON.stringify(v.body)).toBe(200);
      return sub;
    }) as { id: string; purchaseOrder: { id: string } };
  }

  const startBatch = (w: World, slot = 'LUNCH') => send('post', '/api/v1/mess/kitchen/batches', who[w.chef].token, { branchId: w.branch.id, mealDate: today, slot });
  const readyReq = (label: string, id: string) => send('post', `/api/v1/mess/kitchen/batches/${id}/ready`, who[label].token, {});
  const releaseReq = (label: string, id: string, body: unknown = {}) => send('post', `/api/v1/mess/kitchen/batches/${id}/release`, who[label].token, body);
  const dget = (label: string, path: string) => get(`/api/v1/mess/delivery${path}`, who[label].token);
  const dpost = (label: string, path: string, body: unknown = {}) => send('post', `/api/v1/mess/delivery${path}`, who[label].token, body);
  const claim = (label: string, runId: string) => dpost(label, `/runs/${runId}/claim`);
  const dispatch = (label: string, runId: string) => dpost(label, `/runs/${runId}/dispatch`);
  /** B2a: legacy driver-owned state is written directly (the driver HTTP surface no longer exists). */
  const legacyClaim = async (label: string, runId: string) => {
    await prisma.messDeliveryRun.update({ where: { id: runId }, data: { status: 'CLAIMED', claimedByEmployeeId: who[label].employeeId!, claimedAt: new Date() } });
    return { status: 200 };
  };
  const legacyDispatch = async (_label: string, runId: string) => {
    await prisma.messDeliveryRun.update({ where: { id: runId }, data: { status: 'IN_TRANSIT', dispatchedAt: new Date() } });
    return { status: 200 };
  };
  /** The former driver's own handover of a stop (history that a takeover must keep). */
  const legacyHandover = async (label: string, stopId: string) => {
    await prisma.messDeliveryStop.update({ where: { id: stopId }, data: { status: 'HANDED_OVER', handedOverAt: new Date(), handoverMethod: 'CODE', handedOverByEmployeeId: who[label].employeeId! } });
    await prisma.messMeal.updateMany({ where: { deliveryStopId: stopId, status: 'SCHEDULED' }, data: { status: 'FULFILLED', fulfilledAt: new Date() } });
    return { status: 200 };
  };
  const failStop = (label: string, runId: string, stopId: string, body: unknown = { reasonCode: 'RECIPIENT_UNAVAILABLE' }) => dpost(label, `/runs/${runId}/stops/${stopId}/fail`, body);
  const retryStop = (label: string, runId: string, stopId: string) => dpost(label, `/runs/${runId}/stops/${stopId}/retry`);
  const codeUrl = (subId: string, mealId: string) => `/api/v1/mess/subscriptions/${subId}/meals/${mealId}/handover-code`;
  const issue = (label: string, subId: string, mealId: string) => send('post', codeUrl(subId, mealId), who[label].token, {});
  const regen = (label: string, subId: string, mealId: string) => send('post', `${codeUrl(subId, mealId)}/regenerate`, who[label].token, {});
  const codeState = (label: string, subId: string, mealId: string) => get(codeUrl(subId, mealId), who[label].token);
  const wrongCode = (code: string) => (code === '000000' ? '111111' : '000000');

  type Subs = Record<string, { id: string; purchaseOrder: { id: string } }>;
  /** Residents activated for TODAY, batch started + READY, then released by the CHEF. */
  async function released(w: World, planId = plan1.id) {
    const subs: Subs = {};
    for (const l of [w.a1, w.a2, w.b1]) subs[l] = await activate(l, planId);
    const st = await startBatch(w);
    expect(st.status, JSON.stringify(st.body)).toBe(201);
    const batchId = st.body.data.batch.id as string;
    expect((await readyReq(w.chef, batchId)).status).toBe(200);
    const rel = await releaseReq(w.chef, batchId);
    expect(rel.status, JSON.stringify(rel.body)).toBe(201);
    const run = rel.body.data.run as { id: string; stops: Array<{ id: string; servicePoint: { name: string }; expectedQuantity: number }> };
    const stopA = run.stops.find((s) => s.servicePoint.name === w.sp1.name)!;
    const stopB = run.stops.find((s) => s.servicePoint.name === w.sp2.name)!;
    return { subs, batchId, run, stopA, stopB, runId: run.id };
  }
  async function dispatched(w: World, planId = plan1.id) {
    const r = await released(w, planId);
    expect((await legacyClaim(w.d1, r.runId)).status).toBe(200);
    expect((await legacyDispatch(w.d1, r.runId)).status).toBe(200);
    return r;
  }
  /** a1 asks for the code of stop A; returns the plaintext (the ONLY place it ever appears). */
  async function codeFor(w: World, r: Awaited<ReturnType<typeof released>>, label = w.a1) {
    const meal = await mealAt(r.subs[label].id, today);
    const res = await issue(label, r.subs[label].id, meal.id);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return { code: res.body.data.code as string, meal };
  }
  const stopRow = (id: string) => prisma.messDeliveryStop.findUniqueOrThrow({ where: { id } });
  const runRow = (id: string) => prisma.messDeliveryRun.findUniqueOrThrow({ where: { id } });
  const audits = (action: string, entityId: string) => prisma.auditLog.findMany({ where: { action, entityId } });
  async function quiesce() {
    await prisma.payment.updateMany({ where: { provider: { not: null } }, data: { nextAttemptAt: null, lockedUntil: null, lockedBy: null } });
    await prisma.paymentWebhookEvent.updateMany({ where: { status: { in: ['RECEIVED', 'RETRY_PENDING'] } }, data: { status: 'IGNORED', ignoredReason: 'TEST_CLEANUP', lockedUntil: null } });
    await prisma.refund.updateMany({ where: { status: { in: ['REQUESTED', 'SUBMITTING', 'UNKNOWN', 'PROCESSING'] } }, data: { nextAttemptAt: null, lockedUntil: null, lockedBy: null } });
  }

  beforeAll(async () => {
    await mkUser('admin', [RoleEnum.SUPER_ADMIN]);
    await mkUser('admin2', [RoleEnum.SUPER_ADMIN]);
    await mkUser('md', [RoleEnum.MD]);
    await mkUser('legacy', [RoleEnum.MESS_CUSTOMER]);
    await mkUser('outsider', [RoleEnum.CUSTOMER]);
    const otherBranch = await prisma.kitchenBranch.create({ data: { code: `S3AM-X-${ts}`, name: 'X', address: 'X', city: 'Kochi' } });
    await mkUser('chefX', [RoleEnum.CHEF], [otherBranch.id]);
    await mkUser('driverX', [RoleEnum.DELIVERY], [otherBranch.id]);
    const r = await request(app).post('/api/v1/admin/step-up').set(bearer(who.admin.token)).send({ password: PASSWORD });
    step = r.body.data.stepUpToken;
    const r2 = await request(app).post('/api/v1/admin/step-up').set(bearer(who.admin2.token)).send({ password: PASSWORD });
    step2 = r2.body.data.stepUpToken;
    plan1 = await mkPlan();
    plan2 = await mkPlan({ durationDays: 2 });
    plan5 = await mkPlan({ durationDays: 5 });
    await quiesce();
  }, 60000);
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

  // =============================================================================================== SUPER_ADMIN operation of Kerala Mess delivery
  const adm = (path: string, body: unknown = {}, label = 'admin', stepToken: string | null | undefined = undefined) => {
    const r = request(app).post(`/api/v1/admin/mess/delivery${path}`).set(bearer(who[label].token));
    const s = stepToken === undefined ? (label === 'admin' ? step : step2) : stepToken;
    return (s ? r.set('x-step-up-token', s) : r).send(body as object);
  };
  const aClaim = (runId: string, label = 'admin') => adm(`/runs/${runId}/claim`, {}, label);
  const aDispatch = (runId: string, label = 'admin') => adm(`/runs/${runId}/dispatch`, {}, label);
  const aTakeover = (runId: string, body: Record<string, unknown> = {}, label = 'admin') => adm(`/runs/${runId}/takeover`, { reason: 'Driver account retired', ...body }, label);
  const aVerify = (runId: string, stopId: string, code: unknown, label = 'admin') => adm(`/runs/${runId}/stops/${stopId}/verify`, { code }, label);
  const aFail = (runId: string, stopId: string, body: unknown = { reasonCode: 'RECIPIENT_UNAVAILABLE' }, label = 'admin') => adm(`/runs/${runId}/stops/${stopId}/fail`, body, label);
  const aRetry = (runId: string, stopId: string, label = 'admin') => adm(`/runs/${runId}/stops/${stopId}/retry`, {}, label);
  let step2 = '';
  const mealsOfStop = (stopId: string) => prisma.messMeal.findMany({ where: { deliveryStopId: stopId } });
  const text = (res: { body: unknown }) => JSON.stringify(res.body);

  describe('S1. authorization and step-up', () => {
    it('1. every endpoint refuses anonymous (401) and every non-administrator (403) and changes nothing', async () => {
      const w = await world();
      const r = await released(w);
      const calls: Array<[string, unknown]> = [
        [`/runs/${r.runId}/claim`, {}],
        [`/runs/${r.runId}/dispatch`, {}],
        [`/runs/${r.runId}/takeover`, { expectedEmployeeId: randomUUID(), reason: 'reason' }],
        [`/runs/${r.runId}/stops/${r.stopA.id}/verify`, { code: '123456' }],
        [`/runs/${r.runId}/stops/${r.stopA.id}/fail`, { reasonCode: 'OTHER', note: 'x' }],
        [`/runs/${r.runId}/stops/${r.stopA.id}/retry`, {}]
      ];
      for (const [p, body] of calls) {
        expect((await request(app).post(`/api/v1/admin/mess/delivery${p}`).send(body as object)).status, `anon ${p}`).toBe(401);
        for (const l of [w.d1, w.chef, w.a1, 'md']) {
          const res = await send('post', `/api/v1/admin/mess/delivery${p}`, who[l].token, body);
          expect([l, p, res.status]).toEqual([l, p, 403]);
        }
      }
      expect(await runRow(r.runId)).toMatchObject({ status: 'AVAILABLE', claimedByEmployeeId: null, claimedByUserId: null });
    });

    it('2. EVERY action needs a fresh step-up proof; strict bodies reject status / payment / meal fields', async () => {
      const w = await world();
      const r = await dispatched(w);
      const calls: Array<[string, unknown]> = [
        [`/runs/${r.runId}/claim`, {}], [`/runs/${r.runId}/dispatch`, {}], [`/runs/${r.runId}/takeover`, { expectedEmployeeId: who[w.d1].employeeId, reason: 'reason' }],
        [`/runs/${r.runId}/stops/${r.stopA.id}/verify`, { code: '123456' }], [`/runs/${r.runId}/stops/${r.stopA.id}/fail`, { reasonCode: 'OTHER', note: 'x' }], [`/runs/${r.runId}/stops/${r.stopA.id}/retry`, {}]
      ];
      for (const [p, body] of calls) {
        const none = await adm(p, body, 'admin', null);
        expect([p, none.status, none.body.error]).toEqual([p, 403, 'STEP_UP_REQUIRED']);
        expect((await adm(p, body, 'admin', 'not-a-proof')).status, p).toBe(403);
      }
      for (const extra of [{ status: 'COMPLETED' }, { amount: 1 }, { mealCount: 9 }]) expect((await adm(`/runs/${r.runId}/dispatch`, extra)).status, JSON.stringify(extra)).toBe(422);
      expect(await runRow(r.runId)).toMatchObject({ status: 'IN_TRANSIT', claimedByEmployeeId: who[w.d1].employeeId });
    });
  });

  describe('S2. claim, dispatch and takeover', () => {
    it('3. claim: AVAILABLE -> CLAIMED by the administrator (no employee); replay by another administrator is changed:false; a driver then cannot claim it', async () => {
      const w = await world();
      const r = await released(w);
      const c = await aClaim(r.runId);
      expect(c.status, text(c)).toBe(200);
      expect(c.body.data.changed).toBe(true);
      expect(c.body.data.run).toMatchObject({ status: 'CLAIMED', operator: 'ADMIN', driver: null });
      expect(await runRow(r.runId)).toMatchObject({ status: 'CLAIMED', claimedByEmployeeId: null, claimedByUserId: who.admin.id, takenOverFromEmployeeId: null });
      const a = await audits('MESS_RUN_CLAIMED', r.runId);
      expect(a).toHaveLength(1);
      expect(a[0].userId).toBe(who.admin.id);
      const again = await aClaim(r.runId, 'admin2');
      expect([again.status, again.body.data.changed]).toEqual([200, false]);
      const driver = await claim(w.d1, r.runId);
      expect(driver.status).toBe(404); // B2a: the driver claim route is gone
      expect(await runRow(r.runId)).toMatchObject({ claimedByEmployeeId: null, claimedByUserId: who.admin.id });
    });

    it('4. dispatch: CLAIMED -> IN_TRANSIT by the owner administrators; refused for an unclaimed run and for a run a driver owns', async () => {
      const w = await world();
      const r = await released(w);
      expect((await aDispatch(r.runId)).body.error).toBe('RUN_NOT_OPERATED');
      await aClaim(r.runId);
      const d = await aDispatch(r.runId);
      expect([d.status, d.body.data.changed, d.body.data.run.status]).toEqual([200, true, 'IN_TRANSIT']);
      expect((await runRow(r.runId)).dispatchedAt).toBeTruthy();
      expect((await aDispatch(r.runId, 'admin2')).body.data.changed).toBe(false);
      const w2 = await world();
      const r2 = await released(w2);
      expect((await legacyClaim(w2.d1, r2.runId)).status).toBe(200);
      const owned = await aDispatch(r2.runId);
      expect([owned.status, owned.body.error]).toEqual([409, 'RUN_OWNED_BY_DRIVER']);
      expect((await aClaim(r2.runId)).body.error).toBe('RUN_OWNED_BY_DRIVER');
    });

    it('5. takeover moves ONLY the live run: status and timestamps untouched, previous driver recorded, history of already handed-over stops keeps its employee; the driver loses access at once', async () => {
      const w = await world();
      const r = await dispatched(w);
      await codeFor(w, r);
      expect((await legacyHandover(w.d1, r.stopA.id)).status).toBe(200); // the driver handed over stop A BEFORE the takeover
      const before = await runRow(r.runId);
      const t = await aTakeover(r.runId, { expectedEmployeeId: who[w.d1].employeeId });
      expect(t.status, text(t)).toBe(200);
      expect(t.body.data.changed).toBe(true);
      const after = await runRow(r.runId);
      expect(after).toMatchObject({ status: 'IN_TRANSIT', claimedByEmployeeId: null, claimedByUserId: who.admin.id, takenOverFromEmployeeId: who[w.d1].employeeId });
      expect(after.claimedAt?.getTime()).toBe(before.claimedAt?.getTime());
      expect(after.dispatchedAt?.getTime()).toBe(before.dispatchedAt?.getTime());
      expect(await stopRow(r.stopA.id)).toMatchObject({ status: 'HANDED_OVER', handedOverByEmployeeId: who[w.d1].employeeId, handedOverByUserId: null });
      const a = await audits('MESS_RUN_TAKEN_OVER', r.runId);
      expect(a).toHaveLength(1);
      expect(a[0].userId).toBe(who.admin.id);
      // the former driver is shut out
      expect((await dget(w.d1, `/runs/${r.runId}`)).status).toBe(404);
      expect((await failStop(w.d1, r.runId, r.stopB.id)).status).toBe(404);
      const mine = await dget(w.d1, '/runs');
      expect(JSON.stringify(mine.body)).not.toContain(r.runId);
    });

    it('6. takeover guards: stale expected owner 409, replay changed:false, short reason 422, AVAILABLE / COMPLETED runs are not takeover-eligible, one effect under concurrency', async () => {
      const w = await world();
      const r = await dispatched(w);
      const stale = await aTakeover(r.runId, { expectedEmployeeId: who[w.d2].employeeId });
      expect([stale.status, stale.body.error]).toEqual([409, 'RUN_OWNER_CHANGED']);
      expect((await aTakeover(r.runId, { expectedEmployeeId: who[w.d1].employeeId, reason: 'ab' })).status).toBe(422);
      const [a, b] = await Promise.all([aTakeover(r.runId, { expectedEmployeeId: who[w.d1].employeeId }, 'admin'), aTakeover(r.runId, { expectedEmployeeId: who[w.d1].employeeId }, 'admin2')]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect([a.body.data.changed, b.body.data.changed].filter(Boolean)).toHaveLength(1);
      expect(await audits('MESS_RUN_TAKEN_OVER', r.runId)).toHaveLength(1);
      const w2 = await world();
      const avail = await released(w2);
      expect((await aTakeover(avail.runId, { expectedEmployeeId: who[w2.d1].employeeId })).body.error).toBe('RUN_NOT_TAKEOVER_ELIGIBLE');
    });
  });

  describe('S3. handover, failure and retry by the administrator', () => {
    it('7. a valid resident code hands the stop over: HANDED_OVER by the administrator (no employee), EXACTLY the stop\'s meals FULFILLED, the run completes and the subscriptions complete; no money moves', async () => {
      const w = await world();
      const r = await released(w);
      expect((await aClaim(r.runId)).status).toBe(200);
      expect((await aDispatch(r.runId)).status).toBe(200);
      const paymentsBefore = await prisma.payment.count();
      const refundsBefore = await prisma.refund.count();
      const walletBefore = await prisma.walletTransaction.count();
      const { code } = await codeFor(w, r);
      const v = await aVerify(r.runId, r.stopA.id, code);
      expect(v.status, text(v)).toBe(200);
      expect(v.body.data.changed).toBe(true);
      expect(text(v)).not.toContain(code);
      expect(await stopRow(r.stopA.id)).toMatchObject({ status: 'HANDED_OVER', handoverMethod: 'CODE', handedOverByEmployeeId: null, handedOverByUserId: who.admin.id });
      const mealsA = await mealsOfStop(r.stopA.id);
      expect(mealsA.length).toBe(2);
      expect(mealsA.every((m) => m.status === 'FULFILLED' && m.fulfilledAt)).toBe(true);
      expect((await mealsOfStop(r.stopB.id)).every((m) => m.status === 'SCHEDULED')).toBe(true); // the other stop is untouched
      const a = await audits('MESS_STOP_HANDED_OVER', r.stopA.id);
      expect(a).toHaveLength(1);
      expect(a[0].userId).toBe(who.admin.id);
      expect(JSON.stringify(a[0].payload)).not.toContain(code);
      // the other stop (resident b1) completes the run
      const meal = await mealAt(r.subs[w.b1].id, today);
      const issued = await issue(w.b1, r.subs[w.b1].id, meal.id);
      expect(issued.status).toBe(201);
      expect((await aVerify(r.runId, r.stopB.id, issued.body.data.code)).status).toBe(200);
      expect((await runRow(r.runId)).status).toBe('COMPLETED');
      expect((await subRow(r.subs[w.a1].id)).status).toBe('COMPLETED');
      expect(await prisma.payment.count()).toBe(paymentsBefore);
      expect(await prisma.refund.count()).toBe(refundsBefore);
      expect(await prisma.walletTransaction.count()).toBe(walletBefore);
      // replay by the same administrator with the right code is changed:false; another administrator is refused
      const again = await aVerify(r.runId, r.stopA.id, code);
      expect([again.status, again.body.data.changed]).toEqual([200, false]);
      expect((await aVerify(r.runId, r.stopA.id, code, 'admin2')).body.error).toBe('ALREADY_HANDED_OVER');
    });

    it('8. wrong codes are counted by the database exactly like the driver path: 5 -> lock; parallel guesses count exactly 5; the lock refuses even the right code', async () => {
      const w = await world();
      const r = await released(w);
      await aClaim(r.runId);
      await aDispatch(r.runId);
      const { code } = await codeFor(w, r);
      const bad = wrongCode(code);
      const first = await aVerify(r.runId, r.stopA.id, bad);
      expect([first.status, first.body.error]).toEqual([422, 'INVALID_HANDOVER_CODE']);
      await Promise.all(Array.from({ length: 9 }, () => aVerify(r.runId, r.stopA.id, bad)));
      const stop = await stopRow(r.stopA.id);
      expect(stop.lockCycles).toBe(1);
      expect(stop.failedCodeAttempts).toBe(0);
      expect(await audits('MESS_HANDOVER_VERIFY_FAILED', r.stopA.id)).toHaveLength(5);
      const locked = await aVerify(r.runId, r.stopA.id, code);
      expect([locked.status, locked.body.error]).toEqual([409, 'HANDOVER_CODE_LOCKED']);
      expect((await stopRow(r.stopA.id)).status).toBe('PENDING');
      for (const bogus of ['12345', 'abcdef', '']) expect((await aVerify(r.runId, r.stopA.id, bogus)).status, bogus).toBe(422);
    });

    it('9. nothing is handed over without a valid code: no code issued, run not on the road, a run a driver owns', async () => {
      const w = await world();
      const r = await released(w);
      await aClaim(r.runId);
      expect((await aVerify(r.runId, r.stopA.id, '123456')).body.error).toBe('RUN_NOT_IN_TRANSIT');
      await aDispatch(r.runId);
      expect((await aVerify(r.runId, r.stopA.id, '123456')).body.error).toBe('HANDOVER_CODE_NOT_ISSUED');
      expect((await stopRow(r.stopA.id)).status).toBe('PENDING');
      const w2 = await world();
      const d = await dispatched(w2);
      expect((await aVerify(d.runId, d.stopA.id, '123456')).body.error).toBe('RUN_OWNED_BY_DRIVER');
      expect((await aFail(d.runId, d.stopA.id)).body.error).toBe('RUN_OWNED_BY_DRIVER');
      expect((await aRetry(d.runId, d.stopA.id)).body.error).toBe('RUN_OWNED_BY_DRIVER');
    });

    it('10. fail -> retry: failing keeps the meals SCHEDULED and kills the code; retry reopens the stop (attempt + 1) and is refused beyond the third attempt', async () => {
      const w = await world();
      const r = await released(w);
      await aClaim(r.runId);
      await aDispatch(r.runId);
      const { code } = await codeFor(w, r);
      const f = await aFail(r.runId, r.stopA.id, { reasonCode: 'SERVICE_POINT_CLOSED' });
      expect(f.status, text(f)).toBe(200);
      expect(f.body.data.changed).toBe(true);
      expect(await stopRow(r.stopA.id)).toMatchObject({ status: 'FAILED', lastFailureCode: 'SERVICE_POINT_CLOSED', codeHash: null });
      expect((await mealsOfStop(r.stopA.id)).every((m) => m.status === 'SCHEDULED')).toBe(true);
      expect((await aFail(r.runId, r.stopA.id, { reasonCode: 'OTHER', note: 'later' }, 'admin2')).body.data.changed).toBe(false);
      expect((await aVerify(r.runId, r.stopA.id, code)).body.error).toBe('STOP_FAILED');
      expect((await aRetry(r.runId, r.stopA.id)).body.data.changed).toBe(true);
      expect(await stopRow(r.stopA.id)).toMatchObject({ status: 'PENDING', attemptCount: 2, codeHash: null, recipientCustomerProfileId: null });
      expect((await aRetry(r.runId, r.stopA.id)).body.data.changed).toBe(false); // already open
      await aFail(r.runId, r.stopA.id);
      await aRetry(r.runId, r.stopA.id);
      await aFail(r.runId, r.stopA.id);
      expect((await stopRow(r.stopA.id)).attemptCount).toBe(3);
      expect((await aRetry(r.runId, r.stopA.id)).body.error).toBe('DELIVERY_ATTEMPT_LIMIT_REACHED');
      expect((await aFail(r.runId, r.stopA.id, { reasonCode: 'NOT_A_REASON' })).status).toBe(422);
    });

    it('11. after a takeover the administrator completes the stops of the former driver\'s run (mixed history: the driver\'s stop keeps its employee)', async () => {
      const w = await world();
      const r = await dispatched(w);
      await codeFor(w, r);
      expect((await legacyHandover(w.d1, r.stopA.id)).status).toBe(200);
      expect((await aTakeover(r.runId, { expectedEmployeeId: who[w.d1].employeeId })).status).toBe(200);
      const meal = await mealAt(r.subs[w.b1].id, today);
      const issued = await issue(w.b1, r.subs[w.b1].id, meal.id);
      expect((await aVerify(r.runId, r.stopB.id, issued.body.data.code)).status).toBe(200);
      expect(await stopRow(r.stopA.id)).toMatchObject({ handedOverByEmployeeId: who[w.d1].employeeId, handedOverByUserId: null });
      expect(await stopRow(r.stopB.id)).toMatchObject({ handedOverByEmployeeId: null, handedOverByUserId: who.admin.id });
      expect((await runRow(r.runId)).status).toBe('COMPLETED');
    });

    it('12. the monitor shows operator ADMIN (no driver) and the exceptional override keeps working on an administrator-operated run', async () => {
      const w = await world();
      const r = await released(w);
      await aClaim(r.runId);
      await aDispatch(r.runId);
      const m = await get(`/api/v1/mess/delivery/monitor?branchId=${w.branch.id}`, who.admin.token);
      expect(m.status, text(m)).toBe(200);
      const run = m.body.data.runs.find((x: { id: string }) => x.id === r.runId);
      expect(run).toMatchObject({ operator: 'ADMIN', driver: null, status: 'IN_TRANSIT' });
      expect(text(m)).not.toMatch(/codeHash|recipient/);
      const ov = await send('post', `/api/v1/admin/mess/delivery/stops/${r.stopB.id}/override`, who.admin.token, { reasonCode: 'OPERATIONAL_EXCEPTION', note: 'Hostel office confirmed by phone', confirm: true }, { step });
      expect(ov.status, text(ov)).toBe(200);
      expect(await stopRow(r.stopB.id)).toMatchObject({ status: 'HANDED_OVER', handoverMethod: 'ADMIN_OVERRIDE', overrideByUserId: who.admin.id });
    });
  });

  describe('S4. static guarantees', () => {
    it('13. the admin Mess routes are all step-up guarded; no payment / refund / cash / wallet concept is named; the driver routes are gone', () => {
      const dir = join(__dirname, '..', 'modules', 'mess');
      const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      const routes = strip(readFileSync(join(dir, 'messDeliveryOperate.routes.ts'), 'utf8'));
      const chunks = routes.split('router.post(').slice(1);
      expect(chunks).toHaveLength(6);
      for (const c of chunks) expect(c.slice(0, 400)).toMatch(/\.\.\.write\(|requireStepUp\(/);
      expect(routes).toMatch(/requirePermission\('mess:delivery:operate'\)/);
      expect(routes).not.toMatch(/\bcod\b|cash|wallet|createRefund|refund\.(create|update)|getPaymentProvider|payment\.(update|create)/i);
      const driverRoutes = strip(readFileSync(join(dir, 'messDelivery.routes.ts'), 'utf8'));
      expect(driverRoutes).not.toMatch(/DELIVERY/); // B2a: only the SUPER_ADMIN monitor remains
      expect(driverRoutes.match(/router\.(get|post|put|patch|delete)\(/g)).toHaveLength(1);
    });
  });

  describe('S5. B1.1 - the monitor carries the owning driver employee id (SUPER_ADMIN only) so a takeover can be requested from the screen', () => {
    const monitorOf = async (w: { branch: { id: string } }, token = who.admin.token) => get(`/api/v1/mess/delivery/monitor?branchId=${w.branch.id}`, token);
    const runIn = (m: { body: { data: { runs: Array<{ id: string; driver: Record<string, unknown> | null; operator: string | null }> } } }, runId: string) => m.body.data.runs.find((x) => x.id === runId)!;

    it('14. contract: a driver-owned run shows driver {employeeId, name, employeeCode} (exactly these keys); an unclaimed run shows null; an administrator-operated run shows null + operator ADMIN', async () => {
      const w = await world();
      const free = await released(w);
      const m0 = await monitorOf(w);
      expect(m0.status, text(m0)).toBe(200);
      expect(runIn(m0, free.runId)).toMatchObject({ driver: null, operator: null, status: 'AVAILABLE' });

      const w2 = await world();
      const r2 = await dispatched(w2);
      const m = await monitorOf(w2);
      const driver = runIn(m, r2.runId).driver!;
      expect(Object.keys(driver).sort()).toEqual(['employeeCode', 'employeeId', 'name']);
      expect(driver).toEqual({ employeeId: who[w2.d1].employeeId, name: `Staff ${w2.d1}`, employeeCode: `S3AM-${w2.d1}-${ts}` });

      expect((await aTakeover(r2.runId, { expectedEmployeeId: driver.employeeId })).status).toBe(200);
      expect(runIn(await monitorOf(w2), r2.runId)).toMatchObject({ driver: null, operator: 'ADMIN' });
    });

    it('15. the id is exposed ONLY to SUPER_ADMIN: not in the (removed) driver views, not in the CHEF release replay, and every other role is refused the monitor', async () => {
      const w = await world();
      const r = await dispatched(w);
      const id = who[w.d1].employeeId!;
      const mine = await dget(w.d1, '/runs');
      const one = await dget(w.d1, `/runs/${r.runId}`);
      expect(mine.status).toBe(404); // B2a: the driver views no longer exist
      expect(one.status).toBe(404);
      for (const res of [mine, one]) {
        expect(text(res)).not.toContain(id);
        expect(text(res)).not.toMatch(/employeeId|"driver"/);
      }
      const replay = await releaseReq(w.chef, r.batchId); // the CHEF release is idempotent and answers with the run
      expect(replay.status, text(replay)).toBeLessThan(300);
      expect(text(replay)).not.toContain(id);
      expect(text(replay)).not.toMatch(/employeeId/);
      for (const l of [w.d1, w.chef, w.a1, 'md']) {
        const res = await monitorOf(w, who[l].token);
        expect([l, res.status]).toEqual([l, 403]);
        expect(text(res)).not.toContain(id);
      }
      expect((await request(app).get(`/api/v1/mess/delivery/monitor?branchId=${w.branch.id}`)).status).toBe(401);
      expect(text(await monitorOf(w))).toContain(id); // SUPER_ADMIN does receive it
    });

    it('16. the id read from the monitor is the exact value the takeover accepts; another driver id, a random id, a replay and a stale view all fail safely', async () => {
      const w = await world();
      const r = await dispatched(w);
      const mine = runIn(await monitorOf(w), r.runId).driver!.employeeId as string;
      const wrongDriver = who[w.d2].employeeId!;
      const bad1 = await aTakeover(r.runId, { expectedEmployeeId: wrongDriver });
      const bad2 = await aTakeover(r.runId, { expectedEmployeeId: randomUUID() });
      expect([bad1.status, bad1.body.error]).toEqual([409, 'RUN_OWNER_CHANGED']);
      expect([bad2.status, bad2.body.error]).toEqual([409, 'RUN_OWNER_CHANGED']);
      expect(await runRow(r.runId)).toMatchObject({ claimedByEmployeeId: who[w.d1].employeeId, claimedByUserId: null, takenOverFromEmployeeId: null });
      expect(await audits('MESS_RUN_TAKEN_OVER', r.runId)).toHaveLength(0);

      const ok = await aTakeover(r.runId, { expectedEmployeeId: mine });
      expect(ok.status, text(ok)).toBe(200);
      expect(ok.body.data.changed).toBe(true);
      expect(ok.body.data.run).toMatchObject({ operator: 'ADMIN', driver: null });
      expect(await runRow(r.runId)).toMatchObject({ claimedByEmployeeId: null, claimedByUserId: who.admin.id, takenOverFromEmployeeId: who[w.d1].employeeId });
      // another administrator still holding the OLD view (the same driver id) gets the deterministic replay
      const again = await aTakeover(r.runId, { expectedEmployeeId: mine }, 'admin2');
      expect([again.status, again.body.data.changed]).toEqual([200, false]);
      // a stale view that named the wrong driver is still refused
      expect((await aTakeover(r.runId, { expectedEmployeeId: wrongDriver }, 'admin2')).body.error).toBe('RUN_OWNER_CHANGED');
      expect(await audits('MESS_RUN_TAKEN_OVER', r.runId)).toHaveLength(1);
    });

    it('17. a takeover with the id from the monitor still needs a fresh step-up proof, and a non-administrator cannot use it', async () => {
      const w = await world();
      const r = await dispatched(w);
      const id = runIn(await monitorOf(w), r.runId).driver!.employeeId as string;
      const body = { expectedEmployeeId: id, reason: 'Driver account retired' };
      const noProof = await send('post', `/api/v1/admin/mess/delivery/runs/${r.runId}/takeover`, who.admin.token, body, { step: null });
      expect([noProof.status, noProof.body.error]).toEqual([403, 'STEP_UP_REQUIRED']);
      const asDriver = await send('post', `/api/v1/admin/mess/delivery/runs/${r.runId}/takeover`, who[w.d2].token, body, { step });
      expect(asDriver.status).toBe(403);
      expect(await runRow(r.runId)).toMatchObject({ claimedByEmployeeId: who[w.d1].employeeId, claimedByUserId: null });
    });

    it('18. concurrency: a takeover racing a resident code request leaves one owner and a consistent stop; two simultaneous takeovers have at most one effect', async () => {
      const w = await world();
      const r = await dispatched(w);
      const id = runIn(await monitorOf(w), r.runId).driver!.employeeId as string;
      const meal = await mealAt(r.subs[w.a1].id, today);
      const [t, v] = await Promise.all([aTakeover(r.runId, { expectedEmployeeId: id }), issue(w.a1, r.subs[w.a1].id, meal.id)]);
      expect([201, 409]).toContain(v.status);
      expect(t.status, text(t)).toBe(200);
      const row = await runRow(r.runId);
      expect(Number(row.claimedByEmployeeId !== null) + Number(row.claimedByUserId !== null)).toBe(1);
      const [a, b] = await Promise.all([aTakeover(r.runId, { expectedEmployeeId: id }, 'admin'), aTakeover(r.runId, { expectedEmployeeId: id }, 'admin2')]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect((await audits('MESS_RUN_TAKEN_OVER', r.runId)).length).toBe(1);
    });
  });
});
