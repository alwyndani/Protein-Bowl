import { Prisma, ProviderPayment, Refund } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../config/database.js';
import { getPaymentConfig } from '../../config/paymentConfig.js';
import { AuditContext, AuditService } from '../audit/audit.service.js';
import { fromMinorUnits, toMinorUnits } from '../payment/money.js';
import { Tx, backoffMs, lockOrder, lockProviderPaymentById, lockRefund, paymentAlert } from '../payment/paymentOps.js';
import { providerStatusMayAdvance } from '../payment/paymentStatus.js';
import type { ProviderRefund } from '../payment/provider.types.js';
import { REFUND_STATUS, REFUND_TRIGGER, RefundStatus, refundMayMove } from './refundStatus.js';

export type RefundEvidenceSource = 'API' | 'WEBHOOK' | 'RECONCILIATION' | 'MANUAL';

export type RefundApplyOutcome = 'APPLIED' | 'NO_CHANGE' | 'FLAGGED' | 'NOT_FOUND';

export interface RefundApplyResult {
  outcome: RefundApplyOutcome;
  refundId: string | null;
  status: string | null;
  orderPaymentStatus: string | null;
}

/** The refund's own money, exact: a refund counts as "money that left" once the provider says PROCESSED (or PB says so). */
export async function processedRefundTotal(tx: Tx, providerPaymentRowId: string): Promise<Decimal> {
  const rows = await tx.refund.findMany({
    where: { providerPaymentId: providerPaymentRowId, OR: [{ status: REFUND_STATUS.PROCESSED }, { providerStatus: 'PROCESSED' }] },
    select: { amount: true }
  });
  return rows.reduce((acc, r) => acc.add(r.amount), new Decimal(0));
}

/**
 * THE ONLY place that turns trusted provider refund evidence into Protein Bowl refund state. Every source (API response,
 * webhook, reconciliation, manual recovery) converges here: one transaction, fixed lock order
 * (Order -> ProviderPayment -> Refund), strict PB state machine, PROCESSED is monotonic, no floating-point money.
 * When the FULL refund of the order's effective payment is PROCESSED it moves Order.paymentStatus to REFUNDED (under the order
 * lock). It never writes Order.status: that belongs to OrderTransitionService.
 */
export class RefundSettlementService {
  public static async apply(input: { refundId: string; evidence: ProviderRefund; via: RefundEvidenceSource; context?: AuditContext }, tx?: Tx): Promise<RefundApplyResult> {
    if (tx) return await this.run(input, tx);
    const result = await prisma.$transaction((inner) => this.run(input, inner), { maxWait: 10000, timeout: 20000 });
    return result;
  }

