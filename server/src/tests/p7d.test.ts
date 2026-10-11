import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getPaymentProvider } from '../modules/payment/providerRegistry.js';
import { MockPaymentProvider } from '../modules/payment/mock.provider.js';
import { derivePaymentSummary, SummaryLedgerRow, SummaryOrderInput, SummarySession } from '../modules/payment/paymentSummary.service.js';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const mock = getPaymentProvider() as MockPaymentProvider;
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

// ---------------------------------------------------------------------------------------------------- the pure derivation table
describe('P7D-G1 — payment summary derivation table (pure)', () => {
  const order = (over: Partial<SummaryOrderInput> = {}): SummaryOrderInput => ({ id: 'o1', status: 'PENDING', orderType: 'DIRECT', paymentStatus: 'PENDING', paymentMethod: 'ONLINE', netAmount: '145.50', ...over });
  const session = (over: Partial<SummarySession> = {}): SummarySession => ({ status: 'PENDING', providerOrderId: 'order_x', supersededById: null, reviewFlag: null, ...over });
  const row = (providerStatus: string, reconciliationStatus = 'PENDING'): SummaryLedgerRow => ({ providerStatus, reconciliationStatus });
  const d = (o: SummaryOrderInput, s: SummarySession[] = [], l: SummaryLedgerRow[] = []) => derivePaymentSummary(o, s, l, 100);

  it('1. paid money (PAID / PARTIALLY_REFUNDED / REFUNDED) is PAID and never startable', () => {
    for (const paymentStatus of ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED']) expect(d(order({ paymentStatus, status: 'CANCELLED' }))).toEqual({ state: 'PAID', canStartPayment: false });
  });

  it('2. orders that cannot be paid online are NOT_STARTED and not startable: not PENDING, not DIRECT, COD, below the provider minimum', () => {
    for (const status of ['CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY', 'DISPATCHED', 'DELIVERED', 'CANCELLED']) expect(d(order({ status })), status).toEqual({ state: 'NOT_STARTED', canStartPayment: false });
    expect(d(order({ orderType: 'MESS' }))).toEqual({ state: 'NOT_STARTED', canStartPayment: false });
    expect(d(order({ paymentMethod: 'COD' }))).toEqual({ state: 'NOT_STARTED', canStartPayment: false });
    expect(d(order({ paymentMethod: null }))).toEqual({ state: 'NOT_STARTED', canStartPayment: false });
    expect(d(order({ netAmount: '0.50' }))).toEqual({ state: 'NOT_STARTED', canStartPayment: false });
    expect(d(order({ netAmount: '1.005' }))).toEqual({ state: 'NOT_STARTED', canStartPayment: false }); // not expressible in whole paise
    expect(d(order({ netAmount: '1.00' }))).toEqual({ state: 'NOT_STARTED', canStartPayment: true }); // exactly the minimum is fine
    // even with money-like evidence a cancelled order stays "not startable" (the refund state reports the review)
    expect(d(order({ status: 'CANCELLED' }), [], [row('CAPTURED', 'AFTER_CANCELLATION')]).canStartPayment).toBe(false);
  });

  it('3. UNKNOWN / CREATED sessions mean unresolved truth: CONFIRMING, not startable', () => {
    for (const status of ['UNKNOWN', 'CREATED']) expect(d(order(), [session({ status, providerOrderId: null })]), status).toEqual({ state: 'CONFIRMING', canStartPayment: false });
  });

  it('4. any review-flagged session is CONFIRMING, not startable (e.g. AUTHORIZED_NOT_CAPTURED, amount mismatch)', () => {
    for (const reviewFlag of ['AUTHORIZED_NOT_CAPTURED', 'AMOUNT_MISMATCH', 'DUPLICATE_CAPTURE', 'UNKNOWN_OUTCOME_UNRESOLVED']) {
      expect(d(order(), [session({ reviewFlag })]), reviewFlag).toEqual({ state: 'CONFIRMING', canStartPayment: false });
    }
  });

  it('5. AUTHORIZED, or CAPTURED / REFUNDED that is not APPLIED, is money in flight: CONFIRMING, not startable', () => {
    expect(d(order(), [session()], [row('AUTHORIZED')])).toEqual({ state: 'CONFIRMING', canStartPayment: false });
    for (const rec of ['PENDING', 'AMOUNT_MISMATCH', 'CURRENCY_MISMATCH', 'DUPLICATE', 'AFTER_CANCELLATION']) {
      expect(d(order(), [session()], [row('CAPTURED', rec)]), rec).toEqual({ state: 'CONFIRMING', canStartPayment: false });
    }
    expect(d(order(), [], [row('REFUNDED', 'PENDING')]).canStartPayment).toBe(false);
  });

  it('6. FAILED / CREATED provider payments alone are retryable attempts: they do not block', () => {
    expect(d(order(), [session()], [row('FAILED')])).toEqual({ state: 'AWAITING_PAYMENT', canStartPayment: true });
    expect(d(order(), [], [row('CREATED')])).toEqual({ state: 'NOT_STARTED', canStartPayment: true });
  });

  it('7. a current PENDING or EXPIRED session with a provider order is AWAITING_PAYMENT and startable (the server re-checks the provider before re-use/renewal)', () => {
    expect(d(order(), [session({ status: 'PENDING' })])).toEqual({ state: 'AWAITING_PAYMENT', canStartPayment: true });
    expect(d(order(), [session({ status: 'EXPIRED' })])).toEqual({ state: 'AWAITING_PAYMENT', canStartPayment: true });
  });

  it('8. no session, or only FAILED / ABANDONED / superseded ones, is NOT_STARTED and startable', () => {
    expect(d(order())).toEqual({ state: 'NOT_STARTED', canStartPayment: true });
    expect(d(order(), [session({ status: 'FAILED', providerOrderId: null }), session({ status: 'ABANDONED' })])).toEqual({ state: 'NOT_STARTED', canStartPayment: true });
    expect(d(order(), [session({ status: 'PENDING', supersededById: 'newer' })])).toEqual({ state: 'NOT_STARTED', canStartPayment: true });
  });

  it('9. PRECEDENCE: unresolved evidence outranks a live session; PAID outranks everything', () => {
    expect(d(order(), [session({ status: 'PENDING' }), session({ status: 'UNKNOWN', providerOrderId: null })])).toEqual({ state: 'CONFIRMING', canStartPayment: false });
    expect(d(order({ paymentStatus: 'PAID' }), [session({ status: 'UNKNOWN', providerOrderId: null })], [row('AUTHORIZED')])).toEqual({ state: 'PAID', canStartPayment: false });
  });

  it('10. the summary has exactly two keys and nothing about the provider', () => {
    const s = d(order(), [session({ reviewFlag: 'AUTHORIZED_NOT_CAPTURED' })], [row('AUTHORIZED')]);
    expect(Object.keys(s).sort()).toEqual(['canStartPayment', 'state']);
  });
});

// ---------------------------------------------------------------------------------------------------- through the real API
describe('P7D-G1 — payment summary on the customer order DTO (real PostgreSQL, mock provider)', () => {
  const ts = Date.now();
  let seq = 0;
  const who: Record<string, { id: string; profileId: string; token: string }> = {};

  async function mk(label: string) {
    const email = `p7d_${label}_${ts}@test.com`;
    const u = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash('Password123!', 4),
        roles: { create: { role: RoleEnum.CUSTOMER } },
        customerProfile: { create: { fullName: `P7D ${label}`, referralCode: `PB-7D${label.toUpperCase()}${ts}` } }
      },
      include: { customerProfile: true }
    });
    who[label] = { id: u.id, profileId: u.customerProfile!.id, token: jwt.sign({ userId: u.id, email, roles: [RoleEnum.CUSTOMER] }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' }) };
  }
  const mkOrder = (over: Record<string, unknown> = {}) =>
    prisma.order.create({ data: { orderNumber: `P7D-${ts}-${++seq}`, totalAmount: 100, netAmount: '145.50', customerProfileId: who.a.profileId, status: 'PENDING', paymentStatus: 'PENDING', paymentMethod: 'ONLINE', orderType: 'DIRECT', ...over } as never });
  const session = (orderId: string) => request(app).post(`/api/v1/orders/${orderId}/payment-attempts`).set(bearer(who.a.token)).send({});
  const verify = (orderId: string, attemptId: string, providerOrderId: string, providerPaymentId: string) =>
    request(app).post(`/api/v1/orders/${orderId}/payment-attempts/${attemptId}/verify`).set(bearer(who.a.token)).send({ providerOrderId, providerPaymentId, signature: mock.signCheckout(providerOrderId, providerPaymentId) });
  const summary = async (orderId: string) => (await request(app).get(`/api/v1/orders/${orderId}`).set(bearer(who.a.token))).body.data.payment;

  beforeAll(async () => {
    await mk('a');
    await mk('b');
  });
  beforeEach(() => mock.reset());
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('11. a fresh online order: NOT_STARTED + startable (detail AND list agree)', async () => {
    const o = await mkOrder();
    expect(await summary(o.id)).toEqual({ state: 'NOT_STARTED', canStartPayment: true });
    const list = await request(app).get('/api/v1/orders/my-orders').set(bearer(who.a.token));
    expect(list.body.data.find((x: { id: string }) => x.id === o.id).payment).toEqual({ state: 'NOT_STARTED', canStartPayment: true });
  });

  it('12. after the payment session exists: AWAITING_PAYMENT + startable', async () => {
    const o = await mkOrder();
    expect((await session(o.id)).status).toBe(200);
    expect(await summary(o.id)).toEqual({ state: 'AWAITING_PAYMENT', canStartPayment: true });
  });

  it('13. a session whose creation outcome is UNKNOWN: CONFIRMING + not startable', async () => {
    const o = await mkOrder();
    mock.failNextCreate('unknown');
    await session(o.id);
    expect(await summary(o.id)).toEqual({ state: 'CONFIRMING', canStartPayment: false });
  });

  it('14. a definite provider rejection of the session is a safe retry: NOT_STARTED + startable', async () => {
    const o = await mkOrder();
    mock.failNextCreate('definite');
    expect((await session(o.id)).status).toBe(503);
    expect(await summary(o.id)).toEqual({ state: 'NOT_STARTED', canStartPayment: true });
  });

  it('15. an AUTHORIZED (not captured) payment: CONFIRMING + not startable; the response is 202 and the order stays unpaid', async () => {
    const o = await mkOrder();
    const s = await session(o.id);
    const auth = mock.simulatePayment(s.body.data.providerOrderId, { status: 'AUTHORIZED' });
    expect((await verify(o.id, s.body.data.attemptId, s.body.data.providerOrderId, auth.providerPaymentId)).status).toBe(202);
    expect(await summary(o.id)).toEqual({ state: 'CONFIRMING', canStartPayment: false });
  });

  it('16. a captured payment that settlement has not applied yet (ledger evidence): CONFIRMING + not startable', async () => {
    const o = await mkOrder();
    const s = await session(o.id);
    const sess = await prisma.payment.findUniqueOrThrow({ where: { id: s.body.data.attemptId } });
    await prisma.providerPayment.create({ data: { provider: 'mock', providerPaymentId: `pay_p7d_${ts}_16`, providerOrderId: sess.providerOrderId!, paymentId: sess.id, orderId: o.id, amount: '145.50', currency: 'INR', providerStatus: 'CAPTURED', firstSeenVia: 'WEBHOOK', reconciliationStatus: 'PENDING' } });
    expect(await summary(o.id)).toEqual({ state: 'CONFIRMING', canStartPayment: false });
  });

  it('17. a review-flagged session (e.g. AUTHORIZED_NOT_CAPTURED): CONFIRMING + not startable', async () => {
    const o = await mkOrder();
    const s = await session(o.id);
    await prisma.payment.update({ where: { id: s.body.data.attemptId }, data: { reviewFlag: 'AUTHORIZED_NOT_CAPTURED' } });
    expect(await summary(o.id)).toEqual({ state: 'CONFIRMING', canStartPayment: false });
  });

  it('18. a verified capture: PAID + not startable (order CONFIRMED)', async () => {
    const o = await mkOrder();
    const s = await session(o.id);
    const pay = mock.simulatePayment(s.body.data.providerOrderId, { status: 'CAPTURED' });
    const v = await verify(o.id, s.body.data.attemptId, s.body.data.providerOrderId, pay.providerPaymentId);
    expect(v.status).toBe(200);
    expect(await summary(o.id)).toEqual({ state: 'PAID', canStartPayment: false });
  });

  it('19. an expired session stays AWAITING_PAYMENT + startable (the server renews or settles on the next start)', async () => {
    const o = await mkOrder();
    const s = await session(o.id);
    await prisma.payment.update({ where: { id: s.body.data.attemptId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await summary(o.id)).toEqual({ state: 'AWAITING_PAYMENT', canStartPayment: true });
  });

  it('20. cancelled, COD and non-PENDING orders are never startable', async () => {
    const cancelled = await mkOrder();
    await request(app).post(`/api/v1/orders/${cancelled.id}/cancel`).set(bearer(who.a.token)).send({ reasonCode: 'CHANGED_MIND' });
    expect(await summary(cancelled.id)).toEqual({ state: 'NOT_STARTED', canStartPayment: false });
    expect(await summary((await mkOrder({ paymentMethod: 'COD' })).id)).toEqual({ state: 'NOT_STARTED', canStartPayment: false });
    expect(await summary((await mkOrder({ status: 'ACCEPTED' })).id)).toEqual({ state: 'NOT_STARTED', canStartPayment: false });
    expect(await summary((await mkOrder({ netAmount: '0.50' })).id)).toEqual({ state: 'NOT_STARTED', canStartPayment: false });
  });

  it('21. PRECEDENCE with real rows: AUTHORIZED evidence outranks a live PENDING session', async () => {
    const o = await mkOrder();
    const s = await session(o.id);
    mock.simulatePayment(s.body.data.providerOrderId, { status: 'AUTHORIZED' });
    const auth = [...mock.payments.values()][0];
    await verify(o.id, s.body.data.attemptId, s.body.data.providerOrderId, auth.providerPaymentId);
    const sess = await prisma.payment.findUniqueOrThrow({ where: { id: s.body.data.attemptId } });
    expect(sess.status).toBe('PENDING'); // the session itself still looks payable...
    expect(await summary(o.id)).toEqual({ state: 'CONFIRMING', canStartPayment: false }); // ...but money is in flight
  });

  it('22. NOTHING internal leaks: the summary has exactly {state, canStartPayment}; no provider ids, flags, leases or attempt data anywhere in the response', async () => {
    const o = await mkOrder();
    const s = await session(o.id);
    const auth = mock.simulatePayment(s.body.data.providerOrderId, { status: 'AUTHORIZED' });
    await verify(o.id, s.body.data.attemptId, s.body.data.providerOrderId, auth.providerPaymentId);
    await prisma.payment.update({ where: { id: s.body.data.attemptId }, data: { reviewFlag: 'AUTHORIZED_NOT_CAPTURED', lastError: 'SOMETHING', attemptCount: 3 } });
    const res = await request(app).get(`/api/v1/orders/${o.id}`).set(bearer(who.a.token));
    expect(Object.keys(res.body.data.payment).sort()).toEqual(['canStartPayment', 'state']);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(new RegExp(`${s.body.data.providerOrderId}|${auth.providerPaymentId}|AUTHORIZED_NOT_CAPTURED|lockedBy|lockedUntil|attemptCount|lastError|reviewFlag|providerPaymentId|providerOrderId|nextAttemptAt`));
  });

  it('23. the summary also rides on the cancel and refunds responses, and ownership rules are unchanged (another customer gets a safe 404)', async () => {
    const o = await mkOrder();
    const cancel = await request(app).post(`/api/v1/orders/${o.id}/cancel`).set(bearer(who.a.token)).send({ reasonCode: 'OTHER' });
    expect(cancel.body.data.payment).toEqual({ state: 'NOT_STARTED', canStartPayment: false });
    const refunds = await request(app).get(`/api/v1/orders/${o.id}/refunds`).set(bearer(who.a.token));
    expect(refunds.body.data.payment).toEqual({ state: 'NOT_STARTED', canStartPayment: false });
    expect((await request(app).get(`/api/v1/orders/${o.id}`).set(bearer(who.b.token))).status).toBe(404);
  });

  it('24. a paid order that was cancelled still reports PAID (money received) while the refund state carries the refund story', async () => {
    const o = await mkOrder();
    const s = await session(o.id);
    const pay = mock.simulatePayment(s.body.data.providerOrderId, { status: 'CAPTURED' });
    await verify(o.id, s.body.data.attemptId, s.body.data.providerOrderId, pay.providerPaymentId);
    const cancel = await request(app).post(`/api/v1/orders/${o.id}/cancel`).set(bearer(who.a.token)).send({ reasonCode: 'CHANGED_MIND' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.payment).toEqual({ state: 'PAID', canStartPayment: false });
    expect(cancel.body.data.refund.state).toBe('REFUND_PENDING');
  });
});
