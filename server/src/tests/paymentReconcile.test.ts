import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { parsePaymentConfig, resetPaymentConfig, setPaymentConfigForTests } from '../config/paymentConfig.js';
import { getPaymentProvider } from '../modules/payment/providerRegistry.js';
import { MockPaymentProvider } from '../modules/payment/mock.provider.js';
import { PaymentReconciliationService } from '../modules/payment/paymentReconciliation.service.js';
import { reconcileDryRun } from '../modules/payment/paymentReconcileDryRun.js';

/**
 * The reconciliation pass the production entry point runs: delayed, duplicate, failed and mismatched provider payments, idempotency,
 * dry-run purity and the audit trail. Real PostgreSQL, mock provider (no network, no credentials).
 */
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const mock = getPaymentProvider() as MockPaymentProvider;
const sign = (userId: string, email: string, roles: RoleEnum[]) => jwt.sign({ userId, email, roles }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('payment reconciliation (production pass)', () => {
  const ts = Date.now();
  let seq = 0;
  let token = '';
  let profileId = '';

  beforeAll(async () => {
    setPaymentConfigForTests(parsePaymentConfig({ PAYMENT_REFUND_INLINE_SUBMIT: 'false' }, 'test'));
    const email = `rc_${ts}@test.com`;
    const u = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash('x', 4), roles: { create: [{ role: RoleEnum.CUSTOMER }] }, customerProfile: { create: { fullName: 'RC', referralCode: `PB-RC${ts}` } } },
      include: { customerProfile: true }
    });
    profileId = u.customerProfile!.id;
    token = sign(u.id, email, [RoleEnum.CUSTOMER]);
  });
  beforeEach(() => mock.reset());
  afterEach(() => resetPaymentConfig());
  afterAll(async () => { await prisma.$disconnect(); });

  /** An unpaid order with an open payment session whose reconciliation is due now. */
  async function openSession() {
    const n = ++seq;
    const order = await prisma.order.create({
      data: { orderNumber: `RC-${ts}-${n}`, totalAmount: 100, netAmount: '145.50', customerProfileId: profileId, status: 'PENDING', paymentStatus: 'PENDING', paymentMethod: 'ONLINE', orderType: 'DIRECT' } as never
    });
    const s = await request(app).post(`/api/v1/orders/${order.id}/payment-attempts`).set(bearer(token)).send({});
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    await prisma.payment.update({ where: { id: s.body.data.attemptId }, data: { nextAttemptAt: new Date(Date.now() - 1000), lockedUntil: null, lockedBy: null } });
    return { order, attemptId: s.body.data.attemptId as string, providerOrderId: s.body.data.providerOrderId as string };
  }
  const orderOf = (id: string) => prisma.order.findUniqueOrThrow({ where: { id } });
  const ledger = (orderId: string) => prisma.providerPayment.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } });
  const due = (attemptId: string) => prisma.payment.update({ where: { id: attemptId }, data: { nextAttemptAt: new Date(Date.now() - 1000), lockedUntil: null, lockedBy: null } });

  it('DELAYED: a payment captured at the provider with no webhook/verification is settled by the pass; a second pass changes nothing', async () => {
    const { order, providerOrderId } = await openSession();
    mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
    expect((await orderOf(order.id)).paymentStatus).toBe('PENDING');

    const stats = await PaymentReconciliationService.runOnce({ limit: 200 });
    expect(stats.sessionsSettled).toBeGreaterThanOrEqual(1);
    const paid = await orderOf(order.id);
    expect(paid.paymentStatus).toBe('PAID');
    expect(paid.status).toBe('CONFIRMED');
    expect(await ledger(order.id)).toHaveLength(1);
    expect((await ledger(order.id))[0].reconciliationStatus).toBe('APPLIED');
    expect(await prisma.orderEvent.count({ where: { orderId: order.id, toStatus: 'CONFIRMED' } })).toBe(1);

    await PaymentReconciliationService.runOnce({ limit: 200 });
    expect(await ledger(order.id)).toHaveLength(1);
    expect(await prisma.orderEvent.count({ where: { orderId: order.id, toStatus: 'CONFIRMED' } })).toBe(1);
  });

  it('DUPLICATE: two captured payments for one order pay it once; the second is kept and flagged, never auto-refunded', async () => {
    const { order, providerOrderId } = await openSession();
    mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
    mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
    await PaymentReconciliationService.runOnce({ limit: 200 });

    expect((await orderOf(order.id)).paymentStatus).toBe('PAID');
    const rows = await ledger(order.id);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.reconciliationStatus === 'APPLIED')).toHaveLength(1);
    expect(rows.filter((r) => r.reconciliationStatus === 'DUPLICATE')).toHaveLength(1);
    expect(await prisma.refund.count({ where: { orderId: order.id } })).toBe(0);
    expect(await prisma.orderEvent.count({ where: { orderId: order.id, toStatus: 'CONFIRMED' } })).toBe(1);
  });

  it('FAILED: a failed payment never pays the order, and a later successful retry still does', async () => {
    const { order, attemptId, providerOrderId } = await openSession();
    mock.simulatePayment(providerOrderId, { status: 'FAILED', errorCode: 'BAD_REQUEST_ERROR' });
    await PaymentReconciliationService.runOnce({ limit: 200 });
    expect((await orderOf(order.id)).paymentStatus).toBe('PENDING');
    expect((await orderOf(order.id)).status).toBe('PENDING');

    mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
    await due(attemptId);
    await PaymentReconciliationService.runOnce({ limit: 200 });
    expect((await orderOf(order.id)).paymentStatus).toBe('PAID');
  });

  it('MISMATCHED amount or currency: kept and flagged for review, the order is NOT paid', async () => {
    const wrongAmount = await openSession();
    mock.simulatePayment(wrongAmount.providerOrderId, { status: 'CAPTURED', amountMinor: 100 });
    const wrongCurrency = await openSession();
    mock.simulatePayment(wrongCurrency.providerOrderId, { status: 'CAPTURED', currency: 'USD' });
    await PaymentReconciliationService.runOnce({ limit: 200 });

    for (const [c, expected] of [[wrongAmount, 'AMOUNT_MISMATCH'], [wrongCurrency, 'CURRENCY_MISMATCH']] as const) {
      expect((await orderOf(c.order.id)).paymentStatus, expected).toBe('PENDING');
      const rows = await ledger(c.order.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].reconciliationStatus).toBe(expected);
    }
    expect((await PaymentReconciliationService.reviewReport()).flaggedLedgerRows).toBeGreaterThanOrEqual(2);
  });

  it('REPEATED/CONCURRENT runs never produce a second settlement, event or refund', async () => {
    const { order, providerOrderId } = await openSession();
    mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
    await Promise.all([PaymentReconciliationService.runOnce({ limit: 200 }), PaymentReconciliationService.runOnce({ limit: 200 }), PaymentReconciliationService.runOnce({ limit: 200 })]);
    await PaymentReconciliationService.runOnce({ limit: 200 });
    expect((await orderOf(order.id)).paymentStatus).toBe('PAID');
    expect(await ledger(order.id)).toHaveLength(1);
    expect(await prisma.orderEvent.count({ where: { orderId: order.id, toStatus: 'CONFIRMED' } })).toBe(1);
    expect(await prisma.refund.count({ where: { orderId: order.id } })).toBe(0);
  });

  describe('captured ledger rows that were never applied are re-verified with the provider first', () => {
    async function stalePendingRow(opts: { existsAtProvider: boolean; sameOrder?: boolean }) {
      const { order, attemptId, providerOrderId } = await openSession();
      await prisma.payment.update({ where: { id: attemptId }, data: { nextAttemptAt: null } }); // only the ledger step may act
      const providerPaymentId = opts.existsAtProvider ? mock.simulatePayment(providerOrderId, { status: 'CAPTURED' }).providerPaymentId : `pay_missing_${ts}_${++seq}`;
      await prisma.providerPayment.create({
        data: { provider: 'mock', providerPaymentId, providerOrderId, paymentId: attemptId, orderId: order.id, amount: '145.50', currency: 'INR', providerStatus: 'CAPTURED', firstSeenVia: 'RECONCILIATION', reconciliationStatus: 'PENDING' }
      });
      return order;
    }

    it('applies when the provider confirms the payment is captured', async () => {
      const order = await stalePendingRow({ existsAtProvider: true });
      const stats = await PaymentReconciliationService.runOnce({ limit: 200 });
      expect(stats.ledgerApplied).toBeGreaterThanOrEqual(1);
      expect((await orderOf(order.id)).paymentStatus).toBe('PAID');
    });

    it('applies NOTHING when the provider does not know the payment; the row stays pending and is retried next run', async () => {
      const order = await stalePendingRow({ existsAtProvider: false });
      await PaymentReconciliationService.runOnce({ limit: 200 });
      expect((await orderOf(order.id)).paymentStatus).toBe('PENDING');
      expect((await ledger(order.id))[0].reconciliationStatus).toBe('PENDING');
    });

    it('a provider outage leaves the row untouched (recorded as an error, retried next run)', async () => {
      const order = await stalePendingRow({ existsAtProvider: true });
      const original = mock.fetchPayment.bind(mock);
      mock.fetchPayment = async () => { throw new Error('provider down'); };
      try {
        const stats = await PaymentReconciliationService.runOnce({ limit: 200 });
        expect(stats.providerErrors).toBeGreaterThanOrEqual(1);
        expect((await orderOf(order.id)).paymentStatus).toBe('PENDING');
        expect((await ledger(order.id))[0].reconciliationStatus).toBe('PENDING');
      } finally {
        mock.fetchPayment = original;
      }
      await PaymentReconciliationService.runOnce({ limit: 200 }); // retry succeeds
      expect((await orderOf(order.id)).paymentStatus).toBe('PAID');
    });
  });

  it('AUTHORIZED only is never treated as paid', async () => {
    const { order, providerOrderId } = await openSession();
    mock.simulatePayment(providerOrderId, { status: 'AUTHORIZED' });
    await PaymentReconciliationService.runOnce({ limit: 200 });
    expect((await orderOf(order.id)).paymentStatus).toBe('PENDING');
  });

  it('DRY RUN writes nothing and classifies each case (provider reads only)', async () => {
    const delayed = await openSession();
    mock.simulatePayment(delayed.providerOrderId, { status: 'CAPTURED' });
    const nothing = await openSession();
    const mismatch = await openSession();
    mock.simulatePayment(mismatch.providerOrderId, { status: 'CAPTURED', amountMinor: 100 });
    const failed = await openSession();
    mock.simulatePayment(failed.providerOrderId, { status: 'FAILED', errorCode: 'X' });

    const before = { ledger: await prisma.providerPayment.count(), audit: await prisma.auditLog.count(), events: await prisma.orderEvent.count() };
    const report = await reconcileDryRun({ limit: 500 });
    const after = { ledger: await prisma.providerPayment.count(), audit: await prisma.auditLog.count(), events: await prisma.orderEvent.count() };
    expect(after).toEqual(before); // nothing was written
    expect((await orderOf(delayed.order.id)).paymentStatus).toBe('PENDING');

    const cls = (s: { order: { orderNumber: string } }) => report.sessions.find((x) => x.orderNumber === s.order.orderNumber)?.classification;
    expect(cls(delayed)).toBe('WOULD_SETTLE');
    expect(cls(nothing)).toBe('NOTHING_AT_PROVIDER');
    expect(cls(mismatch)).toBe('AMOUNT_MISMATCH');
    expect(cls(failed)).toBe('FAILED_ONLY');
    expect(JSON.stringify(report)).not.toMatch(/signature|secret|token|key/i);
  });

  it('a provider outage is reported as PROVIDER_ERROR in the dry run and as an error count (not a settlement) in a real pass', async () => {
    const { order } = await openSession();
    const original = mock.listOrderPayments.bind(mock);
    mock.listOrderPayments = async () => { throw new Error('provider down'); };
    try {
      const report = await reconcileDryRun({ limit: 500 });
      expect(report.counts.PROVIDER_ERROR).toBeGreaterThanOrEqual(1);
      const stats = await PaymentReconciliationService.runOnce({ limit: 200 });
      expect(stats.providerErrors).toBeGreaterThanOrEqual(1);
      expect((await orderOf(order.id)).paymentStatus).toBe('PENDING');
    } finally {
      mock.listOrderPayments = original;
    }
  });
});
