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
import { PaymentReconciliationService } from '../modules/payment/paymentReconciliation.service.js';
import { OrderTransitionService } from '../modules/order/orderTransition.service.js';
import { RefundService } from '../modules/refund/refund.service.js';
import { RefundSettlementService } from '../modules/refund/refundSettlement.service.js';
import { RefundManualRecoveryService } from '../modules/refund/refundManualRecovery.service.js';
import { lockOrder, lockProviderPaymentById } from '../modules/payment/paymentOps.js';
import { AppError } from '../middleware/error.middleware.js';
import type { ProviderRefund } from '../modules/payment/provider.types.js';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const mock = getPaymentProvider() as MockPaymentProvider;
const ADMIN_PASSWORD = 'P7c#Admin-Pass-2026-xyz';
const sign = (userId: string, email: string, roles: RoleEnum[]) => jwt.sign({ userId, email, roles }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('P7C — cancellation, full refunds, refund webhooks and reconciliation (real PostgreSQL, mock provider)', () => {
  const ts = Date.now();
  let seq = 0;
  type Who = { id: string; email: string; profileId?: string; token: string };
  const who: Record<string, Who> = {};
  let adminStep = '';
  const NET = '145.50';
  const MINOR = 14550;

  async function mkUser(label: string, roles: RoleEnum[]): Promise<Who> {
    const email = `p7c_${label}_${ts}@test.com`;
    const customer = roles.includes(RoleEnum.CUSTOMER);
    const u = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4),
        roles: { create: roles.map((role) => ({ role })) },
        ...(customer ? { customerProfile: { create: { fullName: `P7C ${label}`, referralCode: `PB-7C${label.toUpperCase()}${ts}` } } } : {})
      },
      include: { customerProfile: true }
    });
    who[label] = { id: u.id, email, profileId: u.customerProfile?.id, token: sign(u.id, email, roles) };
    return who[label];
  }

  const mkOrder = (profileId: string, over: Record<string, unknown> = {}) =>
    prisma.order.create({
      data: { orderNumber: `P7C-${ts}-${++seq}`, totalAmount: 100, netAmount: NET, customerProfileId: profileId, status: 'PENDING', paymentStatus: 'PENDING', paymentMethod: 'ONLINE', orderType: 'DIRECT', ...over } as never
    });

  const createSession = (token: string, orderId: string) => request(app).post(`/api/v1/orders/${orderId}/payment-attempts`).set(bearer(token)).send({});
  const verify = (token: string, orderId: string, attemptId: string, providerOrderId: string, providerPaymentId: string) =>
    request(app).post(`/api/v1/orders/${orderId}/payment-attempts/${attemptId}/verify`).set(bearer(token)).send({ providerOrderId, providerPaymentId, signature: mock.signCheckout(providerOrderId, providerPaymentId) });
  // supertest would JSON-serialize a Buffer sent as application/json; octet-stream delivers the exact bytes
  const webhook = (raw: Buffer, headers: Record<string, string>) => request(app).post('/api/v1/payments/webhook').set({ ...headers, 'content-type': 'application/octet-stream' }).send(raw);
  const cancelCust = (token: string, orderId: string, body: Record<string, unknown> = { reasonCode: 'CHANGED_MIND' }) => request(app).post(`/api/v1/orders/${orderId}/cancel`).set(bearer(token)).send(body);
  const cancelAdmin = (orderId: string, body: Record<string, unknown> = { reasonCode: 'OPERATIONAL_ISSUE' }, step: string | null = adminStep, token = who.admin.token) => {
    const r = request(app).post(`/api/v1/admin/orders/${orderId}/cancel`).set(bearer(token));
    return (step ? r.set('x-step-up-token', step) : r).send(body);
  };
  const approve = (ledgerId: string, body: Record<string, unknown> = {}, step: string | null = adminStep, token = who.admin.token) => {
    const r = request(app).post(`/api/v1/admin/provider-payments/${ledgerId}/refund`).set(bearer(token));
    return (step ? r.set('x-step-up-token', step) : r).send(body);
  };

  /** A fully paid CONFIRMED order, created through the real session + verification endpoints. */
  async function payOrder(customer = who.custA) {
    const order = await mkOrder(customer.profileId!);
    const s = await createSession(customer.token, order.id);
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    const attemptId = s.body.data.attemptId as string;
    const providerOrderId = s.body.data.providerOrderId as string;
    const pay = mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
    const v = await verify(customer.token, order.id, attemptId, providerOrderId, pay.providerPaymentId);
    expect(v.status, JSON.stringify(v.body)).toBe(200);
    const ledger = await prisma.providerPayment.findUniqueOrThrow({ where: { provider_providerPaymentId: { provider: 'mock', providerPaymentId: pay.providerPaymentId } } });
    return { order, attemptId, providerOrderId, pay, ledger, customer };
  }
  /** Paid order cancelled by its customer: returns the refund intent (REQUESTED). */
  async function cancelPaid(customer = who.custA) {
    const p = await payOrder(customer);
    const c = await cancelCust(customer.token, p.order.id);
    expect(c.status, JSON.stringify(c.body)).toBe(200);
    const refund = await prisma.refund.findFirstOrThrow({ where: { providerPaymentId: p.ledger.id } });
    return { ...p, refund };
  }
  const orderOf = (id: string) => prisma.order.findUniqueOrThrow({ where: { id } });
  const refundOf = (id: string) => prisma.refund.findUniqueOrThrow({ where: { id } });
  const audits = (action: string, entityId: string) => prisma.auditLog.findMany({ where: { action, entityId } });
  const pastDue = () => new Date(Date.now() - 1000);
  const dueRefund = (id: string) => prisma.refund.update({ where: { id }, data: { nextAttemptAt: pastDue() } });
  const providerRefundFor = (refundId: string): ProviderRefund | undefined => [...mock.refunds.values()].find((r) => r.receipt === refundId);
  const runWorker = (id = 'p7c') => PaymentReconciliationService.runOnce({ workerId: id });
  const useConfig = (over: Record<string, string>) => setPaymentConfigForTests(parsePaymentConfig({ PAYMENT_REFUND_INLINE_SUBMIT: 'false', ...over }, 'test'));

  /** No row from other tests may be claimed by a worker pass in THIS test. */
  async function quiesce() {
    await prisma.payment.updateMany({ where: { provider: { not: null } }, data: { nextAttemptAt: null, lockedUntil: null, lockedBy: null } });
    await prisma.paymentWebhookEvent.updateMany({ where: { status: { in: ['RECEIVED', 'RETRY_PENDING'] } }, data: { status: 'IGNORED', ignoredReason: 'TEST_CLEANUP', lockedUntil: null } });
    await prisma.refund.updateMany({ where: { status: { in: ['REQUESTED', 'SUBMITTING', 'UNKNOWN', 'PROCESSING'] } }, data: { nextAttemptAt: null, lockedUntil: null, lockedBy: null } });
  }

  beforeAll(async () => {
    await mkUser('custA', [RoleEnum.CUSTOMER]);
    await mkUser('custB', [RoleEnum.CUSTOMER]);
    await mkUser('admin', [RoleEnum.SUPER_ADMIN]);
    await mkUser('md', [RoleEnum.MD]);
    await mkUser('chef', [RoleEnum.CHEF]);
    await mkUser('driver', [RoleEnum.DELIVERY]);
    const res = await request(app).post('/api/v1/admin/step-up').set(bearer(who.admin.token)).send({ password: ADMIN_PASSWORD });
    expect(res.status).toBe(200);
    adminStep = res.body.data.stepUpToken;
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
    await quiesce(); // leave nothing for other suites' workers to pick up
    await prisma.$disconnect();
  });

  // =============================================================================================== A. cancellation policy
  describe('cancellation policy (approved states, reason codes, step-up)', () => {
    it('1. CUSTOMER cancels an unpaid PENDING order: no refund, open checkout sessions become unusable but are kept', async () => {
      const order = await mkOrder(who.custA.profileId!);
      const s = await createSession(who.custA.token, order.id);
      expect(s.status).toBe(200);
      const res = await cancelCust(who.custA.token, order.id, { reasonCode: 'WRONG_ORDER', note: 'oops' });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.data).toMatchObject({ status: 'CANCELLED', paymentStatus: 'PENDING', alreadyCancelled: false, cancellation: { state: 'CANCELLED', allowed: false }, refund: { state: 'NO_REFUND' } });
      expect(await prisma.refund.count({ where: { orderId: order.id } })).toBe(0);
      const session = await prisma.payment.findUniqueOrThrow({ where: { id: s.body.data.attemptId } });
      expect(session.status).toBe('EXPIRED'); // unusable for checkout, never deleted
      expect(session.expiresAt!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
      expect((await createSession(who.custA.token, order.id)).status).toBe(409); // no new checkout for a cancelled order
      const o = await orderOf(order.id);
      expect(o).toMatchObject({ status: 'CANCELLED', cancellationReason: 'WRONG_ORDER' });
      expect(o.cancelledAt).not.toBeNull();
    });

    it('2. CUSTOMER cancels a PAID CONFIRMED order: ONE full Refund REQUESTED is created with the cancellation, the provider is not contacted', async () => {
      const p = await payOrder();
      expect((await orderOf(p.order.id)).status).toBe('CONFIRMED');
      const res = await cancelCust(who.custA.token, p.order.id, { reasonCode: 'CHANGED_MIND', note: '  changed\nmy mind  ' });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.data).toMatchObject({ status: 'CANCELLED', paymentStatus: 'PAID', refund: { state: 'REFUND_PENDING' } });
      const refunds = await prisma.refund.findMany({ where: { orderId: p.order.id } });
      expect(refunds).toHaveLength(1);
      expect(refunds[0]).toMatchObject({ status: 'REQUESTED', trigger: 'CUSTOMER_CANCELLATION', providerPaymentId: p.ledger.id, paymentId: p.ledger.paymentId, currency: 'INR', reasonCode: 'CHANGED_MIND', reasonNote: 'changed my mind', requestedByKind: 'CUSTOMER', requestedByUserId: who.custA.id, speedRequested: 'normal', provider: 'mock' });
      expect(refunds[0].amount.toFixed(2)).toBe(NET);
      expect(mock.refundCreateCalls).toBe(0);
      expect(await audits('ORDER_CANCELLATION_REQUESTED', p.order.id)).toHaveLength(1);
      expect(await audits('ORDER_STATUS_CHANGED', p.order.id)).toHaveLength(2); // CONFIRMED + CANCELLED
      const reqAudit = await audits('REFUND_REQUESTED', refunds[0].id);
      expect(reqAudit).toHaveLength(1);
      expect(reqAudit[0].payload).toMatchObject({ amount: NET, currency: 'INR', trigger: 'CUSTOMER_CANCELLATION', reasonCode: 'CHANGED_MIND' });
      const ev = await prisma.orderEvent.findFirstOrThrow({ where: { orderId: p.order.id, toStatus: 'CANCELLED' } });
      expect(ev.reason).toBe('CHANGED_MIND');
    });

    it('3. CUSTOMER cannot cancel ACCEPTED / PREPARING / READY / DISPATCHED / DELIVERED: nothing changes', async () => {
      for (const status of ['ACCEPTED', 'PREPARING', 'READY', 'DISPATCHED', 'DELIVERED']) {
        const p = await payOrder();
        await prisma.order.update({ where: { id: p.order.id }, data: { status } });
        const res = await cancelCust(who.custA.token, p.order.id);
        expect(res.status, status).toBe(409);
        expect(res.body.error, status).toBe('CANCELLATION_NOT_ALLOWED');
        expect(await orderOf(p.order.id)).toMatchObject({ status, paymentStatus: 'PAID' });
        expect(await prisma.refund.count({ where: { orderId: p.order.id } }), status).toBe(0);
      }
    });

    it('4. SUPER_ADMIN cancels PENDING, CONFIRMED and (exceptionally) ACCEPTED with step-up; PAID ones get a full ADMIN_CANCELLATION refund', async () => {
      const pending = await mkOrder(who.custA.profileId!);
      const r1 = await cancelAdmin(pending.id, { reasonCode: 'ITEM_UNAVAILABLE' });
      expect(r1.status, JSON.stringify(r1.body)).toBe(200);
      expect(await prisma.refund.count({ where: { orderId: pending.id } })).toBe(0);

      for (const status of ['CONFIRMED', 'ACCEPTED']) {
        const p = await payOrder();
        if (status === 'ACCEPTED') await prisma.order.update({ where: { id: p.order.id }, data: { status: 'ACCEPTED' } });
        const res = await cancelAdmin(p.order.id, { reasonCode: 'KITCHEN_UNAVAILABLE', note: 'oven down' });
        expect(res.status, `${status} ${JSON.stringify(res.body)}`).toBe(200);
        expect(await orderOf(p.order.id)).toMatchObject({ status: 'CANCELLED', paymentStatus: 'PAID', cancellationReason: 'KITCHEN_UNAVAILABLE' });
        const refund = await prisma.refund.findFirstOrThrow({ where: { orderId: p.order.id } });
        expect(refund).toMatchObject({ status: 'REQUESTED', trigger: 'ADMIN_CANCELLATION', requestedByKind: 'ADMIN', requestedByUserId: who.admin.id, reasonNote: 'oven down' });
        expect(refund.amount.toFixed(2)).toBe(NET);
      }
    });

    it('5. the admin financial path refuses PREPARING / READY (P8/P9 own them) and DISPATCHED / DELIVERED; nothing changes', async () => {
      for (const [status, code] of [['PREPARING', 'CANCELLATION_STATE_NOT_SUPPORTED'], ['READY', 'CANCELLATION_STATE_NOT_SUPPORTED'], ['DISPATCHED', 'CANCELLATION_NOT_ALLOWED'], ['DELIVERED', 'CANCELLATION_NOT_ALLOWED']] as const) {
        const p = await payOrder();
        await prisma.order.update({ where: { id: p.order.id }, data: { status } });
        const res = await cancelAdmin(p.order.id);
        expect(res.status, status).toBe(409);
        expect(res.body.error, status).toBe(code);
        expect(await orderOf(p.order.id)).toMatchObject({ status, paymentStatus: 'PAID' });
        expect(await prisma.refund.count({ where: { orderId: p.order.id } })).toBe(0);
      }
    });

    it('6. the generic transition path still cannot cancel a paid order: not even with a refund intent id when the order is PREPARING / READY', async () => {
      for (const status of ['PREPARING', 'READY']) {
        const p = await payOrder();
        await prisma.order.update({ where: { id: p.order.id }, data: { status } });
        const intent = await prisma.refund.create({
          data: { orderId: p.order.id, providerPaymentId: p.ledger.id, paymentId: p.ledger.paymentId, provider: 'mock', amount: NET, currency: 'INR', trigger: 'ADMIN_CANCELLATION', reasonCode: 'OTHER', requestedByKind: 'ADMIN', status: 'REQUESTED' }
        });
        await expect(
          OrderTransitionService.transition({ orderId: p.order.id, to: 'CANCELLED', actor: { kind: 'USER', userId: who.admin.id, roles: [RoleEnum.SUPER_ADMIN], isGlobal: true }, reason: 'OTHER', refundIntentId: intent.id })
        ).rejects.toMatchObject({ errorCode: 'ORDER_NOT_CANCELLABLE' });
        await expect(OrderTransitionService.transition({ orderId: p.order.id, to: 'CANCELLED', actor: { kind: 'USER', userId: who.admin.id, roles: [RoleEnum.SUPER_ADMIN], isGlobal: true }, reason: 'OTHER' })).rejects.toMatchObject({ errorCode: 'ORDER_NOT_CANCELLABLE' });
        expect((await orderOf(p.order.id)).status).toBe(status);
      }
    });

    it('7. a forged / foreign / already-used refund intent id cannot unlock a paid cancellation', async () => {
      const p = await payOrder();
      const other = await payOrder();
      const foreignIntent = await prisma.refund.create({
        data: { orderId: other.order.id, providerPaymentId: other.ledger.id, paymentId: other.ledger.paymentId, provider: 'mock', amount: NET, currency: 'INR', trigger: 'ADMIN_CANCELLATION', reasonCode: 'OTHER', requestedByKind: 'ADMIN', status: 'REQUESTED' }
      });
      const actor = { kind: 'USER' as const, userId: who.admin.id, roles: [RoleEnum.SUPER_ADMIN], isGlobal: true };
      for (const refundIntentId of ['forged-id', randomUUID(), foreignIntent.id]) {
        await expect(OrderTransitionService.transition({ orderId: p.order.id, to: 'CANCELLED', actor, reason: 'OTHER', refundIntentId })).rejects.toMatchObject({ errorCode: 'ORDER_NOT_CANCELLABLE' });
      }
      expect((await orderOf(p.order.id)).status).toBe('CONFIRMED');
    });

    it('8. admin cancellation requires a valid step-up proof: missing / garbage proof is refused and changes nothing', async () => {
      const p = await payOrder();
      const noProof = await cancelAdmin(p.order.id, { reasonCode: 'OTHER' }, null);
      expect(noProof.status).toBe(403);
      expect(noProof.body.error).toBe('STEP_UP_REQUIRED');
      expect((await cancelAdmin(p.order.id, { reasonCode: 'OTHER' }, 'garbage')).status).toBe(403);
      expect(await orderOf(p.order.id)).toMatchObject({ status: 'CONFIRMED' });
      expect(await prisma.refund.count({ where: { orderId: p.order.id } })).toBe(0);
      expect((await cancelAdmin(p.order.id, { reasonCode: 'OTHER' })).status).toBe(200);
    });

    it('9. reason codes are validated per role; cross-role, unknown and authoritative fields are rejected (nothing changes)', async () => {
      const p = await payOrder();
      const bad: Array<[string, Record<string, unknown>]> = [
        ['customer with an admin code', { reasonCode: 'ITEM_UNAVAILABLE' }],
        ['unknown code', { reasonCode: 'BECAUSE' }],
        ['missing code', {}],
        ['lowercase', { reasonCode: 'other' }],
        ['amount', { reasonCode: 'OTHER', amount: 1 }],
        ['currency', { reasonCode: 'OTHER', currency: 'INR' }],
        ['payment id', { reasonCode: 'OTHER', providerPaymentId: 'pay_x' }],
        ['customer id', { reasonCode: 'OTHER', customerId: 'x' }],
        ['over-long note', { reasonCode: 'OTHER', note: 'x'.repeat(1001) }]
      ];
      for (const [label, body] of bad) expect((await cancelCust(who.custA.token, p.order.id, body)).status, label).toBe(422);
      expect((await cancelAdmin(p.order.id, { reasonCode: 'CHANGED_MIND' })).status).toBe(422); // customer code on the admin path
      expect(await orderOf(p.order.id)).toMatchObject({ status: 'CONFIRMED' });
      expect(await prisma.refund.count({ where: { orderId: p.order.id } })).toBe(0);
      for (const reasonCode of ['CHANGED_MIND', 'ORDERED_BY_MISTAKE', 'WRONG_ORDER', 'DELIVERY_TOO_LATE', 'OTHER']) {
        const o = await mkOrder(who.custA.profileId!);
        expect((await cancelCust(who.custA.token, o.id, { reasonCode })).status, reasonCode).toBe(200);
      }
      for (const reasonCode of ['ITEM_UNAVAILABLE', 'KITCHEN_UNAVAILABLE', 'DELIVERY_UNAVAILABLE', 'PAYMENT_ISSUE', 'OPERATIONAL_ISSUE', 'OTHER']) {
        const o = await mkOrder(who.custA.profileId!);
        expect((await cancelAdmin(o.id, { reasonCode })).status, reasonCode).toBe(200);
      }
    });

    it('10. notes are sanitized (control chars stripped, bounded to 200) and the audit/refund copy is the sanitized one', async () => {
      const p = await payOrder();
      const dirty = ` a${String.fromCharCode(0)}b\n\tc${String.fromCharCode(0x200b)}d ` + 'z'.repeat(400);
      expect((await cancelCust(who.custA.token, p.order.id, { reasonCode: 'OTHER', note: dirty })).status).toBe(200);
      const refund = await prisma.refund.findFirstOrThrow({ where: { orderId: p.order.id } });
      expect(refund.reasonNote!.length).toBe(200);
      expect(refund.reasonNote!.startsWith('a b c d zzz')).toBe(true);
      const aud = (await audits('ORDER_CANCELLATION_REQUESTED', p.order.id))[0];
      expect((aud.payload as { note: string }).note).toBe(refund.reasonNote);
    });

    it('11. an order whose kitchen ticket has progressed beyond QUEUED cannot be cancelled by the admin path', async () => {
      const branch = await prisma.kitchenBranch.findFirstOrThrow();
      const p = await payOrder();
      await prisma.order.update({ where: { id: p.order.id }, data: { status: 'ACCEPTED' } });
      await prisma.kitchenOrderTicket.create({ data: { orderId: p.order.id, branchId: branch.id, kotNumber: `KOT-P7C-${ts}-${++seq}`, status: 'PREPARING', itemsJson: [] } });
      const res = await cancelAdmin(p.order.id);
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('CANCELLATION_STATE_NOT_SUPPORTED');
      expect((await orderOf(p.order.id)).status).toBe('ACCEPTED');
    });

    it('12. COD unpaid orders cancel like any unpaid order; non-DIRECT orders are refused', async () => {
      const cod = await mkOrder(who.custA.profileId!, { paymentMethod: 'COD' });
      expect((await cancelCust(who.custA.token, cod.id)).status).toBe(200);
      const mess = await mkOrder(who.custA.profileId!, { orderType: 'MESS' });
      const res = await cancelCust(who.custA.token, mess.id);
      expect(res.status).toBe(409);
      expect((await orderOf(mess.id)).status).toBe('PENDING');
    });
  });

  // =============================================================================================== B. ownership / RBAC
  describe('ownership and RBAC', () => {
    it('13. another customer gets a safe 404 on cancel and on refunds; anonymous gets 401; staff roles get 403 on the customer endpoints', async () => {
      const p = await payOrder();
      expect((await cancelCust(who.custB.token, p.order.id)).status).toBe(404);
      expect((await cancelCust(who.custB.token, p.order.id)).body.error).toBe('ORDER_NOT_FOUND');
      expect((await request(app).get(`/api/v1/orders/${p.order.id}/refunds`).set(bearer(who.custB.token))).status).toBe(404);
      expect((await cancelCust(who.custB.token, randomUUID())).status).toBe(404);
      expect((await request(app).post(`/api/v1/orders/${p.order.id}/cancel`).send({ reasonCode: 'OTHER' })).status).toBe(401);
      expect((await request(app).get(`/api/v1/orders/${p.order.id}/refunds`)).status).toBe(401);
      for (const staff of ['admin', 'md', 'chef', 'driver']) {
        expect((await cancelCust(who[staff].token, p.order.id)).status, staff).toBe(403);
        expect((await request(app).get(`/api/v1/orders/${p.order.id}/refunds`).set(bearer(who[staff].token))).status, staff).toBe(403);
      }
      expect(await orderOf(p.order.id)).toMatchObject({ status: 'CONFIRMED' });
      expect(await prisma.refund.count({ where: { orderId: p.order.id } })).toBe(0);
    });

    it('14. only SUPER_ADMIN may mutate: MD, CHEF, DELIVERY and customers get 403 on admin cancel and refund approval (even with a step-up proof)', async () => {
      const p = await payOrder();
      for (const label of ['md', 'chef', 'driver', 'custA']) {
        expect((await cancelAdmin(p.order.id, { reasonCode: 'OTHER' }, adminStep, who[label].token)).status, label).toBe(403);
        expect((await approve(p.ledger.id, {}, adminStep, who[label].token)).status, label).toBe(403);
      }
      expect((await request(app).post(`/api/v1/admin/orders/${p.order.id}/cancel`).send({ reasonCode: 'OTHER' })).status).toBe(401);
      expect(await orderOf(p.order.id)).toMatchObject({ status: 'CONFIRMED' });
    });

    it('15. refund visibility: SUPER_ADMIN and MD read (read-only); CHEF, DELIVERY, customers and anonymous cannot', async () => {
      const c = await cancelPaid();
      for (const label of ['admin', 'md']) {
        const list = await request(app).get('/api/v1/admin/refunds?pageSize=100').set(bearer(who[label].token));
        expect(list.status, label).toBe(200);
        expect(list.body.data.items.some((i: { id: string }) => i.id === c.refund.id)).toBe(true);
        expect((await request(app).get(`/api/v1/admin/refunds/${c.refund.id}`).set(bearer(who[label].token))).status, label).toBe(200);
      }
      for (const label of ['chef', 'driver', 'custA']) {
        expect((await request(app).get('/api/v1/admin/refunds').set(bearer(who[label].token))).status, label).toBe(403);
        expect((await request(app).get(`/api/v1/admin/refunds/${c.refund.id}`).set(bearer(who[label].token))).status, label).toBe(403);
      }
      expect((await request(app).get('/api/v1/admin/refunds')).status).toBe(401);
      expect((await request(app).get(`/api/v1/admin/refunds/${randomUUID()}`).set(bearer(who.admin.token))).status).toBe(404);
      expect((await request(app).get('/api/v1/admin/refunds?status=FAILED').set(bearer(who.admin.token))).status).toBe(422); // there is no FAILED state
    });

    it('16. there is NO mark-refunded, amount, retry or reconcile surface over HTTP (route and source guards)', async () => {
      const c = await cancelPaid();
      const paths = ['/api/v1/admin/refunds/mark-refunded', `/api/v1/admin/refunds/${c.refund.id}/mark-refunded`, `/api/v1/admin/refunds/${c.refund.id}/retry`, `/api/v1/admin/refunds/${c.refund.id}/process`, '/api/v1/admin/refunds/reconcile', '/api/v1/admin/refunds', `/api/v1/admin/refunds/${c.refund.id}`, `/api/v1/orders/${c.order.id}/refund`, `/api/v1/orders/${c.order.id}/refunds`, '/api/v1/payments/refund'];
      for (const path of paths) {
        for (const method of ['post', 'put', 'patch', 'delete'] as const) {
          const res = await request(app)[method](path).set(bearer(who.admin.token)).set('x-step-up-token', adminStep).send({ amount: 1 });
          expect([404, 403, 405, 400], `${method} ${path}`).toContain(res.status);
        }
      }
      expect((await refundOf(c.refund.id)).status).toBe('REQUESTED');
      const src = ['refund.routes.ts', 'refundAdmin.routes.ts'].map((f) => readFileSync(join(__dirname, '..', 'modules', 'refund', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')).join('\n');
      expect(src).not.toMatch(/mark-?refunded|markRefunded|reconcile|retry|simulate/i);
    });
  });

  // =============================================================================================== C. atomicity + idempotency of cancellation
  describe('cancellation atomicity and idempotency', () => {
    it('17. repeating a cancel is idempotent: still ONE cancellation, ONE refund, ONE event', async () => {
      const p = await payOrder();
      const a = await cancelCust(who.custA.token, p.order.id);
      const b = await cancelCust(who.custA.token, p.order.id);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(a.body.data.alreadyCancelled).toBe(false);
      expect(b.body.data.alreadyCancelled).toBe(true);
      expect(await prisma.refund.count({ where: { orderId: p.order.id } })).toBe(1);
      expect(await prisma.orderEvent.count({ where: { orderId: p.order.id, toStatus: 'CANCELLED' } })).toBe(1);
      expect(await audits('ORDER_CANCELLATION_REQUESTED', p.order.id)).toHaveLength(1);
    });

    it('18. SIX simultaneous cancels (real PostgreSQL): exactly one changes the order, one refund exists', async () => {
      const p = await payOrder();
      const results = await Promise.all(Array.from({ length: 6 }, () => cancelCust(who.custA.token, p.order.id)));
      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(results.filter((r) => r.body.data.alreadyCancelled === false)).toHaveLength(1);
      expect(await prisma.refund.count({ where: { orderId: p.order.id } })).toBe(1);
      expect(await prisma.orderEvent.count({ where: { orderId: p.order.id, toStatus: 'CANCELLED' } })).toBe(1);
      expect(await audits('REFUND_REQUESTED', (await prisma.refund.findFirstOrThrow({ where: { orderId: p.order.id } })).id)).toHaveLength(1);
    });

    it('19. customer cancel racing an admin cancel of the same order: one winner, one refund', async () => {
      const p = await payOrder();
      const [c, a] = await Promise.all([cancelCust(who.custA.token, p.order.id), cancelAdmin(p.order.id)]);
      expect(c.status).toBe(200);
      expect(a.status).toBe(200);
      expect([c.body.data.alreadyCancelled, a.body.data.alreadyCancelled].filter((x) => x === false)).toHaveLength(1);
      expect(await prisma.refund.count({ where: { orderId: p.order.id } })).toBe(1);
    });

    it('20. ATOMICITY: if the order transition fails, the refund intent is rolled back too (neither partial effect)', async () => {
      const p = await payOrder();
      vi.spyOn(OrderTransitionService, 'transition').mockRejectedValueOnce(new AppError('boom', 500, 'BOOM'));
      const res = await cancelCust(who.custA.token, p.order.id);
      expect(res.status).toBe(500);
      expect(await orderOf(p.order.id)).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID' });
      expect(await prisma.refund.count({ where: { orderId: p.order.id } })).toBe(0);
      expect(await audits('ORDER_CANCELLATION_REQUESTED', p.order.id)).toHaveLength(0);
      expect(await audits('REFUND_REQUESTED', p.ledger.id)).toHaveLength(0);
      vi.restoreAllMocks();
      expect((await cancelCust(who.custA.token, p.order.id)).status).toBe(200); // and a retry works
    });

    it('21. ATOMICITY: if the refund intent cannot be created, the order is NOT cancelled', async () => {
      const p = await payOrder();
      vi.spyOn(RefundService, 'createIntent').mockRejectedValueOnce(new AppError('no', 500, 'NO'));
      expect((await cancelCust(who.custA.token, p.order.id)).status).toBe(500);
      expect(await orderOf(p.order.id)).toMatchObject({ status: 'CONFIRMED' });
      expect(await prisma.orderEvent.count({ where: { orderId: p.order.id, toStatus: 'CANCELLED' } })).toBe(0);
    });

    it('22. crash after commit is recoverable by the worker alone: Order CANCELLED + Refund REQUESTED -> worker submits it', async () => {
      await quiesce();
      const c = await cancelPaid();
      expect(await orderOf(c.order.id)).toMatchObject({ status: 'CANCELLED' });
      expect((await refundOf(c.refund.id)).status).toBe('REQUESTED');
      expect(mock.refundCreateCalls).toBe(0); // "the process died": nothing was sent
      const stats = await runWorker();
      expect(stats.refundsSubmitted).toBe(1);
      expect(await refundOf(c.refund.id)).toMatchObject({ status: 'PROCESSING', providerStatus: 'PENDING' });
      expect(mock.refundCreateCalls).toBe(1);
    });

    it('23. the provider is contacted only AFTER the cancellation committed, and never while a refund lock is held (separate connection probes)', async () => {
      await quiesce();
      useConfig({ PAYMENT_REFUND_INLINE_SUBMIT: 'true' });
      const probes: Array<{ orderStatus: string; refundStatus: string; lockable: boolean }> = [];
      const original = mock.createRefund.bind(mock);
      vi.spyOn(mock, 'createRefund').mockImplementation(async (input) => {
        const refund = await prisma.refund.findUniqueOrThrow({ where: { id: input.receipt }, include: { order: { select: { status: true } } } });
        let lockable = true;
        try {
          await prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '400ms'`);
            await tx.$queryRawUnsafe(`SELECT "id" FROM "refunds" WHERE "id" = '${refund.id}' FOR UPDATE NOWAIT`);
            await tx.$queryRawUnsafe(`SELECT "id" FROM "orders" WHERE "id" = '${refund.orderId}' FOR UPDATE NOWAIT`);
          });
        } catch {
          lockable = false;
        }
        probes.push({ orderStatus: refund.order.status, refundStatus: refund.status, lockable });
        return original(input);
      });
      const p = await payOrder();
      expect((await cancelCust(who.custA.token, p.order.id)).status).toBe(200);
      const refund = await prisma.refund.findFirstOrThrow({ where: { orderId: p.order.id } });
      for (let i = 0; i < 60 && (await refundOf(refund.id)).status !== 'PROCESSING'; i++) await new Promise((r) => setTimeout(r, 100));
      expect(probes, JSON.stringify(await refundOf(refund.id))).toEqual([{ orderStatus: 'CANCELLED', refundStatus: 'SUBMITTING', lockable: true }]);
      expect((await refundOf(refund.id)).status).toBe('PROCESSING');
    });
  });

  // =============================================================================================== D. full-refund invariant + database guarantees
  describe('full-refund invariant and database guarantees', () => {
    it('24. the amount sent to the provider is the complete captured amount in exact paise, with the Refund id as receipt, and no client input', async () => {
      await quiesce();
      const c = await cancelPaid();
      const spy = vi.spyOn(mock, 'createRefund');
      await runWorker();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toEqual({ providerPaymentId: c.pay.providerPaymentId, amountMinor: MINOR, currency: 'INR', receipt: c.refund.id, notes: { pbRefundId: c.refund.id, pbOrderNumber: c.order.orderNumber, source: 'protein-bowl' } });
      expect([...mock.refunds.values()][0]).toMatchObject({ amountMinor: MINOR, receipt: c.refund.id });
    });

    const inTx = <T>(orderId: string, ledgerId: string, fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>) =>
      prisma.$transaction(async (tx) => {
        await lockOrder(tx, orderId);
        await lockProviderPaymentById(tx, ledgerId);
        return fn(tx);
      });
    const intentParams = (p: { order: { id: string; orderNumber: string }; ledger: { id: string } }, trigger = 'ADMIN_CANCELLATION' as const) => ({
      order: p.order,
      ledgerId: p.ledger.id,
      trigger,
      reasonCode: 'OTHER',
      reasonNote: null,
      requestedBy: { userId: who.admin.id, kind: 'ADMIN' as const }
    });

    it('25. the intent service refuses: uncaptured payment, wrong currency, wrong order, unknown payment, an existing refund of another kind', async () => {
      const p = await payOrder();
      const other = await payOrder();
      await expect(inTx(p.order.id, other.ledger.id, (tx) => RefundService.createIntent(tx, intentParams({ order: p.order, ledger: other.ledger })))).rejects.toMatchObject({ errorCode: 'REFUND_NOT_ALLOWED' }); // belongs to another order
      await expect(inTx(p.order.id, randomUUID(), (tx) => RefundService.createIntent(tx, intentParams({ order: p.order, ledger: { id: randomUUID() } })))).rejects.toMatchObject({ errorCode: 'PROVIDER_PAYMENT_NOT_FOUND' });
      await prisma.providerPayment.update({ where: { id: p.ledger.id }, data: { providerStatus: 'AUTHORIZED' } });
      await expect(inTx(p.order.id, p.ledger.id, (tx) => RefundService.createIntent(tx, intentParams(p)))).rejects.toMatchObject({ errorCode: 'REFUND_NOT_ALLOWED' });
      await prisma.providerPayment.update({ where: { id: p.ledger.id }, data: { providerStatus: 'CAPTURED', currency: 'USD' } });
      await expect(inTx(p.order.id, p.ledger.id, (tx) => RefundService.createIntent(tx, intentParams(p)))).rejects.toMatchObject({ errorCode: 'REFUND_NOT_ALLOWED' });
      await prisma.providerPayment.update({ where: { id: p.ledger.id }, data: { currency: 'INR' } });
      const first = await inTx(p.order.id, p.ledger.id, (tx) => RefundService.createIntent(tx, intentParams(p)));
      expect(first.created).toBe(true);
      await expect(inTx(p.order.id, p.ledger.id, (tx) => RefundService.createIntent(tx, intentParams(p, 'ADMIN_CANCELLATION' as never)))).resolves.toMatchObject({ created: false }); // idempotent for the same trigger
      await expect(inTx(p.order.id, p.ledger.id, (tx) => RefundService.createIntent(tx, { ...intentParams(p), trigger: 'DUPLICATE_CAPTURE' as never }))).rejects.toMatchObject({ errorCode: 'REFUND_ALREADY_EXISTS' });
      expect(await prisma.refund.count({ where: { providerPaymentId: p.ledger.id } })).toBe(1);
    });

    it('26. money already refunded outside Protein Bowl blocks a PB full refund (EXTERNAL_REFUND_PRESENT) and routes to review: the customer cannot cancel', async () => {
      const p = await payOrder();
      const ext = mock.externalRefund(p.pay.providerPaymentId, 1000, 'PROCESSED');
      await RefundSettlementService.recordExternal({ ledgerId: p.ledger.id, evidence: ext, via: 'WEBHOOK' });
      const res = await cancelCust(who.custA.token, p.order.id);
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('EXTERNAL_REFUND_PRESENT');
      expect(await orderOf(p.order.id)).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID' });
      expect(await prisma.refund.count({ where: { orderId: p.order.id, trigger: { not: 'EXTERNAL' } } })).toBe(0);
    });

    it('27. DATABASE: one live non-EXTERNAL refund per payment (PROCESSED still occupies it), ABANDONED frees it, EXTERNAL is exempt, amount must be > 0', async () => {
      const p = await payOrder();
      const mk = (over: Record<string, unknown> = {}) =>
        prisma.refund.create({ data: { orderId: p.order.id, providerPaymentId: p.ledger.id, paymentId: p.ledger.paymentId, provider: 'mock', amount: NET, currency: 'INR', trigger: 'ADMIN_CANCELLATION', reasonCode: 'OTHER', requestedByKind: 'ADMIN', status: 'REQUESTED', ...over } as never });
      const first = await mk();
      await expect(mk()).rejects.toMatchObject({ code: 'P2002' });
      await prisma.refund.update({ where: { id: first.id }, data: { status: 'PROCESSED' } });
      await expect(mk()).rejects.toMatchObject({ code: 'P2002' });
      await prisma.refund.update({ where: { id: first.id }, data: { status: 'ABANDONED' } });
      const second = await mk();
      const ext = await mk({ trigger: 'EXTERNAL', providerRefundId: `rfnd_ext_${ts}_27`, status: 'PROCESSED', amount: '10.00' });
      expect(ext.id).toBeTruthy();
      await expect(mk({ trigger: 'EXTERNAL', providerRefundId: `rfnd_ext_${ts}_27`, amount: '10.00' })).rejects.toMatchObject({ code: 'P2002' }); // unique (provider, providerRefundId)
      await expect(mk({ amount: '0.00', trigger: 'EXTERNAL', providerRefundId: `rfnd_z_${ts}` })).rejects.toThrow(); // CHECK (amount > 0)
      await expect(prisma.refund.delete({ where: { id: second.id } })).resolves.toBeTruthy(); // refunds are deletable, but the evidence they point to is not:
      await expect(prisma.providerPayment.delete({ where: { id: p.ledger.id } })).rejects.toThrow(); // RESTRICT foreign key
    });

    it('27b. money that already left (an ABANDONED intent the provider nevertheless processed) is counted: a new full refund is refused', async () => {
      const p = await payOrder();
      await prisma.refund.create({
        data: { orderId: p.order.id, providerPaymentId: p.ledger.id, paymentId: p.ledger.paymentId, provider: 'mock', providerRefundId: `rfnd_late_${ts}`, amount: NET, currency: 'INR', trigger: 'ADMIN_CANCELLATION', reasonCode: 'OTHER', requestedByKind: 'ADMIN', status: 'ABANDONED', providerStatus: 'PROCESSED', reviewFlag: 'ABANDONED_BUT_PROVIDER_REFUND_EXISTS' }
      });
      await expect(inTx(p.order.id, p.ledger.id, (tx) => RefundService.createIntent(tx, intentParams(p)))).rejects.toMatchObject({ errorCode: 'REFUND_NOT_ALLOWED' });
      expect(await prisma.refund.count({ where: { providerPaymentId: p.ledger.id, status: { not: 'ABANDONED' } } })).toBe(0);
    });

    it('28. TWO simultaneous cancellations/approvals can never create two live refunds for one payment (real PostgreSQL)', async () => {
      const p = await payOrder();
      await prisma.order.update({ where: { id: p.order.id }, data: { status: 'CANCELLED' } });
      const results = await Promise.allSettled(Array.from({ length: 6 }, () => inTx(p.order.id, p.ledger.id, (tx) => RefundService.createIntent(tx, intentParams(p)))));
      const ok = results.filter((r) => r.status === 'fulfilled') as Array<PromiseFulfilledResult<{ created: boolean }>>;
      expect(ok.filter((r) => r.value.created)).toHaveLength(1);
      expect(await prisma.refund.count({ where: { providerPaymentId: p.ledger.id } })).toBe(1);
    });
  });

  // =============================================================================================== E. lifecycle: submit, processing, processed, failed
  describe('refund lifecycle and settlement', () => {
    it('29. worker submits: REQUESTED -> PROCESSING (provider pending); the order is still PAID until the money is refunded', async () => {
      await quiesce();
      const c = await cancelPaid();
      await runWorker();
      const r = await refundOf(c.refund.id);
      expect(r).toMatchObject({ status: 'PROCESSING', providerStatus: 'PENDING', attemptCount: 1, speedRequested: 'normal' });
      expect(r.providerRefundId).toMatch(/^rfnd_mock_/);
      expect(r.submittedAt).not.toBeNull();
      expect(r.nextAttemptAt).not.toBeNull(); // scheduled for polling
      expect(await orderOf(c.order.id)).toMatchObject({ status: 'CANCELLED', paymentStatus: 'PAID' });
      expect(await audits('REFUND_SUBMITTED', r.id)).toHaveLength(1);
    });

    it('30. a signed refund.processed webhook completes it: PROCESSED, Order.paymentStatus REFUNDED (Order.status untouched), ledger REFUNDED, one REFUND_PROCESSED audit', async () => {
      await quiesce();
      const c = await cancelPaid();
      await runWorker();
      const pr = providerRefundFor(c.refund.id)!;
      const done = mock.setRefundStatus(pr.providerRefundId, 'PROCESSED');
      const { raw, headers } = mock.buildRefundWebhook('refund.processed', done, { eventId: `evt_${ts}_30` });
      expect((await webhook(raw, headers)).status).toBe(200);
      const r = await refundOf(c.refund.id);
      expect(r).toMatchObject({ status: 'PROCESSED', providerStatus: 'PROCESSED', nextAttemptAt: null, speedProcessed: 'normal' });
      expect(r.processedAt).not.toBeNull();
      expect(await orderOf(c.order.id)).toMatchObject({ status: 'CANCELLED', paymentStatus: 'REFUNDED' });
      expect((await prisma.providerPayment.findUniqueOrThrow({ where: { id: c.ledger.id } })).providerStatus).toBe('REFUNDED');
      expect(await audits('REFUND_PROCESSED', r.id)).toHaveLength(1);
      expect(await prisma.orderEvent.count({ where: { orderId: c.order.id } })).toBe(2); // CONFIRMED + CANCELLED only: the refund never touched Order.status
      expect((await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { provider_eventId: { provider: 'mock', eventId: `evt_${ts}_30` } } })).status).toBe('PROCESSED');
    });

    it('31. polling alone also completes it (no webhook needed): the worker fetches the provider refund', async () => {
      await quiesce();
      const c = await cancelPaid();
      await runWorker();
      mock.setRefundStatus(providerRefundFor(c.refund.id)!.providerRefundId, 'PROCESSED');
      await dueRefund(c.refund.id);
      const stats = await runWorker('p7c-poll');
      expect(stats.refundsResolved).toBe(1);
      expect(await refundOf(c.refund.id)).toMatchObject({ status: 'PROCESSED' });
      expect((await orderOf(c.order.id)).paymentStatus).toBe('REFUNDED');
    });

    it('32. a provider that answers PROCESSED immediately moves SUBMITTING -> PROCESSED directly', async () => {
      await quiesce();
      mock.refundInitialStatus = 'PROCESSED';
      const c = await cancelPaid();
      await runWorker();
      expect(await refundOf(c.refund.id)).toMatchObject({ status: 'PROCESSED', providerStatus: 'PROCESSED' });
      expect((await orderOf(c.order.id)).paymentStatus).toBe('REFUNDED');
    });

    it('33. a provider-FAILED refund goes to REVIEW (never a PB FAILED state, never auto-resubmitted); the order stays PAID', async () => {
      await quiesce();
      const c = await cancelPaid();
      await runWorker();
      const failed = mock.setRefundStatus(providerRefundFor(c.refund.id)!.providerRefundId, 'FAILED');
      const { raw, headers } = mock.buildRefundWebhook('refund.failed', failed, { eventId: `evt_${ts}_33` });
      await webhook(raw, headers);
      const r = await refundOf(c.refund.id);
      expect(r).toMatchObject({ status: 'REVIEW', providerStatus: 'FAILED', failureCode: 'PROVIDER_REFUND_FAILED', reviewFlag: 'PROVIDER_REFUND_FAILED', nextAttemptAt: null });
      expect((await orderOf(c.order.id)).paymentStatus).toBe('PAID');
      await dueRefund(c.refund.id);
      await runWorker('p7c-after-failed');
      expect(mock.refundCreateCalls).toBe(1); // no second provider refund, ever
      expect((await refundOf(c.refund.id)).status).toBe('REVIEW');
      expect(await audits('REFUND_FLAGGED', r.id)).not.toHaveLength(0);
    });

    it('34. PROCESSED is monotonic: later pending / failed evidence never regresses it (failed only raises a review flag)', async () => {
      await quiesce();
      mock.refundInitialStatus = 'PROCESSED';
      const c = await cancelPaid();
      await runWorker();
      const pr = providerRefundFor(c.refund.id)!;
      for (const [type, status] of [['refund.created', 'PENDING'], ['refund.failed', 'FAILED']] as const) {
        const h = mock.buildRefundWebhook(type, { ...pr, status }, { eventId: `evt_${ts}_34_${type}` });
        expect((await webhook(h.raw, h.headers)).status).toBe(200);
      }
      const r = await refundOf(c.refund.id);
      expect(r.status).toBe('PROCESSED');
      expect(r.providerStatus).toBe('PROCESSED');
      expect((await orderOf(c.order.id)).paymentStatus).toBe('REFUNDED');
    });

    it('35. evidence that does not describe THIS refund (wrong payment, amount, currency, receipt) is flagged for review and never applied', async () => {
      const cases: Array<[string, (r: ProviderRefund) => ProviderRefund]> = [
        ['amount', (r) => ({ ...r, amountMinor: r.amountMinor - 100 })],
        ['currency', (r) => ({ ...r, currency: 'USD' })],
        ['payment', (r) => ({ ...r, providerPaymentId: 'pay_someone_else' })],
        ['receipt', (r) => ({ ...r, receipt: randomUUID() })]
      ];
      for (const [label, mutate] of cases) {
        await quiesce();
        const c = await cancelPaid();
        await runWorker();
        const pr = providerRefundFor(c.refund.id)!;
        const res = await RefundSettlementService.apply({ refundId: c.refund.id, evidence: mutate({ ...pr, status: 'PROCESSED' }), via: 'RECONCILIATION' });
        expect(res.outcome, label).toBe('FLAGGED');
        const r = await refundOf(c.refund.id);
        expect(r.status, label).toBe('REVIEW');
        expect(r.reviewFlag, label).toMatch(/^PROVIDER_.*MISMATCH$/);
        expect((await orderOf(c.order.id)).paymentStatus, label).toBe('PAID');
      }
    });

    it('36. over-refund evidence (external money on top of a full PB refund) is flagged OVER_REFUNDED, never silently accepted', async () => {
      await quiesce();
      mock.refundInitialStatus = 'PROCESSED';
      const c = await cancelPaid();
      await runWorker();
      const ext = mock.externalRefund(c.pay.providerPaymentId, 1000, 'PROCESSED');
      const rec = await RefundSettlementService.recordExternal({ ledgerId: c.ledger.id, evidence: ext, via: 'WEBHOOK' });
      expect(rec.created).toBe(true);
      expect(await refundOf(rec.refundId!)).toMatchObject({ trigger: 'EXTERNAL', reviewFlag: 'OVER_REFUNDED' });
    });
  });

  // =============================================================================================== F. idempotency / UNKNOWN recovery
  describe('refund idempotency and UNKNOWN recovery', () => {
    it('37. a provider timeout is UNKNOWN (never failed); repeated worker passes never create a second provider refund', async () => {
      await quiesce();
      const c = await cancelPaid();
      mock.failNextRefund('unknown');
      await runWorker();
      let r = await refundOf(c.refund.id);
      expect(r).toMatchObject({ status: 'UNKNOWN', failureCode: 'PROVIDER_TIMEOUT', attemptCount: 1 });
      expect(r.nextAttemptAt).not.toBeNull();
      for (let i = 0; i < 3; i++) {
        await dueRefund(c.refund.id);
        await runWorker(`p7c-u${i}`);
      }
      r = await refundOf(c.refund.id);
      expect(r.status).toBe('UNKNOWN'); // empty listing is not proof of absence: it stays UNKNOWN
      expect(mock.refundCreateCalls).toBe(1);
      expect(mock.refunds.size).toBe(0);
    });

    it('38. response lost AFTER the provider created the refund: UNKNOWN, then adopted by EXACT receipt lookup - still exactly one provider refund', async () => {
      await quiesce();
      const c = await cancelPaid();
      mock.failNextRefund('unknown-after-create');
      await runWorker();
      expect((await refundOf(c.refund.id)).status).toBe('UNKNOWN');
      expect(mock.refunds.size).toBe(1);
      await dueRefund(c.refund.id);
      const stats = await runWorker('p7c-adopt');
      expect(stats.refundsResolved).toBe(1);
      const r = await refundOf(c.refund.id);
      expect(r).toMatchObject({ status: 'PROCESSING', providerRefundId: providerRefundFor(c.refund.id)!.providerRefundId, failureCode: null });
      expect(mock.refundCreateCalls).toBe(1);
      expect(mock.refunds.size).toBe(1);
      expect(await audits('REFUND_RECOVERED', r.id)).toHaveLength(1);
    });

    it('39. DB failure after provider success: the answer could not be recorded -> UNKNOWN -> adopted by lookup; no second create', async () => {
      await quiesce();
      const c = await cancelPaid();
      vi.spyOn(RefundSettlementService, 'apply').mockRejectedValueOnce(new Error('database temporarily unavailable'));
      await runWorker();
      expect(await refundOf(c.refund.id)).toMatchObject({ status: 'UNKNOWN', failureCode: 'PERSISTENCE_FAILED_AFTER_PROVIDER_ANSWER' });
      expect(mock.refunds.size).toBe(1);
      vi.restoreAllMocks();
      await dueRefund(c.refund.id);
      await runWorker('p7c-after-db');
      expect((await refundOf(c.refund.id)).status).toBe('PROCESSING');
      expect(mock.refundCreateCalls).toBe(1);
    });

    it('40. a DEFINITE provider rejection with nothing to adopt goes to REVIEW (not FAILED), keeps the failure code, and is never retried', async () => {
      await quiesce();
      const c = await cancelPaid();
      mock.failNextRefund('definite');
      await runWorker();
      const r = await refundOf(c.refund.id);
      expect(r).toMatchObject({ status: 'REVIEW', failureCode: 'BAD_REQUEST_ERROR', reviewFlag: 'BAD_REQUEST_ERROR', nextAttemptAt: null });
      expect(r.failureReason).toBe('The payment status should be captured for action to be taken.');
      expect(r.providerStatus).toBe('REJECTED'); // a documented rejection that provably created nothing
      await runWorker('p7c-again');
      expect(mock.refundCreateCalls).toBe(1);
    });

    it('41. a DUPLICATE-RECEIPT rejection means a refund may already exist: the exact receipt lookup adopts it instead of creating another', async () => {
      await quiesce();
      const c = await cancelPaid();
      await mock.createRefund({ providerPaymentId: c.pay.providerPaymentId, amountMinor: MINOR, currency: 'INR', receipt: c.refund.id, notes: {} }); // the provider already has it
      await runWorker();
      const r = await refundOf(c.refund.id);
      expect(r.status).toBe('PROCESSING');
      expect(r.providerRefundId).toBe(providerRefundFor(c.refund.id)!.providerRefundId);
      expect(mock.refunds.size).toBe(1);
    });

    it('42. an EMPTY listing never proves absence: UNKNOWN stays UNKNOWN until the review window, then REVIEW - and late visibility is still adopted', async () => {
      await quiesce();
      const c = await cancelPaid();
      mock.failNextRefund('unknown-after-create');
      await runWorker();
      mock.setRefundListingHidden(true);
      await dueRefund(c.refund.id);
      await runWorker('p7c-hidden');
      expect((await refundOf(c.refund.id)).status).toBe('UNKNOWN');
      await prisma.refund.update({ where: { id: c.refund.id }, data: { submittedAt: new Date(Date.now() - 3 * 3_600_000), nextAttemptAt: pastDue() } });
      await runWorker('p7c-hidden-late');
      expect(await refundOf(c.refund.id)).toMatchObject({ status: 'REVIEW', reviewFlag: 'UNKNOWN_UNRESOLVED' });
      expect(mock.refundCreateCalls).toBe(1);
      mock.setRefundListingHidden(false);
      const out = await RefundManualRecoveryService.reconcile(c.refund.id, { operator: 'ops-test', reason: 'the provider shows it now' });
      expect(out.outcome).toBe('ADOPTED');
      expect((await refundOf(c.refund.id)).status).toBe('PROCESSING');
    });

    it('43. AMBIGUOUS lookup (two provider refunds with our receipt) -> REVIEW, nothing applied', async () => {
      await quiesce();
      const c = await cancelPaid();
      mock.failNextRefund('unknown-after-create');
      await runWorker();
      const existing = providerRefundFor(c.refund.id)!;
      mock.refunds.set('rfnd_twin', { ...existing, providerRefundId: 'rfnd_twin' });
      await dueRefund(c.refund.id);
      await runWorker('p7c-ambiguous');
      expect(await refundOf(c.refund.id)).toMatchObject({ status: 'REVIEW', reviewFlag: 'AMBIGUOUS_PROVIDER_LOOKUP' });
    });

    it('44. a provider refund with our receipt but the WRONG amount / currency is never adopted: REVIEW', async () => {
      for (const [label, patch] of [['amount', { amountMinor: 1000 }], ['currency', { currency: 'USD' }]] as const) {
        await quiesce();
        const c = await cancelPaid();
        mock.failNextRefund('unknown-after-create');
        await runWorker();
        const existing = providerRefundFor(c.refund.id)!;
        mock.refunds.set(existing.providerRefundId, { ...existing, ...patch });
        await dueRefund(c.refund.id);
        await runWorker(`p7c-mismatch-${label}`);
        const r = await refundOf(c.refund.id);
        expect(r.status, label).toBe('REVIEW');
        expect(r.reviewFlag, label).toMatch(/MISMATCH/);
        expect((await orderOf(c.order.id)).paymentStatus, label).toBe('PAID');
      }
    });

    it('45. a SUBMITTING refund whose lease expired (worker died) becomes UNKNOWN and is resolved by lookup, not re-created', async () => {
      await quiesce();
      const c = await cancelPaid();
      await mock.createRefund({ providerPaymentId: c.pay.providerPaymentId, amountMinor: MINOR, currency: 'INR', receipt: c.refund.id, notes: {} });
      await prisma.refund.update({ where: { id: c.refund.id }, data: { status: 'SUBMITTING', attemptCount: 1, submittedAt: new Date(), lockedUntil: pastDue(), lockedBy: 'dead-worker', nextAttemptAt: pastDue() } });
      await runWorker('p7c-lease');
      expect((await refundOf(c.refund.id)).status).toBe('PROCESSING');
      expect(mock.refundCreateCalls).toBe(1); // only the pre-seeded provider call
      expect(mock.refunds.size).toBe(1);
    });

    it('46. a REQUESTED refund can be submitted at most once: concurrent submitters produce ONE provider call', async () => {
      await quiesce();
      const c = await cancelPaid();
      const results = await Promise.all(Array.from({ length: 6 }, (_, i) => RefundService.submit(c.refund.id, `racer-${i}`)));
      expect(results.filter((r) => r === 'SUBMITTED')).toHaveLength(1);
      expect(mock.refundCreateCalls).toBe(1);
      expect(mock.refunds.size).toBe(1);
    });

    it('47. a new intent for the same payment is possible ONLY after the previous one is explicitly ABANDONED (and the provider holds nothing)', async () => {
      await quiesce();
      const c = await cancelPaid();
      mock.failNextRefund('definite');
      await runWorker();
      expect((await refundOf(c.refund.id)).status).toBe('REVIEW');
      const params = { order: c.order, ledger: c.ledger };
      const attempt = () =>
        prisma.$transaction(async (tx) => {
          await lockOrder(tx, c.order.id);
          await lockProviderPaymentById(tx, c.ledger.id);
          return RefundService.createIntent(tx, { order: params.order, ledgerId: c.ledger.id, trigger: 'DUPLICATE_CAPTURE' as never, reasonCode: 'OTHER', reasonNote: null, requestedBy: { userId: who.admin.id, kind: 'ADMIN' } });
        });
      await expect(attempt()).rejects.toMatchObject({ errorCode: 'REFUND_ALREADY_EXISTS' });
      await expect(RefundManualRecoveryService.abandon(c.refund.id, { operator: 'ops-test', reason: 'checked the dashboard' }, false)).rejects.toMatchObject({ errorCode: 'CONFIRMATION_REQUIRED' });
      expect((await RefundManualRecoveryService.abandon(c.refund.id, { operator: 'ops-test', reason: 'checked the dashboard' }, true)).abandoned).toBe(true);
      const fresh = await attempt();
      expect(fresh.created).toBe(true);
      expect(fresh.refund.id).not.toBe(c.refund.id);
      expect((await audits('REFUND_MANUAL_ABANDONED', c.refund.id))[0].payload).toMatchObject({ previousStatus: 'REVIEW' });
    });
  });

  // =============================================================================================== G. duplicate capture
  describe('duplicate captured payments', () => {
    async function withDuplicate() {
      const p = await payOrder();
      const dupPay = mock.simulatePayment(p.providerOrderId, { status: 'CAPTURED' });
      const v = await verify(p.customer.token, p.order.id, p.attemptId, p.providerOrderId, dupPay.providerPaymentId);
      expect(v.status).toBe(200);
      const dup = await prisma.providerPayment.findUniqueOrThrow({ where: { provider_providerPaymentId: { provider: 'mock', providerPaymentId: dupPay.providerPaymentId } } });
      expect(dup.reconciliationStatus).toBe('DUPLICATE');
      return { ...p, dup, dupPay };
    }

    it('48. a duplicate is NEVER refunded automatically; it waits for SUPER_ADMIN approval (visible in the review report)', async () => {
      await quiesce();
      const before = await PaymentReconciliationService.reviewReport();
      const d = await withDuplicate();
      await runWorker('p7c-dup');
      expect(await prisma.refund.count({ where: { orderId: d.order.id } })).toBe(0);
      expect(mock.refundCreateCalls).toBe(0);
      const after = await PaymentReconciliationService.reviewReport();
      expect(after.awaitingRefundApproval).toBe(before.awaitingRefundApproval + 1);
      expect((await request(app).get(`/api/v1/orders/${d.order.id}/refunds`).set(bearer(who.custA.token))).body.data.refund.state).toBe('REFUND_REVIEW_REQUIRED');
    });

    it('49. SUPER_ADMIN (step-up) approves a FULL refund of the exact DUPLICATE payment; the original APPLIED payment and the order are untouched', async () => {
      await quiesce();
      const d = await withDuplicate();
      const res = await approve(d.dup.id, { note: 'customer paid twice' });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.data).toMatchObject({ trigger: 'DUPLICATE_CAPTURE', status: 'REQUESTED', providerPayment: { id: d.dup.id, reconciliationStatus: 'DUPLICATE' }, reasonCode: 'DUPLICATE_PAYMENT', requestedByKind: 'ADMIN', reasonNote: 'customer paid twice' });
      expect(Number(res.body.data.amount)).toBe(145.5);
      expect(await audits('REFUND_APPROVED', res.body.data.id)).toHaveLength(1);
      await runWorker('p7c-dup-refund');
      expect(providerRefundFor(res.body.data.id)).toMatchObject({ providerPaymentId: d.dupPay.providerPaymentId, amountMinor: MINOR }); // the DUPLICATE payment id, not the original
      expect([...mock.refunds.values()].some((r) => r.providerPaymentId === d.pay.providerPaymentId)).toBe(false);
      mock.setRefundStatus(providerRefundFor(res.body.data.id)!.providerRefundId, 'PROCESSED');
      await dueRefund(res.body.data.id);
      await runWorker('p7c-dup-done');
      expect(await refundOf(res.body.data.id)).toMatchObject({ status: 'PROCESSED' });
      const o = await orderOf(d.order.id);
      expect(o).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID', paidByProviderPaymentId: d.ledger.id }); // the effective payment is untouched
      expect((await prisma.providerPayment.findUniqueOrThrow({ where: { id: d.ledger.id } })).providerStatus).toBe('CAPTURED');
      expect((await prisma.providerPayment.findUniqueOrThrow({ where: { id: d.dup.id } })).providerStatus).toBe('REFUNDED');
    });

    it('50. the APPLIED payment can never be the target of a duplicate refund: wrong status, or (belt) target == paidByProviderPaymentId', async () => {
      const d = await withDuplicate();
      const applied = await approve(d.ledger.id);
      expect(applied.status).toBe(409);
      expect(applied.body.error).toBe('REFUND_NOT_APPLICABLE');
      await prisma.providerPayment.update({ where: { id: d.ledger.id }, data: { reconciliationStatus: 'DUPLICATE' } }); // corrupt the ledger on purpose
      const forced = await approve(d.ledger.id);
      expect(forced.status).toBe(409);
      expect(forced.body.error).toBe('REFUND_TARGET_FORBIDDEN');
      expect(await prisma.refund.count({ where: { orderId: d.order.id } })).toBe(0);
      expect((await approve(randomUUID())).status).toBe(404);
    });

    it('51. approval needs step-up and the right body; double approval (even concurrent) yields ONE refund', async () => {
      const d = await withDuplicate();
      expect((await approve(d.dup.id, {}, null)).status).toBe(403);
      expect((await approve(d.dup.id, { amount: 1 })).status).toBe(422);
      expect((await approve(d.dup.id, { currency: 'INR' })).status).toBe(422);
      const results = await Promise.all(Array.from({ length: 5 }, () => approve(d.dup.id)));
      expect(results.every((r) => r.status === 200 || r.status === 201)).toBe(true);
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(new Set(results.map((r) => r.body.data.id)).size).toBe(1);
      expect(await prisma.refund.count({ where: { providerPaymentId: d.dup.id } })).toBe(1);
      expect(await audits('REFUND_APPROVED', results[0].body.data.id)).toHaveLength(1);
    });

    it('52. only DUPLICATE / AFTER_CANCELLATION captured payments can use the approval endpoint (pending, mismatched and applied ones cannot)', async () => {
      const p = await payOrder();
      for (const reconciliationStatus of ['PENDING', 'AMOUNT_MISMATCH', 'CURRENCY_MISMATCH', 'APPLIED']) {
        await prisma.providerPayment.update({ where: { id: p.ledger.id }, data: { reconciliationStatus } });
        const res = await approve(p.ledger.id);
        expect(res.status, reconciliationStatus).toBe(409);
        expect(res.body.error, reconciliationStatus).toBe('REFUND_NOT_APPLICABLE');
      }
    });
  });

  // =============================================================================================== H. after-cancellation capture
  describe('payment captured after cancellation', () => {
    async function lateCapture() {
      const order = await mkOrder(who.custA.profileId!);
      const s = await createSession(who.custA.token, order.id);
      const attemptId = s.body.data.attemptId as string;
      const providerOrderId = s.body.data.providerOrderId as string;
      expect((await cancelCust(who.custA.token, order.id)).status).toBe(200);
      const pay = mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
      const hook = mock.buildWebhook('payment.captured', pay, { eventId: `evt_${ts}_late_${++seq}` });
      expect((await webhook(hook.raw, hook.headers)).status).toBe(200);
      const ledger = await prisma.providerPayment.findUniqueOrThrow({ where: { provider_providerPaymentId: { provider: 'mock', providerPaymentId: pay.providerPaymentId } } });
      return { order, attemptId, providerOrderId, pay, ledger };
    }

    it('53. the order stays CANCELLED and the capture is flagged AFTER_CANCELLATION: no automatic refund', async () => {
      await quiesce();
      const l = await lateCapture();
      expect(l.ledger.reconciliationStatus).toBe('AFTER_CANCELLATION');
      expect(await orderOf(l.order.id)).toMatchObject({ status: 'CANCELLED', paymentStatus: 'PENDING', paidByProviderPaymentId: null });
      await runWorker('p7c-late');
      expect(await prisma.refund.count({ where: { orderId: l.order.id } })).toBe(0);
      expect(mock.refundCreateCalls).toBe(0);
    });

    it('54. SUPER_ADMIN (step-up) approves the exact captured payment: refunded in full, the order is NOT reopened and its paymentStatus is NOT set REFUNDED', async () => {
      await quiesce();
      const l = await lateCapture();
      const res = await approve(l.ledger.id, { note: 'late payment' });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.data).toMatchObject({ trigger: 'AFTER_CANCELLATION', reasonCode: 'LATE_PAYMENT_AFTER_CANCELLATION' });
      await runWorker('p7c-late-refund');
      mock.setRefundStatus(providerRefundFor(res.body.data.id)!.providerRefundId, 'PROCESSED');
      await dueRefund(res.body.data.id);
      await runWorker('p7c-late-done');
      expect((await refundOf(res.body.data.id)).status).toBe('PROCESSED');
      expect(await orderOf(l.order.id)).toMatchObject({ status: 'CANCELLED', paymentStatus: 'PENDING', paidByProviderPaymentId: null });
      expect((await prisma.providerPayment.findUniqueOrThrow({ where: { id: l.ledger.id } })).providerStatus).toBe('REFUNDED');
      expect(await prisma.orderEvent.count({ where: { orderId: l.order.id, toStatus: 'CONFIRMED' } })).toBe(0);
      const view = await request(app).get(`/api/v1/orders/${l.order.id}/refunds`).set(bearer(who.custA.token));
      expect(view.body.data).toMatchObject({ refund: { state: 'REFUNDED' }, cancellation: { state: 'CANCELLED' } });
    });

    it('55. the approval is refused when the order is not cancelled (an AFTER_CANCELLATION flag on a live order is an anomaly for a human)', async () => {
      const l = await lateCapture();
      await prisma.order.update({ where: { id: l.order.id }, data: { status: 'PENDING' } });
      const res = await approve(l.ledger.id);
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('REFUND_NOT_ALLOWED');
    });
  });

  // =============================================================================================== I. AUTHORIZED during cancellation
  describe('AUTHORIZED (not captured) during cancellation', () => {
    it('56. the customer may cancel; no refund is created, nothing is marked refunded, no capture is attempted', async () => {
      const order = await mkOrder(who.custA.profileId!);
      const s = await createSession(who.custA.token, order.id);
      const auth = mock.simulatePayment(s.body.data.providerOrderId, { status: 'AUTHORIZED' });
      const v = await verify(who.custA.token, order.id, s.body.data.attemptId, s.body.data.providerOrderId, auth.providerPaymentId);
      expect(v.status).toBe(202);
      const res = await cancelCust(who.custA.token, order.id);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ status: 'CANCELLED', paymentStatus: 'PENDING', refund: { state: 'NO_REFUND' } });
      expect(await prisma.refund.count({ where: { orderId: order.id } })).toBe(0);
      expect(mock.refundCreateCalls).toBe(0);
      expect((await prisma.providerPayment.findFirstOrThrow({ where: { orderId: order.id } })).providerStatus).toBe('AUTHORIZED');
    });

    it('57. a LATER capture follows AFTER_CANCELLATION -> review -> approved full refund; the AUTHORIZED_NOT_CAPTURED visibility is preserved meanwhile', async () => {
      await quiesce();
      const order = await mkOrder(who.custA.profileId!);
      const s = await createSession(who.custA.token, order.id);
      const providerOrderId = s.body.data.providerOrderId as string;
      const auth = mock.simulatePayment(providerOrderId, { status: 'AUTHORIZED' });
      await verify(who.custA.token, order.id, s.body.data.attemptId, providerOrderId, auth.providerPaymentId);
      await cancelCust(who.custA.token, order.id);
      await prisma.payment.update({ where: { id: s.body.data.attemptId }, data: { createdAt: new Date(Date.now() - 2 * 3_600_000), nextAttemptAt: pastDue() } });
      await runWorker('p7c-auth');
      expect((await prisma.payment.findUniqueOrThrow({ where: { id: s.body.data.attemptId } })).reviewFlag).toBe('AUTHORIZED_NOT_CAPTURED');
      // the account captures it later
      mock.payments.set(auth.providerPaymentId, { ...mock.payments.get(auth.providerPaymentId)!, status: 'CAPTURED' });
      await prisma.payment.update({ where: { id: s.body.data.attemptId }, data: { nextAttemptAt: pastDue() } });
      await runWorker('p7c-auth-late');
      const ledger = await prisma.providerPayment.findUniqueOrThrow({ where: { provider_providerPaymentId: { provider: 'mock', providerPaymentId: auth.providerPaymentId } } });
      expect(ledger.reconciliationStatus).toBe('AFTER_CANCELLATION');
      expect(await orderOf(order.id)).toMatchObject({ status: 'CANCELLED', paymentStatus: 'PENDING' });
      expect(await prisma.refund.count({ where: { orderId: order.id } })).toBe(0); // still nothing moves automatically
      expect((await approve(ledger.id)).status).toBe(201);
    });
  });

  // =============================================================================================== J. refund webhooks
  describe('refund webhooks', () => {
    it('58. a bad / missing signature on a refund event is rejected (400) before anything is persisted or changed', async () => {
      await quiesce();
      const c = await cancelPaid();
      await runWorker();
      const pr = providerRefundFor(c.refund.id)!;
      const { raw, headers } = mock.buildRefundWebhook('refund.processed', { ...pr, status: 'PROCESSED' }, { eventId: `evt_${ts}_58` });
      const before = await prisma.paymentWebhookEvent.count();
      expect((await webhook(raw, { ...headers, 'x-razorpay-signature': '0'.repeat(64) })).status).toBe(400);
      const { 'x-razorpay-signature': _drop, ...noSig } = headers;
      expect((await webhook(raw, noSig)).status).toBe(400);
      expect((await webhook(Buffer.concat([raw, Buffer.from(' ')]), headers)).status).toBe(400);
      expect(await prisma.paymentWebhookEvent.count()).toBe(before);
      expect((await refundOf(c.refund.id)).status).toBe('PROCESSING');
    });

    it('59. a webhook can arrive BEFORE the API answer was recorded: matched by exact receipt, PROCESSING without a stored provider id', async () => {
      await quiesce();
      const c = await cancelPaid();
      mock.failNextRefund('unknown-after-create');
      await runWorker();
      expect(await refundOf(c.refund.id)).toMatchObject({ status: 'UNKNOWN', providerRefundId: null });
      const h = mock.buildRefundWebhook('refund.created', providerRefundFor(c.refund.id)!, { eventId: `evt_${ts}_59` });
      expect((await webhook(h.raw, h.headers)).status).toBe(200);
      expect(await refundOf(c.refund.id)).toMatchObject({ status: 'PROCESSING', providerRefundId: providerRefundFor(c.refund.id)!.providerRefundId });
      expect(mock.refundCreateCalls).toBe(1);
    });

    it('60. duplicate deliveries of one refund event are harmless (one event row, one effect); the same refund re-announced under a NEW event id is a no-op', async () => {
      await quiesce();
      mock.refundInitialStatus = 'PROCESSED';
      const c = await cancelPaid();
      await runWorker();
      const pr = providerRefundFor(c.refund.id)!;
      const h = mock.buildRefundWebhook('refund.processed', pr, { eventId: `evt_${ts}_60` });
      const results = await Promise.all(Array.from({ length: 6 }, () => webhook(h.raw, h.headers)));
      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(await prisma.paymentWebhookEvent.count({ where: { eventId: `evt_${ts}_60` } })).toBe(1);
      const h2 = mock.buildRefundWebhook('refund.processed', pr, { eventId: `evt_${ts}_60b` });
      expect((await webhook(h2.raw, h2.headers)).status).toBe(200);
      expect(await audits('REFUND_PROCESSED', c.refund.id)).toHaveLength(1);
      expect((await refundOf(c.refund.id)).status).toBe('PROCESSED');
    });

    it('61. refund events are durable: an event for a payment this system has not recorded yet stays RETRY_PENDING (never ignored), the worker resolves it later', async () => {
      await quiesce();
      const order = await mkOrder(who.custA.profileId!);
      const s = await createSession(who.custA.token, order.id);
      const pay = mock.simulatePayment(s.body.data.providerOrderId, { status: 'CAPTURED' });
      const ext = mock.externalRefund(pay.providerPaymentId, 2500, 'PROCESSED');
      const h = mock.buildRefundWebhook('refund.processed', ext, { eventId: `evt_${ts}_61` });
      expect((await webhook(h.raw, h.headers)).status).toBe(200);
      const key = { provider_eventId: { provider: 'mock', eventId: `evt_${ts}_61` } };
      expect(await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: key })).toMatchObject({ status: 'RETRY_PENDING', lastError: 'UNMATCHED_PROVIDER_PAYMENT' });
      await prisma.paymentWebhookEvent.update({ where: key, data: { nextAttemptAt: pastDue() } });
      await runWorker('p7c-refund-event');
      expect((await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: key })).status).toBe('PROCESSED');
      // the payment got ledgered through the normal settlement path and the outside refund was recorded against it
      const ledger = await prisma.providerPayment.findUniqueOrThrow({ where: { provider_providerPaymentId: { provider: 'mock', providerPaymentId: pay.providerPaymentId } } });
      expect(await prisma.refund.findFirst({ where: { providerPaymentId: ledger.id, trigger: 'EXTERNAL' } })).toMatchObject({ providerRefundId: ext.providerRefundId });
    });

    it('62. a refund event for a payment that provably belongs to something else on the provider account is finally IGNORED (only after asking the provider)', async () => {
      await quiesce();
      const stranger = await mock.createOrder({ receipt: 'another-system', amountMinor: 5000, currency: 'INR', notes: {} });
      const pay = mock.simulatePayment(stranger.providerOrderId, { status: 'CAPTURED' });
      const ext = mock.externalRefund(pay.providerPaymentId, 5000, 'PROCESSED');
      const h = mock.buildRefundWebhook('refund.processed', ext, { eventId: `evt_${ts}_62` });
      await webhook(h.raw, h.headers);
      const key = { provider_eventId: { provider: 'mock', eventId: `evt_${ts}_62` } };
      await prisma.paymentWebhookEvent.update({ where: key, data: { nextAttemptAt: pastDue() } });
      await runWorker('p7c-stranger');
      expect(await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: key })).toMatchObject({ status: 'IGNORED', ignoredReason: 'UNRELATED_PROVIDER_PAYMENT' });
      expect(await prisma.refund.count({ where: { providerRefundId: ext.providerRefundId } })).toBe(0);
    });

    it('63. EXTERNAL refund (made on the provider dashboard) against a known payment is LEDGERED, counted, flagged for review, idempotent; a full one marks the effective order REFUNDED', async () => {
      await quiesce();
      const before = await PaymentReconciliationService.reviewReport();
      const p = await payOrder();
      const ext = mock.externalRefund(p.pay.providerPaymentId, MINOR, 'PROCESSED');
      const h = mock.buildRefundWebhook('refund.processed', ext, { eventId: `evt_${ts}_63` });
      expect((await webhook(h.raw, h.headers)).status).toBe(200);
      const h2 = mock.buildRefundWebhook('refund.processed', ext, { eventId: `evt_${ts}_63b` });
      expect((await webhook(h2.raw, h2.headers)).status).toBe(200);
      const rows = await prisma.refund.findMany({ where: { providerPaymentId: p.ledger.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ trigger: 'EXTERNAL', status: 'PROCESSED', reviewFlag: 'EXTERNAL_REFUND', reasonCode: 'EXTERNAL_REFUND', requestedByKind: 'SYSTEM', providerRefundId: ext.providerRefundId });
      expect(await orderOf(p.order.id)).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'REFUNDED' }); // money left; Order.status is not this service's to change
      expect(await audits('REFUND_EXTERNAL_RECORDED', rows[0].id)).toHaveLength(1);
      const after = await PaymentReconciliationService.reviewReport();
      expect(after.externalRefunds).toBe(before.externalRefunds + 1);
      expect(after.total).toBeGreaterThan(before.total);
      await RefundManualRecoveryService.acknowledgeExternal(rows[0].id, { operator: 'ops-test', reason: 'refunded by finance on purpose' });
      expect((await PaymentReconciliationService.reviewReport()).externalRefunds).toBe(before.externalRefunds);
      expect(await audits('REFUND_EXTERNAL_ACKNOWLEDGED', rows[0].id)).toHaveLength(1);
    });

    it('64. the worker also ledgers outside refunds it finds while resolving an UNKNOWN refund of the same payment', async () => {
      await quiesce();
      const c = await cancelPaid();
      mock.failNextRefund('unknown-after-create');
      await runWorker();
      const ext = mock.externalRefund(c.pay.providerPaymentId, 100, 'PROCESSED');
      await dueRefund(c.refund.id);
      await runWorker('p7c-foreign');
      expect(await prisma.refund.findFirst({ where: { providerRefundId: ext.providerRefundId } })).toMatchObject({ trigger: 'EXTERNAL' });
      expect((await refundOf(c.refund.id)).status).toBe('PROCESSING'); // ours was adopted by its own exact receipt
    });

    it('65. EXTERNAL refund racing the local refund (real PostgreSQL): both are recorded exactly once and the money never exceeds what was captured without a flag', async () => {
      await quiesce();
      mock.refundInitialStatus = 'PROCESSED';
      const c = await cancelPaid();
      await runWorker();
      const ext = mock.externalRefund(c.pay.providerPaymentId, 500, 'PROCESSED');
      const h = mock.buildRefundWebhook('refund.processed', ext, { eventId: `evt_${ts}_65` });
      const mine = mock.buildRefundWebhook('refund.processed', providerRefundFor(c.refund.id)!, { eventId: `evt_${ts}_65m` });
      const results = await Promise.all([webhook(h.raw, h.headers), webhook(h.raw, h.headers), webhook(mine.raw, mine.headers), webhook(mine.raw, mine.headers)]);
      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(await prisma.refund.count({ where: { providerRefundId: ext.providerRefundId } })).toBe(1);
      const own = await refundOf(c.refund.id);
      expect(own.status).toBe('PROCESSED');
      expect(await prisma.refund.findFirstOrThrow({ where: { providerRefundId: ext.providerRefundId } })).toMatchObject({ reviewFlag: 'OVER_REFUNDED' }); // 14550 + 500 > 14550: flagged, kept
    });

    it('66. the webhook stores only normalized safe data: no raw body, no instrument data, no notes', async () => {
      await quiesce();
      const c = await cancelPaid();
      await runWorker();
      const pr = providerRefundFor(c.refund.id)!;
      const h = mock.buildRefundWebhook('refund.processed', { ...pr, status: 'PROCESSED' }, { eventId: `evt_${ts}_66` });
      await webhook(h.raw, h.headers);
      const ev = await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { provider_eventId: { provider: 'mock', eventId: `evt_${ts}_66` } } });
      expect(JSON.stringify(ev)).not.toContain(h.raw.toString('utf8'));
      expect(ev.normalized).toMatchObject({ kind: 'REFUND', refund: { providerRefundId: pr.providerRefundId, amountMinor: MINOR, status: 'PROCESSED' } });
      expect(Object.keys((ev.normalized as { refund: object }).refund).sort()).toEqual(['amountMinor', 'currency', 'providerPaymentId', 'providerRefundId', 'receipt', 'speedProcessed', 'status']);
    });
  });

  // =============================================================================================== K. reconciliation worker
  describe('refund reconciliation worker', () => {
    it('67. TWO workers over eight REQUESTED refunds (real PostgreSQL): every refund reaches the provider exactly once', async () => {
      await quiesce();
      const refunds = [];
      for (let i = 0; i < 8; i++) refunds.push(await cancelPaid());
      const [a, b] = await Promise.all([PaymentReconciliationService.runOnce({ workerId: 'worker-A', limit: 5 }), PaymentReconciliationService.runOnce({ workerId: 'worker-B', limit: 5 })]);
      expect(a.refundsSubmitted + b.refundsSubmitted).toBeLessThanOrEqual(8);
      await PaymentReconciliationService.runOnce({ workerId: 'worker-C', limit: 25 });
      expect(mock.refundCreateCalls).toBe(8);
      expect(mock.refunds.size).toBe(8);
      for (const r of refunds) expect((await refundOf(r.refund.id)).attemptCount).toBe(1);
    });

    it('68. SKIP LOCKED: while worker A holds its claim transaction open, worker B claims DIFFERENT refunds immediately', async () => {
      await quiesce();
      const ids: string[] = [];
      for (let i = 0; i < 6; i++) ids.push((await cancelPaid()).refund.id);
      let release!: () => void;
      const hold = new Promise<void>((r) => (release = r));
      let claimedByA!: (v: string[]) => void;
      const aReady = new Promise<string[]>((r) => (claimedByA = r));
      const txA = prisma.$transaction(
        async (tx) => {
          claimedByA(await PaymentReconciliationService.claimRefunds(tx, 'A', 3));
          await hold;
        },
        { timeout: 20000, maxWait: 5000 }
      );
      const a = await aReady;
      const started = Date.now();
      const b = await PaymentReconciliationService.claimRefunds(prisma, 'B', 3);
      const elapsed = Date.now() - started;
      release();
      await txA;
      expect(elapsed).toBeLessThan(3000);
      expect(a).toHaveLength(3);
      expect(b).toHaveLength(3);
      expect(a.filter((x) => b.includes(x))).toEqual([]);
      expect([...a, ...b].sort()).toEqual([...ids].sort());
    });

    it('69. leases and eligibility: a claimed refund is not claimable until its lease expires; REVIEW / PROCESSED / ABANDONED / not-due refunds are never claimed', async () => {
      await quiesce();
      const make = async () => (await cancelPaid()).refund.id;
      const due = await make();
      const review = await make();
      const processed = await make();
      const abandoned = await make();
      const future = await make();
      await prisma.refund.update({ where: { id: review }, data: { status: 'REVIEW' } });
      await prisma.refund.update({ where: { id: processed }, data: { status: 'PROCESSED' } });
      await prisma.refund.update({ where: { id: abandoned }, data: { status: 'ABANDONED' } });
      await prisma.refund.update({ where: { id: future }, data: { nextAttemptAt: new Date(Date.now() + 3_600_000) } });
      expect(await PaymentReconciliationService.claimRefunds(prisma, 'W1', 50)).toEqual([due]);
      expect(await PaymentReconciliationService.claimRefunds(prisma, 'W2', 50)).toEqual([]);
      expect((await refundOf(due)).lockedBy).toBe('W1');
      await prisma.refund.update({ where: { id: due }, data: { lockedUntil: pastDue() } });
      expect(await PaymentReconciliationService.claimRefunds(prisma, 'W2', 50)).toEqual([due]); // crashed worker recovery
    });

    it('70. batches are bounded by the limit', async () => {
      await quiesce();
      for (let i = 0; i < 4; i++) await cancelPaid();
      expect((await PaymentReconciliationService.claimRefunds(prisma, 'W', 2)).length).toBe(2);
      expect((await PaymentReconciliationService.claimRefunds(prisma, 'W', 50)).length).toBe(2);
    });

    it('71. provider errors while polling back off without corrupting the refund; a long silence escalates to REVIEW instead of looping forever', async () => {
      await quiesce();
      const c = await cancelPaid();
      await runWorker();
      mock.setReadFailure(true);
      await dueRefund(c.refund.id);
      await runWorker('p7c-down');
      const r = await refundOf(c.refund.id);
      expect(r).toMatchObject({ status: 'PROCESSING', lockedUntil: null });
      expect(r.attemptCount).toBe(2);
      expect(r.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
      await prisma.refund.update({ where: { id: c.refund.id }, data: { submittedAt: new Date(Date.now() - 9 * 86_400_000), nextAttemptAt: pastDue() } });
      await runWorker('p7c-down-long');
      expect((await refundOf(c.refund.id)).status).toBe('REVIEW');
    });

    it('72. the review report counts refunds in REVIEW / UNKNOWN; a refunded duplicate stops counting as review work', async () => {
      await quiesce();
      const base = await PaymentReconciliationService.reviewReport();
      const c = await cancelPaid();
      mock.failNextRefund('unknown');
      await runWorker();
      const afterUnknown = await PaymentReconciliationService.reviewReport();
      expect(afterUnknown.refundsUnknown).toBe(base.refundsUnknown + 1);
      await RefundManualRecoveryService.flagForReview(c.refund.id, { operator: 'ops-test', reason: 'looking at it' });
      const afterReview = await PaymentReconciliationService.reviewReport();
      expect(afterReview.refundsInReview).toBe(base.refundsInReview + 1);
      expect(afterReview.total).toBeGreaterThan(base.total);
    });
  });

  // =============================================================================================== K2. cross-flow races (real PostgreSQL)
  describe('cross-flow concurrency', () => {
    it('81. customer CANCEL racing a provider CAPTURE of the same order (6 rounds): always consistent - cancelled first = AFTER_CANCELLATION (no refund yet), captured first = PAID cancelled with ONE full refund', async () => {
      const outcomes = new Set<string>();
      for (let round = 0; round < 6; round++) {
        const order = await mkOrder(who.custA.profileId!);
        const s = await createSession(who.custA.token, order.id);
        const pay = mock.simulatePayment(s.body.data.providerOrderId, { status: 'CAPTURED' });
        const [c, v] = await Promise.all([cancelCust(who.custA.token, order.id), verify(who.custA.token, order.id, s.body.data.attemptId, s.body.data.providerOrderId, pay.providerPaymentId)]);
        expect([200, 409], `cancel round ${round} ${JSON.stringify(c.body)}`).toContain(c.status);
        expect([200, 202, 409], `verify round ${round} ${JSON.stringify(v.body)}`).toContain(v.status);
        const o = await orderOf(order.id);
        const ledger = await prisma.providerPayment.findFirstOrThrow({ where: { orderId: order.id } });
        const refunds = await prisma.refund.findMany({ where: { orderId: order.id } });
        if (ledger.reconciliationStatus === 'AFTER_CANCELLATION') {
          outcomes.add('cancel-first');
          expect(o).toMatchObject({ status: 'CANCELLED', paymentStatus: 'PENDING', paidByProviderPaymentId: null });
          expect(refunds).toHaveLength(0);
        } else {
          outcomes.add('capture-first');
          expect(ledger.reconciliationStatus).toBe('APPLIED');
          expect(o).toMatchObject({ status: 'CANCELLED', paymentStatus: 'PAID', paidByProviderPaymentId: ledger.id });
          expect(refunds).toHaveLength(1);
          expect(refunds[0].providerPaymentId).toBe(ledger.id);
        }
        expect(await prisma.orderEvent.count({ where: { orderId: order.id, toStatus: 'CANCELLED' } })).toBe(1);
      }
      expect(outcomes.size).toBeGreaterThan(0);
    });

    it('82. a refund webhook, the worker lookup and a manual reconcile racing on an UNKNOWN refund: ONE recovery, one provider refund, no regression', async () => {
      await quiesce();
      const c = await cancelPaid();
      mock.failNextRefund('unknown-after-create');
      await runWorker();
      const pr = providerRefundFor(c.refund.id)!;
      const h = mock.buildRefundWebhook('refund.created', pr, { eventId: `evt_${ts}_82` });
      const results = await Promise.allSettled([
        webhook(h.raw, h.headers),
        RefundService.resolveByLookup(c.refund.id, mock, 'RECONCILIATION'),
        RefundManualRecoveryService.reconcile(c.refund.id, { operator: 'ops-test', reason: 'racing the worker' }),
        webhook(h.raw, h.headers)
      ]);
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      expect(await refundOf(c.refund.id)).toMatchObject({ status: 'PROCESSING', providerRefundId: pr.providerRefundId });
      expect(await audits('REFUND_RECOVERED', c.refund.id)).toHaveLength(1);
      expect(mock.refundCreateCalls).toBe(1);
      expect(mock.refunds.size).toBe(1);
    });
  });

  // =============================================================================================== L. manual recovery (CLI services)
  describe('manual recovery operations', () => {
    it('73. every action needs an operator and a reason; inspect is read-only; flag-for-review only from UNKNOWN', async () => {
      await quiesce();
      const c = await cancelPaid();
      for (const op of [{ operator: '', reason: 'a valid reason' }, { operator: 'ops', reason: '' }, { operator: 'ops', reason: 'x' }]) {
        await expect(RefundManualRecoveryService.reconcile(c.refund.id, op)).rejects.toMatchObject({ statusCode: 422 });
        await expect(RefundManualRecoveryService.flagForReview(c.refund.id, op)).rejects.toMatchObject({ statusCode: 422 });
        await expect(RefundManualRecoveryService.abandon(c.refund.id, op, true)).rejects.toMatchObject({ statusCode: 422 });
        await expect(RefundManualRecoveryService.acknowledgeExternal(c.refund.id, op)).rejects.toMatchObject({ statusCode: 422 });
      }
      const info = await RefundManualRecoveryService.inspect(c.refund.id);
      expect(info).toMatchObject({ id: c.refund.id, status: 'REQUESTED', trigger: 'CUSTOMER_CANCELLATION' });
      await expect(RefundManualRecoveryService.inspect(randomUUID())).rejects.toMatchObject({ statusCode: 404 });
      await expect(RefundManualRecoveryService.flagForReview(c.refund.id, { operator: 'ops-test', reason: 'not unknown yet' })).rejects.toMatchObject({ errorCode: 'REVIEW_REFUSED' });
      expect((await refundOf(c.refund.id)).status).toBe('REQUESTED');
    });

    const abandonOp = { operator: 'ops-test', reason: 'verified in the dashboard' };

    it('74. ABANDON SAFETY: refused unless REVIEW + confirmed; never for EXTERNAL refunds, a known provider refund id, or a REQUESTED refund', async () => {
      await quiesce();
      const c = await cancelPaid();
      await expect(RefundManualRecoveryService.abandon(c.refund.id, abandonOp, true)).rejects.toMatchObject({ errorCode: 'ABANDON_REFUSED' }); // still REQUESTED
      mock.failNextRefund('definite');
      await runWorker();
      expect(await refundOf(c.refund.id)).toMatchObject({ status: 'REVIEW', providerStatus: 'REJECTED' });
      await expect(RefundManualRecoveryService.abandon(c.refund.id, abandonOp, false)).rejects.toMatchObject({ errorCode: 'CONFIRMATION_REQUIRED' });
      expect((await refundOf(c.refund.id)).status).toBe('REVIEW');
      await prisma.refund.update({ where: { id: c.refund.id }, data: { providerRefundId: `rfnd_known_${ts}` } });
      await expect(RefundManualRecoveryService.abandon(c.refund.id, abandonOp, true)).rejects.toMatchObject({ errorCode: 'ABANDON_REFUSED' }); // a provider refund id is known
      const ext = await prisma.refund.create({ data: { orderId: c.order.id, providerPaymentId: c.ledger.id, paymentId: c.ledger.paymentId, provider: 'mock', providerRefundId: `rfnd_x_${ts}`, amount: '1.00', currency: 'INR', trigger: 'EXTERNAL', reasonCode: 'EXTERNAL_REFUND', requestedByKind: 'SYSTEM', status: 'REVIEW' } });
      await expect(RefundManualRecoveryService.abandon(ext.id, abandonOp, true)).rejects.toMatchObject({ errorCode: 'ABANDON_REFUSED' });
    });

    it('74b. ABANDON SAFETY: a refund in REVIEW because of a timeout / lost answer can NEVER be abandoned - an EMPTY (non-authoritative) listing proves nothing', async () => {
      await quiesce();
      const c = await cancelPaid();
      mock.failNextRefund('unknown'); // timeout: the provider MAY or may not have created it
      await runWorker();
      await RefundManualRecoveryService.flagForReview(c.refund.id, abandonOp);
      expect((await refundOf(c.refund.id)).status).toBe('REVIEW');
      mock.setRefundListingHidden(true); // the provider listing is empty - but that is not proof
      const err = await RefundManualRecoveryService.abandon(c.refund.id, abandonOp, true).catch((e) => e);
      expect(err).toMatchObject({ errorCode: 'ABANDON_REFUSED' });
      expect((await refundOf(c.refund.id)).status).toBe('REVIEW');
      expect(await prisma.refund.count({ where: { providerPaymentId: c.ledger.id, status: { not: 'ABANDONED' } } })).toBe(1); // the slot stays occupied: no new intent is possible
    });

    it('74c. ABANDON SAFETY: a duplicate-receipt rejection does not prove absence either (a refund may exist behind a non-authoritative listing)', async () => {
      await quiesce();
      const c = await cancelPaid();
      await mock.createRefund({ providerPaymentId: c.pay.providerPaymentId, amountMinor: MINOR, currency: 'INR', receipt: c.refund.id, notes: {} }); // already at the provider
      mock.setRefundListingHidden(true); // ... but the listing does not show it
      await runWorker();
      const r = await refundOf(c.refund.id);
      expect(r.status).toBe('REVIEW');
      expect(r.providerStatus).not.toBe('REJECTED');
      mock.setRefundListingHidden(false);
      await expect(RefundManualRecoveryService.abandon(c.refund.id, abandonOp, true)).rejects.toMatchObject({ errorCode: 'ABANDON_REFUSED' });
      expect(mock.refunds.size).toBe(1);
    });

    it('74d. ABANDON SAFETY: even after a provable rejection the provider is asked again - outage, an exact receipt match or an ambiguous listing refuse; only a clean answer allows it', async () => {
      await quiesce();
      const c = await cancelPaid();
      mock.failNextRefund('definite');
      await runWorker();
      expect(await refundOf(c.refund.id)).toMatchObject({ status: 'REVIEW', providerStatus: 'REJECTED' });

      mock.setReadFailure(true); // provider outage is NEVER treated as absence
      await expect(RefundManualRecoveryService.abandon(c.refund.id, abandonOp, true)).rejects.toMatchObject({ errorCode: 'PAYMENT_PROVIDER_UNAVAILABLE' });
      mock.setReadFailure(false);

      const stray = { providerRefundId: 'rfnd_stray_1', providerPaymentId: c.pay.providerPaymentId, amountMinor: MINOR, currency: 'INR', status: 'PENDING' as const, receipt: c.refund.id, speedProcessed: null };
      mock.refunds.set('rfnd_stray_1', stray); // exact receipt found
      await expect(RefundManualRecoveryService.abandon(c.refund.id, abandonOp, true)).rejects.toMatchObject({ errorCode: 'ABANDON_REFUSED' });
      mock.refunds.set('rfnd_stray_2', { ...stray, providerRefundId: 'rfnd_stray_2' }); // ambiguous (two)
      await expect(RefundManualRecoveryService.abandon(c.refund.id, abandonOp, true)).rejects.toMatchObject({ errorCode: 'ABANDON_REFUSED' });
      expect((await refundOf(c.refund.id)).status).toBe('REVIEW');

      mock.refunds.clear(); // a clean answer on top of a provable rejection
      expect(await RefundManualRecoveryService.abandon(c.refund.id, abandonOp, true)).toEqual({ abandoned: true, alreadyAbandoned: false });
      expect((await audits('REFUND_MANUAL_ABANDONED', c.refund.id))[0].payload).toMatchObject({ previousStatus: 'REVIEW' });
    });

    it('74e. a refund refused BEFORE any provider call (money already left through an external refund) may be abandoned once the provider shows no receipt', async () => {
      await quiesce();
      const c = await cancelPaid();
      const ext = mock.externalRefund(c.pay.providerPaymentId, 1000, 'PROCESSED'); // appears after the intent, before submission
      await RefundSettlementService.recordExternal({ ledgerId: c.ledger.id, evidence: ext, via: 'WEBHOOK' });
      await runWorker();
      expect(await refundOf(c.refund.id)).toMatchObject({ status: 'REVIEW', reviewFlag: 'EXTERNAL_REFUND_PRESENT', providerStatus: null });
      expect(mock.refundCreateCalls).toBe(0); // no provider call was made for the local refund
      expect((await RefundManualRecoveryService.abandon(c.refund.id, abandonOp, true)).abandoned).toBe(true);
    });

    it('75. manual reconcile can only move a refund FORWARD on provider evidence and can never mark anything processed by itself', async () => {
      await quiesce();
      const c = await cancelPaid();
      mock.failNextRefund('unknown');
      await runWorker();
      const out = await RefundManualRecoveryService.reconcile(c.refund.id, { operator: 'ops-test', reason: 'asking the provider again' });
      expect(out.outcome).toBe('NOT_FOUND'); // the provider holds nothing: nothing is invented
      expect((await refundOf(c.refund.id)).status).toBe('UNKNOWN');
      expect((await audits('REFUND_MANUAL_RECONCILE', c.refund.id))[0].role).toBe('CLI:ops-test');
      const pending = await cancelPaid();
      await expect(RefundManualRecoveryService.reconcile(pending.refund.id, { operator: 'ops-test', reason: 'not claimable yet' })).rejects.toMatchObject({ errorCode: 'RECONCILE_REFUSED' });
      const source = readFileSync(join(__dirname, '..', 'modules', 'refund', 'refundManualRecovery.service.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      expect(source).not.toMatch(/status:\s*REFUND_STATUS\.PROCESSED|status:\s*'PROCESSED'/);
    });
  });

  // =============================================================================================== K3. final-review hardening
  describe('final-review hardening: inline submission, SUBMITTING crash window, external race, effective payment, approval race', () => {
    it('84. INLINE submission racing the worker (real PostgreSQL): both run the SAME submit compare-and-set - exactly ONE provider createRefund per refund', async () => {
      await quiesce();
      useConfig({ PAYMENT_REFUND_INLINE_SUBMIT: 'false' });
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) ids.push((await cancelPaid()).refund.id);
      const original = mock.createRefund.bind(mock);
      vi.spyOn(mock, 'createRefund').mockImplementation(async (input) => {
        await new Promise((r) => setTimeout(r, 120)); // widen the race window
        return original(input);
      });
      useConfig({ PAYMENT_REFUND_INLINE_SUBMIT: 'true' });
      for (const id of ids) RefundService.kick(id); // the inline path (same RefundService.submit)
      const workers = await Promise.all([runWorker('race-A'), runWorker('race-B'), runWorker('race-C')]);
      for (let i = 0; i < 60 && (await prisma.refund.count({ where: { id: { in: ids }, status: { in: ['REQUESTED', 'SUBMITTING'] } } })) > 0; i++) await new Promise((r) => setTimeout(r, 100));
      expect(mock.refundCreateCalls).toBe(ids.length);
      expect(mock.refunds.size).toBe(ids.length);
      for (const id of ids) {
        const r = await refundOf(id);
        expect(r.status).toBe('PROCESSING');
        expect(r.attemptCount).toBe(1);
      }
      expect(workers.reduce((a, w) => a + w.refundsSubmitted, 0)).toBeLessThanOrEqual(ids.length);
    });

    it('85. inline vs worker for ONE refund, 8 rounds: never two provider calls whoever wins', async () => {
      for (let round = 0; round < 8; round++) {
        await quiesce();
        useConfig({ PAYMENT_REFUND_INLINE_SUBMIT: 'false' });
        mock.reset();
        const c = await cancelPaid();
        useConfig({ PAYMENT_REFUND_INLINE_SUBMIT: 'true' });
        RefundService.kick(c.refund.id);
        await runWorker(`round-${round}`);
        for (let i = 0; i < 40 && (await refundOf(c.refund.id)).status !== 'PROCESSING'; i++) await new Promise((r) => setTimeout(r, 50));
        expect(mock.refundCreateCalls, `round ${round}`).toBe(1);
      }
    });

    it('86. SUBMITTING crash window: the provider creates the refund, the answer AND the UNKNOWN downgrade are lost (crash) -> SUBMITTING; the expired lease resolves by exact-receipt lookup; createRefund is called EXACTLY ONCE', async () => {
      await quiesce();
      const c = await cancelPaid();
      const seen: string[] = ['REQUESTED'];
      vi.spyOn(RefundSettlementService, 'apply').mockRejectedValueOnce(new Error('process crashed before recording the answer'));
      vi.spyOn(RefundService, 'markUnknown').mockRejectedValueOnce(new Error('process crashed'));
      await runWorker('crashy');
      let r = await refundOf(c.refund.id);
      expect(r.status).toBe('SUBMITTING'); // exactly where a real crash would leave it
      seen.push(r.status);
      expect(r.providerRefundId).toBeNull();
      expect(r.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
      expect(mock.refundCreateCalls).toBe(1);
      expect(mock.refunds.size).toBe(1);
      vi.restoreAllMocks();

      // a live lease is never touched by other workers
      const during = await runWorker('bystander');
      expect(during.refundsClaimed).toBe(0);
      expect((await refundOf(c.refund.id)).status).toBe('SUBMITTING');
      expect(mock.refundCreateCalls).toBe(1);

      // the lease expires -> the worker downgrades to UNKNOWN and LOOKS UP; it must never create again
      await prisma.refund.update({ where: { id: c.refund.id }, data: { lockedUntil: pastDue(), nextAttemptAt: pastDue() } });
      const original = RefundService.resolveByLookup.bind(RefundService);
      vi.spyOn(RefundService, 'resolveByLookup').mockImplementation(async (id, provider, via) => {
        seen.push((await refundOf(id)).status);
        return original(id, provider, via);
      });
      await runWorker('after-lease');
      r = await refundOf(c.refund.id);
      seen.push(r.status);
      expect(seen).toEqual(['REQUESTED', 'SUBMITTING', 'UNKNOWN', 'PROCESSING']);
      const pr = providerRefundFor(c.refund.id)!;
      expect(r).toMatchObject({ status: 'PROCESSING', providerRefundId: pr.providerRefundId, failureCode: null });
      // adopted only because EVERYTHING matched
      expect(pr).toMatchObject({ receipt: c.refund.id, providerPaymentId: c.pay.providerPaymentId, amountMinor: MINOR, currency: 'INR' });
      expect(mock.refundCreateCalls).toBe(1); // exactly one provider create call across the whole story
      expect(mock.refunds.size).toBe(1);
      expect(await audits('REFUND_RECOVERED', r.id)).toHaveLength(1);
    });

    it('87. an expired SUBMITTING lease NEVER adopts a provider refund whose receipt matches but whose payment, amount or currency does not (REVIEW, still one create)', async () => {
      for (const [label, patch] of [['amount', { amountMinor: 1000 }], ['currency', { currency: 'USD' }], ['payment', { providerPaymentId: 'pay_other' }]] as const) {
        await quiesce();
        const c = await cancelPaid();
        const seeded = await mock.createRefund({ providerPaymentId: c.pay.providerPaymentId, amountMinor: MINOR, currency: 'INR', receipt: c.refund.id, notes: {} });
        mock.refunds.set(seeded.providerRefundId, { ...seeded, ...patch });
        await prisma.refund.update({ where: { id: c.refund.id }, data: { status: 'SUBMITTING', attemptCount: 1, submittedAt: new Date(), lockedUntil: pastDue(), lockedBy: 'dead', nextAttemptAt: pastDue() } });
        const before = mock.refundCreateCalls;
        await runWorker(`mismatch-${label}`);
        const r = await refundOf(c.refund.id);
        // a refund listed under ANOTHER payment is simply not found for this one (stays UNKNOWN); amount/currency mismatches go to REVIEW
        expect(r.status, label).toBe(label === 'payment' ? 'UNKNOWN' : 'REVIEW');
        expect(r.providerRefundId, label).toBeNull();
        expect(mock.refundCreateCalls, label).toBe(before); // nothing was created by the worker
        mock.reset();
      }
    });

    it('88. EXTERNAL evidence vs a LOCAL full-refund intent, 8 racing rounds: either the intent is refused (external first) or the local refund is blocked before any provider call (local first) - money can never exceed what was captured', async () => {
      const outcomes = new Set<string>();
      for (let round = 0; round < 8; round++) {
        await quiesce();
        const p = await payOrder();
        const ext = mock.externalRefund(p.pay.providerPaymentId, 1000, 'PROCESSED');
        const before = mock.refundCreateCalls;
        const [cancel] = await Promise.all([cancelCust(who.custA.token, p.order.id), RefundSettlementService.recordExternal({ ledgerId: p.ledger.id, evidence: ext, via: 'WEBHOOK' })]);
        await runWorker(`ext-race-${round}`);
        const o = await orderOf(p.order.id);
        const refunds = await prisma.refund.findMany({ where: { providerPaymentId: p.ledger.id } });
        const local = refunds.filter((r) => r.trigger !== 'EXTERNAL');
        expect(refunds.filter((r) => r.trigger === 'EXTERNAL')).toHaveLength(1); // trusted evidence is NEVER dropped
        if (cancel.status === 409) {
          outcomes.add('external-first');
          expect(cancel.body.error).toBe('EXTERNAL_REFUND_PRESENT');
          expect(local).toHaveLength(0);
          expect(o.status).toBe('CONFIRMED');
        } else {
          outcomes.add('local-first');
          expect(local).toHaveLength(1);
          expect(local[0]).toMatchObject({ status: 'REVIEW', reviewFlag: 'EXTERNAL_REFUND_PRESENT' }); // blocked before the provider
        }
        expect(mock.refundCreateCalls, `round ${round}`).toBe(before); // no local refund ever reached the provider
        const providerMoney = [...mock.refunds.values()].filter((r) => r.providerPaymentId === p.pay.providerPaymentId && r.status !== 'FAILED').reduce((a, r) => a + r.amountMinor, 0);
        expect(providerMoney).toBeLessThanOrEqual(MINOR);
        mock.reset();
      }
      expect(outcomes.size).toBeGreaterThan(0);
    });

    it('89. when BOTH a local full refund and an outside refund have reached the provider (the unavoidable in-flight window) the excess is flagged OVER_REFUNDED with an alert - never silent', async () => {
      await quiesce();
      const alert = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      mock.refundInitialStatus = 'PROCESSED';
      const c = await cancelPaid();
      await runWorker(); // local full refund is already PROCESSED at the provider
      const ext = mock.externalRefund(c.pay.providerPaymentId, 500, 'PROCESSED'); // an outside refund discovered afterwards
      const rec = await RefundSettlementService.recordExternal({ ledgerId: c.ledger.id, evidence: ext, via: 'RECONCILIATION' });
      expect(await refundOf(rec.refundId!)).toMatchObject({ reviewFlag: 'OVER_REFUNDED', trigger: 'EXTERNAL' });
      expect(alert.mock.calls.some((x) => String(x[0]).includes('refund.over_refunded'))).toBe(true);
      expect((await PaymentReconciliationService.reviewReport()).externalRefunds).toBeGreaterThanOrEqual(0);
    });

    it('90. EFFECTIVE-PAYMENT invariant: a PROCESSED refund of a DUPLICATE, an AFTER_CANCELLATION or an EXTERNAL non-effective payment never changes the order payment state; only the effective payment can', async () => {
      await quiesce();
      const p = await payOrder();
      const dupPay = mock.simulatePayment(p.providerOrderId, { status: 'CAPTURED' });
      await verify(who.custA.token, p.order.id, p.attemptId, p.providerOrderId, dupPay.providerPaymentId);
      const dup = await prisma.providerPayment.findUniqueOrThrow({ where: { provider_providerPaymentId: { provider: 'mock', providerPaymentId: dupPay.providerPaymentId } } });
      const ext = mock.externalRefund(dupPay.providerPaymentId, MINOR, 'PROCESSED'); // a FULL outside refund of the NON-effective duplicate
      await RefundSettlementService.recordExternal({ ledgerId: dup.id, evidence: ext, via: 'WEBHOOK' });
      expect(await orderOf(p.order.id)).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID', paidByProviderPaymentId: p.ledger.id });
      expect((await prisma.providerPayment.findUniqueOrThrow({ where: { id: p.ledger.id } })).providerStatus).toBe('CAPTURED');
      // a PARTIAL outside refund of the effective payment does not make the order REFUNDED either
      const part = mock.externalRefund(p.pay.providerPaymentId, 1000, 'PROCESSED');
      await RefundSettlementService.recordExternal({ ledgerId: p.ledger.id, evidence: part, via: 'WEBHOOK' });
      expect((await orderOf(p.order.id)).paymentStatus).toBe('PAID');
      // only a PROCESSED full refund of the effective payment does
      const eff = await payOrder();
      mock.refundInitialStatus = 'PROCESSED';
      await cancelCust(who.custA.token, eff.order.id);
      await runWorker('effective');
      expect((await orderOf(eff.order.id)).paymentStatus).toBe('REFUNDED');
      expect(await prisma.orderEvent.count({ where: { orderId: eff.order.id, toStatus: { in: ['CONFIRMED', 'CANCELLED'] } } })).toBe(2); // RefundSettlementService never wrote Order.status
    });

    it('91. concurrent approvals of the same duplicate (real PostgreSQL): ONE intent, and after the worker runs ONE provider refund and one financial effect', async () => {
      await quiesce();
      const p = await payOrder();
      const dupPay = mock.simulatePayment(p.providerOrderId, { status: 'CAPTURED' });
      await verify(who.custA.token, p.order.id, p.attemptId, p.providerOrderId, dupPay.providerPaymentId);
      const dup = await prisma.providerPayment.findUniqueOrThrow({ where: { provider_providerPaymentId: { provider: 'mock', providerPaymentId: dupPay.providerPaymentId } } });
      const results = await Promise.all(Array.from({ length: 6 }, () => approve(dup.id)));
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      const id = results.find((r) => r.status === 201)!.body.data.id as string;
      await Promise.all([runWorker('approve-A'), runWorker('approve-B')]);
      expect(mock.refundCreateCalls).toBe(1);
      expect(mock.refunds.size).toBe(1);
      expect(await prisma.refund.count({ where: { providerPaymentId: dup.id } })).toBe(1);
      expect(await audits('REFUND_APPROVED', id)).toHaveLength(1);
      expect(await audits('REFUND_REQUESTED', id)).toHaveLength(1);
      expect((await approve(p.ledger.id)).status).toBe(409); // the applied payment is never selectable
    });
  });

  // =============================================================================================== M. customer views, DTO, privacy, static guards
  describe('customer views, privacy and static guards', () => {
    it('76. GET /orders/:id/refunds walks REFUND_PENDING -> REFUND_PROCESSING -> REFUNDED with safe fields only', async () => {
      await quiesce();
      const c = await cancelPaid();
      const get = () => request(app).get(`/api/v1/orders/${c.order.id}/refunds`).set(bearer(who.custA.token));
      let res = await get();
      expect(res.body.data).toMatchObject({ orderId: c.order.id, cancellation: { state: 'CANCELLED', allowed: false }, refund: { state: 'REFUND_PENDING' } });
      expect(res.body.data.refunds).toHaveLength(1);
      await runWorker();
      expect((await get()).body.data.refund.state).toBe('REFUND_PROCESSING');
      mock.setRefundStatus(providerRefundFor(c.refund.id)!.providerRefundId, 'PROCESSED');
      await dueRefund(c.refund.id);
      await runWorker('p7c-view');
      res = await get();
      expect(res.body.data.refund.state).toBe('REFUNDED');
      const item = res.body.data.refunds[0];
      expect(Object.keys(item).sort()).toEqual(['amount', 'currency', 'id', 'processedAt', 'requestedAt', 'state']);
      expect(JSON.stringify(res.body)).not.toMatch(/providerRefundId|rfnd_|lockedBy|lockedUntil|attemptCount|reviewFlag|failureCode|failureReason|providerPaymentId|pay_mock|reasonNote|requestedByUserId/);
    });

    it('77. the customer order DTO gains additive cancellation / refund fields (detail and list), with the right availability per state', async () => {
      const pending = await mkOrder(who.custA.profileId!);
      const paid = await payOrder();
      const accepted = await payOrder();
      await prisma.order.update({ where: { id: accepted.order.id }, data: { status: 'ACCEPTED' } });
      const detail = await request(app).get(`/api/v1/orders/${pending.id}`).set(bearer(who.custA.token));
      expect(detail.body.data).toMatchObject({ cancellation: { state: 'CANCELLATION_AVAILABLE', allowed: true }, refund: { state: 'NO_REFUND' } });
      const list = await request(app).get('/api/v1/orders/my-orders').set(bearer(who.custA.token));
      const by = (id: string) => list.body.data.find((o: { id: string }) => o.id === id);
      expect(by(pending.id).cancellation).toEqual({ state: 'CANCELLATION_AVAILABLE', allowed: true });
      expect(by(paid.order.id).cancellation).toEqual({ state: 'CANCELLATION_AVAILABLE', allowed: true });
      expect(by(accepted.order.id).cancellation).toEqual({ state: 'CANCELLATION_NOT_ALLOWED', allowed: false });
      expect(by(paid.order.id).refund).toEqual({ state: 'NO_REFUND' });
      expect(JSON.stringify(detail.body)).not.toMatch(/providerRefundId|pricingSnapshot|paidByProviderPaymentId/);
    });

    it('78. the admin projections expose ids, statuses and amounts only (no lease fields, no provider payloads); filters work', async () => {
      await quiesce();
      const c = await cancelPaid();
      await runWorker();
      const list = await request(app).get('/api/v1/admin/refunds?status=PROCESSING&trigger=CUSTOMER_CANCELLATION&pageSize=100').set(bearer(who.admin.token));
      expect(list.status).toBe(200);
      const item = list.body.data.items.find((i: { id: string }) => i.id === c.refund.id);
      expect(item).toMatchObject({ status: 'PROCESSING', providerStatus: 'PENDING', trigger: 'CUSTOMER_CANCELLATION', order: { id: c.order.id, status: 'CANCELLED', paymentStatus: 'PAID' } });
      expect(list.body.data.items.every((i: { status: string }) => i.status === 'PROCESSING')).toBe(true);
      expect(list.body.data.review).toHaveProperty('refundsInReview');
      const text = JSON.stringify(list.body);
      expect(text).not.toMatch(/lockedBy|lockedUntil|nextAttemptAt|signature|payload/);
      const review = await request(app).get('/api/v1/admin/refunds?reviewOnly=true&pageSize=100').set(bearer(who.md.token));
      expect(review.status).toBe(200);
      expect(review.body.data.items.every((i: { status: string; reviewFlag: string | null }) => ['REVIEW', 'UNKNOWN'].includes(i.status) || i.reviewFlag)).toBe(true);
    });

    it('79. PRIVACY: after complete flows no secret, signature, raw payload or payment-instrument data exists in refunds, events or audit rows; logs carry ids only', async () => {
      await quiesce();
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const c = await cancelPaid();
      await runWorker();
      const pr = providerRefundFor(c.refund.id)!;
      const pii = mock.buildRefundWebhook('refund.processed', { ...pr, status: 'PROCESSED' }, { eventId: `evt_${ts}_79` });
      const withPii = JSON.parse(pii.raw.toString());
      withPii.payload.refund.entity = { ...withPii.payload.refund.entity, notes: { email: 'secret.person@pii.test', vpa: 'secret@okbank' }, acquirer_data: { arn: 'ARN123SECRET' }, card: { last4: '4242' } };
      const raw = Buffer.from(JSON.stringify(withPii));
      await webhook(raw, { ...pii.headers, 'x-razorpay-signature': mock.signWebhook(raw) });
      const dump = JSON.stringify([
        await prisma.refund.findMany({ where: { orderId: c.order.id } }),
        await prisma.paymentWebhookEvent.findMany({ where: { providerPaymentId: pr.providerPaymentId } }),
        await prisma.auditLog.findMany({ where: { OR: [{ entityId: c.refund.id }, { entityId: c.order.id }] } })
      ]);
      for (const secret of ['secret.person@pii.test', 'secret@okbank', 'ARN123SECRET', '4242', MOCK_KEY_SECRET, MOCK_WEBHOOK_SECRET, pii.headers['x-razorpay-signature'], raw.toString('utf8')]) expect(dump.includes(secret), secret.slice(0, 14)).toBe(false);
      const printed = [...log.mock.calls, ...err.mock.calls].map((x) => x.map(String).join(' ')).join('\n');
      expect(printed).not.toMatch(new RegExp(`${MOCK_KEY_SECRET}|${MOCK_WEBHOOK_SECRET}|secret.person|ARN123SECRET`));
    });

    it('80. static guards: only the cancellation service passes refundIntentId; only the refund settlement writes Order.paymentStatus=REFUNDED; the refund module never writes Order.status; no PB FAILED refund state exists', () => {
      const root = join(__dirname, '..');
      const walk = (dir: string, out: string[] = []) => {
        for (const n of readdirSync(dir)) {
          const full = join(dir, n);
          if (statSync(full).isDirectory()) {
            if (n !== 'tests') walk(full, out);
          } else if (full.endsWith('.ts')) out.push(full);
        }
        return out;
      };
      const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      const files = walk(root);
      const passingIntent = files.filter((f) => /refundIntentId\s*:/.test(strip(readFileSync(f, 'utf8'))) && !f.endsWith('orderTransition.service.ts')).map((f) => f.split(/[\\/]/).pop());
      expect(passingIntent).toEqual(['cancellation.service.ts']);
      const refundedWriters = files.filter((f) => /paymentStatus\s*:\s*'REFUNDED'/.test(strip(readFileSync(f, 'utf8')))).map((f) => f.split(/[\\/]/).pop());
      expect(refundedWriters).toEqual(['refundSettlement.service.ts']);
      for (const f of files.filter((x) => x.includes(`${join('modules', 'refund')}`))) {
        expect(strip(readFileSync(f, 'utf8')), f).not.toMatch(/\.order\.(update|updateMany|upsert)\s*\(\s*\{[^}]*\bstatus\s*:/);
        expect(strip(readFileSync(f, 'utf8')), f).not.toMatch(/'FAILED'\s*as\s*RefundStatus|REFUND_STATUS\.FAILED/);
      }
    });
  });
});
