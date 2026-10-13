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
const PASSWORD = 'P10c#Admin-Pass-2026-xyz';
const sign = (userId: string, email: string, roles: RoleEnum[]) => jwt.sign({ userId, email, roles }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '2d' });
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('P10C - Kerala Mess bulk delivery, service-point handover, fulfilment and completion', () => {
  const ts = Date.now();
  let seq = 0;
  type Who = { id: string; email: string; profileId?: string; employeeId?: string; token: string };
  const who: Record<string, Who> = {};
  let step = '';
  const today = businessDate();
  const key = () => `p10c-${ts}-${++seq}-${randomUUID().slice(0, 8)}`;
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
    const email = `p10c_${label}_${ts}@test.com`;
    const customer = roles.includes(RoleEnum.CUSTOMER) || roles.includes(RoleEnum.MESS_CUSTOMER);
    const staff = !customer && roles.some((r) => r !== RoleEnum.SUPER_ADMIN);
    const u = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(PASSWORD, 4),
        roles: { create: roles.map((role) => ({ role })) },
        ...(customer ? { customerProfile: { create: { fullName: `P10C ${label}`, referralCode: `PB-10C${label.toUpperCase()}${ts}` } } } : {}),
        ...(staff ? { employeeProfile: { create: { employeeCode: `P10C-${label}-${ts}`, fullName: `Staff ${label}`, designation: 'Test', assignedBranchId: branches[0] ?? null } } } : {})
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
    const c = await admin('post', '/mess/plans', { code: `P10C-${ts}-${++seq}`, name: 'P10C Plan', durationDays: 1, basePrice: '100.00', taxRate: '0.0500', mealSlots: ['LUNCH'], pauseCutoffHours: 2, maxPauses: 3, minStartLeadDays: 0, slotTimes: { LUNCH: '13:00' }, ...over });
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
    const branch = await prisma.kitchenBranch.create({ data: { code: `P10C-W${n}-${ts}`, name: `W${n}`, address: 'W', city: 'Kochi' } });
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
  const verify = (label: string, runId: string, stopId: string, code: string) => dpost(label, `/runs/${runId}/stops/${stopId}/verify`, { code });
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
    expect((await claim(w.d1, r.runId)).status).toBe(200);
    expect((await dispatch(w.d1, r.runId)).status).toBe(200);
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
    await mkUser('md', [RoleEnum.MD]);
    await mkUser('legacy', [RoleEnum.MESS_CUSTOMER]);
    await mkUser('outsider', [RoleEnum.CUSTOMER]);
    const otherBranch = await prisma.kitchenBranch.create({ data: { code: `P10C-X-${ts}`, name: 'X', address: 'X', city: 'Kochi' } });
    await mkUser('chefX', [RoleEnum.CHEF], [otherBranch.id]);
    await mkUser('driverX', [RoleEnum.DELIVERY], [otherBranch.id]);
    const r = await request(app).post('/api/v1/admin/step-up').set(bearer(who.admin.token)).send({ password: PASSWORD });
    step = r.body.data.stepUpToken;
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

  // =============================================================================================== A. release
  describe('A. CHEF release: one run, one stop per frozen service point, snapshotted', () => {
    it('1. release creates ONE run + one stop per frozen service point; quantities sum to the batch; meals are stamped; snapshot incl. instructions', async () => {
      const w = await world();
      const r = await released(w);
      const run = await prisma.messDeliveryRun.findUniqueOrThrow({ where: { id: r.runId }, include: { stops: true, batch: true } });
      expect(run).toMatchObject({ status: 'AVAILABLE', stopCount: 2, mealCount: 3, branchId: w.branch.id, slot: 'LUNCH', batchId: r.batchId });
      expect(dateToString(run.mealDate)).toBe(today);
      expect(run.stops.reduce((n, s) => n + s.expectedQuantity, 0)).toBe(run.batch.mealCount);
      const a = run.stops.find((s) => s.servicePointId === w.sp1.id)!;
      const b = run.stops.find((s) => s.servicePointId === w.sp2.id)!;
      expect([a.expectedQuantity, b.expectedQuantity]).toEqual([2, 1]);
      expect(a).toMatchObject({ servicePointName: w.sp1.name, gateLabel: 'Gate 1', deliveryInstructions: 'Ring the bell twice', city: 'Kochi', postalCode: '682001', status: 'PENDING', attemptCount: 1 });
      const meals = await prisma.messMeal.findMany({ where: { batchId: r.batchId } });
      expect(meals).toHaveLength(3);
      for (const m of meals) expect(m.deliveryStopId).toBe(m.servicePointId === w.sp1.id ? a.id : b.id);
      expect((await audits('MESS_RUN_RELEASED', r.runId)).length).toBe(1);
    });

    it('2. release is CHEF-only on an authorized branch: DELIVERY / SUPER_ADMIN / MD / customer are 403, a foreign CHEF and an unknown batch are 404', async () => {
      const w = await world();
      for (const l of [w.a1, w.a2, w.b1]) await activate(l, plan1.id);
      const st = await startBatch(w);
      expect((await readyReq(w.chef, st.body.data.batch.id)).status).toBe(200);
      const id = st.body.data.batch.id as string;
      for (const l of [w.d1, 'admin', 'md', w.a1]) expect((await releaseReq(l, id)).status, l).toBe(403);
      expect((await releaseReq('chefX', id)).status).toBe(404);
      expect((await releaseReq(w.chef, randomUUID())).status).toBe(404);
      expect((await releaseReq(w.chef, id, { amount: 1 })).status).toBe(422); // strict empty body
      expect(await prisma.messDeliveryRun.count({ where: { batchId: id } })).toBe(0);
    });

    it('3. a batch that is not READY is refused; release is idempotent and parallel releases create exactly one run', async () => {
      const w = await world();
      for (const l of [w.a1, w.a2, w.b1]) await activate(l, plan1.id);
      const st = await startBatch(w);
      const id = st.body.data.batch.id as string;
      const early = await releaseReq(w.chef, id);
      expect(early.status).toBe(409);
      expect(early.body.error).toBe('BATCH_NOT_READY');
      expect((await readyReq(w.chef, id)).status).toBe(200);
      const results = await Promise.all([releaseReq(w.chef, id), releaseReq(w.chef, id), releaseReq(w.chef, id)]);
      expect(results.every((x) => x.status < 300)).toBe(true);
      expect(results.filter((x) => x.body.data.changed).length).toBe(1);
      expect(await prisma.messDeliveryRun.count({ where: { batchId: id } })).toBe(1);
      expect(await prisma.messDeliveryStop.count({ where: { run: { batchId: id } } })).toBe(2);
      const again = await releaseReq(w.chef, id);
      expect(again.status).toBe(200);
      expect(again.body.data.changed).toBe(false);
    });

    it('4. READY replay racing the release never breaks either; the batch list tells the CHEF when a release is possible', async () => {
      const w = await world();
      for (const l of [w.a1, w.a2, w.b1]) await activate(l, plan1.id);
      const id = (await startBatch(w)).body.data.batch.id as string;
      expect((await readyReq(w.chef, id)).status).toBe(200);
      const list1 = await get(`/api/v1/mess/kitchen/batches?branchId=${w.branch.id}`, who[w.chef].token);
      expect(list1.body.data.batches.find((b: { id: string }) => b.id === id)).toMatchObject({ canRelease: true, delivery: null });
      const [a, b] = await Promise.all([readyReq(w.chef, id), releaseReq(w.chef, id)]);
      expect(a.status).toBe(200);
      expect(b.status).toBeLessThan(300);
      const list2 = await get(`/api/v1/mess/kitchen/batches?branchId=${w.branch.id}`, who[w.chef].token);
      expect(list2.body.data.batches.find((x: { id: string }) => x.id === id)).toMatchObject({ canRelease: false, delivery: { status: 'AVAILABLE' } });
    });

    it('5. the service-point snapshot is immutable: later edits change nothing on the stop; an edit racing the release is consistent (all old or all new)', async () => {
      const w = await world();
      const r = await released(w);
      const patch = await admin('patch', `/mess/service-points/${w.sp1.id}`, { expectedVersion: 1, name: 'Renamed hostel', addressLine: '99 New Road', deliveryInstructions: 'New note' });
      expect(patch.status, JSON.stringify(patch.body)).toBe(200);
      const stop = await stopRow(r.stopA.id);
      expect(stop).toMatchObject({ servicePointName: w.sp1.name, addressLine: `${w.n} Campus Road`, deliveryInstructions: 'Ring the bell twice' });

      const w2 = await world();
      for (const l of [w2.a1, w2.a2, w2.b1]) await activate(l, plan1.id);
      const id = (await startBatch(w2)).body.data.batch.id as string;
      await readyReq(w2.chef, id);
      const [rel] = await Promise.all([releaseReq(w2.chef, id), admin('patch', `/mess/service-points/${w2.sp1.id}`, { expectedVersion: 1, name: 'Raced name', deliveryInstructions: 'Raced note' })]);
      expect(rel.status).toBe(201);
      const s = await prisma.messDeliveryStop.findFirstOrThrow({ where: { runId: rel.body.data.run.id, servicePointId: w2.sp1.id } });
      const old = s.servicePointName === w2.sp1.name && s.deliveryInstructions === 'Ring the bell twice';
      const neu = s.servicePointName === 'Raced name' && s.deliveryInstructions === 'Raced note';
      expect(old || neu, `${s.servicePointName} / ${s.deliveryInstructions}`).toBe(true);
    });
  });

  // =============================================================================================== B. claim / dispatch / privacy
  describe('B. claim and dispatch (one DELIVERY employee owns the run)', () => {
    it('6. two drivers race to claim: exactly one wins, the loser gets 409 and can no longer see the run', async () => {
      const w = await world();
      const r = await released(w);
      const [x, y] = await Promise.all([claim(w.d1, r.runId), claim(w.d2, r.runId)]);
      expect([x.status, y.status].sort()).toEqual([200, 409]);
      const winner = x.status === 200 ? w.d1 : w.d2;
      const loser = x.status === 200 ? w.d2 : w.d1;
      expect((x.status === 409 ? x : y).body.error).toBe('ALREADY_CLAIMED');
      expect((await runRow(r.runId)).claimedByEmployeeId).toBe(who[winner].employeeId);
      expect((await dget(loser, `/runs/${r.runId}`)).status).toBe(404);
      expect((await dget(winner, `/runs/${r.runId}`)).status).toBe(200);
      expect((await dget(loser, '/runs')).body.data.available.find((x2: { id: string }) => x2.id === r.runId)).toBeUndefined();
    });

    it('7. claim is branch-scoped and DELIVERY-only: foreign driver 404, CHEF / SUPER_ADMIN / MD / customer 403; replay by the owner is a no-op', async () => {
      const w = await world();
      const r = await released(w);
      expect((await claim('driverX', r.runId)).status).toBe(404);
      for (const l of [w.chef, 'admin', 'md', w.a1]) expect((await claim(l, r.runId)).status, l).toBe(403);
      expect((await claim(w.d1, r.runId)).status).toBe(200);
      const replay = await claim(w.d1, r.runId);
      expect(replay.status).toBe(200);
      expect(replay.body.data.changed).toBe(false);
      expect((await audits('MESS_RUN_CLAIMED', r.runId)).length).toBe(1);
      expect((await claim(w.d1, randomUUID())).status).toBe(404);
    });

    it('8. dispatch: owner only, CLAIMED -> IN_TRANSIT, replay is idempotent; another driver and unclaimed dispatch are refused', async () => {
      const w = await world();
      const r = await released(w);
      expect((await dispatch(w.d1, r.runId)).status).toBe(404); // not the owner (nobody owns it yet)
      expect((await claim(w.d1, r.runId)).status).toBe(200);
      expect((await dispatch(w.d2, r.runId)).status).toBe(404);
      for (const l of [w.chef, 'admin', 'md']) expect((await dispatch(l, r.runId)).status, l).toBe(403);
      const d = await dispatch(w.d1, r.runId);
      expect(d.status).toBe(200);
      expect(d.body.data.changed).toBe(true);
      expect((await runRow(r.runId)).status).toBe('IN_TRANSIT');
      const again = await dispatch(w.d1, r.runId);
      expect(again.body.data.changed).toBe(false);
      expect((await audits('MESS_RUN_DISPATCHED', r.runId)).length).toBe(1);
      expect((await claim(w.d2, r.runId)).status).toBe(409);
    });

    it('9. the DELIVERY DTO has service-point data and quantities only: no customer, room, phone, student id, payment, recipient or proof data', async () => {
      const w = await world();
      const r = await dispatched(w);
      await codeFor(w, r);
      const list = await dget(w.d1, '/runs');
      const one = await dget(w.d1, `/runs/${r.runId}`);
      const text = JSON.stringify([list.body, one.body]);
      expect(text).not.toMatch(/@test\.com|P10C wa|P10C wb|roomNumber|phone|studentId|amount|wallet|refund|payment|recipient|codeHash|codeVersion|failedCodeAttempts|customer/i);
      const stop = one.body.data.run.stops.find((s: { id: string }) => s.id === r.stopA.id);
      expect(Object.keys(stop).sort()).toEqual(['attempt', 'closedAt', 'expectedQuantity', 'failureCode', 'handedOverAt', 'handoverMethod', 'id', 'proof', 'servicePoint', 'status'].sort());
      expect(stop.servicePoint).toEqual({ name: w.sp1.name, gateLabel: 'Gate 1', addressLine: `${w.n} Campus Road`, city: 'Kochi', postalCode: '682001', deliveryInstructions: 'Ring the bell twice' });
      expect(stop.proof.state).toBe('READY_FOR_VERIFICATION');
    });
  });

  // =============================================================================================== C. recipient + code
  describe('C. the handover code: only a resident customer of the frozen stop receives it', () => {
    it('10. nobody can obtain a code before the run is IN_TRANSIT; a foreign customer, a legacy role and staff are refused', async () => {
      const w = await world();
      const r = await released(w);
      const meal = await mealAt(r.subs[w.a1].id, today);
      const early = await issue(w.a1, r.subs[w.a1].id, meal.id);
      expect(early.status).toBe(409);
      expect(early.body.error).toBe('HANDOVER_NOT_AVAILABLE');
      expect((await codeState(w.a1, r.subs[w.a1].id, meal.id)).body.data.state).toBe('NOT_AVAILABLE');
      expect((await claim(w.d1, r.runId)).status).toBe(200);
      expect((await dispatch(w.d1, r.runId)).status).toBe(200);
      expect((await issue('outsider', r.subs[w.a1].id, meal.id)).status).toBe(404); // not their meal
      expect((await issue(w.b1, r.subs[w.a1].id, meal.id)).status).toBe(404); // another resident cannot use someone else's meal id
      expect((await issue('legacy', r.subs[w.a1].id, meal.id)).status).toBe(403);
      for (const l of [w.d1, w.chef, 'admin', 'md']) expect((await issue(l, r.subs[w.a1].id, meal.id)).status, l).toBe(403);
    });

    it('11. the FIRST resident to ask becomes the recipient and gets the plaintext once (no-store); the other resident only learns that it was issued to someone else', async () => {
      const w = await world();
      const r = await dispatched(w);
      const m1 = await mealAt(r.subs[w.a1].id, today);
      const m2 = await mealAt(r.subs[w.a2].id, today);
      expect((await codeState(w.a1, r.subs[w.a1].id, m1.id)).body.data.state).toBe('NOT_ISSUED');
      const first = await issue(w.a1, r.subs[w.a1].id, m1.id);
      expect(first.status).toBe(201);
      expect(first.headers['cache-control']).toMatch(/no-store/);
      expect(first.body.data).toMatchObject({ state: 'ISSUED_TO_YOU', regenerationsLeft: 3 });
      expect(first.body.data.code).toMatch(/^\d{6}$/);
      const second = await issue(w.a2, r.subs[w.a2].id, m2.id);
      expect(second.status).toBe(409);
      expect(second.body.error).toBe('HANDOVER_CODE_ISSUED_TO_ANOTHER');
      expect(JSON.stringify(second.body)).not.toContain(first.body.data.code);
      const st2 = await codeState(w.a2, r.subs[w.a2].id, m2.id);
      expect(st2.body.data).toEqual({ state: 'ISSUED_TO_ANOTHER' });
      expect((await codeState(w.a1, r.subs[w.a1].id, m1.id)).body.data.state).toBe('ISSUED_TO_YOU');
      expect((await codeState(w.a1, r.subs[w.a1].id, m1.id)).body.data.code).toBeUndefined();
      expect((await issue(w.a1, r.subs[w.a1].id, m1.id)).body.error).toBe('HANDOVER_CODE_ALREADY_ISSUED');
      const stop = await stopRow(r.stopA.id);
      expect(stop.recipientCustomerProfileId).toBe(who[w.a1].profileId);
      // the resident of the OTHER service point cannot touch this stop
      const mB = await mealAt(r.subs[w.b1].id, today);
      expect((await issue(w.b1, r.subs[w.b1].id, mB.id)).status).toBe(201);
      expect((await stopRow(r.stopB.id)).recipientCustomerProfileId).toBe(who[w.b1].profileId);
    });

    it('12. two residents racing the first request: exactly ONE becomes the recipient', async () => {
      const w = await world();
      const r = await dispatched(w);
      const m1 = await mealAt(r.subs[w.a1].id, today);
      const m2 = await mealAt(r.subs[w.a2].id, today);
      const [x, y] = await Promise.all([issue(w.a1, r.subs[w.a1].id, m1.id), issue(w.a2, r.subs[w.a2].id, m2.id)]);
      expect([x.status, y.status].sort()).toEqual([201, 409]);
      expect((await stopRow(r.stopA.id)).codeVersion).toBe(1);
      expect((await audits('MESS_HANDOVER_CODE_ISSUED', r.stopA.id)).length).toBe(1);
    });

    it('13. only the recipient regenerates; the old code dies; at most 3 regenerations; counters reset', async () => {
      const w = await world();
      const r = await dispatched(w);
      const { code: c0, meal } = await codeFor(w, r);
      const m2 = await mealAt(r.subs[w.a2].id, today);
      expect((await regen(w.a2, r.subs[w.a2].id, m2.id)).status).toBe(409); // not the recipient
      const codes = [c0];
      for (let i = 0; i < 3; i++) {
        const g = await regen(w.a1, r.subs[w.a1].id, meal.id);
        expect(g.status, JSON.stringify(g.body)).toBe(200);
        expect(g.body.data.regenerationsLeft).toBe(2 - i);
        codes.push(g.body.data.code);
      }
      const over = await regen(w.a1, r.subs[w.a1].id, meal.id);
      expect(over.status).toBe(409);
      expect(over.body.error).toBe('HANDOVER_REGENERATION_LIMIT');
      expect((await stopRow(r.stopA.id)).regenerationCount).toBe(3);
      // every earlier code is dead, only the last one works
      for (const old of codes.slice(0, 3)) if (old !== codes[3]) expect((await verify(w.d1, r.runId, r.stopA.id, old)).status, 'old code').toBe(422);
      expect((await verify(w.d1, r.runId, r.stopA.id, codes[3])).status).toBe(200);
      expect((await audits('MESS_HANDOVER_CODE_REGENERATED', r.stopA.id)).length).toBe(3);
    });

    it('14. the plaintext is never stored or exposed: HMAC only (Mess domain), absent from every staff payload, monitor, kitchen list, audit and the stop row', async () => {
      const w = await world();
      const r = await dispatched(w);
      const { code } = await codeFor(w, r);
      const stop = await stopRow(r.stopA.id);
      expect(stop.codeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(stop.codeHash).toBe(hashHandoverCode(r.stopA.id, stop.codeVersion, code));
      expect(stop.codeHash).not.toBe(p9HashCode(r.stopA.id, stop.codeVersion, code)); // domain separation from the P9 delivery code
      const payloads = [
        await dget(w.d1, '/runs'), await dget(w.d1, `/runs/${r.runId}`), await dget(w.d2, '/runs'),
        await get(`/api/v1/mess/delivery/monitor?branchId=${w.branch.id}`, who.admin.token), await get(`/api/v1/mess/delivery/monitor?branchId=${w.branch.id}`, who.md.token),
        await get(`/api/v1/mess/kitchen/batches?branchId=${w.branch.id}`, who[w.chef].token), await get(`/api/v1/mess/kitchen/demand?branchId=${w.branch.id}`, who[w.chef].token),
        await get(`/api/v1/mess/subscriptions/${r.subs[w.a2].id}/meals`, who[w.a2].token)
      ];
      const hit = (s: string) => new RegExp(`"${code}"|\\b${code}\\b`).test(s);
      for (const p of payloads) expect(hit(JSON.stringify(p.body)), JSON.stringify(p.body).slice(0, 80)).toBe(false);
      const rows = JSON.stringify(await prisma.auditLog.findMany({ where: { OR: [{ entityId: r.stopA.id }, { entityId: r.runId }] }, select: { action: true, payload: true } }));
      expect(hit(rows)).toBe(false);
      expect(rows).not.toContain(stop.codeHash);
    });

    it('15. a handover code expires 3 hours after issue (exact boundary) and never beyond the end of the meal business date; a regeneration revives it', async () => {
      const w = await world();
      const r = await dispatched(w);
      const t0 = `${today}T10:00:00.000+05:30`;
      const { code: c1, meal } = await atInstant(t0, () => codeFor(w, r));
      const stop1 = await stopRow(r.stopA.id);
      expect(stop1.codeExpiresAt!.getTime() - stop1.codeIssuedAt!.getTime()).toBe(3 * 3_600_000);
      const edge = new Date(stop1.codeExpiresAt!.getTime()).toISOString();
      const before = new Date(stop1.codeExpiresAt!.getTime() - 1).toISOString();
      // exactly at the expiry instant: refused, NOT counted as a wrong guess
      const late = await atInstant(edge, () => verify(w.d1, r.runId, r.stopA.id, c1));
      expect(late.status).toBe(409);
      expect(late.body.error).toBe('HANDOVER_CODE_EXPIRED');
      expect((await stopRow(r.stopA.id)).failedCodeAttempts).toBe(0);
      expect((await atInstant(edge, () => codeState(w.a1, r.subs[w.a1].id, meal.id))).body.data.state).toBe('CODE_EXPIRED');
      const g = await atInstant(edge, () => regen(w.a1, r.subs[w.a1].id, meal.id));
      expect(g.status).toBe(200);
      // one millisecond before the (new) expiry still works
      const s2 = await stopRow(r.stopA.id);
      const ok = await atInstant(new Date(s2.codeExpiresAt!.getTime() - 1).toISOString(), () => verify(w.d1, r.runId, r.stopA.id, g.body.data.code));
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      void before;
      // cap at the end of the business date: issued at 22:30 -> expires at the end of the day, not at 01:30
      const w2 = await world();
      const r2 = await dispatched(w2);
      await atInstant(`${today}T22:30:00.000+05:30`, () => codeFor(w2, r2));
      expect((await stopRow(r2.stopA.id)).codeExpiresAt!.getTime()).toBe(endOfBusinessDate(today).getTime());
    });
  });

  // =============================================================================================== D. verification + fulfilment
  describe('D. verification: all-or-nothing, exact meals, single use, attempt limits', () => {
    it('16. a correct code hands the stop over: EXACTLY that stop\'s meals become FULFILLED; the other stop and the run stay open; the proof cannot be replayed', async () => {
      const w = await world();
      const r = await dispatched(w);
      const { code } = await codeFor(w, r);
      const v = await verify(w.d1, r.runId, r.stopA.id, code);
      expect(v.status, JSON.stringify(v.body)).toBe(200);
      expect(v.body.data.changed).toBe(true);
      const stop = await stopRow(r.stopA.id);
      expect(stop).toMatchObject({ status: 'HANDED_OVER', handoverMethod: 'CODE', handedOverByEmployeeId: who[w.d1].employeeId });
      expect(stop.handedOverAt).toBeTruthy();
      const meals = await prisma.messMeal.findMany({ where: { batchId: r.batchId } });
      for (const m of meals) {
        if (m.deliveryStopId === r.stopA.id) expect(m.status === 'FULFILLED' && m.fulfilledAt !== null, 'stop A meal').toBe(true);
        else expect(m).toMatchObject({ status: 'SCHEDULED', fulfilledAt: null });
      }
      expect((await runRow(r.runId)).status).toBe('IN_TRANSIT');
      expect((await stopRow(r.stopB.id)).status).toBe('PENDING');
      // replay by the same driver with the same code: no change; any other code: refused, nothing counted
      const replay = await verify(w.d1, r.runId, r.stopA.id, code);
      expect(replay.status).toBe(200);
      expect(replay.body.data.changed).toBe(false);
      const other = await verify(w.d1, r.runId, r.stopA.id, wrongCode(code));
      expect(other.status).toBe(409);
      expect(other.body.error).toBe('ALREADY_HANDED_OVER');
      expect((await audits('MESS_STOP_HANDED_OVER', r.stopA.id)).length).toBe(1);
    });

    it('17. only the OWNER can verify: another driver / foreign driver 404; CHEF, SUPER_ADMIN, MD and customers 403; the code cannot be used on another stop', async () => {
      const w = await world();
      const r = await dispatched(w);
      const { code } = await codeFor(w, r);
      expect((await verify(w.d2, r.runId, r.stopA.id, code)).status).toBe(404);
      expect((await verify('driverX', r.runId, r.stopA.id, code)).status).toBe(404);
      for (const l of [w.chef, 'admin', 'md', w.a1]) expect((await verify(l, r.runId, r.stopA.id, code)).status, l).toBe(403);
      expect((await verify(w.d1, r.runId, randomUUID(), code)).status).toBe(404);
      const mB = await mealAt(r.subs[w.b1].id, today);
      await issue(w.b1, r.subs[w.b1].id, mB.id);
      const cross = await verify(w.d1, r.runId, r.stopB.id, code); // stop A's code on stop B
      expect(cross.status).toBe(422);
      expect((await stopRow(r.stopA.id)).status).toBe('PENDING');
    });

    it('18. wrong codes: 5 attempts lock for 15 minutes, 3 lock cycles block the code until the recipient regenerates; a malformed code is not counted', async () => {
      const w = await world();
      const r = await dispatched(w);
      const { code, meal } = await codeFor(w, r);
      expect((await verify(w.d1, r.runId, r.stopA.id, '12ab')).status).toBe(422);
      expect((await verify(w.d1, r.runId, r.stopA.id, '12ab')).body.error).toBe('INVALID_HANDOVER_CODE_FORMAT');
      expect((await stopRow(r.stopA.id)).failedCodeAttempts).toBe(0);
      const wrong = wrongCode(code);
      for (let i = 1; i <= 4; i++) {
        const x = await verify(w.d1, r.runId, r.stopA.id, wrong);
        expect(x.status).toBe(422);
        expect(x.body.error).toBe('INVALID_HANDOVER_CODE');
      }
      const fifth = await verify(w.d1, r.runId, r.stopA.id, wrong);
      expect(fifth.status).toBe(409);
      expect(fifth.body.error).toBe('HANDOVER_CODE_LOCKED');
      expect((await verify(w.d1, r.runId, r.stopA.id, code)).body.error).toBe('HANDOVER_CODE_LOCKED'); // even the right code is refused while locked
      expect((await codeState(w.a1, r.subs[w.a1].id, meal.id)).body.data.state).toBe('LOCKED');
      // the 15 minutes pass (non-financial time shift), cycle 2, then cycle 3 blocks
      for (const cycle of [2, 3]) {
        await prisma.messDeliveryStop.update({ where: { id: r.stopA.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
        for (let i = 1; i <= 4; i++) expect((await verify(w.d1, r.runId, r.stopA.id, wrong)).status).toBe(422);
        const last = await verify(w.d1, r.runId, r.stopA.id, wrong);
        expect(last.body.error).toBe(cycle === 3 ? 'HANDOVER_CODE_BLOCKED' : 'HANDOVER_CODE_LOCKED');
      }
      expect((await stopRow(r.stopA.id)).blockedAt).toBeTruthy();
      await prisma.messDeliveryStop.update({ where: { id: r.stopA.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
      expect((await verify(w.d1, r.runId, r.stopA.id, code)).body.error).toBe('HANDOVER_CODE_BLOCKED');
      const g = await regen(w.a1, r.subs[w.a1].id, meal.id);
      expect(g.status).toBe(200);
      expect(await stopRow(r.stopA.id)).toMatchObject({ blockedAt: null, lockCycles: 0, failedCodeAttempts: 0 });
      expect((await verify(w.d1, r.runId, r.stopA.id, g.body.data.code)).status).toBe(200);
    });

    it('19. no code can be verified before one was issued; and not for a run that is not on the road', async () => {
      const w = await world();
      const r = await released(w);
      expect((await verify(w.d1, r.runId, r.stopA.id, '123456')).status).toBe(404); // not claimed yet: invisible
      expect((await claim(w.d1, r.runId)).status).toBe(200);
      const notRoad = await verify(w.d1, r.runId, r.stopA.id, '123456');
      expect(notRoad.status).toBe(409);
      expect(notRoad.body.error).toBe('RUN_NOT_IN_TRANSIT');
      expect((await dispatch(w.d1, r.runId)).status).toBe(200);
      const none = await verify(w.d1, r.runId, r.stopA.id, '123456');
      expect(none.status).toBe(409);
      expect(none.body.error).toBe('HANDOVER_CODE_NOT_ISSUED');
    });

    it('20. all-or-nothing: if the stop\'s meals do not match the frozen quantity the whole handover rolls back (nothing fulfilled, stop still PENDING)', async () => {
      const w = await world();
      const r = await dispatched(w);
      const { code } = await codeFor(w, r);
      const victim = await prisma.messMeal.findFirstOrThrow({ where: { deliveryStopId: r.stopA.id } });
      await prisma.messMeal.update({ where: { id: victim.id }, data: { deliveryStopId: null } }); // tamper: membership no longer matches the frozen quantity
      const v = await verify(w.d1, r.runId, r.stopA.id, code);
      expect(v.status).toBe(409);
      expect(v.body.error).toBe('STOP_QUANTITY_MISMATCH');
      expect((await stopRow(r.stopA.id)).status).toBe('PENDING');
      expect(await prisma.messMeal.count({ where: { batchId: r.batchId, status: 'FULFILLED' } })).toBe(0);
      await prisma.messMeal.update({ where: { id: victim.id }, data: { deliveryStopId: r.stopA.id } });
      expect((await verify(w.d1, r.runId, r.stopA.id, code)).status).toBe(200);
    });

    it('21. two simultaneous verifications of the same code: one handover, one no-op, one audit', async () => {
      const w = await world();
      const r = await dispatched(w);
      const { code } = await codeFor(w, r);
      const [x, y] = await Promise.all([verify(w.d1, r.runId, r.stopA.id, code), verify(w.d1, r.runId, r.stopA.id, code)]);
      expect([x.status, y.status]).toEqual([200, 200]);
      expect([x.body.data.changed, y.body.data.changed].sort()).toEqual([false, true]);
      expect(await prisma.messMeal.count({ where: { deliveryStopId: r.stopA.id, status: 'FULFILLED' } })).toBe(2);
      expect((await audits('MESS_STOP_HANDED_OVER', r.stopA.id)).length).toBe(1);
    });

    it('22. the cancellation boundary survives delivery: a subscription with a batched / released meal cannot be cancelled by the customer or SUPER_ADMIN, and nothing is refunded', async () => {
      const w = await world();
      const r = await released(w);
      const c = await send('post', `/api/v1/mess/subscriptions/${r.subs[w.a1].id}/cancel`, who[w.a1].token, { reasonCode: 'CHANGED_MIND' });
      expect(c.status).toBe(409);
      const a = await admin('post', `/mess/subscriptions/${r.subs[w.a1].id}/cancel`, { reasonCode: 'OPERATIONAL_ISSUE' });
      expect(a.status).toBe(409);
      expect((await subRow(r.subs[w.a1].id)).status).toBe('ACTIVE');
      expect(await prisma.refund.count({ where: { orderId: r.subs[w.a1].purchaseOrder.id } })).toBe(0);
    });
  });

  // =============================================================================================== E. failure + retry
  describe('E. operational failure and retry (no finance, three attempts)', () => {
    it('23. a failure is operational only: reason vocabulary, OTHER needs a note, the meals stay SCHEDULED, no money row changes, the proof dies', async () => {
      const w = await world();
      const r = await dispatched(w);
      const { code, meal } = await codeFor(w, r);
      const before = { refunds: await prisma.refund.count(), wallet: await prisma.walletTransaction.count(), payments: await prisma.payment.count(), pause: await prisma.mealPauseRequest.count() };
      expect((await failStop(w.d1, r.runId, r.stopA.id, { reasonCode: 'LOST_KEYS' })).status).toBe(422);
      expect((await failStop(w.d1, r.runId, r.stopA.id, { reasonCode: 'OTHER' })).status).toBe(422);
      expect((await failStop(w.d1, r.runId, r.stopA.id, { reasonCode: 'VEHICLE_ISSUE', amount: 5 })).status).toBe(422);
      for (const l of [w.chef, 'admin', 'md', w.a1]) expect((await failStop(l, r.runId, r.stopA.id)).status, l).toBe(403);
      expect((await failStop(w.d2, r.runId, r.stopA.id)).status).toBe(404);
      const f = await failStop(w.d1, r.runId, r.stopA.id, { reasonCode: 'OTHER', note: 'Gate was locked after repeated calls' });
      expect(f.status, JSON.stringify(f.body)).toBe(200);
      const stop = await stopRow(r.stopA.id);
      expect(stop).toMatchObject({ status: 'FAILED', lastFailureCode: 'OTHER', codeHash: null, attemptCount: 1 });
      expect(await prisma.messMeal.count({ where: { deliveryStopId: r.stopA.id, status: 'SCHEDULED' } })).toBe(2);
      expect(await prisma.refund.count()).toBe(before.refunds);
      expect(await prisma.walletTransaction.count()).toBe(before.wallet);
      expect(await prisma.payment.count()).toBe(before.payments);
      expect(await prisma.mealPauseRequest.count()).toBe(before.pause);
      expect((await verify(w.d1, r.runId, r.stopA.id, code)).body.error).toBe('STOP_FAILED');
      expect((await codeState(w.a1, r.subs[w.a1].id, meal.id)).body.data.state).toBe('NOT_AVAILABLE');
      const replay = await failStop(w.d1, r.runId, r.stopA.id);
      expect(replay.body.data.changed).toBe(false);
      expect((await runRow(r.runId)).status).toBe('IN_TRANSIT');
    });

    it('24. retry reopens the stop: new attempt number, the old proof is invalid, the recipient is cleared so a fresh resident may receive a new code', async () => {
      const w = await world();
      const r = await dispatched(w);
      const { code: oldCode } = await codeFor(w, r);
      expect((await retryStop(w.d1, r.runId, r.stopA.id)).body.data.changed).toBe(false); // PENDING already: no-op
      expect((await failStop(w.d1, r.runId, r.stopA.id)).status).toBe(200);
      const rt = await retryStop(w.d1, r.runId, r.stopA.id);
      expect(rt.status, JSON.stringify(rt.body)).toBe(200);
      expect(rt.body.data.changed).toBe(true);
      const stop = await stopRow(r.stopA.id);
      expect(stop).toMatchObject({ status: 'PENDING', attemptCount: 2, codeHash: null, recipientCustomerProfileId: null, failedCodeAttempts: 0, lockCycles: 0, blockedAt: null });
      expect(stop.codeVersion).toBeGreaterThanOrEqual(2);
      expect((await verify(w.d1, r.runId, r.stopA.id, oldCode)).body.error).toBe('HANDOVER_CODE_NOT_ISSUED');
      const m2 = await mealAt(r.subs[w.a2].id, today);
      const fresh = await issue(w.a2, r.subs[w.a2].id, m2.id); // another resident can now be the recipient
      expect(fresh.status, JSON.stringify(fresh.body)).toBe(201);
      expect((await verify(w.d1, r.runId, r.stopA.id, oldCode === fresh.body.data.code ? wrongCode(oldCode) : oldCode)).status).toBe(422);
      expect((await verify(w.d1, r.runId, r.stopA.id, fresh.body.data.code)).status).toBe(200);
      expect((await audits('MESS_STOP_RETRIED', r.stopA.id)).length).toBe(1);
    });

    it('25. attempt cap, exact boundaries: attempt 1 -> fail -> retry (2) -> fail -> retry (3) -> fail -> retry REFUSED; the driver can never close a stop', async () => {
      const w = await world();
      const r = await dispatched(w);
      for (const expectedNext of [2, 3]) {
        expect((await failStop(w.d1, r.runId, r.stopA.id)).status).toBe(200);
        const rt = await retryStop(w.d1, r.runId, r.stopA.id);
        expect(rt.status).toBe(200);
        expect((await stopRow(r.stopA.id)).attemptCount).toBe(expectedNext);
      }
      expect((await failStop(w.d1, r.runId, r.stopA.id)).status).toBe(200);
      const over = await retryStop(w.d1, r.runId, r.stopA.id);
      expect(over.status).toBe(409);
      expect(over.body.error).toBe('DELIVERY_ATTEMPT_LIMIT_REACHED');
      expect(await stopRow(r.stopA.id)).toMatchObject({ status: 'FAILED', attemptCount: 3 });
      // there is no route that lets DELIVERY mark CLOSED_UNDELIVERED
      expect((await dpost(w.d1, `/runs/${r.runId}/stops/${r.stopA.id}/close`, {})).status).toBe(404);
      expect(readFileSync(join(__dirname, '..', 'modules', 'mess', 'messDelivery.routes.ts'), 'utf8')).not.toMatch(/CLOSED_UNDELIVERED|close/i);
    });

    it('26. verify racing a failure report: one outcome, never both (HANDED_OVER + fulfilled meals XOR FAILED + SCHEDULED meals)', async () => {
      const w = await world();
      const r = await dispatched(w);
      const { code } = await codeFor(w, r);
      const [v, f] = await Promise.all([verify(w.d1, r.runId, r.stopA.id, code), failStop(w.d1, r.runId, r.stopA.id)]);
      expect(v.status).toBeLessThan(500);
      expect(f.status).toBeLessThan(500);
      const stop = await stopRow(r.stopA.id);
      const fulfilled = await prisma.messMeal.count({ where: { deliveryStopId: r.stopA.id, status: 'FULFILLED' } });
      if (stop.status === 'HANDED_OVER') expect(fulfilled).toBe(2);
      else {
        expect(stop.status).toBe('FAILED');
        expect(fulfilled).toBe(0);
      }
    });

    it('27. verify racing a SUPER_ADMIN override: exactly one completion method', async () => {
      const w = await world();
      const r = await dispatched(w);
      const { code } = await codeFor(w, r);
      const body = { reasonCode: 'RECIPIENT_CANNOT_ACCESS_CODE', note: 'Resident phone is broken, identity checked by phone', confirm: true };
      const [v, o] = await Promise.all([verify(w.d1, r.runId, r.stopA.id, code), admin('post', `/mess/delivery/stops/${r.stopA.id}/override`, body)]);
      expect(v.status).toBeLessThan(500);
      expect(o.status).toBeLessThan(500);
      const stop = await stopRow(r.stopA.id);
      expect(stop.status).toBe('HANDED_OVER');
      expect(['CODE', 'ADMIN_OVERRIDE']).toContain(stop.handoverMethod);
      expect(await prisma.messMeal.count({ where: { deliveryStopId: r.stopA.id, status: 'FULFILLED' } })).toBe(2);
      expect((await audits('MESS_STOP_HANDED_OVER', r.stopA.id)).length + (await audits('MESS_STOP_OVERRIDDEN', r.stopA.id)).length).toBe(1);
    });

    it('28. retry racing a verification never leaves a verified retried stop with a stale proof', async () => {
      const w = await world();
      const r = await dispatched(w);
      const { code } = await codeFor(w, r);
      expect((await failStop(w.d1, r.runId, r.stopA.id)).status).toBe(200);
      const [rt, v] = await Promise.all([retryStop(w.d1, r.runId, r.stopA.id), verify(w.d1, r.runId, r.stopA.id, code)]);
      expect(rt.status).toBeLessThan(500);
      expect(v.status).toBeLessThan(500);
      expect(await prisma.messMeal.count({ where: { deliveryStopId: r.stopA.id, status: 'FULFILLED' } })).toBe(0);
      expect((await stopRow(r.stopA.id)).status).not.toBe('HANDED_OVER');
    });
  });

  // =============================================================================================== F. run state + day close
  describe('F. run states, CLOSED_UNDELIVERED and day-close', () => {
    async function handOver(w: World, r: Awaited<ReturnType<typeof released>>, which: 'A' | 'B') {
      const label = which === 'A' ? w.a1 : w.b1;
      const stop = which === 'A' ? r.stopA : r.stopB;
      const { code } = await codeFor(w, r, label);
      const v = await verify(w.d1, r.runId, stop.id, code);
      expect(v.status, JSON.stringify(v.body)).toBe(200);
    }

    it('29. the run is COMPLETED only when EVERY stop is handed over (and only then)', async () => {
      const w = await world();
      const r = await dispatched(w);
      await handOver(w, r, 'A');
      expect((await runRow(r.runId)).status).toBe('IN_TRANSIT');
      await handOver(w, r, 'B');
      const run = await runRow(r.runId);
      expect(run.status).toBe('COMPLETED');
      expect(run.completedAt).toBeTruthy();
      expect((await audits('MESS_RUN_COMPLETED', r.runId)).length).toBe(1);
      const mine = await dget(w.d1, '/runs');
      expect(mine.body.data.mine.find((x: { id: string }) => x.id === r.runId).status).toBe('COMPLETED');
    });

    it('30. the last two stops handed over in parallel complete the run exactly once', async () => {
      const w = await world();
      const r = await dispatched(w);
      const a = await codeFor(w, r, w.a1);
      const b = await codeFor(w, r, w.b1);
      const [x, y] = await Promise.all([verify(w.d1, r.runId, r.stopA.id, a.code), verify(w.d1, r.runId, r.stopB.id, b.code)]);
      expect([x.status, y.status]).toEqual([200, 200]);
      expect((await runRow(r.runId)).status).toBe('COMPLETED');
      expect((await audits('MESS_RUN_COMPLETED', r.runId)).length).toBe(1);
    });

    it('31. day-close: a finished day closes pending / failed stops (meals NOT_DELIVERED), keeps handed-over stops, CLOSES the run, never completes it; reruns change nothing; today stays untouched', async () => {
      const w = await world();
      const r = await dispatched(w);
      await handOver(w, r, 'A');
      expect((await failStop(w.d1, r.runId, r.stopB.id)).status).toBe(200);
      const todayWorld = await world();
      const t = await dispatched(todayWorld);
      // the business day ends (a non-financial date shift: a day cannot be waited for)
      await prisma.messDeliveryRun.update({ where: { id: r.runId }, data: { mealDate: dateFromString(addDays(today, -1)) } });
      const out = await MessCompletionService.closeDay();
      expect(out.stopsClosed).toBeGreaterThanOrEqual(1);
      expect(await stopRow(r.stopA.id)).toMatchObject({ status: 'HANDED_OVER' });
      const b = await stopRow(r.stopB.id);
      expect(b.status).toBe('CLOSED_UNDELIVERED');
      expect(b.closedAt).toBeTruthy();
      expect(await prisma.messMeal.count({ where: { deliveryStopId: r.stopB.id, status: 'NOT_DELIVERED' } })).toBe(1);
      expect(await prisma.messMeal.count({ where: { deliveryStopId: r.stopA.id, status: 'FULFILLED' } })).toBe(2);
      expect(await runRow(r.runId)).toMatchObject({ status: 'CLOSED' });
      expect((await audits('MESS_STOP_CLOSED_UNDELIVERED', r.stopB.id)).length).toBe(1);
      expect((await audits('MESS_RUN_CLOSED', r.runId)).length).toBe(1);
      const again = await MessCompletionService.closeDay();
      expect(await stopRow(r.stopB.id)).toMatchObject({ status: 'CLOSED_UNDELIVERED' });
      expect((await audits('MESS_STOP_CLOSED_UNDELIVERED', r.stopB.id)).length).toBe(1);
      void again;
      // the run of TODAY (other world) is untouched
      expect((await runRow(t.runId)).status).toBe('IN_TRANSIT');
      expect((await stopRow(t.stopA.id)).status).toBe('PENDING');
      expect(await prisma.messMeal.count({ where: { deliveryStopId: t.stopA.id, status: 'SCHEDULED' } })).toBe(2);
      // no finance
      expect(await prisma.refund.count({ where: { orderId: r.subs[w.b1].purchaseOrder.id } })).toBe(0);
    });

    it('32. a day-close verify attempt for a finished day is refused (DELIVERY_DAY_ENDED) and the stop is closed instead', async () => {
      const w = await world();
      const r = await dispatched(w);
      const { code } = await codeFor(w, r);
      await prisma.messDeliveryRun.update({ where: { id: r.runId }, data: { mealDate: dateFromString(addDays(today, -1)) } });
      const [v] = await Promise.all([verify(w.d1, r.runId, r.stopA.id, code), MessCompletionService.closeDay()]);
      expect([409]).toContain(v.status);
      expect((await stopRow(r.stopA.id)).status).toBe('CLOSED_UNDELIVERED');
      expect(await prisma.messMeal.count({ where: { deliveryStopId: r.stopA.id, status: 'FULFILLED' } })).toBe(0);
      expect((await dpost(w.d1, `/runs/${r.runId}/stops/${r.stopB.id}/fail`, { reasonCode: 'VEHICLE_ISSUE' })).status).toBeGreaterThanOrEqual(409);
    });

    it('33. expired unreleased meals: exactly (SCHEDULED, no delivery stop, date < today) become NOT_DELIVERED; future, PAUSED, CANCELLED, FULFILLED and today are untouched', async () => {
      const w = await world();
      const sub = await activate(w.a1, plan5.id);
      const ms = await mealsOf(sub.id);
      expect(ms).toHaveLength(5);
      const y = (n: number) => dateFromString(addDays(today, -n));
      await prisma.messMeal.update({ where: { id: ms[0].id }, data: { mealDate: y(1) } }); // expired, SCHEDULED  -> NOT_DELIVERED
      await prisma.messMeal.update({ where: { id: ms[1].id }, data: { mealDate: y(2), status: 'PAUSED', pausedAt: new Date() } }); // paused (past)
      await prisma.messMeal.update({ where: { id: ms[2].id }, data: { mealDate: y(3), status: 'FULFILLED', fulfilledAt: new Date() } });
      await prisma.messMeal.update({ where: { id: ms[3].id }, data: { mealDate: y(4), status: 'CANCELLED' } });
      // ms[4] is a FUTURE meal (today + 4)
      const solo = await activate(w.b1, plan1.id); // today's meal in an active current-day flow
      await MessCompletionService.closeDay();
      const after = Object.fromEntries((await mealsOf(sub.id)).map((m) => [m.id, m.status]));
      expect(after[ms[0].id]).toBe('NOT_DELIVERED');
      expect(after[ms[1].id]).toBe('PAUSED');
      expect(after[ms[2].id]).toBe('FULFILLED');
      expect(after[ms[3].id]).toBe('CANCELLED');
      expect(after[ms[4].id]).toBe('SCHEDULED');
      expect((await mealAt(solo.id, today)).status).toBe('SCHEDULED');
      expect((await subRow(sub.id)).status).toBe('ACTIVE'); // a future meal remains
      expect((await audits('MESS_MEALS_EXPIRED', sub.id)).length).toBe(1);
      await MessCompletionService.closeDay(); // idempotent
      expect((await audits('MESS_MEALS_EXPIRED', sub.id)).length).toBe(1);
    });
  });

  // =============================================================================================== G. subscription completion
  describe('G. subscription completion: every meal terminal, immediately, idempotently', () => {
    it('34. the final meal handed over completes the subscription IMMEDIATELY (same day), once, with no financial effect', async () => {
      const w = await world();
      const r = await dispatched(w);
      const { code } = await codeFor(w, r);
      expect((await subRow(r.subs[w.a1].id)).status).toBe('ACTIVE');
      expect((await verify(w.d1, r.runId, r.stopA.id, code)).status).toBe(200);
      // a1 AND a2 share stop A: both single-meal subscriptions are complete
      for (const l of [w.a1, w.a2]) expect((await subRow(r.subs[l].id)).status, l).toBe('COMPLETED');
      expect((await subRow(r.subs[w.b1].id)).status).toBe('ACTIVE'); // its stop is still open
      expect((await audits('MESS_SUBSCRIPTION_COMPLETED', r.subs[w.a1].id)).length).toBe(1);
      expect(await MessCompletionService.tryComplete(r.subs[w.a1].id)).toBe(false); // idempotent
      expect((await audits('MESS_SUBSCRIPTION_COMPLETED', r.subs[w.a1].id)).length).toBe(1);
      expect(await prisma.refund.count({ where: { orderId: r.subs[w.a1].purchaseOrder.id } })).toBe(0);
      expect((await get(`/api/v1/mess/subscriptions/${r.subs[w.a1].id}`, who[w.a1].token)).body.data.subscription.status).toBe('COMPLETED');
    });

    it('35. an unresolved (FAILED / PENDING) stop blocks completion; the meal in it is not terminal', async () => {
      const w = await world();
      const r = await dispatched(w);
      expect((await failStop(w.d1, r.runId, r.stopB.id)).status).toBe(200);
      expect(await MessCompletionService.tryComplete(r.subs[w.b1].id)).toBe(false);
      expect((await subRow(r.subs[w.b1].id)).status).toBe('ACTIVE');
    });

    it('36. a multi-meal subscription completes only when ALL meals are terminal; a PAUSED meal is terminal only once its resume window has closed', async () => {
      const w = await world();
      const sub = await activate(w.a1, plan2.id); // today + tomorrow
      const today1 = await mealAt(sub.id, today);
      const tomorrow = await mealAt(sub.id, addDays(today, 1));
      await prisma.messMeal.update({ where: { id: today1.id }, data: { status: 'FULFILLED', fulfilledAt: new Date() } }); // as if delivered
      expect(await MessCompletionService.tryComplete(sub.id)).toBe(false); // tomorrow is SCHEDULED
      const p = await send('post', `/api/v1/mess/subscriptions/${sub.id}/meals/${tomorrow.id}/pause`, who[w.a1].token, {});
      expect(p.status, JSON.stringify(p.body)).toBe(200);
      expect(await MessCompletionService.tryComplete(sub.id)).toBe(false); // paused, but the customer can still resume it
      await prisma.messMeal.update({ where: { id: tomorrow.id }, data: { serviceAt: new Date(Date.now() - 3 * 3_600_000) } }); // the resume window has closed
      const out = await MessCompletionService.closeDay();
      expect(out.subscriptionsCompleted).toBeGreaterThanOrEqual(1);
      expect((await subRow(sub.id)).status).toBe('COMPLETED');
    });

    it('37. all meals PAUSED (after the resume window) is a terminal entitlement: the subscription completes', async () => {
      const w = await world();
      const sub = await activate(w.a1, plan1.id, 1); // starts tomorrow, so the pause window is open whatever the wall clock says
      const m = await mealAt(sub.id, addDays(today, 1));
      expect((await send('post', `/api/v1/mess/subscriptions/${sub.id}/meals/${m.id}/pause`, who[w.a1].token, {})).status).toBe(200);
      expect(await MessCompletionService.tryComplete(sub.id)).toBe(false);
      await prisma.messMeal.update({ where: { id: m.id }, data: { serviceAt: new Date(Date.now() - 3 * 3_600_000) } });
      expect(await MessCompletionService.tryComplete(sub.id)).toBe(true);
      expect((await subRow(sub.id)).status).toBe('COMPLETED');
    });

    it('38. the last meal fulfilment racing the completion attempt: COMPLETED exactly once', async () => {
      const w = await world();
      const r = await dispatched(w);
      const { code } = await codeFor(w, r);
      const [v, c1, c2] = await Promise.all([verify(w.d1, r.runId, r.stopA.id, code), MessCompletionService.tryComplete(r.subs[w.a1].id), MessCompletionService.tryComplete(r.subs[w.a1].id)]);
      expect(v.status).toBe(200);
      void c1;
      void c2;
      await MessCompletionService.tryComplete(r.subs[w.a1].id);
      expect((await subRow(r.subs[w.a1].id)).status).toBe('COMPLETED');
      expect((await audits('MESS_SUBSCRIPTION_COMPLETED', r.subs[w.a1].id)).length).toBe(1);
    });

    it('39. customer cancellation racing the release never produces a half state; a COMPLETED / delivered subscription cannot be cancelled', async () => {
      const w = await world();
      for (const l of [w.a1, w.a2, w.b1]) await activate(l, plan1.id);
      const id = (await startBatch(w)).body.data.batch.id as string;
      await readyReq(w.chef, id);
      const sub = await prisma.messSubscription.findFirstOrThrow({ where: { messAccount: { customerProfileId: who[w.a1].profileId! } } });
      const [c, rel] = await Promise.all([send('post', `/api/v1/mess/subscriptions/${sub.id}/cancel`, who[w.a1].token, { reasonCode: 'CHANGED_MIND' }), releaseReq(w.chef, id)]);
      expect(c.status).toBe(409);
      expect(rel.status).toBe(201);
      expect((await subRow(sub.id)).status).toBe('ACTIVE');
      expect(await prisma.messMeal.count({ where: { messSubscriptionId: sub.id, status: 'CANCELLED' } })).toBe(0);
    });
  });

  // =============================================================================================== H. override
  describe('H. exceptional SUPER_ADMIN override', () => {
    const body = { reasonCode: 'RECIPIENT_DEVICE_UNAVAILABLE', note: 'Resident could not open the app; confirmed in person', confirm: true };

    it('40. needs SUPER_ADMIN + step-up + a fixed reason code + a note (>= 10) + explicit confirmation; MD / CHEF / DELIVERY / customers are refused', async () => {
      const w = await world();
      const r = await dispatched(w);
      const url = `/mess/delivery/stops/${r.stopA.id}/override`;
      expect((await admin('post', url, body, null)).status).toBeGreaterThanOrEqual(401);
      expect((await admin('post', url, { ...body, confirm: false })).status).toBe(422);
      expect((await admin('post', url, { ...body, note: 'short' })).status).toBe(422);
      expect((await admin('post', url, { ...body, reasonCode: 'BECAUSE' })).status).toBe(422);
      expect((await admin('post', url, { ...body, code: '123456' })).status).toBe(422);
      for (const l of ['md', w.chef, w.d1, w.a1]) expect((await send('post', `/api/v1/admin${url}`, who[l].token, body, { step })).status, l).toBe(403);
      expect((await admin('post', `/mess/delivery/stops/${randomUUID()}/override`, body)).status).toBe(404);
      expect((await stopRow(r.stopA.id)).status).toBe('PENDING');
    });

    it('41. success: stop HANDED_OVER via ADMIN_OVERRIDE, EXACTLY its meals FULFILLED, no code revealed or regenerated, reason + note + actor audited, replay is a no-op', async () => {
      const w = await world();
      const r = await dispatched(w);
      const o = await admin('post', `/mess/delivery/stops/${r.stopA.id}/override`, body);
      expect(o.status, JSON.stringify(o.body)).toBe(200);
      expect(o.body.data).toEqual({ changed: true });
      const stop = await stopRow(r.stopA.id);
      expect(stop).toMatchObject({ status: 'HANDED_OVER', handoverMethod: 'ADMIN_OVERRIDE', overrideByUserId: who.admin.id, overrideReasonCode: 'RECIPIENT_DEVICE_UNAVAILABLE', codeHash: null, codeVersion: 0, handedOverByEmployeeId: null });
      expect(await prisma.messMeal.count({ where: { deliveryStopId: r.stopA.id, status: 'FULFILLED' } })).toBe(2);
      expect(await prisma.messMeal.count({ where: { deliveryStopId: r.stopB.id, status: 'SCHEDULED' } })).toBe(1);
      const a = await audits('MESS_STOP_OVERRIDDEN', r.stopA.id);
      expect(a).toHaveLength(1);
      expect(a[0].payload).toMatchObject({ reasonCode: 'RECIPIENT_DEVICE_UNAVAILABLE', note: body.note, method: 'ADMIN_OVERRIDE' });
      expect((await admin('post', `/mess/delivery/stops/${r.stopA.id}/override`, body)).body.data.changed).toBe(false);
      // a failed / closed / handed-over-by-code stop cannot be overridden
      expect((await failStop(w.d1, r.runId, r.stopB.id)).status).toBe(200);
      expect((await admin('post', `/mess/delivery/stops/${r.stopB.id}/override`, body)).status).toBe(409);
    });

    it('42. an override on a run that is not on the road is refused', async () => {
      const w = await world();
      const r = await released(w);
      const o = await admin('post', `/mess/delivery/stops/${r.stopA.id}/override`, body);
      expect(o.status).toBe(409);
      expect(o.body.error).toBe('RUN_NOT_IN_TRANSIT');
    });
  });

  // =============================================================================================== I. customer calendar + monitor
  describe('I. customer calendar and staff monitors', () => {
    it('43. the customer sees a safe progression (IN_PREPARATION -> READY -> OUT_FOR_DELIVERY -> FULFILLED; NOT_DELIVERED after day-close) and no run / stop / driver / proof data', async () => {
      const w = await world();
      const subs: Subs = {};
      for (const l of [w.a1, w.b1]) subs[l] = await activate(l, plan1.id);
      const meal = async (l: string) => (await get(`/api/v1/mess/subscriptions/${subs[l].id}/meals`, who[l].token)).body.data.meals.find((m: { date: string }) => m.date === today);
      const st = await startBatch(w);
      expect((await meal(w.a1)).kitchenState).toBe('IN_PREPARATION');
      const id = st.body.data.batch.id as string;
      await readyReq(w.chef, id);
      expect((await meal(w.a1)).kitchenState).toBe('READY');
      const run = (await releaseReq(w.chef, id)).body.data.run as { id: string; stops: Array<{ id: string; servicePoint: { name: string } }> };
      expect((await meal(w.a1)).kitchenState).toBe('READY'); // released but not on the road
      await claim(w.d1, run.id);
      await dispatch(w.d1, run.id);
      const out = await meal(w.a1);
      expect(out).toMatchObject({ status: 'SCHEDULED', kitchenState: 'OUT_FOR_DELIVERY', canPause: false, canResume: false });
      expect(Object.keys(out).sort()).toEqual(['canPause', 'canResume', 'date', 'forfeitIfPaused', 'id', 'kitchenState', 'reason', 'serviceAt', 'slot', 'status']);
      const raw = JSON.stringify((await get(`/api/v1/mess/subscriptions/${subs[w.a1].id}/meals`, who[w.a1].token)).body);
      expect(raw).not.toMatch(/runId|stopId|driver|handover|codeHash|recipient|employee/i);
      const stopA = run.stops.find((s) => s.servicePoint.name === w.sp1.name)!;
      const mealA = await mealAt(subs[w.a1].id, today);
      const code = (await issue(w.a1, subs[w.a1].id, mealA.id)).body.data.code as string;
      expect((await verify(w.d1, run.id, stopA.id, code)).status).toBe(200);
      expect(await meal(w.a1)).toMatchObject({ status: 'FULFILLED', canPause: false, canResume: false });
      // the other service point's stop is closed at day end -> NOT_DELIVERED
      await prisma.messDeliveryRun.update({ where: { id: run.id }, data: { mealDate: dateFromString(addDays(today, -1)) } });
      await MessCompletionService.closeDay();
      const nd = (await get(`/api/v1/mess/subscriptions/${subs[w.b1].id}/meals?from=${addDays(today, -1)}&to=${today}`, who[w.b1].token)).body.data.meals;
      expect(nd.find((m: { status: string }) => m.status === 'NOT_DELIVERED')).toBeTruthy();
    });

    it('44. monitors: SUPER_ADMIN and MD read ONE explicit branch; MD never sees free-text failure notes; DELIVERY / CHEF / customers are refused', async () => {
      const w = await world();
      const r = await dispatched(w);
      expect((await failStop(w.d1, r.runId, r.stopB.id, { reasonCode: 'OTHER', note: 'Sensitive operational free text' })).status).toBe(200);
      const adminView = await get(`/api/v1/mess/delivery/monitor?branchId=${w.branch.id}`, who.admin.token);
      const mdView = await get(`/api/v1/mess/delivery/monitor?branchId=${w.branch.id}`, who.md.token);
      expect(adminView.status).toBe(200);
      expect(mdView.status).toBe(200);
      expect(JSON.stringify(adminView.body)).toContain('Sensitive operational free text');
      expect(JSON.stringify(mdView.body)).not.toContain('Sensitive operational free text');
      expect(JSON.stringify(mdView.body)).not.toMatch(/failureNote|codeHash|recipient/);
      const runDto = mdView.body.data.runs.find((x: { id: string }) => x.id === r.runId);
      expect(runDto.driver).toMatchObject({ name: expect.any(String) });
      expect((await get('/api/v1/mess/delivery/monitor', who.md.token)).status).toBe(400);
      for (const l of [w.d1, w.chef, w.a1]) expect((await get(`/api/v1/mess/delivery/monitor?branchId=${w.branch.id}`, who[l].token)).status, l).toBe(403);
      expect((await get(`/api/v1/mess/delivery/runs`, who.admin.token)).status).toBe(403); // the driver API is DELIVERY-only
      expect((await get(`/api/v1/mess/delivery/runs`)).status).toBe(401);
    });
  });

  // =============================================================================================== J. database integrity + static guarantees
  describe('J. database integrity and static guarantees', () => {
    it('45. PostgreSQL rejects incoherent runs, stops and meals', async () => {
      const w = await world();
      const r = await dispatched(w);
      const run = (sql: string) => prisma.$executeRawUnsafe(sql);
      await expect(run(`UPDATE "mess_delivery_stops" SET status = 'HANDED_OVER' WHERE id = '${r.stopA.id}'`), 'HANDED_OVER needs evidence').rejects.toThrow();
      await expect(run(`UPDATE "mess_delivery_stops" SET "attemptCount" = 4 WHERE id = '${r.stopA.id}'`), 'attempt cap').rejects.toThrow();
      await expect(run(`UPDATE "mess_delivery_stops" SET "regenerationCount" = 4 WHERE id = '${r.stopA.id}'`), 'regeneration cap').rejects.toThrow();
      await expect(run(`UPDATE "mess_delivery_stops" SET status = 'CLOSED_UNDELIVERED' WHERE id = '${r.stopA.id}'`), 'closed needs closedAt').rejects.toThrow();
      await expect(run(`UPDATE "mess_delivery_stops" SET status = 'WHATEVER' WHERE id = '${r.stopA.id}'`)).rejects.toThrow();
      await expect(run(`UPDATE "mess_delivery_stops" SET "codeHash" = 'abc' WHERE id = '${r.stopA.id}'`), 'a hash needs recipient + dates').rejects.toThrow();
      await expect(run(`UPDATE "mess_delivery_runs" SET status = 'COMPLETED' WHERE id = '${r.runId}'`), 'COMPLETED needs completedAt').rejects.toThrow();
      await expect(run(`UPDATE "mess_delivery_runs" SET status = 'AVAILABLE' WHERE id = '${r.runId}'`), 'AVAILABLE cannot be owned').rejects.toThrow();
      await expect(run(`UPDATE "mess_delivery_runs" SET status = 'NOPE' WHERE id = '${r.runId}'`)).rejects.toThrow();
      await expect(run(`INSERT INTO "mess_delivery_runs" ("id","batchId","branchId","mealDate","slot","stopCount","mealCount","releasedByUserId") SELECT gen_random_uuid()::text,"batchId","branchId","mealDate","slot",1,1,"releasedByUserId" FROM "mess_delivery_runs" WHERE id = '${r.runId}'`), 'one run per batch').rejects.toThrow();
      const m = await prisma.messMeal.findFirstOrThrow({ where: { deliveryStopId: r.stopA.id } });
      await expect(run(`UPDATE "mess_daily_orders" SET status = 'FULFILLED' WHERE id = '${m.id}'`), 'FULFILLED needs fulfilledAt').rejects.toThrow();
      await expect(run(`UPDATE "mess_daily_orders" SET "batchId" = NULL WHERE id = '${m.id}'`), 'a stop member must be batched').rejects.toThrow();
      await run(`UPDATE "mess_daily_orders" SET status = 'NOT_DELIVERED' WHERE id = '${m.id}'`); // allowed for a batched meal
      await run(`UPDATE "mess_daily_orders" SET status = 'SCHEDULED' WHERE id = '${m.id}'`);
    });

    it('46. service-point deliveryInstructions: SUPER_ADMIN managed, max 300 characters, clearable, never a contact phone', async () => {
      const w = await world();
      const long = await admin('patch', `/mess/service-points/${w.sp2.id}`, { expectedVersion: 1, deliveryInstructions: 'x'.repeat(301) });
      expect(long.status).toBe(422);
      const ok = await admin('patch', `/mess/service-points/${w.sp2.id}`, { expectedVersion: 1, deliveryInstructions: 'y'.repeat(300) });
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      expect(ok.body.data.servicePoint.deliveryInstructions).toHaveLength(300);
      const cleared = await admin('patch', `/mess/service-points/${w.sp2.id}`, { expectedVersion: 2, deliveryInstructions: '' });
      expect(cleared.body.data.servicePoint.deliveryInstructions).toBeNull();
      expect((await send('patch', `/api/v1/admin/mess/service-points/${w.sp2.id}`, who.md.token, { expectedVersion: 3, deliveryInstructions: 'z' }, { step })).status).toBe(403);
    });

    const root = join(__dirname, '..');
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const src = (f: string) => strip(readFileSync(join(root, 'modules', 'mess', f), 'utf8'));

    it('47. the P10C modules do no financial work, never touch the P9 per-order delivery tables and never revive the legacy gate pass', () => {
      for (const f of ['messDelivery.service.ts', 'messDelivery.routes.ts', 'messCompletion.service.ts', 'messHandoverCode.ts']) {
        const s = src(f);
        expect(s, f).not.toMatch(/prisma\.order\.|tx\.order\.|\.payment\.|providerPayment|\.refund\.|walletAccount|walletTransaction|PaymentProvider|RefundService|OrderTransitionService/);
        expect(s, f).not.toMatch(/\bCOD\b|cash|refundAmount|paymentMethod|collect/i);
        expect(s, f).not.toMatch(/deliveryAssignment|deliveryProof(?!Config)|deliveryAttempt|kitchenOrderTicket/);
        expect(s, f).not.toMatch(/gatePass|hostelGatePass|cash_at_gate|verify-gatepass/i);
        expect(s, f).not.toMatch(/console\.(log|info|warn|error)\([^)]*\bcode\b/); // the plaintext is never logged
      }
    });

    it('48. only the delivery service ever writes FULFILLED; only the completion / delivery services write NOT_DELIVERED / COMPLETED; the only plaintext return is the resident issue path', () => {
      const hits = { fulfilled: [] as string[], notDelivered: [] as string[], completed: [] as string[] };
      const walk = (d: string) => {
        for (const n of readdirSync(d, { withFileTypes: true })) {
          const p = join(d, n.name);
          if (n.isDirectory()) {
            if (n.name !== 'tests') walk(p);
          } else if (n.name.endsWith('.ts')) {
            const s = strip(readFileSync(p, 'utf8'));
            if (/status: MEAL_STATUS\.FULFILLED|status: 'FULFILLED'/.test(s) && !/where:\s*\{[^}]*status: (MEAL_STATUS\.FULFILLED|'FULFILLED')/.test(s.replace(/data: \{[^}]*\}/g, ''))) hits.fulfilled.push(n.name);
            if (/status: MEAL_STATUS\.NOT_DELIVERED/.test(s)) hits.notDelivered.push(n.name);
            if (/status: SUBSCRIPTION_STATUS\.COMPLETED/.test(s)) hits.completed.push(n.name);
          }
        }
      };
      walk(root);
      expect(hits.fulfilled.sort()).toEqual(['messDelivery.service.ts']);
      expect(hits.notDelivered.sort()).toEqual(['messCompletion.service.ts']);
      expect(hits.completed.sort()).toEqual(['messCompletion.service.ts']);
      const svc = src('messDelivery.service.ts');
      expect((svc.match(/\bcode,/g) ?? []).length).toBeLessThanOrEqual(2); // the plaintext leaves the service only in the issue / regenerate result
    });

    it('49. the legacy gate-pass endpoint is still retired (410); the permission matrix is exact', async () => {
      expect((await send('post', '/api/v1/mess/verify-gatepass', who.admin.token, {})).status).toBe(410);
      const perms = readFileSync(join(root, 'authz', 'permissions.ts'), 'utf8');
      expect(perms).toMatch(/\[RoleEnum\.DELIVERY\]: \[[^\]]*'mess:delivery:read', 'mess:delivery:write'/);
      expect(perms.match(/mess:delivery:write/g)).toHaveLength(2); // the type + DELIVERY only
      expect(perms.match(/mess:delivery:override/g)).toHaveLength(2); // the type + SUPER_ADMIN only
      expect(perms).toMatch(/\[RoleEnum\.MD\]: \[[^\]]*'mess:delivery:read'\]/);
    });

    it('50. DELIVERY, CHEF, SUPER_ADMIN and MD hold no customer-context access to the handover code', async () => {
      const w = await world();
      const r = await dispatched(w);
      const meal = await mealAt(r.subs[w.a1].id, today);
      for (const l of [w.d1, w.chef, 'admin', 'md']) {
        for (const res of [await codeState(l, r.subs[w.a1].id, meal.id), await issue(l, r.subs[w.a1].id, meal.id), await regen(l, r.subs[w.a1].id, meal.id)]) expect(res.status, l).toBe(403);
      }
      void generateHandoverCode;
      void MessDeliveryService;
    });
  });
  // =============================================================================================== K. frozen membership and isolation
  describe('K. frozen membership: a later service-point change never moves a delivered meal', () => {
    it('51. eligibility and fulfilment follow the FROZEN meal membership, not the current account: moving a resident\'s account after release changes nothing', async () => {
      const w = await world();
      const r = await dispatched(w);
      // a1 and a2 are re-pointed to the OTHER service point AFTER the batch froze (a data-level change: the API refuses it while a subscription is open)
      await prisma.messAccount.updateMany({ where: { customerProfileId: { in: [who[w.a1].profileId!, who[w.a2].profileId!] } }, data: { servicePointId: w.sp2.id } });
      const { code } = await codeFor(w, r, w.a1); // still the resident of stop A (their meal is frozen into it)
      const mB = await mealAt(r.subs[w.b1].id, today);
      expect((await issue(w.b1, r.subs[w.b1].id, mB.id)).status).toBe(201);
      expect((await verify(w.d1, r.runId, r.stopA.id, code)).status).toBe(200);
      expect(await prisma.messMeal.count({ where: { deliveryStopId: r.stopA.id, status: 'FULFILLED' } })).toBe(2); // a1 AND a2: both frozen into stop A
      expect(await prisma.messMeal.count({ where: { deliveryStopId: r.stopB.id, status: 'FULFILLED' } })).toBe(0);
      const mine = await prisma.messMeal.findMany({ where: { messSubscriptionId: r.subs[w.a1].id } });
      expect(mine.every((m) => m.servicePointId === w.sp1.id)).toBe(true); // the snapshot never moved
    });

    it('52. a resident of one stop can never obtain, regenerate or read the code of another stop, and a meal of ANOTHER subscription is a 404', async () => {
      const w = await world();
      const r = await dispatched(w);
      const mA = await mealAt(r.subs[w.a1].id, today);
      const mB = await mealAt(r.subs[w.b1].id, today);
      expect((await issue(w.b1, r.subs[w.a1].id, mA.id)).status).toBe(404);
      expect((await codeState(w.a1, r.subs[w.b1].id, mB.id)).status).toBe(404);
      expect((await regen(w.a1, r.subs[w.b1].id, mB.id)).status).toBe(404);
      expect((await issue(w.a1, r.subs[w.a1].id, mB.id)).status).toBe(404); // their subscription, someone else's meal
      expect((await stopRow(r.stopA.id)).recipientCustomerProfileId).toBeNull();
      expect((await stopRow(r.stopB.id)).recipientCustomerProfileId).toBeNull();
    });

    it('53. the DIRECT kitchen and DIRECT delivery never see a Mess run: no order, no assignment, no payment is created by release / delivery', async () => {
      const w = await world();
      const orders = await prisma.order.count();
      const assignments = await prisma.deliveryAssignment.count();
      const r = await dispatched(w);
      const { code } = await codeFor(w, r);
      await verify(w.d1, r.runId, r.stopA.id, code);
      expect(await prisma.order.count()).toBe(orders + 3); // only the three Mess PURCHASE orders of this world
      expect(await prisma.deliveryAssignment.count()).toBe(assignments);
      const queue = await get('/api/v1/delivery/orders', who[w.d1].token);
      expect(JSON.stringify(queue.body)).not.toContain(r.runId);
    });
  });

  // =============================================================================================== L. completion semantics + day-close boundary (deterministic clock)
  describe('L. PAUSED is completion-terminal only after its resume cutoff; day-close boundaries; no financial effect', () => {
    const moneyCounts = async () => ({ refunds: await prisma.refund.count(), wallet: await prisma.walletTransaction.count(), payments: await prisma.payment.count(), orders: await prisma.order.count(), assignments: await prisma.deliveryAssignment.count(), pauseReq: await prisma.mealPauseRequest.count() });
    const iso = (ms: number) => new Date(ms).toISOString();

    /** plan2 subscription (today + tomorrow): today's meal already FULFILLED (as if delivered), tomorrow's meal PAUSED through the real API (its resume window is open now). */
    async function pausedTomorrow(label: string) {
      const sub = await activate(label, plan2.id);
      const m0 = await mealAt(sub.id, today);
      const m1 = await mealAt(sub.id, addDays(today, 1));
      await prisma.messMeal.update({ where: { id: m0.id }, data: { status: 'FULFILLED', fulfilledAt: new Date() } });
      const p = await send('post', `/api/v1/mess/subscriptions/${sub.id}/meals/${m1.id}/pause`, who[label].token, {});
      expect(p.status, JSON.stringify(p.body)).toBe(200);
      const paused = await prisma.messMeal.findUniqueOrThrow({ where: { id: m1.id } });
      return { sub, m1: paused, deadline: pauseDeadline(paused.serviceAt, 2) };
    }

    it('74. exact PAUSED predicate: one instant BEFORE the resume cutoff the meal is NONTERMINAL (subscription stays ACTIVE); AT the cutoff instant and after it, it is TERMINAL; completion never mutates the PAUSED meal', async () => {
      const w = await world();
      const cases = [
        { label: w.a1, at: (d: number) => d - 1, completes: false },
        { label: w.a2, at: (d: number) => d, completes: true },
        { label: w.b1, at: (d: number) => d + 1, completes: true }
      ];
      for (const c of cases) {
        const { sub, m1, deadline } = await pausedTomorrow(c.label);
        const now = c.at(deadline.getTime());
        // the SAME predicate pause / resume use decides, so the two can never disagree
        expect(withinPauseWindow(now, m1.serviceAt, 2), `${c.label}: resumable at ${iso(now)}`).toBe(!c.completes);
        const out = await atInstant(iso(now), () => MessCompletionService.tryComplete(sub.id));
        expect(out, `${c.label} at ${iso(now)}`).toBe(c.completes);
        expect((await subRow(sub.id)).status).toBe(c.completes ? 'COMPLETED' : 'ACTIVE');
        const after = await prisma.messMeal.findUniqueOrThrow({ where: { id: m1.id } });
        expect(after).toMatchObject({ status: 'PAUSED' }); // completion never touches the PAUSED meal
        expect(after.pausedAt?.getTime()).toBe(m1.pausedAt?.getTime());
        expect(after.updatedAt.getTime()).toBe(m1.updatedAt.getTime());
        if (c.completes) {
          // invariant: a COMPLETED subscription never has a PAUSED meal that was still legally resumable at that instant
          expect(withinPauseWindow(now, after.serviceAt, 2)).toBe(false);
          expect((await audits('MESS_SUBSCRIPTION_COMPLETED', sub.id)).length).toBe(1);
        } else {
          // C: everything else terminal + one resumable PAUSED meal => the customer can still resume it (a real API call, not a shortcut)
          const r = await send('post', `/api/v1/mess/subscriptions/${sub.id}/meals/${m1.id}/resume`, who[c.label].token, {});
          expect(r.status, JSON.stringify(r.body)).toBe(200);
        }
      }
    });

    it('75. D: once the cutoff has passed and nothing else is open the day-close completes it; an unresolved delivery stop or a SCHEDULED meal still blocks it', async () => {
      const w = await world();
      const { sub, deadline } = await pausedTomorrow(w.a1);
      const out = await atInstant(iso(deadline.getTime() + 60_000), () => MessCompletionService.closeDay());
      expect(out.subscriptionsCompleted).toBeGreaterThanOrEqual(1);
      expect((await subRow(sub.id)).status).toBe('COMPLETED');
      // a SCHEDULED meal blocks completion whatever the clock says
      const sub2 = await activate(w.a2, plan2.id);
      expect(await atInstant(iso(deadline.getTime() + 3_600_000), () => MessCompletionService.tryComplete(sub2.id))).toBe(false);
      expect((await subRow(sub2.id)).status).toBe('ACTIVE');
    });

    it('76. day-close boundary on the business date (deterministic clock): yesterday-dated is eligible, today and tomorrow are NOT; PAUSED / CANCELLED / FULFILLED / NOT_DELIVERED are untouched; reruns change nothing', async () => {
      const w = await world();
      const sA = await activate(w.a1, plan5.id); // today .. today+4
      const sB = await activate(w.a2, plan5.id);
      const sC = await activate(w.b1, plan5.id);
      const a = await mealsOf(sA.id);
      const b = await mealsOf(sB.id);
      const c = await mealsOf(sC.id);
      await prisma.messMeal.update({ where: { id: a[1].id }, data: { status: 'PAUSED', pausedAt: new Date() } }); // past + PAUSED
      await prisma.messMeal.update({ where: { id: b[0].id }, data: { status: 'FULFILLED', fulfilledAt: new Date() } }); // past + FULFILLED
      await prisma.messMeal.update({ where: { id: b[1].id }, data: { status: 'CANCELLED' } }); // past + CANCELLED
      await prisma.messMeal.update({ where: { id: c[0].id }, data: { status: 'NOT_DELIVERED' } }); // past + NOT_DELIVERED already
      const before = await moneyCounts();
      // the business date becomes today+2 (10:00 IST): dates today and today+1 are in the past, today+2 is "today", today+3 / today+4 are the future
      const at = `${addDays(today, 2)}T10:00:00.000+05:30`;
      await atInstant(at, () => MessCompletionService.closeDay());
      const st = async (id: string) => Object.fromEntries((await mealsOf(id)).map((m) => [dateToString(m.mealDate), m.status]));
      const A = await st(sA.id);
      const B = await st(sB.id);
      const C = await st(sC.id);
      const d = (n: number) => addDays(today, n);
      expect(A[d(0)]).toBe('NOT_DELIVERED'); // yesterday (relative to the clock): eligible
      expect(A[d(1)]).toBe('PAUSED'); // untouched
      expect(A[d(2)]).toBe('SCHEDULED'); // TODAY: not eligible
      expect(A[d(3)]).toBe('SCHEDULED'); // tomorrow: not eligible
      expect(A[d(4)]).toBe('SCHEDULED');
      expect(B[d(0)]).toBe('FULFILLED');
      expect(B[d(1)]).toBe('CANCELLED');
      expect([B[d(2)], B[d(3)], B[d(4)]]).toEqual(['SCHEDULED', 'SCHEDULED', 'SCHEDULED']);
      expect(C[d(0)]).toBe('NOT_DELIVERED'); // untouched (idempotent)
      expect(C[d(1)]).toBe('NOT_DELIVERED'); // eligible
      expect([C[d(2)], C[d(3)]]).toEqual(['SCHEDULED', 'SCHEDULED']);
      expect((await audits('MESS_MEALS_EXPIRED', sA.id)).length).toBe(1);
      for (const s of [sA, sB, sC]) expect((await subRow(s.id)).status).toBe('ACTIVE'); // future meals remain
      await atInstant(at, () => MessCompletionService.closeDay()); // idempotent
      expect(await st(sA.id)).toEqual(A);
      expect((await audits('MESS_MEALS_EXPIRED', sA.id)).length).toBe(1);
      expect(await moneyCounts()).toEqual(before); // ZERO financial effect
    });

    it('77. the Asia/Kolkata midnight is the exact edge: 23:59:59.999 of the meal day is still "today" (untouched); 00:00:00.000 of the next day makes it eligible', async () => {
      const w = await world();
      const sub = await activate(w.a1, plan1.id);
      const m = await mealAt(sub.id, today);
      await atInstant(`${today}T23:59:59.999+05:30`, () => MessCompletionService.closeDay());
      expect((await prisma.messMeal.findUniqueOrThrow({ where: { id: m.id } })).status).toBe('SCHEDULED');
      expect((await subRow(sub.id)).status).toBe('ACTIVE');
      await atInstant(`${addDays(today, 1)}T00:00:00.000+05:30`, () => MessCompletionService.closeDay());
      expect((await prisma.messMeal.findUniqueOrThrow({ where: { id: m.id } })).status).toBe('NOT_DELIVERED');
      // E: completion after the day-close: every meal terminal => ACTIVE -> COMPLETED, no financial row
      expect((await subRow(sub.id)).status).toBe('COMPLETED');
      expect(await prisma.refund.count({ where: { orderId: sub.purchaseOrder.id } })).toBe(0);
    });

    it('78. a meal attached to an active delivery stop is untouched by the unreleased-meal rule; only the STOP rule closes it once its day has ended', async () => {
      const w = await world();
      const r = await dispatched(w);
      const stopMeal = await prisma.messMeal.findFirstOrThrow({ where: { deliveryStopId: r.stopA.id } });
      await MessCompletionService.closeDay(); // same business day: nothing may change
      expect(await prisma.messMeal.findUniqueOrThrow({ where: { id: stopMeal.id } })).toMatchObject({ status: 'SCHEDULED' });
      expect((await stopRow(r.stopA.id)).status).toBe('PENDING');
      expect((await audits('MESS_MEALS_EXPIRED', stopMeal.messSubscriptionId)).length).toBe(0);
      await atInstant(`${addDays(today, 1)}T00:00:00.000+05:30`, () => MessCompletionService.closeDay());
      expect((await stopRow(r.stopA.id)).status).toBe('CLOSED_UNDELIVERED');
      expect((await prisma.messMeal.findUniqueOrThrow({ where: { id: stopMeal.id } })).status).toBe('NOT_DELIVERED');
      expect((await audits('MESS_MEALS_EXPIRED', stopMeal.messSubscriptionId)).length).toBe(0); // closed by the stop rule, never by the unreleased rule
      expect((await audits('MESS_STOP_CLOSED_UNDELIVERED', r.stopA.id)).length).toBe(1);
    });

    it('79. PAUSED becoming completion-terminal and day-close producing NOT_DELIVERED create ZERO refund / wallet / payment / order / delivery-assignment / pause-request rows, no replacement meal and no term change', async () => {
      const w = await world();
      const { sub, deadline } = await pausedTomorrow(w.a1);
      const before = await moneyCounts();
      const row = await subRow(sub.id);
      const mealCount = await prisma.messMeal.count({ where: { messSubscriptionId: sub.id } });
      await atInstant(iso(deadline.getTime() + 1), () => MessCompletionService.closeDay());
      expect((await subRow(sub.id)).status).toBe('COMPLETED');
      expect(await moneyCounts()).toEqual(before);
      const after = await subRow(sub.id);
      expect([after.endDate.getTime(), after.totalMealsAllowed, after.mealsRemaining, Number(after.mealsRemaining)]).toEqual([row.endDate.getTime(), row.totalMealsAllowed, row.mealsRemaining, Number(row.mealsRemaining)]); // no extension, no credit
      expect(await prisma.messMeal.count({ where: { messSubscriptionId: sub.id } })).toBe(mealCount); // no replacement meal
      expect(await prisma.refund.count({ where: { orderId: sub.purchaseOrder.id } })).toBe(0);
      expect(await prisma.order.findUniqueOrThrow({ where: { id: sub.purchaseOrder.id } })).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID', paymentMethod: 'ONLINE' });
    });

    it('80. the completion code reuses the pause / resume cutoff function (no second calculation, no database clock)', () => {
      const s = readFileSync(join(__dirname, '..', 'modules', 'mess', 'messCompletion.service.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(s).toContain("import { withinPauseWindow } from './messMeal.service.js';");
      expect(s).toMatch(/withinPauseWindow\(nowMs, m\.serviceAt, cutoff\)/);
      expect(s).not.toMatch(/AT TIME ZONE|interval '1 hour'/); // no SQL / database-clock duplicate of the cutoff
    });
  });

});