  private static async run(input: { refundId: string; evidence: ProviderRefund; via: RefundEvidenceSource; context?: AuditContext }, tx: Tx): Promise<RefundApplyResult> {
    const { evidence } = input;
    const peek = await tx.refund.findUnique({ where: { id: input.refundId }, select: { orderId: true, providerPaymentId: true } });
    if (!peek) return { outcome: 'NOT_FOUND', refundId: null, status: null, orderPaymentStatus: null };

    await lockOrder(tx, peek.orderId);
    await lockProviderPaymentById(tx, peek.providerPaymentId);
    await lockRefund(tx, input.refundId);

    const refund = await tx.refund.findUnique({ where: { id: input.refundId } });
    const ledger = await tx.providerPayment.findUnique({ where: { id: peek.providerPaymentId } });
    const order = await tx.order.findUnique({ where: { id: peek.orderId }, select: { id: true, orderNumber: true, status: true, paymentStatus: true, paidByProviderPaymentId: true } });
    if (!refund || !ledger || !order) return { outcome: 'NOT_FOUND', refundId: null, status: null, orderPaymentStatus: null };

    const done = (outcome: RefundApplyOutcome, status: string): RefundApplyResult => ({ outcome, refundId: refund.id, status, orderPaymentStatus: order.paymentStatus });
    const ownReceipt = refund.trigger !== REFUND_TRIGGER.EXTERNAL;

    // ---- the evidence must describe THIS refund of THIS payment, with the same amount and currency
    let mismatch: string | null = null;
    if (evidence.providerPaymentId !== ledger.providerPaymentId) mismatch = 'PROVIDER_PAYMENT_MISMATCH';
    else if (evidence.amountMinor !== toMinorUnits(refund.amount)) mismatch = 'PROVIDER_AMOUNT_MISMATCH';
    else if (evidence.currency !== refund.currency) mismatch = 'PROVIDER_CURRENCY_MISMATCH';
    else if (ownReceipt && evidence.receipt !== refund.id) mismatch = 'PROVIDER_RECEIPT_MISMATCH';
    else if (refund.providerRefundId && refund.providerRefundId !== evidence.providerRefundId) mismatch = 'PROVIDER_REFUND_ID_MISMATCH';
    if (!mismatch && !refund.providerRefundId) {
      const clash = await tx.refund.findFirst({ where: { provider: refund.provider, providerRefundId: evidence.providerRefundId, NOT: { id: refund.id } }, select: { id: true } });
      if (clash) mismatch = 'PROVIDER_REFUND_ID_CONFLICT';
    }
    if (mismatch) return await this.flag(tx, refund, order, mismatch, input);

    const current = refund.status as RefundStatus;

    // ---- terminal / anomalous situations
    if (current === REFUND_STATUS.PROCESSED) {
      if (evidence.status !== 'PROCESSED') return await this.flag(tx, refund, order, 'PROVIDER_STATUS_REGRESSION_IGNORED', input, false);
      return done('NO_CHANGE', current);
    }
    if (current === REFUND_STATUS.ABANDONED) {
      // An operator closed this intent, yet the provider holds a refund for it: the money situation must be looked at by a human.
      await tx.refund.update({ where: { id: refund.id }, data: { providerRefundId: refund.providerRefundId ?? evidence.providerRefundId, providerStatus: evidence.status } });
      return await this.flag(tx, refund, order, 'ABANDONED_BUT_PROVIDER_REFUND_EXISTS', input, false);
    }
    if (current === REFUND_STATUS.REQUESTED) {
      // The provider cannot know a refund we have not submitted yet.
      return await this.flag(tx, refund, order, 'EVIDENCE_BEFORE_SUBMISSION', input, false);
    }

    // ---- provider status -> PB status (pending -> PROCESSING, processed -> PROCESSED, failed -> REVIEW)
    const target: RefundStatus = evidence.status === 'PROCESSED' ? REFUND_STATUS.PROCESSED : evidence.status === 'FAILED' ? REFUND_STATUS.REVIEW : REFUND_STATUS.PROCESSING;
    const next: RefundStatus = target === current || refundMayMove(current, target) ? target : current;
    const now = new Date();

    const data: Prisma.RefundUpdateInput = {
      providerRefundId: refund.providerRefundId ?? evidence.providerRefundId,
      providerStatus: evidence.status,
      speedProcessed: evidence.speedProcessed ?? refund.speedProcessed,
      status: next,
      lockedUntil: null,
      lockedBy: null
    };
    if (evidence.status === 'FAILED') {
      data.failureCode = 'PROVIDER_REFUND_FAILED';
      data.reviewFlag = 'PROVIDER_REFUND_FAILED';
    } else {
      data.failureCode = null; // the provider evidence resolved the earlier uncertainty (timeout, lookup...)
      if (refund.reviewFlag && refund.reviewFlag !== 'EXTERNAL_REFUND' && refund.reviewFlag !== 'EXTERNAL_ACKNOWLEDGED') data.reviewFlag = null;
    }
    if (next === REFUND_STATUS.PROCESSED) {
      data.processedAt = now;
      data.nextAttemptAt = null;
    } else if (next === REFUND_STATUS.PROCESSING) {
      data.nextAttemptAt = new Date(now.getTime() + Math.max(backoffMs(refund.attemptCount), getPaymentConfig().retry.baseMs));
    } else {
      data.nextAttemptAt = null; // REVIEW: waits for a human (or later trusted provider evidence)
    }
    await tx.refund.update({ where: { id: refund.id }, data });

    const moved = next !== current;
    if (current === REFUND_STATUS.SUBMITTING && input.via === 'API') {
      await this.audit(tx, 'REFUND_SUBMITTED', refund, { providerStatus: evidence.status, orderNumber: order.orderNumber }, input);
    }
    if (moved && (current === REFUND_STATUS.UNKNOWN || current === REFUND_STATUS.REVIEW) && next !== REFUND_STATUS.REVIEW) {
      await this.audit(tx, 'REFUND_RECOVERED', refund, { from: current, to: next, via: input.via, orderNumber: order.orderNumber }, input);
    }
    if (next === REFUND_STATUS.REVIEW) {
      await this.audit(tx, 'REFUND_FLAGGED', refund, { flag: 'PROVIDER_REFUND_FAILED', orderNumber: order.orderNumber }, input);
      paymentAlert('refund.provider_failed', { refundId: refund.id, orderId: order.id });
    }

    let orderPaymentStatus = order.paymentStatus;
    if (next === REFUND_STATUS.PROCESSED) {
      orderPaymentStatus = await this.afterProcessed(tx, { ...refund, ...(data as object) } as Refund, ledger, order, input);
    }
    return { outcome: moved || next === REFUND_STATUS.PROCESSING ? 'APPLIED' : 'NO_CHANGE', refundId: refund.id, status: next, orderPaymentStatus };
  }

