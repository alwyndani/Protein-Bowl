import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import app from '../app.js';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { parsePaymentConfig, resetPaymentConfig, setPaymentConfigForTests } from '../config/paymentConfig.js';
import { getPaymentProvider } from '../modules/payment/providerRegistry.js';
import { MOCK_KEY_SECRET, MOCK_WEBHOOK_SECRET, MockPaymentProvider } from '../modules/payment/mock.provider.js';
import { PaymentSessionService } from '../modules/payment/paymentSession.service.js';
import { PaymentSettlementService } from '../modules/payment/paymentSettlement.service.js';
import { PaymentReconciliationService } from '../modules/payment/paymentReconciliation.service.js';
import { PaymentWebhookService } from '../modules/payment/paymentWebhook.service.js';
import { PaymentManualRecoveryService } from '../modules/payment/paymentManualRecovery.service.js';
import type { ProviderPaymentInfo } from '../modules/payment/provider.types.js';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const mock = getPaymentProvider() as MockPaymentProvider;
const sign = (userId: string, email: string, roles: RoleEnum[]) => jwt.sign({ userId, email, roles }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('P7B — payment sessions, verification, ledger, webhooks, reconciliation (real PostgreSQL, mock provider)', () => {
  const ts = Date.now();
  let seq = 0;
  type Who = { id: string; profileId?: string; token: string };
  const who: Record<string, Who> = {};
  const NET = '145.50';
  const MINOR = 14550;

  async function mkUser(label: string, roles: RoleEnum[]): Promise<Who> {
    const email = `p7b_${label}_${ts}@test.com`;
    const customer = roles.includes(RoleEnum.CUSTOMER);
    const u = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash('Password123!', 4),
        roles: { create: roles.map((role) => ({ role })) },
        ...(customer ? { customerProfile: { create: { fullName: `P7B ${label}`, referralCode: `PB-7B${label.toUpperCase()}${ts}` } } } : {})
      },
      include: { customerProfile: true }
    });
    who[label] = { id: u.id, profileId: u.customerProfile?.id, token: sign(u.id, email, roles) };
    return who[label];
  }

  const mkOrder = (profileId: string, over: Record<string, unknown> = {}) =>
    prisma.order.create({
      data: { orderNumber: `P7B-${ts}-${++seq}`, totalAmount: 100, netAmount: NET, customerProfileId: profileId, status: 'PENDING', paymentStatus: 'PENDING', paymentMethod: 'ONLINE', orderType: 'DIRECT', ...over } as never
    });

  const createSession = (token: string, orderId: string, body: Record<string, unknown> = {}) => request(app).post(`/api/v1/orders/${orderId}/payment-attempts`).set(bearer(token)).send(body);
  const verify = (token: string, orderId: string, attemptId: string, body: Record<string, unknown>) =>
    request(app).post(`/api/v1/orders/${orderId}/payment-attempts/${attemptId}/verify`).set(bearer(token)).send(body);
  const verifyBody = (providerOrderId: string, providerPaymentId: string, signature = mock.signCheckout(providerOrderId, providerPaymentId)) => ({ providerOrderId, providerPaymentId, signature });
  // supertest would JSON-serialize a Buffer sent as application/json; octet-stream delivers the exact bytes (the route accepts any type)
  const webhook = (raw: Buffer, headers: Record<string, string>) => request(app).post('/api/v1/payments/webhook').set({ ...headers, 'content-type': 'application/octet-stream' }).send(raw);
  const captured = (providerOrderId: string, over: Partial<{ providerPaymentId: string; amountMinor: number; currency: string }> = {}) =>
    mock.simulatePayment(providerOrderId, { status: 'CAPTURED', ...over });
  const info = (providerOrderId: string, over: Partial<ProviderPaymentInfo> = {}): ProviderPaymentInfo => ({
    providerPaymentId: `pay_t_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    providerOrderId,
    amountMinor: MINOR,
    currency: 'INR',
    status: 'CAPTURED',
    method: 'upi',
    errorCode: null,
    errorReason: null,
    ...over
  });

  /** A customer order with an established PENDING payment session (provider order created through the real endpoint). */
  async function ready(customer = who.custA, over: Record<string, unknown> = {}) {
    const order = await mkOrder(customer.profileId!, over);
    const res = await createSession(customer.token, order.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return { order, attemptId: res.body.data.attemptId as string, providerOrderId: res.body.data.providerOrderId as string, dto: res.body.data };
  }
  const sessionOf = (id: string) => prisma.payment.findUniqueOrThrow({ where: { id } });
  const orderOf = (id: string) => prisma.order.findUniqueOrThrow({ where: { id } });
  const confirmedEvents = (orderId: string) => prisma.orderEvent.count({ where: { orderId, toStatus: 'CONFIRMED' } });
  const audits = (action: string, entityId: string) => prisma.auditLog.findMany({ where: { action, entityId } });
  const pastDue = () => new Date(Date.now() - 1000);
  const age = (id: string, ms: number) => prisma.payment.update({ where: { id }, data: { createdAt: new Date(Date.now() - ms) } });
  const expire = (id: string) => prisma.payment.update({ where: { id }, data: { expiresAt: pastDue() } });
  const useConfig = (over: Record<string, string>) => setPaymentConfigForTests(parsePaymentConfig(over, 'test'));

  /** Make sure rows from other tests / earlier runs cannot be claimed by a worker pass in THIS test. */
  async function quiesce() {
    await prisma.payment.updateMany({ where: { provider: { not: null } }, data: { nextAttemptAt: null, lockedUntil: null, lockedBy: null } });
    await prisma.paymentWebhookEvent.updateMany({ where: { status: { in: ['RECEIVED', 'RETRY_PENDING'] } }, data: { status: 'IGNORED', ignoredReason: 'TEST_CLEANUP', lockedUntil: null } });
  }

  beforeAll(async () => {
    await mkUser('custA', [RoleEnum.CUSTOMER]);
    await mkUser('custB', [RoleEnum.CUSTOMER]);
    await mkUser('admin', [RoleEnum.SUPER_ADMIN]);
    await mkUser('md', [RoleEnum.MD]);
    await mkUser('chef', [RoleEnum.CHEF]);
    await mkUser('driver', [RoleEnum.DELIVERY]);
    await quiesce();
  });

  beforeEach(() => {
    mock.reset();
  });

  afterEach(() => {
    resetPaymentConfig();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // =============================================================================================== A. payment session creation
  describe('payment session creation', () => {
    it('1. creates a session: durable intent, amount from the persisted Order.netAmount, provider order with the receipt', async () => {
      const order = await mkOrder(who.custA.profileId!);
      const res = await createSession(who.custA.token, order.id);
      expect(res.status).toBe(200);
      const d = res.body.data;
      expect(d).toMatchObject({ provider: 'mock', keyId: 'mock_key_id', amountMinor: MINOR, currency: 'INR', orderNumber: order.orderNumber, status: 'PENDING' });
      const s = await sessionOf(d.attemptId);
      expect(s.status).toBe('PENDING');
      expect(s.amount.toFixed(2)).toBe(NET);
      expect(s.currency).toBe('INR');
      expect(s.providerOrderId).toBe(d.providerOrderId);
      expect(s.payload).toBeNull(); // deprecated column is never written
      const po = mock.orders.get(d.providerOrderId)!;
      expect(po).toMatchObject({ amountMinor: MINOR, currency: 'INR', receipt: d.attemptId });
      expect(po.notes).toEqual({ pbAttemptId: d.attemptId, pbOrderNumber: order.orderNumber, source: 'protein-bowl' });
      const ttl = s.expiresAt!.getTime() - Date.now();
      expect(ttl).toBeGreaterThan(14 * 60_000);
      expect(ttl).toBeLessThanOrEqual(15 * 60_000 + 2000);
    });

    it('2. the response contains only safe checkout fields (no secrets, flags or internal state)', async () => {
      const { dto } = await ready();
      expect(Object.keys(dto).sort()).toEqual(['amountMinor', 'attemptId', 'currency', 'expiresAt', 'keyId', 'orderNumber', 'provider', 'providerOrderId', 'status']);
      expect(JSON.stringify(dto)).not.toMatch(new RegExp(`${MOCK_KEY_SECRET}|${MOCK_WEBHOOK_SECRET}|reviewFlag|lockedBy|signature`));
    });

    it('3. the client can never choose amount, currency or status: body fields are ignored', async () => {
      const order = await mkOrder(who.custA.profileId!);
      const res = await createSession(who.custA.token, order.id, { amount: 1, amountMinor: 100, currency: 'USD', status: 'SUCCESS', netAmount: 1 });
      expect(res.status).toBe(200);
      expect(res.body.data.amountMinor).toBe(MINOR);
      expect(res.body.data.currency).toBe('INR');
      expect(mock.orders.get(res.body.data.providerOrderId)!.amountMinor).toBe(MINOR);
    });

    it('4. only the owning CUSTOMER may create a session (other customers 404, staff 403, anonymous 401)', async () => {
      const order = await mkOrder(who.custA.profileId!);
      expect((await createSession(who.custB.token, order.id)).status).toBe(404);
      expect((await createSession(who.custB.token, order.id)).body.error).toBe('ORDER_NOT_FOUND');
      for (const staff of ['admin', 'md', 'chef', 'driver']) expect((await createSession(who[staff].token, order.id)).status, staff).toBe(403);
      expect((await request(app).post(`/api/v1/orders/${order.id}/payment-attempts`).send({})).status).toBe(401);
      expect((await createSession(who.custA.token, randomUUID())).status).toBe(404);
      expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
      expect(mock.createCalls).toBe(0);
    });

    it('5. unpayable orders are refused with stable codes (COD, cancelled, already paid, not pending)', async () => {
      const cod = await mkOrder(who.custA.profileId!, { paymentMethod: 'COD' });
      expect((await createSession(who.custA.token, cod.id)).body.error).toBe('ORDER_NOT_PAYABLE');
      const cancelled = await mkOrder(who.custA.profileId!, { status: 'CANCELLED' });
      expect((await createSession(who.custA.token, cancelled.id)).body.error).toBe('ORDER_NOT_PAYABLE');
      const confirmed = await mkOrder(who.custA.profileId!, { status: 'CONFIRMED' });
      expect((await createSession(who.custA.token, confirmed.id)).body.error).toBe('ORDER_NOT_PAYABLE');
      const paid = await mkOrder(who.custA.profileId!, { paymentStatus: 'PAID' });
      const res = await createSession(who.custA.token, paid.id);
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('PAYMENT_ALREADY_COMPLETED');
      expect(mock.createCalls).toBe(0);
    });

    it('6. orders below the provider minimum are rejected with PAYMENT_AMOUNT_TOO_SMALL and create nothing', async () => {
      const tiny = await mkOrder(who.custA.profileId!, { netAmount: '0.50' });
      const res = await createSession(who.custA.token, tiny.id);
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('PAYMENT_AMOUNT_TOO_SMALL');
      expect(await prisma.payment.count({ where: { orderId: tiny.id } })).toBe(0);
      const exact = await mkOrder(who.custA.profileId!, { netAmount: '1.00' });
      expect((await createSession(who.custA.token, exact.id)).status).toBe(200); // 100 paise is the verified minimum
    });

    it('7. the attempt is audited transactionally with safe ids/amounts only', async () => {
      const { attemptId, order } = await ready();
      const rows = await audits('PAYMENT_ATTEMPT_CREATED', attemptId);
      expect(rows).toHaveLength(1);
      expect(rows[0].payload).toMatchObject({ orderNumber: order.orderNumber, amountMinor: MINOR, currency: 'INR', provider: 'mock' });
      expect(JSON.stringify(rows[0].payload)).not.toMatch(/signature|secret|keyId/i);
    });

    it('8. a second request reuses the live session: same provider order, no second provider call', async () => {
      const { order, providerOrderId } = await ready();
      const again = await createSession(who.custA.token, order.id);
      expect(again.status).toBe(200);
      expect(again.body.data.providerOrderId).toBe(providerOrderId);
      expect(mock.createCalls).toBe(1);
      expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
    });

    it('9. concurrent requests produce ONE provider order and ONE session (real DB race)', async () => {
      const order = await mkOrder(who.custA.profileId!);
      const results = await Promise.all(Array.from({ length: 6 }, () => createSession(who.custA.token, order.id)));
      expect(results.every((r) => r.status === 200 || r.status === 409)).toBe(true);
      for (const r of results.filter((x) => x.status === 409)) expect(r.body.error).toBe('PAYMENT_ATTEMPT_IN_PROGRESS');
      expect(mock.createCalls).toBe(1);
      expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
      expect(new Set(results.filter((r) => r.status === 200).map((r) => r.body.data.providerOrderId)).size).toBe(1);
    });

    it('10. a DEFINITE provider rejection marks the session FAILED (audited); the customer may start a fresh session', async () => {
      const order = await mkOrder(who.custA.profileId!);
      mock.failNextCreate('definite');
      const res = await createSession(who.custA.token, order.id);
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('PAYMENT_PROVIDER_UNAVAILABLE');
      const failed = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
      expect(failed).toMatchObject({ status: 'FAILED', lastError: 'BAD_REQUEST_ERROR', providerOrderId: null });
      expect(await audits('PAYMENT_FAILED', failed.id)).toHaveLength(1);
      const retry = await createSession(who.custA.token, order.id);
      expect(retry.status).toBe(200);
      expect(retry.body.data.attemptId).not.toBe(failed.id);
    });

    it('11. an UNKNOWN outcome (timeout) is NOT a failure: the session is kept UNKNOWN, scheduled for reconciliation, and the create is never retried', async () => {
      const order = await mkOrder(who.custA.profileId!);
      mock.failNextCreate('unknown');
      const res = await createSession(who.custA.token, order.id);
      expect(res.status).toBe(503);
      const s = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
      expect(s.status).toBe('UNKNOWN');
      expect(s.nextAttemptAt).not.toBeNull();
      expect(mock.createCalls).toBe(1);
    });

    it('12. response lost AFTER the provider created the order: the next request finds it by receipt and adopts it - no second provider order', async () => {
      const order = await mkOrder(who.custA.profileId!);
      mock.failNextCreate('unknown-after-create');
      expect((await createSession(who.custA.token, order.id)).status).toBe(503);
      expect(mock.orders.size).toBe(1);
      const retry = await createSession(who.custA.token, order.id);
      expect(retry.status, JSON.stringify(retry.body)).toBe(200);
      expect(retry.body.data.providerOrderId).toBe([...mock.orders.keys()][0]);
      expect(mock.createCalls).toBe(1); // recovered, not replaced
      const sessions = await prisma.payment.findMany({ where: { orderId: order.id } });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].status).toBe('PENDING');
      expect(await audits('PAYMENT_ATTEMPT_RECOVERED', sessions[0].id)).toHaveLength(1);
    });

    it('13. grace expiry ALONE never proves an UNKNOWN session unusable: no replacement, still in progress, still UNKNOWN', async () => {
      const order = await mkOrder(who.custA.profileId!);
      mock.failNextCreate('unknown');
      await createSession(who.custA.token, order.id);
      const s = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
      await age(s.id, 60 * 60_000); // an hour old, far beyond the 120 s grace
      for (let i = 0; i < 3; i++) {
        const res = await createSession(who.custA.token, order.id);
        expect(res.status).toBe(409);
        expect(res.body.error).toBe('PAYMENT_ATTEMPT_IN_PROGRESS');
      }
      expect(mock.createCalls).toBe(1);
      expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
      expect((await sessionOf(s.id)).status).toBe('UNKNOWN');
    });

    it('14. a freshly CREATED session (another request may be mid-call) is "in progress": no provider call, no second session', async () => {
      const order = await mkOrder(who.custA.profileId!);
      await prisma.payment.create({ data: { orderId: order.id, customerProfileId: who.custA.profileId!, amount: NET, currency: 'INR', status: 'CREATED', provider: 'mock' } });
      const res = await createSession(who.custA.token, order.id);
      expect(res.status).toBe(409);
      expect(mock.createCalls).toBe(0);
      expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
    });

    it('15. a stale CREATED session (crash after the intent was saved) becomes UNKNOWN when the provider shows nothing - never replaced', async () => {
      const order = await mkOrder(who.custA.profileId!);
      const stale = await prisma.payment.create({ data: { orderId: order.id, customerProfileId: who.custA.profileId!, amount: NET, currency: 'INR', status: 'CREATED', provider: 'mock', createdAt: new Date(Date.now() - 30 * 60_000) } });
      const res = await createSession(who.custA.token, order.id);
      expect(res.status).toBe(409);
      expect((await sessionOf(stale.id)).status).toBe('UNKNOWN');
      expect(mock.createCalls).toBe(0);
    });

    it('16. the provider order exists but the LOCAL write keeps failing: the session stays UNKNOWN and the reconciliation worker adopts it by receipt', async () => {
      await quiesce();
      const order = await mkOrder(who.custA.profileId!);
      const spy = vi.spyOn(PaymentSessionService as any, 'persistProviderOrder').mockRejectedValue(new Error('database unavailable'));
      const res = await createSession(who.custA.token, order.id);
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('PAYMENT_ATTEMPT_IN_PROGRESS');
      expect(spy).toHaveBeenCalledTimes(3); // bounded retries
      const s = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
      expect(s).toMatchObject({ status: 'UNKNOWN', providerOrderId: null });
      spy.mockRestore();
      await prisma.payment.update({ where: { id: s.id }, data: { nextAttemptAt: pastDue() } });
      const stats = await PaymentReconciliationService.runOnce({ workerId: 't16' });
      expect(stats.sessionsAdopted).toBeGreaterThanOrEqual(1);
      const fixed = await sessionOf(s.id);
      expect(fixed.status).toBe('PENDING');
      expect(fixed.providerOrderId).toBe([...mock.orders.keys()][0]);
    });

    it('17. a provider answer that does not describe OUR intent is never trusted (treated as unknown, flagged)', async () => {
      const order = await mkOrder(who.custA.profileId!);
      vi.spyOn(mock, 'createOrder').mockResolvedValueOnce({ providerOrderId: 'order_wrong', amountMinor: MINOR + 1, currency: 'INR', receipt: 'someone-else', notes: {}, status: 'created' });
      const res = await createSession(who.custA.token, order.id);
      expect(res.status).toBe(503);
      const s = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
      expect(s).toMatchObject({ status: 'UNKNOWN', providerOrderId: null, reviewFlag: 'PROVIDER_ORDER_MISMATCH' });
    });

    it('18. an EXPIRED session is RENEWED (same provider order, new TTL) when the provider order is still payable', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      await expire(attemptId);
      const res = await createSession(who.custA.token, order.id);
      expect(res.status).toBe(200);
      expect(res.body.data.providerOrderId).toBe(providerOrderId);
      expect(res.body.data.attemptId).toBe(attemptId);
      expect(new Date(res.body.data.expiresAt).getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
      expect(mock.createCalls).toBe(1);
      expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
    });

    it('19. an expired session whose provider order was PAID is settled and the customer is told it is already paid', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      captured(providerOrderId);
      await expire(attemptId);
      const res = await createSession(who.custA.token, order.id);
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('PAYMENT_ALREADY_COMPLETED');
      expect(await orderOf(order.id)).toMatchObject({ paymentStatus: 'PAID', status: 'CONFIRMED' });
      expect(mock.createCalls).toBe(1);
    });

    it('20. when the provider cannot be reached, an expired session is NEVER replaced (uncertainty -> retryable error)', async () => {
      const { order, attemptId } = await ready();
      await expire(attemptId);
      mock.setReadFailure(true);
      const res = await createSession(who.custA.token, order.id);
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('PAYMENT_PROVIDER_UNAVAILABLE');
      expect(mock.createCalls).toBe(1);
      expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
    });

    it('21. REPLACEMENT happens only when the old provider order is PROVEN unusable (definitively missing), is audited and supersedes the old session', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      await expire(attemptId);
      mock.orders.delete(providerOrderId); // the provider definitively no longer knows it
      const res = await createSession(who.custA.token, order.id);
      expect(res.status).toBe(200);
      expect(res.body.data.attemptId).not.toBe(attemptId);
      expect(res.body.data.providerOrderId).not.toBe(providerOrderId);
      expect(mock.createCalls).toBe(2);
      const old = await sessionOf(attemptId);
      expect(old).toMatchObject({ status: 'EXPIRED', supersededById: res.body.data.attemptId });
      const created = await audits('PAYMENT_ATTEMPT_CREATED', res.body.data.attemptId);
      expect(created[0].payload).toMatchObject({ replaces: attemptId, reason: 'PROVIDER_ORDER_UNUSABLE' });
    });

    it('22. a provider order whose amount does not match the persisted order is unusable and replaced', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      await expire(attemptId);
      mock.orders.set(providerOrderId, { ...mock.orders.get(providerOrderId)!, amountMinor: 1 });
      const res = await createSession(who.custA.token, order.id);
      expect(res.status).toBe(200);
      expect(res.body.data.amountMinor).toBe(MINOR);
      expect(res.body.data.attemptId).not.toBe(attemptId);
    });

    it('23. concurrent renewals of an expired session never create a second provider order', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      await expire(attemptId);
      const results = await Promise.all(Array.from({ length: 5 }, () => createSession(who.custA.token, order.id)));
      expect(results.every((r) => r.status === 200 || r.status === 409)).toBe(true);
      expect(mock.createCalls).toBe(1);
      expect(new Set(results.filter((r) => r.status === 200).map((r) => r.body.data.providerOrderId))).toEqual(new Set([providerOrderId]));
      expect(await prisma.payment.count({ where: { orderId: order.id, supersededById: null } })).toBe(1);
    });

    it('24. an AUTHORIZED-but-not-captured payment keeps the session "in progress" (no new session, nothing confirmed)', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      mock.simulatePayment(providerOrderId, { status: 'AUTHORIZED' });
      await expire(attemptId);
      const res = await createSession(who.custA.token, order.id);
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('PAYMENT_ATTEMPT_IN_PROGRESS');
      expect((await orderOf(order.id)).paymentStatus).toBe('PENDING');
      expect(mock.createCalls).toBe(1);
    });

    it('25. an operator-ABANDONED session no longer blocks a fresh session', async () => {
      const order = await mkOrder(who.custA.profileId!);
      mock.failNextCreate('unknown');
      await createSession(who.custA.token, order.id);
      const s = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
      expect((await createSession(who.custA.token, order.id)).status).toBe(409);
      await PaymentManualRecoveryService.abandonSession(s.id, { operator: 'ops-test', reason: 'checked the provider dashboard: no order exists' });
      const res = await createSession(who.custA.token, order.id);
      expect(res.status).toBe(200);
      expect(res.body.data.attemptId).not.toBe(s.id);
    });

    it('26. the session status endpoint is owner-only and exposes only safe fields', async () => {
      const { order, attemptId } = await ready();
      const own = await request(app).get(`/api/v1/orders/${order.id}/payment-attempts/${attemptId}`).set(bearer(who.custA.token));
      expect(own.status).toBe(200);
      expect(Object.keys(own.body.data).sort()).toEqual(['attemptId', 'expiresAt', 'lastError', 'orderPaymentStatus', 'orderStatus', 'status']);
      expect((await request(app).get(`/api/v1/orders/${order.id}/payment-attempts/${attemptId}`).set(bearer(who.custB.token))).status).toBe(404);
      expect((await request(app).get(`/api/v1/orders/${order.id}/payment-attempts/${attemptId}`).set(bearer(who.admin.token))).status).toBe(403);
    });
  });

  // =============================================================================================== B. checkout verification
  describe('checkout verification', () => {
    it('27. a valid signature + provider CAPTURED confirms: ledger APPLIED, session SUCCESS, order PAID then CONFIRMED (exactly once)', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      const p = captured(providerOrderId);
      const res = await verify(who.custA.token, order.id, attemptId, verifyBody(providerOrderId, p.providerPaymentId));
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.data).toMatchObject({ result: 'PAID', orderStatus: 'CONFIRMED', orderPaymentStatus: 'PAID' });
      const o = await orderOf(order.id);
      expect(o).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID' });
      expect(o.confirmedAt).not.toBeNull();
      const ledger = await prisma.providerPayment.findUniqueOrThrow({ where: { provider_providerPaymentId: { provider: 'mock', providerPaymentId: p.providerPaymentId } } });
      expect(ledger).toMatchObject({ reconciliationStatus: 'APPLIED', providerStatus: 'CAPTURED', paymentId: attemptId, orderId: order.id, currency: 'INR' });
      expect(ledger.amount.toFixed(2)).toBe(NET);
      expect(o.paidByProviderPaymentId).toBe(ledger.id);
      expect((await sessionOf(attemptId)).status).toBe('SUCCESS');
      expect(await confirmedEvents(order.id)).toBe(1);
      const ev = await prisma.orderEvent.findFirstOrThrow({ where: { orderId: order.id, toStatus: 'CONFIRMED' } });
      expect(ev.actorRole).toBe('SYSTEM:PAYMENT_VERIFICATION');
      expect(await audits('PAYMENT_VERIFIED', attemptId)).toHaveLength(1);
    });

    it('28. verifying twice is idempotent (same result, one PAID, one CONFIRMED, one audit row)', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      const p = captured(providerOrderId);
      const body = verifyBody(providerOrderId, p.providerPaymentId);
      const a = await verify(who.custA.token, order.id, attemptId, body);
      const b = await verify(who.custA.token, order.id, attemptId, body);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(await confirmedEvents(order.id)).toBe(1);
      expect(await audits('PAYMENT_VERIFIED', attemptId)).toHaveLength(1);
      expect(await prisma.providerPayment.count({ where: { orderId: order.id } })).toBe(1);
    });

    it('29. a forged/invalid signature is rejected and changes nothing (audited as rejected)', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      const p = captured(providerOrderId);
      const res = await verify(who.custA.token, order.id, attemptId, verifyBody(providerOrderId, p.providerPaymentId, 'a'.repeat(64)));
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('PAYMENT_VERIFICATION_FAILED');
      expect(await orderOf(order.id)).toMatchObject({ status: 'PENDING', paymentStatus: 'PENDING', paidByProviderPaymentId: null });
      expect(await prisma.providerPayment.count({ where: { orderId: order.id } })).toBe(0);
      expect((await audits('PAYMENT_VERIFICATION_REJECTED', attemptId))[0].payload).toEqual({ reason: 'SIGNATURE_INVALID' });
    });

    it('30. a signature for a DIFFERENT payment id, or for another secret, never verifies', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      const p = captured(providerOrderId);
      const other = captured(providerOrderId);
      const wrongPayment = verifyBody(providerOrderId, p.providerPaymentId, mock.signCheckout(providerOrderId, other.providerPaymentId));
      expect((await verify(who.custA.token, order.id, attemptId, wrongPayment)).status).toBe(400);
      const wrongOrder = verifyBody(providerOrderId, p.providerPaymentId, mock.signCheckout('order_other', p.providerPaymentId));
      expect((await verify(who.custA.token, order.id, attemptId, wrongOrder)).status).toBe(400);
      expect((await orderOf(order.id)).paymentStatus).toBe('PENDING');
    });

    it('31. the STORED provider order id is authoritative: a different order id in the body fails even with a matching signature', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      const p = captured(providerOrderId);
      const forged = verifyBody('order_attacker', p.providerPaymentId);
      const res = await verify(who.custA.token, order.id, attemptId, forged);
      expect(res.status).toBe(400);
      expect((await audits('PAYMENT_VERIFICATION_REJECTED', attemptId))[0].payload).toEqual({ reason: 'PROVIDER_ORDER_MISMATCH' });
      expect((await orderOf(order.id)).paymentStatus).toBe('PENDING');
    });

    it('32. a valid signature is NOT enough: an AUTHORIZED (uncaptured) payment stays pending and nothing is confirmed', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      const p = mock.simulatePayment(providerOrderId, { status: 'AUTHORIZED' });
      const res = await verify(who.custA.token, order.id, attemptId, verifyBody(providerOrderId, p.providerPaymentId));
      expect(res.status).toBe(202);
      expect(res.body.data.result).toBe('PENDING');
      expect(await orderOf(order.id)).toMatchObject({ status: 'PENDING', paymentStatus: 'PENDING' });
      const ledger = await prisma.providerPayment.findFirstOrThrow({ where: { orderId: order.id } });
      expect(ledger).toMatchObject({ providerStatus: 'AUTHORIZED', reconciliationStatus: 'PENDING' });
    });

    it('33. a FAILED provider payment is rejected (400) and recorded in the ledger without touching the order', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      const p = mock.simulatePayment(providerOrderId, { status: 'FAILED', errorCode: 'BAD_REQUEST_ERROR' });
      const res = await verify(who.custA.token, order.id, attemptId, verifyBody(providerOrderId, p.providerPaymentId));
      expect(res.status).toBe(400);
      expect(await orderOf(order.id)).toMatchObject({ status: 'PENDING', paymentStatus: 'PENDING' });
      expect(await prisma.providerPayment.findFirstOrThrow({ where: { orderId: order.id } })).toMatchObject({ providerStatus: 'FAILED', errorCode: 'BAD_REQUEST_ERROR' });
      expect(await audits('PAYMENT_FAILED', attemptId)).toHaveLength(1);
    });

    it('34. a payment the provider does not know, or one that belongs to another provider order, is rejected', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      expect((await verify(who.custA.token, order.id, attemptId, verifyBody(providerOrderId, 'pay_ghost'))).status).toBe(400);
      const foreign = mock.simulatePayment('order_somewhere_else', { status: 'CAPTURED', amountMinor: MINOR });
      expect((await verify(who.custA.token, order.id, attemptId, verifyBody(providerOrderId, foreign.providerPaymentId))).status).toBe(400);
      expect((await orderOf(order.id)).paymentStatus).toBe('PENDING');
    });

    it('35. when the provider cannot be reached the answer is "pending" and nothing is corrupted (reconciliation will finish it)', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      const p = captured(providerOrderId);
      mock.setReadFailure(true);
      const res = await verify(who.custA.token, order.id, attemptId, verifyBody(providerOrderId, p.providerPaymentId));
      expect(res.status).toBe(202);
      expect(res.body.data.result).toBe('PENDING');
      expect(await orderOf(order.id)).toMatchObject({ status: 'PENDING', paymentStatus: 'PENDING' });
      expect(await prisma.providerPayment.count({ where: { orderId: order.id } })).toBe(0);
      mock.setReadFailure(false);
      expect((await verify(who.custA.token, order.id, attemptId, verifyBody(providerOrderId, p.providerPaymentId))).status).toBe(200);
    });

    it('36. wrong AMOUNT: evidence kept and flagged, never confirmed (422 PAYMENT_AMOUNT_MISMATCH, audited)', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      const p = captured(providerOrderId, { amountMinor: MINOR - 100 });
      const res = await verify(who.custA.token, order.id, attemptId, verifyBody(providerOrderId, p.providerPaymentId));
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('PAYMENT_AMOUNT_MISMATCH');
      expect(await orderOf(order.id)).toMatchObject({ status: 'PENDING', paymentStatus: 'PENDING', paidByProviderPaymentId: null });
      expect((await prisma.providerPayment.findFirstOrThrow({ where: { orderId: order.id } })).reconciliationStatus).toBe('AMOUNT_MISMATCH');
      expect((await sessionOf(attemptId)).reviewFlag).toBe('AMOUNT_MISMATCH');
      expect(await audits('PAYMENT_FLAGGED', attemptId)).toHaveLength(1);
    });

    it('37. wrong CURRENCY: evidence kept and flagged, never confirmed (422 PAYMENT_CURRENCY_MISMATCH)', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      const p = captured(providerOrderId, { currency: 'USD' });
      const res = await verify(who.custA.token, order.id, attemptId, verifyBody(providerOrderId, p.providerPaymentId));
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('PAYMENT_CURRENCY_MISMATCH');
      expect((await orderOf(order.id)).paymentStatus).toBe('PENDING');
      expect((await prisma.providerPayment.findFirstOrThrow({ where: { orderId: order.id } })).reconciliationStatus).toBe('CURRENCY_MISMATCH');
    });

    it('38. another customer (or a staff user) cannot verify against someone else\'s session: safe 404 / 403, no state change', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      const p = captured(providerOrderId);
      const body = verifyBody(providerOrderId, p.providerPaymentId);
      const res = await verify(who.custB.token, order.id, attemptId, body);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('PAYMENT_ATTEMPT_NOT_FOUND');
      expect((await verify(who.admin.token, order.id, attemptId, body)).status).toBe(403);
      expect((await verify(who.custA.token, randomUUID(), attemptId, body)).status).toBe(404);
      expect((await orderOf(order.id)).paymentStatus).toBe('PENDING');
    });

    it('39. the body is strictly validated and the client cannot inject status/amount (extra fields have no effect)', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      const p = mock.simulatePayment(providerOrderId, { status: 'AUTHORIZED' });
      for (const bad of [{}, { providerOrderId }, { providerOrderId, providerPaymentId: p.providerPaymentId, signature: 'xyz' }, { providerOrderId: 'bad id!', providerPaymentId: 'p', signature: 'a'.repeat(64) }, { providerOrderId, providerPaymentId: 'x'.repeat(100), signature: 'a'.repeat(64) }]) {
        expect((await verify(who.custA.token, order.id, attemptId, bad as never)).status).toBe(422);
      }
      const res = await verify(who.custA.token, order.id, attemptId, { ...verifyBody(providerOrderId, p.providerPaymentId), status: 'CAPTURED', paymentStatus: 'PAID', amount: MINOR, captured: true });
      expect(res.status).toBe(202);
      expect(await orderOf(order.id)).toMatchObject({ status: 'PENDING', paymentStatus: 'PENDING' });
    });

    it('40. a capture for an order that was CANCELLED is kept, flagged AFTER_CANCELLATION and never reopens the order', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      await prisma.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
      const p = captured(providerOrderId);
      const res = await verify(who.custA.token, order.id, attemptId, verifyBody(providerOrderId, p.providerPaymentId));
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('ORDER_NOT_PAYABLE');
      expect(await orderOf(order.id)).toMatchObject({ status: 'CANCELLED', paymentStatus: 'PENDING', paidByProviderPaymentId: null });
      expect((await prisma.providerPayment.findFirstOrThrow({ where: { orderId: order.id } })).reconciliationStatus).toBe('AFTER_CANCELLATION');
      expect((await sessionOf(attemptId)).reviewFlag).toBe('AFTER_CANCELLATION');
      expect(await confirmedEvents(order.id)).toBe(0);
    });

    it('41. a SECOND captured provider payment is retained separately and flagged DUPLICATE - the first payment is untouched and the order is not re-confirmed', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      const p1 = captured(providerOrderId);
      expect((await verify(who.custA.token, order.id, attemptId, verifyBody(providerOrderId, p1.providerPaymentId))).status).toBe(200);
      const p2 = captured(providerOrderId);
      const res = await verify(who.custA.token, order.id, attemptId, verifyBody(providerOrderId, p2.providerPaymentId));
      expect(res.status).toBe(200);
      expect(res.body.data.result).toBe('PAID');
      const rows = await prisma.providerPayment.findMany({ where: { orderId: order.id }, orderBy: { createdAt: 'asc' } });
      expect(rows.map((r) => r.reconciliationStatus)).toEqual(['APPLIED', 'DUPLICATE']);
      expect(rows.map((r) => r.providerPaymentId)).toEqual([p1.providerPaymentId, p2.providerPaymentId]);
      expect((await orderOf(order.id)).paidByProviderPaymentId).toBe(rows[0].id);
      expect(await confirmedEvents(order.id)).toBe(1);
      expect(await audits('PAYMENT_FLAGGED', attemptId)).toHaveLength(1);
      expect((await sessionOf(attemptId)).reviewFlag).toBe('DUPLICATE_CAPTURE');
    });
  });

  // =============================================================================================== C. settlement + ledger
  describe('settlement and the provider-payment ledger', () => {
    it('42. settle() is idempotent: the second call is ALREADY_APPLIED and changes nothing', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      const p = info(providerOrderId);
      const first = await PaymentSettlementService.settle({ paymentId: attemptId, payment: p, provider: 'mock', via: 'WEBHOOK' });
      const second = await PaymentSettlementService.settle({ paymentId: attemptId, payment: p, provider: 'mock', via: 'WEBHOOK' });
      expect([first.outcome, second.outcome]).toEqual(['APPLIED', 'ALREADY_APPLIED']);
      expect(first.ledgerId).toBe(second.ledgerId);
      expect(await confirmedEvents(order.id)).toBe(1);
      expect(await prisma.providerPayment.count({ where: { orderId: order.id } })).toBe(1);
    });

    it('43. the ledger is monotonic: CAPTURED can never become AUTHORIZED, FAILED or CREATED', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      const p = info(providerOrderId);
      await PaymentSettlementService.settle({ paymentId: attemptId, payment: p, provider: 'mock', via: 'WEBHOOK' });
      for (const status of ['AUTHORIZED', 'FAILED', 'CREATED'] as const) {
        const r = await PaymentSettlementService.settle({ paymentId: attemptId, payment: { ...p, status, errorCode: 'LATE' }, provider: 'mock', via: 'WEBHOOK' });
        expect(r.outcome).toBe('ALREADY_APPLIED');
      }
      const row = await prisma.providerPayment.findFirstOrThrow({ where: { orderId: order.id } });
      expect(row).toMatchObject({ providerStatus: 'CAPTURED', reconciliationStatus: 'APPLIED', errorCode: null });
      expect(await orderOf(order.id)).toMatchObject({ paymentStatus: 'PAID', status: 'CONFIRMED' });
    });

    it('44. status only advances: AUTHORIZED -> CAPTURED applies; FAILED never downgrades AUTHORIZED', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      const p = info(providerOrderId, { status: 'AUTHORIZED' });
      expect((await PaymentSettlementService.settle({ paymentId: attemptId, payment: p, provider: 'mock', via: 'WEBHOOK' })).outcome).toBe('NOT_CAPTURED');
      await PaymentSettlementService.settle({ paymentId: attemptId, payment: { ...p, status: 'FAILED' }, provider: 'mock', via: 'WEBHOOK' });
      expect((await prisma.providerPayment.findFirstOrThrow({ where: { orderId: order.id } })).providerStatus).toBe('AUTHORIZED');
      expect((await PaymentSettlementService.settle({ paymentId: attemptId, payment: { ...p, status: 'CAPTURED' }, provider: 'mock', via: 'WEBHOOK' })).outcome).toBe('APPLIED');
    });

    it('45. database-level ledger uniqueness: a provider payment id can exist only once per provider', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      const row = { provider: 'mock', providerPaymentId: `pay_uniq_${ts}`, providerOrderId, paymentId: attemptId, orderId: order.id, amount: NET, currency: 'INR', providerStatus: 'CREATED', firstSeenVia: 'WEBHOOK' };
      await prisma.providerPayment.create({ data: row });
      await expect(prisma.providerPayment.create({ data: row })).rejects.toMatchObject({ code: 'P2002' });
      await prisma.providerPayment.create({ data: { ...row, provider: 'razorpay' } }); // the same id under another provider is a different payment
    });

    it('46. SIX different captured payments settled in parallel: exactly ONE is APPLIED, five are DUPLICATE, all six are kept, one CONFIRMED (real DB race)', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      const payments = Array.from({ length: 6 }, () => info(providerOrderId));
      const results = await Promise.all(payments.map((p) => PaymentSettlementService.settle({ paymentId: attemptId, payment: p, provider: 'mock', via: 'RECONCILIATION' })));
      expect(results.filter((r) => r.outcome === 'APPLIED')).toHaveLength(1);
      expect(results.filter((r) => r.outcome === 'DUPLICATE')).toHaveLength(5);
      const rows = await prisma.providerPayment.findMany({ where: { orderId: order.id } });
      expect(rows).toHaveLength(6);
      const applied = rows.filter((r) => r.reconciliationStatus === 'APPLIED');
      expect(applied).toHaveLength(1);
      expect((await orderOf(order.id)).paidByProviderPaymentId).toBe(applied[0].id);
      expect(await confirmedEvents(order.id)).toBe(1);
      expect(await audits('PAYMENT_FLAGGED', attemptId)).toHaveLength(5);
    });

    it('46b. payments on DIFFERENT sessions of the same order (renewal/replacement history) race safely: exactly one APPLIED, one PAID, one CONFIRMED', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      const second = await prisma.payment.create({
        data: { orderId: order.id, customerProfileId: who.custA.profileId!, amount: NET, currency: 'INR', status: 'EXPIRED', provider: 'mock', providerOrderId: `order_second_${ts}_${++seq}` }
      });
      const jobs = Array.from({ length: 8 }, (_, i) =>
        i % 2 === 0
          ? PaymentSettlementService.settle({ paymentId: attemptId, payment: info(providerOrderId), provider: 'mock', via: 'RECONCILIATION' })
          : PaymentSettlementService.settle({ paymentId: second.id, payment: info(second.providerOrderId!), provider: 'mock', via: 'RECONCILIATION' })
      );
      const results = await Promise.all(jobs);
      expect(results.filter((r) => r.outcome === 'APPLIED')).toHaveLength(1);
      expect(results.filter((r) => r.outcome === 'DUPLICATE')).toHaveLength(7);
      const rows = await prisma.providerPayment.findMany({ where: { orderId: order.id } });
      expect(rows).toHaveLength(8);
      expect(rows.filter((r) => r.reconciliationStatus === 'APPLIED')).toHaveLength(1);
      expect((await orderOf(order.id)).paidByProviderPaymentId).toBe(rows.find((r) => r.reconciliationStatus === 'APPLIED')!.id);
      expect(await confirmedEvents(order.id)).toBe(1);
    });

    it('47. verify and webhook arriving SIMULTANEOUSLY for the same payment give exactly one PAID and one CONFIRMED', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      const p = captured(providerOrderId);
      const hook = mock.buildWebhook('payment.captured', p);
      const [v, w] = await Promise.all([verify(who.custA.token, order.id, attemptId, verifyBody(providerOrderId, p.providerPaymentId)), webhook(hook.raw, hook.headers)]);
      expect(v.status).toBe(200);
      expect(w.status).toBe(200);
      expect(await confirmedEvents(order.id)).toBe(1);
      expect(await prisma.providerPayment.count({ where: { orderId: order.id } })).toBe(1);
      expect(await orderOf(order.id)).toMatchObject({ paymentStatus: 'PAID', status: 'CONFIRMED' });
    });

    it('48. a mixed burst (verify x3, webhook x3, reconciliation x2) converges without deadlocks or errors', async () => {
      await quiesce();
      const { order, attemptId, providerOrderId } = await ready();
      const p = captured(providerOrderId);
      await prisma.payment.update({ where: { id: attemptId }, data: { nextAttemptAt: pastDue() } });
      const hook = mock.buildWebhook('payment.captured', p);
      const calls = [
        ...Array.from({ length: 3 }, () => verify(who.custA.token, order.id, attemptId, verifyBody(providerOrderId, p.providerPaymentId))),
        ...Array.from({ length: 3 }, () => webhook(hook.raw, hook.headers)),
        PaymentReconciliationService.runOnce({ workerId: 'burst-1' }),
        PaymentReconciliationService.runOnce({ workerId: 'burst-2' })
      ];
      const settled = await Promise.allSettled(calls);
      expect(settled.every((s) => s.status === 'fulfilled')).toBe(true);
      expect(await confirmedEvents(order.id)).toBe(1);
      expect((await prisma.providerPayment.findMany({ where: { orderId: order.id } })).filter((r) => r.reconciliationStatus === 'APPLIED')).toHaveLength(1);
    });

    it('49. a provider payment that belongs to a DIFFERENT provider order is refused and not ledgered', async () => {
      const { order, attemptId } = await ready();
      await expect(PaymentSettlementService.settle({ paymentId: attemptId, payment: info('order_not_ours'), provider: 'mock', via: 'WEBHOOK' })).rejects.toMatchObject({ errorCode: 'PAYMENT_ORDER_MISMATCH' });
      expect(await prisma.providerPayment.count({ where: { orderId: order.id } })).toBe(0);
    });

    it('50. a provider payment already recorded against another session cannot be re-attached', async () => {
      const a = await ready();
      const b = await ready(who.custB);
      const p = info(a.providerOrderId);
      await PaymentSettlementService.settle({ paymentId: a.attemptId, payment: p, provider: 'mock', via: 'WEBHOOK' });
      await expect(PaymentSettlementService.settle({ paymentId: b.attemptId, payment: { ...p, providerOrderId: b.providerOrderId }, provider: 'mock', via: 'WEBHOOK' })).rejects.toMatchObject({ errorCode: 'PAYMENT_ORDER_MISMATCH' });
      expect((await orderOf(b.order.id)).paymentStatus).toBe('PENDING');
    });

    it('51. confirmation goes through OrderTransitionService: an unpaid order can never be confirmed by anything else', async () => {
      const { order } = await ready();
      const { OrderTransitionService } = await import('../modules/order/orderTransition.service.js');
      await expect(OrderTransitionService.transition({ orderId: order.id, to: 'CONFIRMED', actor: { kind: 'SYSTEM', source: 'PAYMENT_VERIFICATION' } })).rejects.toMatchObject({ errorCode: 'ORDER_NOT_OPERATIONALLY_ELIGIBLE' });
    });
  });

  // =============================================================================================== D. webhook
  describe('payment webhook', () => {
    it('52. a validly signed CAPTURED webhook applies the payment: ledger, PAID, CONFIRMED, event PROCESSED, no raw body stored', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      const p = mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
      const { raw, headers } = mock.buildWebhook('payment.captured', p, { eventId: `evt_${ts}_52` });
      const res = await webhook(raw, headers);
      expect(res.status).toBe(200);
      expect(await orderOf(order.id)).toMatchObject({ paymentStatus: 'PAID', status: 'CONFIRMED' });
      const ev = await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { provider_eventId: { provider: 'mock', eventId: `evt_${ts}_52` } } });
      expect(ev).toMatchObject({ status: 'PROCESSED', eventType: 'payment.captured', providerOrderId, providerPaymentId: p.providerPaymentId });
      expect(ev.payloadHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(ev)).not.toContain(raw.toString('utf8'));
      expect(await prisma.providerPayment.findFirstOrThrow({ where: { orderId: order.id } })).toMatchObject({ reconciliationStatus: 'APPLIED', firstSeenVia: 'WEBHOOK' });
      expect((await sessionOf(attemptId)).status).toBe('SUCCESS');
      expect(JSON.stringify(res.body)).toBe('{"success":true}');
    });

    it('53. an invalid / missing / tampered signature is rejected with 400 BEFORE anything is persisted', async () => {
      const { order, providerOrderId } = await ready();
      const p = mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
      const { raw, headers } = mock.buildWebhook('payment.captured', p, { eventId: `evt_${ts}_53` });
      const before = await prisma.paymentWebhookEvent.count();
      expect((await webhook(raw, { ...headers, 'x-razorpay-signature': '0'.repeat(64) })).status).toBe(400);
      const { 'x-razorpay-signature': _drop, ...noSig } = headers;
      expect((await webhook(raw, noSig)).status).toBe(400);
      expect((await webhook(Buffer.concat([raw, Buffer.from(' ')]), headers)).status).toBe(400); // one extra byte
      expect((await webhook(Buffer.alloc(0), headers)).status).toBe(400);
      expect(await prisma.paymentWebhookEvent.count()).toBe(before);
      expect(await prisma.providerPayment.count({ where: { orderId: order.id } })).toBe(0);
      expect((await orderOf(order.id)).paymentStatus).toBe('PENDING');
    });

    it('54. a correctly signed but malformed body is rejected and not persisted', async () => {
      const raw = Buffer.from('this is not json');
      const before = await prisma.paymentWebhookEvent.count();
      const res = await webhook(raw, { 'x-razorpay-signature': mock.signWebhook(raw) });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_PAYLOAD');
      expect(await prisma.paymentWebhookEvent.count()).toBe(before);
    });

    it('55. the signature is checked against the EXACT raw bytes: non-canonical whitespace verifies, a re-serialized body does not', async () => {
      const { order, providerOrderId } = await ready();
      const p = mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
      const pretty = Buffer.from(JSON.stringify(JSON.parse(mock.buildWebhook('payment.captured', p).raw.toString()), null, 4));
      const headers = { 'x-razorpay-signature': mock.signWebhook(pretty), 'x-razorpay-event-id': `evt_${ts}_55`, 'content-type': 'application/json' };
      expect((await webhook(pretty, headers)).status).toBe(200);
      expect((await orderOf(order.id)).paymentStatus).toBe('PAID');
      const compact = Buffer.from(JSON.stringify(JSON.parse(pretty.toString())));
      const bad = await webhook(pretty, { ...headers, 'x-razorpay-signature': mock.signWebhook(compact), 'x-razorpay-event-id': `evt_${ts}_55b` });
      expect(bad.status).toBe(400);
    });

    it('56. duplicate deliveries of the same event id are harmless (one event row, one effect)', async () => {
      const { order, providerOrderId } = await ready();
      const p = mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
      const { raw, headers } = mock.buildWebhook('payment.captured', p, { eventId: `evt_${ts}_56` });
      const results = await Promise.all(Array.from({ length: 8 }, () => webhook(raw, headers)));
      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(await prisma.paymentWebhookEvent.count({ where: { eventId: `evt_${ts}_56` } })).toBe(1);
      expect(await confirmedEvents(order.id)).toBe(1);
      expect(await prisma.providerPayment.count({ where: { orderId: order.id } })).toBe(1);
    });

    it('57. the same payment re-announced under a NEW event id is an idempotent no-op', async () => {
      const { order, providerOrderId } = await ready();
      const p = mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
      const a = mock.buildWebhook('payment.captured', p, { eventId: `evt_${ts}_57a` });
      const b = mock.buildWebhook('order.paid', p, { eventId: `evt_${ts}_57b` });
      expect((await webhook(a.raw, a.headers)).status).toBe(200);
      expect((await webhook(b.raw, b.headers)).status).toBe(200);
      expect(await confirmedEvents(order.id)).toBe(1);
      expect(await prisma.providerPayment.count({ where: { orderId: order.id } })).toBe(1);
      expect(await prisma.paymentWebhookEvent.count({ where: { providerOrderId, status: 'PROCESSED' } })).toBe(2);
    });

    it('58. without a provider event id the deterministic body-hash fallback still deduplicates', async () => {
      const { providerOrderId } = await ready();
      const p = mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
      const { raw, headers } = mock.buildWebhook('payment.captured', p);
      const { 'x-razorpay-event-id': _id, ...noId } = headers;
      await webhook(raw, noId);
      await webhook(raw, noId);
      expect(await prisma.paymentWebhookEvent.count({ where: { providerOrderId, eventId: { startsWith: 'sha256:' } } })).toBe(1);
    });

    it('59. out-of-order delivery cannot regress state: authorized/failed arriving after captured change nothing', async () => {
      const { order, providerOrderId } = await ready();
      const p = mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
      for (const [type, status] of [['payment.captured', 'CAPTURED'], ['payment.authorized', 'AUTHORIZED'], ['payment.failed', 'FAILED']] as const) {
        const h = mock.buildWebhook(type, { ...p, status, errorCode: status === 'FAILED' ? 'LATE' : null }, { eventId: `evt_${ts}_59_${type}` });
        expect((await webhook(h.raw, h.headers)).status).toBe(200);
      }
      expect(await prisma.providerPayment.findFirstOrThrow({ where: { orderId: order.id } })).toMatchObject({ providerStatus: 'CAPTURED', reconciliationStatus: 'APPLIED' });
      expect(await orderOf(order.id)).toMatchObject({ paymentStatus: 'PAID', status: 'CONFIRMED' });
      expect(await prisma.paymentWebhookEvent.count({ where: { providerOrderId, status: 'PROCESSED' } })).toBe(3);
    });

    it('60. AUTHORIZED then FAILED webhooks are recorded in the ledger without confirming anything', async () => {
      const { order, providerOrderId } = await ready();
      const p = mock.simulatePayment(providerOrderId, { status: 'AUTHORIZED' });
      const a = mock.buildWebhook('payment.authorized', p, { eventId: `evt_${ts}_60a` });
      await webhook(a.raw, a.headers);
      const f = mock.buildWebhook('payment.failed', { ...p, status: 'FAILED', providerPaymentId: `${p.providerPaymentId}_2`, errorCode: 'BAD_REQUEST_ERROR' }, { eventId: `evt_${ts}_60b` });
      await webhook(f.raw, f.headers);
      expect(await orderOf(order.id)).toMatchObject({ paymentStatus: 'PENDING', status: 'PENDING' });
      const rows = await prisma.providerPayment.findMany({ where: { orderId: order.id }, orderBy: { createdAt: 'asc' } });
      expect(rows.map((r) => r.providerStatus)).toEqual(['AUTHORIZED', 'FAILED']);
      expect((await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } })).status).toBe('PENDING'); // a failed try does not kill the session
    });

    it('61. unsupported events are IGNORED with a reason; refund events are deferred to P7C (recoverable from the provider), not silently lost', async () => {
      const down = mock.buildWebhook('payment.downtime.started', null, { eventId: `evt_${ts}_61a` });
      await webhook(down.raw, down.headers);
      const refund = mock.buildWebhook('refund.processed', null, { eventId: `evt_${ts}_61b`, extra: { refund: { entity: { id: 'rfnd_1', payment_id: 'pay_x', amount: 100 } } } });
      await webhook(refund.raw, refund.headers);
      expect(await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { provider_eventId: { provider: 'mock', eventId: `evt_${ts}_61a` } } })).toMatchObject({ status: 'IGNORED', ignoredReason: 'UNSUPPORTED_EVENT_TYPE' });
      expect(await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { provider_eventId: { provider: 'mock', eventId: `evt_${ts}_61b` } } })).toMatchObject({ status: 'IGNORED', ignoredReason: 'DEFERRED_P7C' });
    });

    it('62. an event that matches no local session is NOT ignored: it stays RETRY_PENDING for the worker', async () => {
      const unknownOrder = mock.simulatePayment('order_stranger', { status: 'CAPTURED', amountMinor: MINOR });
      const h = mock.buildWebhook('payment.captured', unknownOrder, { eventId: `evt_${ts}_62` });
      expect((await webhook(h.raw, h.headers)).status).toBe(200);
      const ev = await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { provider_eventId: { provider: 'mock', eventId: `evt_${ts}_62` } } });
      expect(ev).toMatchObject({ status: 'RETRY_PENDING', attemptCount: 1, lastError: 'UNMATCHED_PROVIDER_ORDER' });
      expect(ev.nextAttemptAt).not.toBeNull();
    });

    it('63. WEBHOOK BEFORE LOCAL PERSISTENCE: the worker resolves the unmatched event through the provider order receipt, adopts the order and settles it', async () => {
      await quiesce();
      const order = await mkOrder(who.custA.profileId!);
      mock.failNextCreate('unknown-after-create');
      await createSession(who.custA.token, order.id);
      const session = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
      expect(session.providerOrderId).toBeNull();
      const providerOrderId = [...mock.orders.keys()][0];
      const p = mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
      const h = mock.buildWebhook('payment.captured', p, { eventId: `evt_${ts}_63` });
      expect((await webhook(h.raw, h.headers)).status).toBe(200);
      const evKey = { provider_eventId: { provider: 'mock', eventId: `evt_${ts}_63` } };
      expect((await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: evKey })).status).toBe('RETRY_PENDING');
      expect((await orderOf(order.id)).paymentStatus).toBe('PENDING');

      await prisma.paymentWebhookEvent.update({ where: evKey, data: { nextAttemptAt: pastDue() } });
      const stats = await PaymentReconciliationService.runOnce({ workerId: 't63' });
      expect(stats.eventsProcessed).toBe(1);
      expect((await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: evKey })).status).toBe('PROCESSED');
      expect(await sessionOf(session.id)).toMatchObject({ providerOrderId, status: 'SUCCESS' });
      expect(await orderOf(order.id)).toMatchObject({ paymentStatus: 'PAID', status: 'CONFIRMED' });
      expect(await confirmedEvents(order.id)).toBe(1);
    });

    it('64. an unmatched event for a provider order that is definitively NOT ours is finally IGNORED (only after asking the provider)', async () => {
      await quiesce();
      const stranger = await mock.createOrder({ receipt: 'another-system-receipt', amountMinor: 5000, currency: 'INR', notes: {} });
      const p = mock.simulatePayment(stranger.providerOrderId, { status: 'CAPTURED' });
      const h = mock.buildWebhook('payment.captured', p, { eventId: `evt_${ts}_64` });
      await webhook(h.raw, h.headers);
      const key = { provider_eventId: { provider: 'mock', eventId: `evt_${ts}_64` } };
      expect((await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: key })).status).toBe('RETRY_PENDING');
      await prisma.paymentWebhookEvent.update({ where: key, data: { nextAttemptAt: pastDue() } });
      const stats = await PaymentReconciliationService.runOnce({ workerId: 't64' });
      expect(stats.eventsIgnored).toBe(1);
      expect(await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: key })).toMatchObject({ status: 'IGNORED', ignoredReason: 'UNRELATED_PROVIDER_ORDER' });
    });

    it('65. an event for a provider order that LOOKS like ours but has no local intent is FAILED and alerted, never ignored', async () => {
      await quiesce();
      const alert = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const lookalike = await mock.createOrder({ receipt: randomUUID(), amountMinor: MINOR, currency: 'INR', notes: { source: 'protein-bowl' } });
      const p = mock.simulatePayment(lookalike.providerOrderId, { status: 'CAPTURED' });
      const h = mock.buildWebhook('payment.captured', p, { eventId: `evt_${ts}_65` });
      await webhook(h.raw, h.headers);
      const key = { provider_eventId: { provider: 'mock', eventId: `evt_${ts}_65` } };
      await prisma.paymentWebhookEvent.update({ where: key, data: { nextAttemptAt: pastDue() } });
      await PaymentReconciliationService.runOnce({ workerId: 't65' });
      expect(await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: key })).toMatchObject({ status: 'FAILED', lastError: 'OURS_BUT_NO_LOCAL_INTENT' });
      expect(alert.mock.calls.some((c) => String(c[0]).includes('webhook.unknown_intent'))).toBe(true);
    });

    it('66. processing failures are retried with bounded backoff and end FAILED (never silently dropped), and FAILED events can be replayed', async () => {
      await quiesce();
      useConfig({ PAYMENT_RETRY_MAX_ATTEMPTS: '3', PAYMENT_RETRY_BASE_SECONDS: '1', PAYMENT_RETRY_MAX_SECONDS: '2' });
      const { order, providerOrderId } = await ready();
      const p = mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
      const spy = vi.spyOn(PaymentSettlementService, 'settle').mockRejectedValue(new Error('database temporarily unavailable'));
      const h = mock.buildWebhook('payment.captured', p, { eventId: `evt_${ts}_66` });
      expect((await webhook(h.raw, h.headers)).status).toBe(200); // durable even though processing failed
      const key = { provider_eventId: { provider: 'mock', eventId: `evt_${ts}_66` } };
      let ev = await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: key });
      expect(ev).toMatchObject({ status: 'RETRY_PENDING', attemptCount: 1 });
      const attempts: number[] = [ev.attemptCount];
      for (let i = 0; i < 5 && ev.status === 'RETRY_PENDING'; i++) {
        await prisma.paymentWebhookEvent.update({ where: key, data: { nextAttemptAt: pastDue() } });
        await PaymentReconciliationService.runOnce({ workerId: 't66' });
        ev = await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: key });
        attempts.push(ev.attemptCount);
      }
      expect(ev.status).toBe('FAILED');
      expect(ev.attemptCount).toBeLessThanOrEqual(3);
      expect(attempts[0]).toBe(1);
      expect((await orderOf(order.id)).paymentStatus).toBe('PENDING');

      // operator replays after the cause is fixed
      spy.mockRestore();
      await PaymentManualRecoveryService.replayEvent(ev.id, { operator: 'ops-test', reason: 'database was restored' });
      expect((await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: key })).status).toBe('RETRY_PENDING');
      await PaymentReconciliationService.runOnce({ workerId: 't66b' });
      expect((await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: key })).status).toBe('PROCESSED');
      expect(await orderOf(order.id)).toMatchObject({ paymentStatus: 'PAID', status: 'CONFIRMED' });
    });

    it('67. if the event cannot even be PERSISTED the endpoint returns 500 so the provider retries (never a false 200)', async () => {
      const { providerOrderId } = await ready();
      const p = mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
      const h = mock.buildWebhook('payment.captured', p, { eventId: `evt_${ts}_67` });
      vi.spyOn(prisma.paymentWebhookEvent, 'create').mockRejectedValue(new Error('db down')); // different client instance: assert via real client below
      // The app uses its own shared client, so instead break the real one through a deliberately invalid event id length
      vi.restoreAllMocks();
      const spy = vi.spyOn((await import('../config/database.js')).prisma.paymentWebhookEvent, 'create').mockRejectedValue(new Error('db down'));
      const res = await webhook(h.raw, h.headers);
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('INGEST_FAILED');
      spy.mockRestore();
      expect((await webhook(h.raw, h.headers)).status).toBe(200); // the provider's retry then succeeds
    });

    it('68. a failure while processing inline still acknowledges (the event is durable) and leaves it RETRY_PENDING', async () => {
      const { order, providerOrderId } = await ready();
      const p = mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
      vi.spyOn(PaymentSettlementService, 'settle').mockRejectedValueOnce(new Error('boom'));
      const h = mock.buildWebhook('payment.captured', p, { eventId: `evt_${ts}_68` });
      expect((await webhook(h.raw, h.headers)).status).toBe(200);
      expect((await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { provider_eventId: { provider: 'mock', eventId: `evt_${ts}_68` } } })).status).toBe('RETRY_PENDING');
      expect((await orderOf(order.id)).paymentStatus).toBe('PENDING');
    });

    it('69. a webhook with the wrong amount is processed but the payment is flagged, never confirmed', async () => {
      const { order, providerOrderId } = await ready();
      const p = mock.simulatePayment(providerOrderId, { status: 'CAPTURED', amountMinor: 1000 });
      const h = mock.buildWebhook('payment.captured', p, { eventId: `evt_${ts}_69` });
      await webhook(h.raw, h.headers);
      expect(await orderOf(order.id)).toMatchObject({ paymentStatus: 'PENDING', status: 'PENDING' });
      expect((await prisma.providerPayment.findFirstOrThrow({ where: { orderId: order.id } })).reconciliationStatus).toBe('AMOUNT_MISMATCH');
    });

    it('70. a LATE capture on an expired / superseded session is still ledgered and applied (the watch window outlives the session TTL)', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      await expire(attemptId);
      await prisma.payment.update({ where: { id: attemptId }, data: { status: 'EXPIRED', supersededById: randomUUID() } });
      const p = mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
      const h = mock.buildWebhook('payment.captured', p, { eventId: `evt_${ts}_70` });
      await webhook(h.raw, h.headers);
      expect(await orderOf(order.id)).toMatchObject({ paymentStatus: 'PAID', status: 'CONFIRMED' });
      expect((await sessionOf(attemptId)).status).toBe('SUCCESS');
    });

    it('71. the webhook needs no customer authentication and ignores cookies/bearer tokens; the signature is the only authority', async () => {
      const { order, providerOrderId } = await ready();
      const p = mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
      const h = mock.buildWebhook('payment.captured', p, { eventId: `evt_${ts}_71` });
      const res = await request(app).post('/api/v1/payments/webhook').set({ ...h.headers, 'content-type': 'application/octet-stream' }).set('Origin', 'https://not-allowed.example').send(h.raw);
      expect(res.status).toBe(200); // provider calls carry no browser Origin; it is mounted outside the browser CORS/origin layer
      expect((await orderOf(order.id)).paymentStatus).toBe('PAID');
      const forged = await request(app).post('/api/v1/payments/webhook').set(bearer(who.admin.token)).set({ 'content-type': 'application/octet-stream' }).send(Buffer.from('{"event":"payment.captured"}'));
      expect(forged.status).toBe(400); // an admin bearer token is worth nothing without the provider signature
    });

    it('72. normal API protections are NOT weakened: other POST routes still enforce the origin check and JSON parsing', async () => {
      const res = await request(app).post('/api/v1/auth/login').set('Origin', 'https://not-allowed.example').send({ email: 'a@b.co', password: 'x' });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('ORIGIN_NOT_ALLOWED');
    });

    it('73. the webhook is mounted BEFORE the global JSON parser, CORS/origin layer and the general rate limiter (static guard on app.ts)', () => {
      const src = readFileSync(join(__dirname, '..', 'app.ts'), 'utf8').replace(/\/\/.*$/gm, '');
      const hook = src.indexOf("app.post('/api/v1/payments/webhook'");
      expect(hook).toBeGreaterThan(-1);
      for (const later of ['app.use(cors(', 'app.use(enforceAllowedOrigin)', 'app.use(express.json(', "app.use('/api/v1', generalRateLimiter)"]) {
        expect(src.indexOf(later), later).toBeGreaterThan(hook);
      }
      expect(src.slice(hook, hook + 160)).toContain('express.raw');
    });

    it('74. PII sent by the provider (email, contact, vpa, card) is never stored in the event, ledger or audit log', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      const p = captured(providerOrderId);
      const pii = { payment: { entity: { id: p.providerPaymentId, order_id: providerOrderId, amount: p.amountMinor, currency: 'INR', status: 'captured', method: 'card', email: 'secret.person@pii.test', contact: '+919999900000', vpa: 'secret@okbank', card: { last4: '4242', network: 'Visa' }, bank: 'PIIBANK' } } };
      const h = mock.buildWebhook('payment.captured', null, { eventId: `evt_${ts}_74`, extra: pii });
      await webhook(h.raw, h.headers);
      const dump = JSON.stringify([
        await prisma.paymentWebhookEvent.findMany({ where: { providerOrderId } }),
        await prisma.providerPayment.findMany({ where: { orderId: order.id } }),
        await prisma.payment.findMany({ where: { orderId: order.id } }),
        await prisma.auditLog.findMany({ where: { entityId: attemptId } })
      ]);
      for (const secret of ['secret.person@pii.test', '+919999900000', 'secret@okbank', '4242', 'Visa', 'PIIBANK']) expect(dump, secret).not.toContain(secret);
      expect((await prisma.providerPayment.findFirstOrThrow({ where: { orderId: order.id } })).method).toBe('card'); // instrument TYPE only
    });
  });

  // =============================================================================================== E. reconciliation worker
  describe('reconciliation worker', () => {
    it('75. settles a missed webhook/verify: a PENDING session whose provider payment was captured becomes PAID + CONFIRMED', async () => {
      await quiesce();
      const { order, attemptId, providerOrderId } = await ready();
      captured(providerOrderId);
      await prisma.payment.update({ where: { id: attemptId }, data: { nextAttemptAt: pastDue() } });
      const stats = await PaymentReconciliationService.runOnce({ workerId: 't75' });
      expect(stats.sessionsSettled).toBe(1);
      expect(await orderOf(order.id)).toMatchObject({ paymentStatus: 'PAID', status: 'CONFIRMED' });
      expect((await prisma.providerPayment.findFirstOrThrow({ where: { orderId: order.id } })).firstSeenVia).toBe('RECONCILIATION');
      expect((await sessionOf(attemptId)).nextAttemptAt).toBeNull();
    });

    it('76. running the worker again is a no-op (idempotent)', async () => {
      await quiesce();
      const { order, attemptId, providerOrderId } = await ready();
      captured(providerOrderId);
      await prisma.payment.update({ where: { id: attemptId }, data: { nextAttemptAt: pastDue() } });
      await PaymentReconciliationService.runOnce({ workerId: 't76a' });
      await prisma.payment.update({ where: { id: attemptId }, data: { nextAttemptAt: pastDue() } });
      const second = await PaymentReconciliationService.runOnce({ workerId: 't76b' });
      expect(second.sessionsSettled).toBe(0);
      expect(await confirmedEvents(order.id)).toBe(1);
      expect(await prisma.providerPayment.count({ where: { orderId: order.id } })).toBe(1);
    });

    it('77. an UNKNOWN session is resolved by receipt lookup; stale CREATED sessions likewise', async () => {
      await quiesce();
      const o1 = await mkOrder(who.custA.profileId!);
      mock.failNextCreate('unknown-after-create');
      await createSession(who.custA.token, o1.id);
      const s1 = await prisma.payment.findFirstOrThrow({ where: { orderId: o1.id } });
      const o2 = await mkOrder(who.custA.profileId!);
      const created = await mock.createOrder({ receipt: 'placeholder', amountMinor: MINOR, currency: 'INR', notes: {} });
      const s2 = await prisma.payment.create({ data: { orderId: o2.id, customerProfileId: who.custA.profileId!, amount: NET, currency: 'INR', status: 'CREATED', provider: 'mock', createdAt: new Date(Date.now() - 10 * 60_000), nextAttemptAt: pastDue() } });
      mock.orders.set(created.providerOrderId, { ...created, receipt: s2.id });
      await prisma.payment.update({ where: { id: s1.id }, data: { nextAttemptAt: pastDue() } });
      const stats = await PaymentReconciliationService.runOnce({ workerId: 't77' });
      expect(stats.sessionsAdopted).toBe(2);
      expect((await sessionOf(s1.id)).status).toBe('PENDING');
      expect(await sessionOf(s2.id)).toMatchObject({ status: 'PENDING', providerOrderId: created.providerOrderId });
    });

    it('78. an UNKNOWN session the provider cannot show stays UNKNOWN forever: backoff, review flag after the review window, NEVER FAILED/ABANDONED/replaced', async () => {
      await quiesce();
      const alert = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const order = await mkOrder(who.custA.profileId!);
      mock.failNextCreate('unknown');
      await createSession(who.custA.token, order.id);
      const s = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
      await age(s.id, 60 * 60_000); // beyond the 30 min review window
      let previousAttempts = 0;
      for (let i = 0; i < 3; i++) {
        await prisma.payment.update({ where: { id: s.id }, data: { nextAttemptAt: pastDue() } });
        await PaymentReconciliationService.runOnce({ workerId: 't78' });
        const cur = await sessionOf(s.id);
        expect(cur.status).toBe('UNKNOWN');
        expect(cur.reviewFlag).toBe('UNKNOWN_OUTCOME_UNRESOLVED');
        expect(cur.attemptCount).toBeGreaterThan(previousAttempts);
        expect(cur.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
        previousAttempts = cur.attemptCount;
      }
      expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
      expect(alert.mock.calls.some((c) => String(c[0]).includes('session.unknown_unresolved'))).toBe(true);
      expect((await PaymentReconciliationService.reviewReport()).unknownSessions).toBeGreaterThanOrEqual(1);
    });

    it('79. lookup that returns nothing temporarily (hidden listing) does not turn UNKNOWN into FAILED; later visibility adopts it', async () => {
      await quiesce();
      const order = await mkOrder(who.custA.profileId!);
      mock.failNextCreate('unknown-after-create');
      await createSession(who.custA.token, order.id);
      const s = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
      mock.setReceiptLookupHidden(true);
      await prisma.payment.update({ where: { id: s.id }, data: { nextAttemptAt: pastDue() } });
      await PaymentReconciliationService.runOnce({ workerId: 't79a' });
      expect((await sessionOf(s.id)).status).toBe('UNKNOWN');
      mock.setReceiptLookupHidden(false);
      await prisma.payment.update({ where: { id: s.id }, data: { nextAttemptAt: pastDue() } });
      await PaymentReconciliationService.runOnce({ workerId: 't79b' });
      expect((await sessionOf(s.id)).status).toBe('PENDING');
    });

    it('80. a PENDING session past its TTL becomes EXPIRED but stays under watch; a later capture is still applied', async () => {
      await quiesce();
      const { order, attemptId, providerOrderId } = await ready();
      await expire(attemptId);
      await prisma.payment.update({ where: { id: attemptId }, data: { nextAttemptAt: pastDue() } });
      await PaymentReconciliationService.runOnce({ workerId: 't80a' });
      const mid = await sessionOf(attemptId);
      expect(mid.status).toBe('EXPIRED');
      expect(mid.nextAttemptAt).not.toBeNull(); // still watched
      captured(providerOrderId);
      await prisma.payment.update({ where: { id: attemptId }, data: { nextAttemptAt: pastDue() } });
      await PaymentReconciliationService.runOnce({ workerId: 't80b' });
      expect(await orderOf(order.id)).toMatchObject({ paymentStatus: 'PAID', status: 'CONFIRMED' });
    });

    it('81. sessions older than the watch window stop being scheduled (no nextAttemptAt)', async () => {
      await quiesce();
      const { attemptId } = await ready();
      await age(attemptId, 8 * 86_400_000);
      await prisma.payment.update({ where: { id: attemptId }, data: { nextAttemptAt: pastDue(), expiresAt: pastDue() } });
      await PaymentReconciliationService.runOnce({ workerId: 't81' });
      expect((await sessionOf(attemptId)).nextAttemptAt).toBeNull();
    });

    it('82. provider errors back off with an incremented attempt counter and never corrupt the session', async () => {
      await quiesce();
      const { attemptId } = await ready();
      mock.setReadFailure(true);
      await prisma.payment.update({ where: { id: attemptId }, data: { nextAttemptAt: pastDue() } });
      const stats = await PaymentReconciliationService.runOnce({ workerId: 't82' });
      expect(stats.providerErrors).toBe(1);
      const s = await sessionOf(attemptId);
      expect(s).toMatchObject({ status: 'PENDING', attemptCount: 1, lockedUntil: null });
      expect(s.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('83. a captured ledger row that was never applied is decided from stored evidence (no provider call needed)', async () => {
      await quiesce();
      const { order, attemptId, providerOrderId } = await ready();
      await prisma.providerPayment.create({
        data: { provider: 'mock', providerPaymentId: `pay_orphan_${ts}`, providerOrderId, paymentId: attemptId, orderId: order.id, amount: NET, currency: 'INR', providerStatus: 'CAPTURED', firstSeenVia: 'WEBHOOK', firstCapturedSeenAt: new Date() }
      });
      mock.setReadFailure(true); // proves no provider call is needed
      const stats = await PaymentReconciliationService.runOnce({ workerId: 't83' });
      expect(stats.ledgerApplied).toBeGreaterThanOrEqual(1);
      expect(await orderOf(order.id)).toMatchObject({ paymentStatus: 'PAID', status: 'CONFIRMED' });
    });

    it('84. TWO workers running concurrently process each due session exactly once (real DB, SKIP LOCKED + leases)', async () => {
      await quiesce();
      const sessions = [];
      for (let i = 0; i < 8; i++) {
        const r = await ready();
        await prisma.payment.update({ where: { id: r.attemptId }, data: { nextAttemptAt: pastDue() } });
        sessions.push(r.attemptId);
      }
      const [a, b] = await Promise.all([PaymentReconciliationService.runOnce({ workerId: 'worker-A', limit: 4 }), PaymentReconciliationService.runOnce({ workerId: 'worker-B', limit: 4 })]);
      expect(a.sessionsClaimed + b.sessionsClaimed).toBeLessThanOrEqual(8);
      const rows = await prisma.payment.findMany({ where: { id: { in: sessions } } });
      for (const r of rows) expect(r.attemptCount).toBeLessThanOrEqual(1); // never processed twice
      const handled = rows.filter((r) => r.attemptCount === 1).length;
      expect(handled).toBe(a.sessionsClaimed + b.sessionsClaimed);
      expect(handled).toBeGreaterThanOrEqual(4);
    });

    it('85. SKIP LOCKED: while worker A holds its claim transaction open, worker B claims DIFFERENT rows immediately (never blocks, never overlaps)', async () => {
      await quiesce();
      const ids: string[] = [];
      for (let i = 0; i < 6; i++) {
        const r = await ready();
        await prisma.payment.update({ where: { id: r.attemptId }, data: { nextAttemptAt: pastDue() } });
        ids.push(r.attemptId);
      }
      let release!: () => void;
      const hold = new Promise<void>((r) => (release = r));
      let claimedByA!: (v: string[]) => void;
      const aReady = new Promise<string[]>((r) => (claimedByA = r));
      const txA = prisma.$transaction(
        async (tx) => {
          claimedByA(await PaymentReconciliationService.claimSessions(tx, 'A', 3));
          await hold;
        },
        { timeout: 20000, maxWait: 5000 }
      );
      const a = await aReady;
      const started = Date.now();
      const b = await PaymentReconciliationService.claimSessions(prisma, 'B', 3);
      const elapsed = Date.now() - started;
      release();
      await txA;
      expect(elapsed).toBeLessThan(3000); // it did not wait for A's transaction
      expect(a).toHaveLength(3);
      expect(b).toHaveLength(3);
      expect(a.filter((x) => b.includes(x))).toEqual([]);
      expect([...a, ...b].sort()).toEqual([...ids].sort());
    });

    it('86. leases: a claimed row cannot be claimed again until the lease expires; expiry makes it claimable (crashed worker recovery)', async () => {
      await quiesce();
      const { attemptId } = await ready();
      await prisma.payment.update({ where: { id: attemptId }, data: { nextAttemptAt: pastDue() } });
      expect(await PaymentReconciliationService.claimSessions(prisma, 'W1', 5)).toEqual([attemptId]);
      expect(await PaymentReconciliationService.claimSessions(prisma, 'W2', 5)).toEqual([]);
      const row = await sessionOf(attemptId);
      expect(row.lockedBy).toBe('W1');
      expect(row.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
      await prisma.payment.update({ where: { id: attemptId }, data: { lockedUntil: pastDue() } });
      expect(await PaymentReconciliationService.claimSessions(prisma, 'W2', 5)).toEqual([attemptId]);
      expect((await sessionOf(attemptId)).lockedBy).toBe('W2');
    });

    it('87. batches are bounded: a claim never returns more than the requested limit, and never rows that are not due', async () => {
      await quiesce();
      const due: string[] = [];
      for (let i = 0; i < 5; i++) {
        const r = await ready();
        await prisma.payment.update({ where: { id: r.attemptId }, data: { nextAttemptAt: pastDue() } });
        due.push(r.attemptId);
      }
      const notDue = await ready();
      await prisma.payment.update({ where: { id: notDue.attemptId }, data: { nextAttemptAt: new Date(Date.now() + 3_600_000) } });
      const first = await PaymentReconciliationService.claimSessions(prisma, 'W', 2);
      expect(first).toHaveLength(2);
      const rest = await PaymentReconciliationService.claimSessions(prisma, 'W', 50);
      expect(rest).toHaveLength(3);
      expect([...first, ...rest].sort()).toEqual([...due].sort());
      expect([...first, ...rest]).not.toContain(notDue.attemptId);
    });

    it('88. event claiming follows the same SKIP LOCKED + lease rules and only picks RETRY_PENDING / stale RECEIVED events', async () => {
      await quiesce();
      const mk = (status: string, nextAttemptAt: Date | null, receivedAt = new Date()) =>
        prisma.paymentWebhookEvent.create({ data: { provider: 'mock', eventId: `evt_${ts}_88_${++seq}`, eventType: 'payment.captured', payloadHash: 'h'.repeat(64), status, nextAttemptAt, receivedAt } });
      const dueRetry = await mk('RETRY_PENDING', pastDue());
      const futureRetry = await mk('RETRY_PENDING', new Date(Date.now() + 3_600_000));
      const freshReceived = await mk('RECEIVED', null);
      const staleReceived = await mk('RECEIVED', null, new Date(Date.now() - 5 * 60_000));
      const done = await mk('PROCESSED', null, new Date(Date.now() - 5 * 60_000));
      const claimed = await PaymentReconciliationService.claimEvents(prisma, 'E1', 50);
      expect(claimed.sort()).toEqual([dueRetry.id, staleReceived.id].sort());
      for (const id of [futureRetry.id, freshReceived.id, done.id]) expect(claimed).not.toContain(id);
      expect(await PaymentReconciliationService.claimEvents(prisma, 'E2', 50)).toEqual([]); // leased
    });

    it('89. the review report counts failed events, flagged payments/sessions and unknown sessions', async () => {
      await quiesce();
      const before = await PaymentReconciliationService.reviewReport();
      const { order, attemptId, providerOrderId } = await ready();
      await PaymentSettlementService.settle({ paymentId: attemptId, payment: info(providerOrderId), provider: 'mock', via: 'WEBHOOK' });
      await PaymentSettlementService.settle({ paymentId: attemptId, payment: info(providerOrderId), provider: 'mock', via: 'WEBHOOK' }); // DUPLICATE
      await prisma.paymentWebhookEvent.create({ data: { provider: 'mock', eventId: `evt_${ts}_89`, eventType: 'payment.captured', payloadHash: 'h'.repeat(64), status: 'FAILED' } });
      const after = await PaymentReconciliationService.reviewReport();
      expect(after.flaggedLedgerRows).toBe(before.flaggedLedgerRows + 1);
      expect(after.flaggedSessions).toBe(before.flaggedSessions + 1);
      expect(after.failedEvents).toBe(before.failedEvents + 1);
      expect(after.total).toBeGreaterThan(before.total);
      expect(order.id).toBeTruthy();
    });
  });

  // =============================================================================================== F. manual recovery (CLI services)
  describe('manual recovery operations', () => {
    it('90. every manual action requires an operator and a reason', async () => {
      const { attemptId } = await ready();
      for (const op of [{ operator: '', reason: 'valid reason here' }, { operator: 'ops', reason: '' }, { operator: 'ops', reason: 'x' }]) {
        await expect(PaymentManualRecoveryService.abandonSession(attemptId, op)).rejects.toMatchObject({ statusCode: 422 });
        await expect(PaymentManualRecoveryService.adoptProviderOrder(attemptId, 'order_x', op)).rejects.toMatchObject({ statusCode: 422 });
        await expect(PaymentManualRecoveryService.replayEvent(randomUUID(), op)).rejects.toMatchObject({ statusCode: 422 });
      }
      expect((await sessionOf(attemptId)).status).toBe('PENDING');
    });

    it('91. adopt re-verifies the provider order (receipt, amount, currency), is audited, and can NEVER mark anything paid', async () => {
      const order = await mkOrder(who.custA.profileId!);
      mock.failNextCreate('unknown-after-create');
      await createSession(who.custA.token, order.id);
      const s = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
      const providerOrderId = [...mock.orders.keys()][0];
      const stranger = await mock.createOrder({ receipt: 'not-this-session', amountMinor: MINOR, currency: 'INR', notes: {} });
      const op = { operator: 'ops-test', reason: 'found in the provider dashboard' };
      await expect(PaymentManualRecoveryService.adoptProviderOrder(s.id, stranger.providerOrderId, op)).rejects.toMatchObject({ errorCode: 'ADOPT_REFUSED' }); // wrong receipt
      await expect(PaymentManualRecoveryService.adoptProviderOrder(s.id, 'order_missing', op)).rejects.toMatchObject({ errorCode: 'PROVIDER_ORDER_NOT_FOUND' });
      await PaymentManualRecoveryService.adoptProviderOrder(s.id, providerOrderId, op);
      expect(await sessionOf(s.id)).toMatchObject({ status: 'PENDING', providerOrderId });
      const a = (await audits('PAYMENT_MANUAL_ADOPTED', s.id))[0];
      expect(a.role).toBe('CLI:ops-test');
      expect(a.payload).toMatchObject({ providerOrderId, reason: 'found in the provider dashboard' });
      expect(await orderOf(order.id)).toMatchObject({ paymentStatus: 'PENDING', status: 'PENDING', paidByProviderPaymentId: null });
    });

    it('92. abandon is refused while the provider shows a captured/authorized payment, and is audited otherwise', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      mock.simulatePayment(providerOrderId, { status: 'AUTHORIZED' });
      const op = { operator: 'ops-test', reason: 'customer reported a problem' };
      await expect(PaymentManualRecoveryService.abandonSession(attemptId, op)).rejects.toMatchObject({ errorCode: 'ABANDON_REFUSED' });
      mock.payments.clear();
      const res = await PaymentManualRecoveryService.abandonSession(attemptId, op);
      expect(res).toEqual({ abandoned: true, alreadyAbandoned: false });
      expect((await sessionOf(attemptId)).status).toBe('ABANDONED');
      expect((await audits('PAYMENT_MANUAL_ABANDONED', attemptId))[0].payload).toMatchObject({ reason: 'customer reported a problem', previousStatus: 'PENDING' });
      expect((await orderOf(order.id)).paymentStatus).toBe('PENDING');
      expect((await PaymentManualRecoveryService.abandonSession(attemptId, op)).alreadyAbandoned).toBe(true);
    });

    it('93. a session with captured ledger evidence can never be abandoned', async () => {
      const { attemptId, providerOrderId } = await ready();
      await PaymentSettlementService.settle({ paymentId: attemptId, payment: info(providerOrderId), provider: 'mock', via: 'WEBHOOK' });
      await expect(PaymentManualRecoveryService.abandonSession(attemptId, { operator: 'ops-test', reason: 'trying to abandon a paid session' })).rejects.toMatchObject({ errorCode: 'ABANDON_REFUSED' });
    });

    it('94. replay only works for FAILED/RETRY_PENDING events and is audited', async () => {
      const mk = (status: string) => prisma.paymentWebhookEvent.create({ data: { provider: 'mock', eventId: `evt_${ts}_94_${++seq}`, eventType: 'payment.captured', payloadHash: 'h'.repeat(64), status } });
      const processed = await mk('PROCESSED');
      const failed = await mk('FAILED');
      const op = { operator: 'ops-test', reason: 'root cause fixed in release' };
      await expect(PaymentManualRecoveryService.replayEvent(processed.id, op)).rejects.toMatchObject({ errorCode: 'REPLAY_REFUSED' });
      await expect(PaymentManualRecoveryService.replayEvent(randomUUID(), op)).rejects.toMatchObject({ errorCode: 'EVENT_NOT_FOUND' });
      await PaymentManualRecoveryService.replayEvent(failed.id, op);
      expect(await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { id: failed.id } })).toMatchObject({ status: 'RETRY_PENDING', attemptCount: 0 });
      expect((await audits('PAYMENT_EVENT_REPLAYED', failed.id))[0].payload).toMatchObject({ previousStatus: 'FAILED' });
    });

    it('95. there is NO HTTP surface for manual recovery, reconciliation, simulation or marking paid (route + source guards)', async () => {
      for (const path of ['/api/v1/payments/mark-paid', '/api/v1/payments/simulate-payment-success', '/api/v1/payments/mock-capture', '/api/v1/payments/reconcile', '/api/v1/payments/adopt', '/api/v1/admin/payments/reconcile', '/api/v1/admin/payments/mark-paid', '/api/v1/admin/payments/abandon', '/api/v1/orders/x/mark-paid']) {
        for (const method of ['post', 'put', 'patch'] as const) {
          const res = await request(app)[method](path).set(bearer(who.admin.token)).send({});
          expect([404, 400], `${method} ${path}`).toContain(res.status);
          expect(res.status === 404 || res.body.error === 'INVALID_SIGNATURE' || res.body.error === 'INVALID_PAYLOAD').toBe(true);
        }
      }
      const routeFiles = ['payment.routes.ts', 'paymentAdmin.routes.ts'].map((f) => readFileSync(join(__dirname, '..', 'modules', 'payment', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1'));
      for (const src of routeFiles) expect(src).not.toMatch(/mark-?paid|simulate|mock-capture|adopt|abandon(?!ed)|reconcile/i);
    });
  });

  // =============================================================================================== G. RBAC + admin visibility + privacy
  describe('RBAC, admin visibility and privacy', () => {
    it('96. GET /admin/payments: SUPER_ADMIN and MD may read; CHEF, DELIVERY, customers and anonymous may not', async () => {
      await ready();
      for (const label of ['admin', 'md']) {
        const res = await request(app).get('/api/v1/admin/payments').set(bearer(who[label].token));
        expect(res.status, label).toBe(200);
        expect(res.body.data).toHaveProperty('items');
        expect(res.body.data).toHaveProperty('review');
      }
      for (const label of ['chef', 'driver', 'custA']) expect((await request(app).get('/api/v1/admin/payments').set(bearer(who[label].token))).status, label).toBe(403);
      expect((await request(app).get('/api/v1/admin/payments')).status).toBe(401);
    });

    it('97. the admin view is read-only (no mutating methods) and filterable by review flags', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      await PaymentSettlementService.settle({ paymentId: attemptId, payment: info(providerOrderId), provider: 'mock', via: 'WEBHOOK' });
      await PaymentSettlementService.settle({ paymentId: attemptId, payment: info(providerOrderId), provider: 'mock', via: 'WEBHOOK' });
      for (const method of ['post', 'put', 'patch', 'delete'] as const) {
        const res = await request(app)[method]('/api/v1/admin/payments').set(bearer(who.admin.token)).send({});
        expect([404, 405, 400]).toContain(res.status);
      }
      const review = await request(app).get('/api/v1/admin/payments?reviewOnly=true&pageSize=100').set(bearer(who.admin.token));
      expect(review.status).toBe(200);
      const item = review.body.data.items.find((i: { order: { id: string } }) => i.order.id === order.id);
      expect(item).toBeDefined();
      expect(item.reviewFlag).toBe('DUPLICATE_CAPTURE');
      expect(item.providerPayments.map((p: { reconciliationStatus: string }) => p.reconciliationStatus).sort()).toEqual(['APPLIED', 'DUPLICATE']);
      const filtered = await request(app).get('/api/v1/admin/payments?status=SUCCESS').set(bearer(who.md.token));
      expect(filtered.body.data.items.every((i: { status: string }) => i.status === 'SUCCESS')).toBe(true);
      expect((await request(app).get('/api/v1/admin/payments?status=NOPE').set(bearer(who.admin.token))).status).toBe(422);
    });

    it('98. admin responses carry only ids, statuses and amounts: no signatures, secrets, raw payloads or instrument data', async () => {
      const { attemptId, providerOrderId } = await ready();
      await PaymentSettlementService.settle({ paymentId: attemptId, payment: info(providerOrderId), provider: 'mock', via: 'WEBHOOK' });
      const res = await request(app).get('/api/v1/admin/payments?pageSize=100').set(bearer(who.admin.token));
      const text = JSON.stringify(res.body);
      expect(text).not.toMatch(new RegExp(`${MOCK_KEY_SECRET}|${MOCK_WEBHOOK_SECRET}|razorpay_signature|"signature"|payload|normalized|payloadHash|lockedBy|vpa|cardNumber`));
    });

    it('99. customers cannot reach each other\'s sessions through any payment endpoint, and staff cannot use customer payment endpoints', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      const p = captured(providerOrderId);
      const body = verifyBody(providerOrderId, p.providerPaymentId);
      expect((await createSession(who.custB.token, order.id)).status).toBe(404);
      expect((await verify(who.custB.token, order.id, attemptId, body)).status).toBe(404);
      expect((await request(app).get(`/api/v1/orders/${order.id}/payment-attempts/${attemptId}`).set(bearer(who.custB.token))).status).toBe(404);
      for (const label of ['admin', 'md', 'chef', 'driver']) {
        expect((await createSession(who[label].token, order.id)).status, label).toBe(403);
        expect((await verify(who[label].token, order.id, attemptId, body)).status, label).toBe(403);
      }
      expect((await orderOf(order.id)).paymentStatus).toBe('PENDING');
    });

    it('100. after complete flows no secret, signature or provider payload exists anywhere in the audit log, ledger, events or sessions', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      const p = captured(providerOrderId);
      const sig = mock.signCheckout(providerOrderId, p.providerPaymentId);
      await verify(who.custA.token, order.id, attemptId, { providerOrderId, providerPaymentId: p.providerPaymentId, signature: sig });
      await verify(who.custA.token, order.id, attemptId, { providerOrderId, providerPaymentId: p.providerPaymentId, signature: 'b'.repeat(64) });
      const h = mock.buildWebhook('payment.captured', p, { eventId: `evt_${ts}_100` });
      await webhook(h.raw, h.headers);
      const dump = JSON.stringify([
        await prisma.auditLog.findMany({ where: { OR: [{ entityId: attemptId }, { entityId: order.id }] } }),
        await prisma.providerPayment.findMany({ where: { orderId: order.id } }),
        await prisma.payment.findMany({ where: { orderId: order.id } }),
        await prisma.paymentWebhookEvent.findMany({ where: { providerOrderId } })
      ]);
      for (const secret of [sig, 'b'.repeat(64), h.headers['x-razorpay-signature'], MOCK_KEY_SECRET, MOCK_WEBHOOK_SECRET, h.raw.toString('utf8')]) expect(dump.includes(secret), secret.slice(0, 12)).toBe(false);
    });

    it('101. nothing is logged to the console except structured id-only alerts (no signatures, secrets or payloads)', async () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { order, attemptId, providerOrderId } = await ready();
      const p1 = captured(providerOrderId);
      await verify(who.custA.token, order.id, attemptId, verifyBody(providerOrderId, p1.providerPaymentId));
      const p2 = captured(providerOrderId);
      await verify(who.custA.token, order.id, attemptId, verifyBody(providerOrderId, p2.providerPaymentId)); // duplicate -> structured alert
      await verify(who.custA.token, order.id, attemptId, verifyBody(providerOrderId, p1.providerPaymentId, 'c'.repeat(64)));
      const printed = [...log.mock.calls, ...err.mock.calls, ...warn.mock.calls].map((c) => c.map(String).join(' ')).join('\n');
      expect(printed).not.toMatch(new RegExp(`${MOCK_KEY_SECRET}|${MOCK_WEBHOOK_SECRET}|c{64}|signature`));
      for (const c of err.mock.calls.filter((x) => String(x[0]).includes('"area":"payments"'))) for (const k of Object.keys(JSON.parse(String(c[0])))) expect(['level', 'area', 'event', 'ledgerId', 'orderId', 'outcome', 'paymentId', 'attemptId', 'reason']).toContain(k);
    });

    it('102. Payment.payload is deprecated: the application never writes it (static guard on payment sources)', () => {
      const dir = join(__dirname, '..', 'modules', 'payment');
      for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts') && !/provider|razorpay|signatures/.test(x) && statSync(join(dir, x)).isFile())) {
        const src = readFileSync(join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
        expect(src, f).not.toMatch(/\bpayload\s*:\s*[^\s{]/); // no `payload:` column write (audit entries use an object literal and are allowed)
        expect(src, f).not.toMatch(/data:\s*\{[^}]*\bpayload\b/);
      }
    });

    it('104. FINAL REVIEW: two DIFFERENT captured payments racing for one order, 12 rounds on real PostgreSQL: exactly one APPLIED, one PAID, one CONFIRMED, the other preserved as DUPLICATE', async () => {
      for (let round = 0; round < 12; round++) {
        const { order, attemptId, providerOrderId } = await ready();
        const [p1, p2] = [info(providerOrderId), info(providerOrderId)];
        const results = await Promise.all([
          PaymentSettlementService.settle({ paymentId: attemptId, payment: p1, provider: 'mock', via: 'WEBHOOK' }),
          PaymentSettlementService.settle({ paymentId: attemptId, payment: p2, provider: 'mock', via: 'RECONCILIATION' })
        ]);
        expect(results.map((r) => r.outcome).sort(), `round ${round}`).toEqual(['APPLIED', 'DUPLICATE']);
        const rows = await prisma.providerPayment.findMany({ where: { orderId: order.id } });
        expect(rows.map((r) => r.reconciliationStatus).sort()).toEqual(['APPLIED', 'DUPLICATE']);
        expect(rows.map((r) => r.providerPaymentId).sort()).toEqual([p1.providerPaymentId, p2.providerPaymentId].sort());
        const o = await orderOf(order.id);
        expect(o).toMatchObject({ paymentStatus: 'PAID', status: 'CONFIRMED' });
        expect(o.paidByProviderPaymentId).toBe(rows.find((r) => r.reconciliationStatus === 'APPLIED')!.id);
        expect(await confirmedEvents(order.id)).toBe(1);
        expect(await audits('PAYMENT_VERIFIED', attemptId)).toHaveLength(1); // one PAID transition
        expect(await audits('PAYMENT_FLAGGED', attemptId)).toHaveLength(1);
      }
    });

    it('105. integrity backstop: the UNIQUE paid-reference means one ledger row can never be the effective payment of two orders', async () => {
      const a = await ready();
      const b = await ready(who.custB);
      await PaymentSettlementService.settle({ paymentId: a.attemptId, payment: info(a.providerOrderId), provider: 'mock', via: 'WEBHOOK' });
      const ledgerId = (await orderOf(a.order.id)).paidByProviderPaymentId!;
      await expect(prisma.order.update({ where: { id: b.order.id }, data: { paidByProviderPaymentId: ledgerId } })).rejects.toMatchObject({ code: 'P2002' });
      expect((await orderOf(b.order.id)).paidByProviderPaymentId).toBeNull();
    });

    it('106. event-id fallback: the same signed webhook WITHOUT an event-id header, delivered twice (and concurrently), has exactly one effect and no raw body is stored', async () => {
      const { order, attemptId, providerOrderId } = await ready();
      const p = mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
      const { raw, headers } = mock.buildWebhook('payment.captured', p);
      const { 'x-razorpay-event-id': _omit, ...noId } = headers;
      const [r1, r2] = await Promise.all([webhook(raw, noId), webhook(raw, noId)]);
      const r3 = await webhook(raw, noId);
      expect([r1.status, r2.status, r3.status]).toEqual([200, 200, 200]);
      const events = await prisma.paymentWebhookEvent.findMany({ where: { providerOrderId } });
      expect(events).toHaveLength(1);
      expect(events[0].eventId).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(events[0].payloadHash).toBe(events[0].eventId.slice(7));
      expect(JSON.stringify(events[0])).not.toContain(raw.toString('utf8'));
      expect(await prisma.providerPayment.count({ where: { orderId: order.id } })).toBe(1);
      expect(await confirmedEvents(order.id)).toBe(1);
      expect(await audits('PAYMENT_VERIFIED', attemptId)).toHaveLength(1);
    });

    it('107. receipt lookup is EXACT even though the provider filter is "contains": a foreign order whose receipt merely contains the session id is never adopted', async () => {
      await quiesce();
      const order = await mkOrder(who.custA.profileId!);
      mock.failNextCreate('unknown');
      await createSession(who.custA.token, order.id);
      const s = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
      await mock.createOrder({ receipt: `x${s.id}y`, amountMinor: MINOR, currency: 'INR', notes: {} });
      await prisma.payment.update({ where: { id: s.id }, data: { nextAttemptAt: pastDue() } });
      await PaymentReconciliationService.runOnce({ workerId: 't107' });
      expect(await sessionOf(s.id)).toMatchObject({ status: 'UNKNOWN', providerOrderId: null });
    });

    it('108. AUTHORIZED-but-never-captured (wrong account capture mode): never PAID, order stays PENDING, and operators get a flag + alert after the review window', async () => {
      await quiesce();
      const alert = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { order, attemptId, providerOrderId } = await ready();
      mock.simulatePayment(providerOrderId, { status: 'AUTHORIZED' });
      await prisma.payment.update({ where: { id: attemptId }, data: { nextAttemptAt: pastDue() } });
      await PaymentReconciliationService.runOnce({ workerId: 't108a' });
      expect((await sessionOf(attemptId)).reviewFlag).toBeNull(); // not yet old enough to be suspicious
      await age(attemptId, 2 * 60 * 60_000);
      await prisma.payment.update({ where: { id: attemptId }, data: { nextAttemptAt: pastDue() } });
      await PaymentReconciliationService.runOnce({ workerId: 't108b' });
      expect(await sessionOf(attemptId)).toMatchObject({ reviewFlag: 'AUTHORIZED_NOT_CAPTURED', status: 'PENDING' });
      expect(await orderOf(order.id)).toMatchObject({ paymentStatus: 'PENDING', status: 'PENDING', paidByProviderPaymentId: null });
      expect(alert.mock.calls.some((c) => String(c[0]).includes('session.authorized_not_captured'))).toBe(true);
      await prisma.payment.update({ where: { id: attemptId }, data: { createdAt: new Date() } }); // newest first in the admin list
      const res = await request(app).get('/api/v1/admin/payments?reviewOnly=true&pageSize=100').set(bearer(who.admin.token));
      const item = res.body.data.items.find((i: { order: { id: string } }) => i.order.id === order.id);
      expect(item.reviewFlag).toBe('AUTHORIZED_NOT_CAPTURED');
      expect(item.providerPayments[0].providerStatus).toBe('AUTHORIZED');
    });

    it('103. legacy Payment rows (no provider) are untouched by P7B code: never claimed, never listed as sessions', async () => {
      const order = await mkOrder(who.custA.profileId!);
      const legacy = await prisma.payment.create({ data: { orderId: order.id, amount: NET, status: 'SUCCESS', method: 'UPI' } });
      await PaymentReconciliationService.runOnce({ workerId: 't103' });
      expect(await sessionOf(legacy.id)).toMatchObject({ status: 'SUCCESS', provider: null, nextAttemptAt: null });
      const res = await request(app).get('/api/v1/admin/payments?pageSize=100').set(bearer(who.admin.token));
      expect(res.body.data.items.find((i: { id: string }) => i.id === legacy.id)).toBeUndefined();
      const fresh = await createSession(who.custA.token, order.id); // a legacy row does not block a real session
      expect(fresh.status).toBe(200);
    });
  });
});
