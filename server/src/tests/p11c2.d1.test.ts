import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import app from '../app.js';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { resetPaymentConfig } from '../config/paymentConfig.js';
import { getPaymentProvider } from '../modules/payment/providerRegistry.js';
import { MockPaymentProvider } from '../modules/payment/mock.provider.js';
import { PaymentReconciliationService } from '../modules/payment/paymentReconciliation.service.js';
import { derivePaymentSummary } from '../modules/payment/paymentSummary.service.js';
import { PROVIDER_STATE_UNVERIFIED } from '../modules/payment/paymentStatus.js';

/**
 * P11C-2 D1 - payment retry-safety hardening. RETRY-SAFETY INVARIANT: another payment may be started only when backend / provider
 * authoritative state proves it safe; time, a restart, a client error, a timeout or a dismissed checkout never prove it.
 * Real PostgreSQL + the in-process mock provider (no network, no real money).
 */
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const mock = getPaymentProvider() as MockPaymentProvider;
const sign = (userId: string, email: string, roles: RoleEnum[]) => jwt.sign({ userId, email, roles }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('P11C-2 D1 - provider-checked reuse of unexpired PENDING payment sessions', () => {
  const ts = Date.now();
  let seq = 0;
  let cust: { id: string; profileId: string; token: string };
  const NET = '145.50';
  const MINOR = 14550;

  beforeAll(async () => {
    const email = `p11c2d1_${ts}@test.com`;
    const u = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash('Password123!', 4),
        roles: { create: [{ role: RoleEnum.CUSTOMER }] },
        customerProfile: { create: { fullName: 'P11C2 D1', referralCode: `PB-D1${ts}` } }
      },
      include: { customerProfile: true }
    });
    cust = { id: u.id, profileId: u.customerProfile!.id, token: sign(u.id, email, [RoleEnum.CUSTOMER]) };
    await quiesce();
  });
  beforeEach(() => mock.reset());
  afterEach(() => {
    resetPaymentConfig();
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function quiesce() {
    await prisma.payment.updateMany({ where: { provider: { not: null } }, data: { nextAttemptAt: null, lockedUntil: null, lockedBy: null } });
    await prisma.paymentWebhookEvent.updateMany({ where: { status: { in: ['RECEIVED', 'RETRY_PENDING'] } }, data: { status: 'IGNORED', ignoredReason: 'TEST_CLEANUP', lockedUntil: null } });
  }
  const mkOrder = (over: Record<string, unknown> = {}) =>
    prisma.order.create({
      data: { orderNumber: `D1-${ts}-${++seq}`, totalAmount: 100, netAmount: NET, customerProfileId: cust.profileId, status: 'PENDING', paymentStatus: 'PENDING', paymentMethod: 'ONLINE', orderType: 'DIRECT', ...over } as never
    });
  const createSession = (orderId: string) => request(app).post(`/api/v1/orders/${orderId}/payment-attempts`).set(bearer(cust.token)).send({});
  const verify = (orderId: string, attemptId: string, providerOrderId: string, providerPaymentId: string) =>
    request(app)
      .post(`/api/v1/orders/${orderId}/payment-attempts/${attemptId}/verify`)
      .set(bearer(cust.token))
      .send({ providerOrderId, providerPaymentId, signature: mock.signCheckout(providerOrderId, providerPaymentId) });
  const webhook = (raw: Buffer, headers: Record<string, string>) => request(app).post('/api/v1/payments/webhook').set({ ...headers, 'content-type': 'application/octet-stream' }).send(raw);
  const orderDto = async (orderId: string) => (await request(app).get(`/api/v1/orders/${orderId}`).set(bearer(cust.token))).body.data;
  const sessionOf = (id: string) => prisma.payment.findUniqueOrThrow({ where: { id } });
  const orderOf = (id: string) => prisma.order.findUniqueOrThrow({ where: { id } });
  const expire = (id: string) => prisma.payment.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });

  async function ready(over: Record<string, unknown> = {}) {
    const order = await mkOrder(over);
    const res = await createSession(order.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return { order, attemptId: res.body.data.attemptId as string, providerOrderId: res.body.data.providerOrderId as string };
  }

  // ---------------------------------------------------------------------------------------------- proven safe -> reuse
  it('1. PENDING + the provider has NO payment: the SAME session / provider order is reused (no duplicate provider order)', async () => {
    const { order, attemptId, providerOrderId } = await ready();
    expect(mock.orders.size).toBe(1);
    const again = await createSession(order.id);
    expect(again.status).toBe(200);
    expect(again.body.data).toMatchObject({ attemptId, providerOrderId, status: 'PENDING' });
    expect(mock.orders.size).toBe(1);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
    const dto = await orderDto(order.id);
    expect(dto.payment).toEqual({ state: 'AWAITING_PAYMENT', canStartPayment: true });
  });

  it('1b. an abandoned / dismissed checkout (provider payment CREATED) and a FAILED payment do NOT block a retry', async () => {
    const { order, attemptId, providerOrderId } = await ready();
    mock.simulatePayment(providerOrderId, { status: 'CREATED' });
    mock.simulatePayment(providerOrderId, { status: 'FAILED', errorCode: 'BAD_REQUEST_ERROR' });
    const again = await createSession(order.id);
    expect(again.status).toBe(200);
    expect(again.body.data).toMatchObject({ attemptId, providerOrderId });
    expect(mock.orders.size).toBe(1);
  });

  // ---------------------------------------------------------------------------------------------- captured
  it('2. PENDING + provider CAPTURED the payment (backend not told yet): settled via the existing path, 409 ALREADY_COMPLETED, no new provider order', async () => {
    const { order, attemptId, providerOrderId } = await ready();
    mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
    expect(await prisma.providerPayment.count({ where: { orderId: order.id } })).toBe(0); // the backend has not heard of it
    const res = await createSession(order.id);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('PAYMENT_ALREADY_COMPLETED');
    expect(mock.orders.size).toBe(1);
    expect(await orderOf(order.id)).toMatchObject({ paymentStatus: 'PAID', status: 'CONFIRMED' });
    expect((await sessionOf(attemptId)).status).toBe('SUCCESS');
    expect(await prisma.providerPayment.count({ where: { orderId: order.id, reconciliationStatus: 'APPLIED' } })).toBe(1);
    expect((await orderDto(order.id)).payment).toEqual({ state: 'PAID', canStartPayment: false });
    // repeat: still refused, still exactly one effective payment
    const repeat = await createSession(order.id);
    expect(repeat.status).toBe(409);
    expect(await prisma.orderEvent.count({ where: { orderId: order.id, toStatus: 'CONFIRMED' } })).toBe(1);
  });

  it('2b. a captured payment with a MISMATCHED amount (flagged for review) also blocks a new payment: money has moved', async () => {
    const { order, providerOrderId } = await ready();
    const p = mock.simulatePayment(providerOrderId, { status: 'CAPTURED', amountMinor: 100 });
    const res = await createSession(order.id);
    expect(res.status).toBe(409);
    expect(await prisma.providerPayment.findFirstOrThrow({ where: { providerPaymentId: p.providerPaymentId } })).toMatchObject({ reconciliationStatus: 'AMOUNT_MISMATCH' });
    expect(await orderOf(order.id)).toMatchObject({ paymentStatus: 'PENDING' }); // never PAID by a mismatched capture
    expect((await orderDto(order.id)).payment).toEqual({ state: 'CONFIRMING', canStartPayment: false });
    expect(mock.orders.size).toBe(1);
  });

  // ---------------------------------------------------------------------------------------------- authorized / in progress
  it('3. PENDING + provider AUTHORIZED the payment: blocked (409 IN_PROGRESS), no new provider order, canStartPayment false', async () => {
    const { order, providerOrderId } = await ready();
    mock.simulatePayment(providerOrderId, { status: 'AUTHORIZED' });
    const res = await createSession(order.id);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('PAYMENT_ATTEMPT_IN_PROGRESS');
    expect(mock.orders.size).toBe(1);
    expect(await orderOf(order.id)).toMatchObject({ paymentStatus: 'PENDING', status: 'PENDING' }); // never PAID by an authorization
    expect((await orderDto(order.id)).payment).toEqual({ state: 'CONFIRMING', canStartPayment: false });
  });

  it('3b. the provider order is already "paid" but no captured payment is visible yet: blocked, not re-exposed', async () => {
    const { order, providerOrderId } = await ready();
    mock.orders.set(providerOrderId, { ...mock.orders.get(providerOrderId)!, status: 'paid' });
    const res = await createSession(order.id);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('PAYMENT_ATTEMPT_IN_PROGRESS');
    expect(mock.orders.size).toBe(1);
  });

  // ---------------------------------------------------------------------------------------------- fail closed
  it('4. PENDING + the provider cannot be asked: FAIL CLOSED (503), no checkout, no new provider order, summary becomes CONFIRMING / false', async () => {
    const { order, attemptId } = await ready();
    expect((await orderDto(order.id)).payment.canStartPayment).toBe(true);
    mock.setReadFailure(true);
    const res = await createSession(order.id);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('PAYMENT_PROVIDER_UNAVAILABLE');
    expect(res.body.data?.providerOrderId).toBeUndefined();
    mock.setReadFailure(false);
    expect(mock.orders.size).toBe(1);
    const s = await sessionOf(attemptId);
    expect(s).toMatchObject({ status: 'PENDING', lastError: PROVIDER_STATE_UNVERIFIED });
    expect(s.nextAttemptAt).not.toBeNull(); // reconciliation is scheduled
    expect((await orderDto(order.id)).payment).toEqual({ state: 'CONFIRMING', canStartPayment: false });
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('4b. while the provider stays unreachable every call keeps failing closed; once it answers and nothing is in flight the SAME session is reused and the marker clears', async () => {
    const { order, attemptId, providerOrderId } = await ready();
    mock.setReadFailure(true);
    expect((await createSession(order.id)).status).toBe(503);
    expect((await createSession(order.id)).status).toBe(503);
    expect(mock.orders.size).toBe(1);
    mock.setReadFailure(false);
    const ok = await createSession(order.id);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ attemptId, providerOrderId });
    expect((await sessionOf(attemptId)).lastError).toBeNull();
    expect((await orderDto(order.id)).payment).toEqual({ state: 'AWAITING_PAYMENT', canStartPayment: true });
  });

  it('4c. a payment captured while the provider was unreachable is found afterwards: settled, never offered again', async () => {
    const { order, providerOrderId } = await ready();
    mock.setReadFailure(true);
    expect((await createSession(order.id)).status).toBe(503);
    mock.setReadFailure(false);
    mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
    const res = await createSession(order.id);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('PAYMENT_ALREADY_COMPLETED');
    expect(await orderOf(order.id)).toMatchObject({ paymentStatus: 'PAID' });
  });

  it('4d. a customer verification whose provider lookup failed (202) also makes the summary CONFIRMING / false; a retried verification then settles', async () => {
    const { order, attemptId, providerOrderId } = await ready();
    const p = mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
    mock.setReadFailure(true);
    const first = await verify(order.id, attemptId, providerOrderId, p.providerPaymentId);
    expect(first.status).toBe(202);
    expect(first.body.data.result).toBe('PENDING');
    mock.setReadFailure(false);
    expect((await orderDto(order.id)).payment).toEqual({ state: 'CONFIRMING', canStartPayment: false });
    const second = await verify(order.id, attemptId, providerOrderId, p.providerPaymentId);
    expect(second.status).toBe(200);
    expect(second.body.data.result).toBe('PAID');
    expect((await orderDto(order.id)).payment).toEqual({ state: 'PAID', canStartPayment: false });
  });

  it('4e. reconciliation clears the marker once the provider is readable and nothing is in flight', async () => {
    const { order, attemptId } = await ready();
    mock.setReadFailure(true);
    expect((await createSession(order.id)).status).toBe(503);
    mock.setReadFailure(false);
    await prisma.payment.update({ where: { id: attemptId }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    await PaymentReconciliationService.runOnce({ workerId: 'd1-clear', limit: 50 });
    expect((await sessionOf(attemptId)).lastError).toBeNull();
    expect((await orderDto(order.id)).payment).toEqual({ state: 'AWAITING_PAYMENT', canStartPayment: true });
  });

  // ---------------------------------------------------------------------------------------------- concurrency
  it('5. repeated / concurrent create calls never create a second provider order and all return the SAME session', async () => {
    const { order, attemptId, providerOrderId } = await ready();
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => createSession(order.id)));
    for (const r of results) {
      expect(r.status).toBe(200);
      expect(r.body.data).toMatchObject({ attemptId, providerOrderId });
    }
    expect(mock.orders.size).toBe(1);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('5b. concurrent FIRST creates for a fresh order also end with one provider order', async () => {
    const order = await mkOrder();
    const results = await Promise.all([1, 2, 3].map(() => createSession(order.id)));
    const ok = results.filter((r) => r.status === 200);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    expect(new Set(ok.map((r) => r.body.data.providerOrderId)).size).toBe(1);
    expect(mock.orders.size).toBe(1);
    for (const r of results.filter((x) => x.status !== 200)) expect([409, 503]).toContain(r.status);
  });

  it('6. webhook racing a create call (payment already captured): exactly one APPLIED payment, one PAID, one CONFIRMED', async () => {
    const { order, providerOrderId } = await ready();
    const p = mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
    const hook = mock.buildWebhook('payment.captured', p);
    const [c, w, v] = await Promise.all([createSession(order.id), webhook(hook.raw, hook.headers), createSession(order.id)]);
    expect(w.status).toBe(200);
    for (const r of [c, v]) {
      expect(r.status).toBe(409);
      expect(r.body.error).toBe('PAYMENT_ALREADY_COMPLETED');
    }
    expect(await prisma.orderEvent.count({ where: { orderId: order.id, toStatus: 'CONFIRMED' } })).toBe(1);
    expect(await prisma.providerPayment.count({ where: { orderId: order.id } })).toBe(1);
    expect(await prisma.providerPayment.count({ where: { orderId: order.id, reconciliationStatus: 'APPLIED' } })).toBe(1);
    expect(await orderOf(order.id)).toMatchObject({ paymentStatus: 'PAID', status: 'CONFIRMED' });
    expect(mock.orders.size).toBe(1);
  });

  // ---------------------------------------------------------------------------------------------- unusable provider order is still replaced
  it('7. a provider order that is PROVEN unusable (amount mismatch) is replaced even on the reuse path', async () => {
    const { order, attemptId, providerOrderId } = await ready();
    mock.orders.set(providerOrderId, { ...mock.orders.get(providerOrderId)!, amountMinor: MINOR + 100 });
    const res = await createSession(order.id);
    expect(res.status).toBe(200);
    expect(res.body.data.attemptId).not.toBe(attemptId);
    expect(res.body.data.providerOrderId).not.toBe(providerOrderId);
    expect((await sessionOf(attemptId)).supersededById).toBe(res.body.data.attemptId);
    expect(mock.orders.size).toBe(2);
  });

  // ---------------------------------------------------------------------------------------------- existing behaviours preserved
  it('8. an EXPIRED session is still renewed (same provider order, new TTL); with the provider unreachable it fails closed with no replacement', async () => {
    const { order, attemptId, providerOrderId } = await ready();
    await expire(attemptId);
    mock.setReadFailure(true);
    expect((await createSession(order.id)).status).toBe(503);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
    mock.setReadFailure(false);
    const renewed = await createSession(order.id);
    expect(renewed.status).toBe(200);
    expect(renewed.body.data).toMatchObject({ attemptId, providerOrderId, status: 'PENDING' });
    expect(new Date(renewed.body.data.expiresAt).getTime()).toBeGreaterThan(Date.now() + 10 * 60_000);
    expect(mock.orders.size).toBe(1);
  });

  it('8b. an EXPIRED session with a captured payment is settled, not renewed', async () => {
    const { order, attemptId, providerOrderId } = await ready();
    await expire(attemptId);
    mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
    const res = await createSession(order.id);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('PAYMENT_ALREADY_COMPLETED');
    expect(await orderOf(order.id)).toMatchObject({ paymentStatus: 'PAID' });
  });

  it('9. UNKNOWN (provider order creation outcome unknown) stays safe: no second provider order, CONFIRMING / false', async () => {
    const order = await mkOrder();
    mock.failNextCreate('unknown');
    const first = await createSession(order.id);
    expect(first.status).toBe(503);
    const dto = await orderDto(order.id);
    expect(dto.payment).toEqual({ state: 'CONFIRMING', canStartPayment: false });
    const second = await createSession(order.id);
    expect([409, 503]).toContain(second.status);
    expect(mock.orders.size).toBe(0);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('10. PAYMENT_ALREADY_COMPLETED for a PAID order and ORDER_NOT_PAYABLE for a non-payable one are unchanged', async () => {
    const paid = await mkOrder({ paymentStatus: 'PAID', status: 'CONFIRMED' });
    const a = await createSession(paid.id);
    expect(a.status).toBe(409);
    expect(a.body.error).toBe('PAYMENT_ALREADY_COMPLETED');
    const cancelled = await mkOrder({ status: 'CANCELLED' });
    const b = await createSession(cancelled.id);
    expect(b.status).toBe(409);
    expect(b.body.error).toBe('ORDER_NOT_PAYABLE');
    const legacy = await mkOrder({ paymentMethod: 'COD' });
    expect((await createSession(legacy.id)).body.error).toBe('ORDER_NOT_PAYABLE');
    expect(mock.orders.size).toBe(0);
  });

  it('11. the response contract is unchanged (same safe field set) and the unverified marker is not a new endpoint or field', async () => {
    const { dto } = { dto: (await createSession((await mkOrder()).id)).body.data };
    expect(Object.keys(dto).sort()).toEqual(['amountMinor', 'attemptId', 'currency', 'expiresAt', 'keyId', 'orderNumber', 'provider', 'providerOrderId', 'status']);
  });
});

describe('P11C-2 D1 - derivePaymentSummary treats an unverified provider state as unresolved (pure)', () => {
  const order = { id: 'o1', status: 'PENDING', orderType: 'DIRECT', paymentStatus: 'PENDING', paymentMethod: 'ONLINE', netAmount: '145.50' };
  const session = (over: Record<string, unknown> = {}) => ({ status: 'PENDING', providerOrderId: 'order_x', supersededById: null, reviewFlag: null, lastError: null, ...over });

  it('a current PENDING / EXPIRED session carrying the marker is CONFIRMING / false (also for the verify-lookup marker)', () => {
    for (const marker of [PROVIDER_STATE_UNVERIFIED, 'VERIFY_FETCH_UNAVAILABLE']) {
      for (const status of ['PENDING', 'EXPIRED']) {
        expect(derivePaymentSummary(order, [session({ status, lastError: marker })], [], 100)).toEqual({ state: 'CONFIRMING', canStartPayment: false });
      }
    }
  });

  it('a marker on a superseded or FAILED session, or an unrelated lastError, does not block', () => {
    expect(derivePaymentSummary(order, [session({ lastError: PROVIDER_STATE_UNVERIFIED, supersededById: randomUUID() })], [], 100)).toEqual({ state: 'NOT_STARTED', canStartPayment: true });
    expect(derivePaymentSummary(order, [session({ status: 'FAILED', lastError: PROVIDER_STATE_UNVERIFIED })], [], 100)).toEqual({ state: 'NOT_STARTED', canStartPayment: true });
    expect(derivePaymentSummary(order, [session({ lastError: 'PROVIDER_UNAVAILABLE' })], [], 100)).toEqual({ state: 'AWAITING_PAYMENT', canStartPayment: true });
  });

  it('without a marker the existing derivation is unchanged', () => {
    expect(derivePaymentSummary(order, [session()], [], 100)).toEqual({ state: 'AWAITING_PAYMENT', canStartPayment: true });
    expect(derivePaymentSummary(order, [], [], 100)).toEqual({ state: 'NOT_STARTED', canStartPayment: true });
  });
});