  /**
   * A refund just became PROCESSED. Count money; when the full captured amount is refunded and this payment is the order's
   * effective one: ledger -> REFUNDED (monotonic) and Order.paymentStatus -> REFUNDED, under the order lock already held.
   */
  public static async afterProcessed(
    tx: Tx,
    refund: Pick<Refund, 'id' | 'trigger' | 'amount'>,
    ledger: ProviderPayment,
    order: { id: string; orderNumber: string; paymentStatus: string; paidByProviderPaymentId: string | null },
    input: { via: RefundEvidenceSource; context?: AuditContext }
  ): Promise<string> {
    const refunded = await processedRefundTotal(tx, ledger.id);
    let orderPaymentStatus = order.paymentStatus;

    if (refunded.greaterThan(ledger.amount)) {
      await tx.refund.update({ where: { id: refund.id }, data: { reviewFlag: 'OVER_REFUNDED' } });
      await this.audit(tx, 'REFUND_FLAGGED', refund, { flag: 'OVER_REFUNDED', orderNumber: order.orderNumber }, input);
      paymentAlert('refund.over_refunded', { refundId: refund.id, orderId: order.id });
    } else if (refunded.equals(ledger.amount)) {
      if (providerStatusMayAdvance(ledger.providerStatus, 'REFUNDED')) {
        await tx.providerPayment.update({ where: { id: ledger.id }, data: { providerStatus: 'REFUNDED' } });
      }
      if (ledger.id === order.paidByProviderPaymentId && order.paymentStatus !== 'REFUNDED') {
        const res = await tx.order.updateMany({ where: { id: order.id, paymentStatus: order.paymentStatus }, data: { paymentStatus: 'REFUNDED' } });
        if (res.count === 1) orderPaymentStatus = 'REFUNDED';
      }
    }
    await this.audit(
      tx,
      'REFUND_PROCESSED',
      refund,
      { orderNumber: order.orderNumber, amount: refund.amount.toFixed(2), trigger: refund.trigger, orderPaymentStatus, via: input.via },
      input
    );
    return orderPaymentStatus;
  }

  /** Record that something is wrong (without ever discarding provider evidence). Status moves to REVIEW only where the PB state machine allows it. */
  private static async flag(
    tx: Tx,
    refund: Refund,
    order: { id: string; orderNumber: string; paymentStatus: string },
    flagCode: string,
    input: { via: RefundEvidenceSource; context?: AuditContext },
    moveToReview = true
  ): Promise<RefundApplyResult> {
    const toReview = moveToReview && refundMayMove(refund.status, REFUND_STATUS.REVIEW);
    await tx.refund.update({
      where: { id: refund.id },
      data: {
        reviewFlag: flagCode,
        status: toReview ? REFUND_STATUS.REVIEW : refund.status,
        failureCode: toReview ? flagCode : refund.failureCode,
        lockedUntil: null,
        lockedBy: null,
        nextAttemptAt: toReview ? null : refund.nextAttemptAt
      }
    });
    if (refund.reviewFlag !== flagCode) {
      await this.audit(tx, 'REFUND_FLAGGED', refund, { flag: flagCode, orderNumber: order.orderNumber, via: input.via }, input);
      paymentAlert('refund.flagged', { refundId: refund.id, orderId: order.id, outcome: flagCode });
    }
    return { outcome: 'FLAGGED', refundId: refund.id, status: toReview ? REFUND_STATUS.REVIEW : refund.status, orderPaymentStatus: order.paymentStatus };
  }

  /**
   * Trusted provider evidence of a refund Protein Bowl did not create (e.g. made from the provider dashboard) against a KNOWN
   * ProviderPayment. It is ledgered, counted as refunded money, and flagged for review. Idempotent per (provider, providerRefundId).
   */
  public static async recordExternal(
    input: { ledgerId: string; evidence: ProviderRefund; via: RefundEvidenceSource; context?: AuditContext },
    tx?: Tx
  ): Promise<{ created: boolean; refundId: string | null }> {
    if (!tx) return await prisma.$transaction((inner) => this.recordExternal(input, inner), { maxWait: 10000, timeout: 20000 });

    const peek = await tx.providerPayment.findUnique({ where: { id: input.ledgerId }, select: { orderId: true } });
    if (!peek) return { created: false, refundId: null };
    await lockOrder(tx, peek.orderId);
    await lockProviderPaymentById(tx, input.ledgerId);

    const ledger = await tx.providerPayment.findUniqueOrThrow({ where: { id: input.ledgerId } });
    const order = await tx.order.findUniqueOrThrow({ where: { id: ledger.orderId }, select: { id: true, orderNumber: true, status: true, paymentStatus: true, paidByProviderPaymentId: true } });
    const ev = input.evidence;

    const existing = await tx.refund.findFirst({ where: { provider: ledger.provider, providerRefundId: ev.providerRefundId }, select: { id: true } });
    if (existing) return { created: false, refundId: existing.id };
    if (ev.providerPaymentId !== ledger.providerPaymentId) return { created: false, refundId: null };

    const status = ev.status === 'PROCESSED' ? REFUND_STATUS.PROCESSED : ev.status === 'FAILED' ? REFUND_STATUS.REVIEW : REFUND_STATUS.PROCESSING;
    const now = new Date();
    const created = await tx.refund.create({
      data: {
        orderId: ledger.orderId,
        providerPaymentId: ledger.id,
        paymentId: ledger.paymentId,
        provider: ledger.provider,
        providerRefundId: ev.providerRefundId,
        amount: fromMinorUnits(ev.amountMinor),
        currency: ev.currency,
        trigger: REFUND_TRIGGER.EXTERNAL,
        reasonCode: 'EXTERNAL_REFUND',
        requestedByKind: 'SYSTEM',
        status,
        providerStatus: ev.status,
        speedProcessed: ev.speedProcessed,
        reviewFlag: 'EXTERNAL_REFUND',
        failureCode: ev.status === 'FAILED' ? 'PROVIDER_REFUND_FAILED' : null,
        processedAt: status === REFUND_STATUS.PROCESSED ? now : null,
        nextAttemptAt: status === REFUND_STATUS.PROCESSING ? new Date(now.getTime() + getPaymentConfig().retry.baseMs) : null
      }
    });
    await this.audit(tx, 'REFUND_EXTERNAL_RECORDED', created, { orderNumber: order.orderNumber, amount: created.amount.toFixed(2), providerStatus: ev.status, via: input.via }, input);
    paymentAlert('refund.external_recorded', { refundId: created.id, orderId: order.id });
    if (status === REFUND_STATUS.PROCESSED) await this.afterProcessed(tx, created, ledger, order, input);
    return { created: true, refundId: created.id };
  }

  private static async audit(tx: Tx, action: string, refund: Pick<Refund, 'id'>, payload: Record<string, unknown>, input: { context?: AuditContext }): Promise<void> {
    await AuditService.record({ actor: null, action, entity: 'Refund', entityId: refund.id, payload, context: input.context }, tx);
  }
}
