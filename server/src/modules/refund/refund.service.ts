import { Prisma, ProviderPayment, Refund } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { getPaymentConfig } from '../../config/paymentConfig.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditContext, AuditService } from '../audit/audit.service.js';
import { toMinorUnits } from '../payment/money.js';
import { Tx, backoffMs, lockOrder, lockProviderPaymentById, lockRefund, paymentAlert, safeCode } from '../payment/paymentOps.js';
import { DEFAULT_CURRENCY, RECON } from '../payment/paymentStatus.js';
import { PaymentProvider, ProviderDefiniteError, ProviderRefund, ProviderUnknownError } from '../payment/provider.types.js';
import { getPaymentProvider } from '../payment/providerRegistry.js';
import { PaymentSettlementService } from '../payment/paymentSettlement.service.js';
import { RefundSettlementService, processedRefundTotal } from './refundSettlement.service.js';
import { LIVE_REFUND_STATUSES, REFUND_STATUS, REFUND_TRIGGER, RefundTrigger } from './refundStatus.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CreateIntentParams {
  order: { id: string; orderNumber: string };
  ledgerId: string;
  trigger: RefundTrigger;
  reasonCode: string;
  reasonNote: string | null;
  requestedBy: { userId: string | null; kind: 'CUSTOMER' | 'ADMIN' | 'SYSTEM' };
  context?: AuditContext;
}

/**
 * Only these DOCUMENTED provider rejections prove that NO refund was created (checked 2026-10-10 against the Razorpay refund API
 * error table). Anything else - above all a duplicate-receipt or "already refunded/processed" answer, or a text we do not
 * recognise - does NOT prove absence, so such a refund can never be ABANDONED (which would allow a second intent).
 */
const NOTHING_CREATED_REJECTIONS = [
  /payment status should be captured/i,
  /greater than amount captured/i,
  /amount must be at least/i,
  /amount must be an integer/i,
  /amount cannot be blank/i,
  /does not have enough balance/i,
  /not supported for this payment method/i,
  /refunds cannot be created on your account/i
];
export function rejectionProvesNoRefund(detail: string | null | undefined): boolean {
  if (!detail) return false;
  if (/duplicate|already/i.test(detail)) return false;
  return NOTHING_CREATED_REJECTIONS.some((re) => re.test(detail));
}

export type ResolveOutcome = 'ADOPTED' | 'NOT_FOUND' | 'AMBIGUOUS' | 'REVIEW';

export type HandleRefundResult = { kind: 'APPLIED' } | { kind: 'RETRY'; reason: string } | { kind: 'IGNORE'; reason: string } | { kind: 'FAIL'; reason: string };

/**
 * Refund orchestration. Provider HTTP NEVER happens inside a database transaction here. The single provider create call per
 * Refund is guarded by the REQUESTED -> SUBMITTING compare-and-set; any uncertainty afterwards becomes UNKNOWN and is resolved
 * by looking the refund up by its exact receipt - never by creating a second refund.
 */
export class RefundService {
  // ================================================================================================ intent (inside the caller's transaction)
  /**
   * Create the FULL refund intent for ONE captured ProviderPayment. The caller MUST already hold the Order lock and the
   * ProviderPayment lock (in that order). The amount is the complete captured amount, calculated here - never supplied.
   * Returns the existing live refund (idempotent) when the same trigger already created one.
   */
  public static async createIntent(tx: Tx, p: CreateIntentParams): Promise<{ refund: Refund; created: boolean }> {
    const ledger = await tx.providerPayment.findUnique({ where: { id: p.ledgerId } });
    if (!ledger) throw new AppError('Payment not found', 404, 'PROVIDER_PAYMENT_NOT_FOUND');
    if (ledger.orderId !== p.order.id) throw new AppError('Payment does not belong to this order', 409, 'REFUND_NOT_ALLOWED');
    if (ledger.providerStatus !== 'CAPTURED') throw new AppError('Only a captured payment can be refunded', 409, 'REFUND_NOT_ALLOWED');
    if (ledger.currency !== DEFAULT_CURRENCY) throw new AppError('Unsupported payment currency', 409, 'REFUND_NOT_ALLOWED');
    toMinorUnits(ledger.amount); // exact whole paise or it throws

    const live = await tx.refund.findMany({ where: { providerPaymentId: ledger.id, status: { in: [...LIVE_REFUND_STATUSES] } } });
    const sameTrigger = live.find((r) => r.trigger === p.trigger && r.trigger !== REFUND_TRIGGER.EXTERNAL);
    if (sameTrigger && live.length === 1) return { refund: sameTrigger, created: false };
    if (live.some((r) => r.trigger === REFUND_TRIGGER.EXTERNAL)) {
      throw new AppError('Money was already refunded for this payment outside the application; this needs manual review', 409, 'EXTERNAL_REFUND_PRESENT');
    }
    if (live.length > 0) throw new AppError('A refund already exists for this payment', 409, 'REFUND_ALREADY_EXISTS');

    // Full-refund invariant: the refund is the COMPLETE remaining refundable amount, and nothing may have been refunded yet.
    const refundedAlready = await processedRefundTotal(tx, ledger.id);
    const remaining = ledger.amount.sub(refundedAlready);
    if (!refundedAlready.isZero() || !remaining.equals(ledger.amount) || !remaining.greaterThan(0)) {
      throw new AppError('This payment cannot be refunded in full', 409, 'REFUND_NOT_ALLOWED');
    }

    try {
      const refund = await tx.refund.create({
        data: {
          orderId: ledger.orderId,
          providerPaymentId: ledger.id,
          paymentId: ledger.paymentId,
          provider: ledger.provider,
          amount: remaining,
          currency: ledger.currency,
          trigger: p.trigger,
          reasonCode: p.reasonCode,
          reasonNote: p.reasonNote,
          requestedByUserId: p.requestedBy.userId,
          requestedByKind: p.requestedBy.kind,
          status: REFUND_STATUS.REQUESTED,
          speedRequested: 'normal',
          nextAttemptAt: new Date()
        }
      });
      await AuditService.record(
        {
          actor: p.requestedBy.userId ? { userId: p.requestedBy.userId, roles: [p.requestedBy.kind] } : null,
          action: 'REFUND_REQUESTED',
          entity: 'Refund',
          entityId: refund.id,
          payload: { orderNumber: p.order.orderNumber, amount: refund.amount.toFixed(2), currency: refund.currency, trigger: p.trigger, reasonCode: p.reasonCode },
          context: p.context
        },
        tx
      );
      return { refund, created: true };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError('A refund already exists for this payment', 409, 'REFUND_ALREADY_EXISTS');
      }
      throw err;
    }
  }

  /** Best-effort immediate submission after the creating transaction COMMITTED. Correctness never depends on it: the worker submits REQUESTED refunds. */
  public static kick(refundId: string | null | undefined): void {
    if (!refundId || !getPaymentConfig().refundInlineSubmit) return;
    void this.submit(refundId, `inline-${process.pid}`).catch(() => undefined);
  }

  // ================================================================================================ SUBMIT (the one provider create call)
  public static async submit(refundId: string, workerId: string): Promise<'NOT_SUBMITTABLE' | 'SUBMITTED' | 'UNKNOWN' | 'REVIEW'> {
    const cfg = getPaymentConfig();
    const provider = getPaymentProvider();

    // Single compare-and-set REQUESTED -> SUBMITTING under the refund row lock. After this a create call is NEVER repeated.
    const claimed = await prisma.$transaction(async (tx) => {
      await lockRefund(tx, refundId);
      const r = await tx.refund.findUnique({ where: { id: refundId }, include: { providerPayment: true, order: { select: { orderNumber: true } } } });
      if (!r || r.status !== REFUND_STATUS.REQUESTED) return null;
      const now = new Date();
      if (r.lockedUntil && r.lockedUntil > now && r.lockedBy !== workerId) return null;
      // Money that already left through an outside (EXTERNAL) refund must never be topped up by a Protein Bowl full refund:
      // refuse BEFORE any provider call and hand it to a human. (The SUBMITTING step is kept so the PB state machine is respected.)
      const outside = await tx.refund.count({ where: { providerPaymentId: r.providerPaymentId, trigger: REFUND_TRIGGER.EXTERNAL, status: { not: REFUND_STATUS.ABANDONED } } });
      await tx.refund.update({
        where: { id: r.id },
        data: {
          status: REFUND_STATUS.SUBMITTING,
          attemptCount: { increment: 1 },
          submittedAt: now,
          lockedUntil: new Date(now.getTime() + cfg.leaseMs),
          lockedBy: workerId,
          nextAttemptAt: new Date(now.getTime() + cfg.leaseMs)
        }
      });
      if (outside > 0) {
        await tx.refund.update({
          where: { id: r.id },
          data: { status: REFUND_STATUS.REVIEW, reviewFlag: 'EXTERNAL_REFUND_PRESENT', failureCode: 'EXTERNAL_REFUND_PRESENT', lockedUntil: null, lockedBy: null, nextAttemptAt: null }
        });
        await AuditService.record({ actor: null, action: 'REFUND_FLAGGED', entity: 'Refund', entityId: r.id, payload: { flag: 'EXTERNAL_REFUND_PRESENT', orderNumber: r.order.orderNumber, providerCalled: false } }, tx);
        return 'BLOCKED' as const;
      }
      return r;
    });
    if (claimed === 'BLOCKED') {
      paymentAlert('refund.blocked_by_external_refund', { refundId });
      return 'REVIEW';
    }
    if (!claimed) return 'NOT_SUBMITTABLE';

    const refund = claimed;
    if (refund.provider !== provider.name) {
      await this.markReview(refund.id, 'PROVIDER_MISMATCH', null);
      return 'REVIEW';
    }

    let evidence: ProviderRefund;
    try {
      evidence = await provider.createRefund({
        providerPaymentId: refund.providerPayment.providerPaymentId,
        amountMinor: toMinorUnits(refund.amount),
        currency: DEFAULT_CURRENCY,
        receipt: refund.id,
        notes: { pbRefundId: refund.id, pbOrderNumber: refund.order.orderNumber, source: 'protein-bowl' }
      });
    } catch (err) {
      if (err instanceof ProviderDefiniteError) {
        // A definite rejection may also be "duplicate receipt": a refund might already exist. Look first, then decide.
        try {
          const outcome = await this.resolveByLookup(refund.id, provider, 'API');
          if (outcome === 'ADOPTED') return 'SUBMITTED';
        } catch {
          /* lookup unavailable: fall through to REVIEW (never a second create) */
        }
        await this.markReview(refund.id, safeCode(err, 'PROVIDER_REJECTED'), err.detail, undefined, { provedNothingCreated: rejectionProvesNoRefund(err.detail) });
        return 'REVIEW';
      }
      await this.markUnknown(refund.id, safeCode(err, 'PROVIDER_UNAVAILABLE'));
      return 'UNKNOWN';
    }

    try {
      await RefundSettlementService.apply({ refundId: refund.id, evidence, via: 'API' });
      return 'SUBMITTED';
    } catch {
      // The provider answered but we could not record it: the refund may exist. UNKNOWN + lookup, never a second create.
      await this.markUnknown(refund.id, 'PERSISTENCE_FAILED_AFTER_PROVIDER_ANSWER').catch(() => undefined);
      return 'UNKNOWN';
    }
  }

  // ================================================================================================ UNKNOWN / PROCESSING / REVIEW helpers
  /** SUBMITTING -> UNKNOWN (CAS). The outcome of the provider call is unknown. */
  public static async markUnknown(refundId: string, code: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await lockRefund(tx, refundId);
      const r = await tx.refund.findUnique({ where: { id: refundId } });
      if (!r || r.status !== REFUND_STATUS.SUBMITTING) return;
      await tx.refund.update({
        where: { id: r.id },
        data: { status: REFUND_STATUS.UNKNOWN, failureCode: code.slice(0, 60), lockedUntil: null, lockedBy: null, nextAttemptAt: new Date(Date.now() + backoffMs(r.attemptCount)) }
      });
    });
  }

  /** (SUBMITTING | UNKNOWN | PROCESSING) -> REVIEW with a normalized code. Never invents a provider outcome. */
  public static async markReview(refundId: string, code: string, detail: string | null, context?: AuditContext, opts: { provedNothingCreated?: boolean } = {}): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await lockRefund(tx, refundId);
      const r = await tx.refund.findUnique({ where: { id: refundId }, include: { order: { select: { orderNumber: true } } } });
      if (!r) return;
      const reviewable: string[] = [REFUND_STATUS.SUBMITTING, REFUND_STATUS.UNKNOWN, REFUND_STATUS.PROCESSING, REFUND_STATUS.REVIEW];
      if (!reviewable.includes(r.status)) return; // REQUESTED / PROCESSED / ABANDONED never move to REVIEW here
      await tx.refund.update({
        where: { id: r.id },
        data: { status: REFUND_STATUS.REVIEW, reviewFlag: code.slice(0, 60), failureCode: code.slice(0, 60), failureReason: detail ? detail.slice(0, 200) : r.failureReason, ...(opts.provedNothingCreated ? { providerStatus: 'REJECTED' } : {}), lockedUntil: null, lockedBy: null, nextAttemptAt: null }
      });
      await AuditService.record({ actor: null, action: 'REFUND_FLAGGED', entity: 'Refund', entityId: r.id, payload: { flag: code.slice(0, 60), orderNumber: r.order.orderNumber }, context }, tx);
    });
    paymentAlert('refund.review_required', { refundId, outcome: code.slice(0, 60) });
  }

  /**
   * Ask the provider for this payment's refunds and match OUR refund by EXACT receipt (or known provider refund id), then let the
   * settlement service verify payment, amount and currency. Also ledgers any refund we did not create (EXTERNAL).
   * An empty listing is NOT proof of absence. Throws ProviderUnknownError when the provider cannot be asked.
   */
  public static async resolveByLookup(refundId: string, provider: PaymentProvider, via: 'API' | 'RECONCILIATION' | 'MANUAL'): Promise<ResolveOutcome> {
    const refund = await prisma.refund.findUnique({ where: { id: refundId }, include: { providerPayment: true } });
    if (!refund) return 'NOT_FOUND';
    const listed = await provider.listPaymentRefunds(refund.providerPayment.providerPaymentId);

    const mine = listed.filter((x) => x.receipt === refund.id || (refund.providerRefundId !== null && x.providerRefundId === refund.providerRefundId));
    await this.ledgerForeignRefunds(refund.providerPayment, listed, via);

    if (mine.length === 0) return 'NOT_FOUND';
    if (mine.length > 1) {
      await this.markReview(refund.id, 'AMBIGUOUS_PROVIDER_LOOKUP', null);
      return 'AMBIGUOUS';
    }
    const res = await RefundSettlementService.apply({ refundId: refund.id, evidence: mine[0], via });
    return res.outcome === 'FLAGGED' ? 'REVIEW' : 'ADOPTED';
  }

  /** Every provider refund of this payment that no local Refund owns becomes an EXTERNAL refund (ledgered, counted, flagged). */
  public static async ledgerForeignRefunds(ledger: ProviderPayment, listed: ProviderRefund[], via: 'API' | 'WEBHOOK' | 'RECONCILIATION' | 'MANUAL'): Promise<void> {
    for (const x of listed) {
      if (x.providerPaymentId !== ledger.providerPaymentId) continue;
      const byId = await prisma.refund.findFirst({ where: { provider: ledger.provider, providerRefundId: x.providerRefundId }, select: { id: true } });
      if (byId) continue;
      if (x.receipt && UUID_RE.test(x.receipt)) {
        const byReceipt = await prisma.refund.findUnique({ where: { id: x.receipt }, select: { id: true, providerPaymentId: true } });
        if (byReceipt) continue; // ours (the settlement service verifies it); never mis-record it as external
      }
      await RefundSettlementService.recordExternal({ ledgerId: ledger.id, evidence: x, via });
    }
  }

  // ================================================================================================ the worker's per-refund step
  public static async reconcileOne(refundId: string, provider: PaymentProvider, workerId: string): Promise<'SUBMITTED' | 'RESOLVED' | 'WAITING' | 'REVIEW' | 'NOOP'> {
    const cfg = getPaymentConfig();
    const refund = await prisma.refund.findUnique({ where: { id: refundId } });
    if (!refund) return 'NOOP';
    const ageMs = Date.now() - (refund.submittedAt ?? refund.createdAt).getTime();

    if (refund.status === REFUND_STATUS.REQUESTED) {
      const r = await this.submit(refund.id, workerId);
      return r === 'SUBMITTED' ? 'SUBMITTED' : r === 'REVIEW' ? 'REVIEW' : 'WAITING';
    }

    if (refund.status === REFUND_STATUS.SUBMITTING) {
      // lease expired while SUBMITTING: the worker died or the answer was lost. UNKNOWN, then look the refund up.
      await this.markUnknown(refund.id, 'SUBMIT_LEASE_EXPIRED');
    }

    const fresh = await prisma.refund.findUnique({ where: { id: refund.id } });
    if (!fresh || (fresh.status !== REFUND_STATUS.UNKNOWN && fresh.status !== REFUND_STATUS.PROCESSING)) return 'NOOP';
    const attempt = fresh.attemptCount + 1;

    const release = async (delayMs: number | null) =>
      prisma.refund.updateMany({ where: { id: fresh.id, status: fresh.status }, data: { attemptCount: attempt, lockedUntil: null, lockedBy: null, nextAttemptAt: delayMs === null ? null : new Date(Date.now() + delayMs) } });

    try {
      let outcome: ResolveOutcome;
      if (fresh.providerRefundId) {
        const evidence = await provider.fetchRefund(fresh.providerRefundId);
        if (evidence) {
          const res = await RefundSettlementService.apply({ refundId: fresh.id, evidence, via: 'RECONCILIATION' });
          outcome = res.outcome === 'FLAGGED' ? 'REVIEW' : 'ADOPTED';
        } else {
          outcome = await this.resolveByLookup(fresh.id, provider, 'RECONCILIATION'); // fetch said "no such refund": fall back to the listing, never conclude absence from one 404
        }
      } else {
        outcome = await this.resolveByLookup(fresh.id, provider, 'RECONCILIATION');
      }
      if (outcome === 'ADOPTED') {
        // PROCESSED is final; PROCESSING keeps being polled with the schedule set by the settlement service
        await prisma.refund.updateMany({ where: { id: fresh.id }, data: { attemptCount: attempt } });
        return 'RESOLVED';
      }
      if (outcome === 'REVIEW' || outcome === 'AMBIGUOUS') return 'REVIEW';

      // NOT_FOUND: an empty listing / missing refund proves nothing. Keep waiting; escalate to a human after the review window.
      const staleMs = fresh.status === REFUND_STATUS.PROCESSING ? cfg.oldOrderWatchMs : cfg.unknownReviewMs;
      if (ageMs >= staleMs) {
        await this.markReview(fresh.id, fresh.status === REFUND_STATUS.PROCESSING ? 'PROCESSING_STALE' : 'UNKNOWN_UNRESOLVED', null);
        return 'REVIEW';
      }
      await release(backoffMs(attempt));
      return 'WAITING';
    } catch (err) {
      // provider unreachable / transient error: stay where we are, back off; escalate only after a long, bounded silence
      if (ageMs >= (fresh.status === REFUND_STATUS.PROCESSING ? cfg.oldOrderWatchMs : cfg.unknownReviewMs * 4)) {
        await this.markReview(fresh.id, 'PROVIDER_UNREACHABLE_TOO_LONG', null);
        return 'REVIEW';
      }
      void err;
      await release(backoffMs(attempt));
      return 'WAITING';
    }
  }

  // ================================================================================================ refund webhook evidence
  /**
   * Trusted (signature-verified) refund evidence from a webhook or the provider. Matched by provider refund id, else by exact
   * receipt (our Refund.id). A refund against a KNOWN ProviderPayment that we did not create is recorded as EXTERNAL. Unmatched
   * evidence stays recoverable (RETRY) and is only IGNOREd once the provider proves the payment is unrelated.
   */
  public static async handleProviderRefund(evidence: ProviderRefund, opts: { allowProviderCalls: boolean; via: 'WEBHOOK' | 'RECONCILIATION'; context?: AuditContext }): Promise<HandleRefundResult> {
    const provider = getPaymentProvider();

    const byId = await prisma.refund.findFirst({ where: { provider: provider.name, providerRefundId: evidence.providerRefundId }, select: { id: true } });
    let refundId = byId?.id ?? null;
    if (!refundId && evidence.receipt && UUID_RE.test(evidence.receipt)) {
      const byReceipt = await prisma.refund.findUnique({ where: { id: evidence.receipt }, select: { id: true } });
      refundId = byReceipt?.id ?? null;
    }
    if (refundId) {
      const res = await RefundSettlementService.apply({ refundId, evidence, via: opts.via, context: opts.context });
      return res.outcome === 'NOT_FOUND' ? { kind: 'RETRY', reason: 'REFUND_NOT_FOUND' } : { kind: 'APPLIED' };
    }

    let ledger = await prisma.providerPayment.findUnique({ where: { provider_providerPaymentId: { provider: provider.name, providerPaymentId: evidence.providerPaymentId } } });
    if (!ledger) {
      if (!opts.allowProviderCalls) return { kind: 'RETRY', reason: 'UNMATCHED_PROVIDER_PAYMENT' };
      const payment = await provider.fetchPayment(evidence.providerPaymentId);
      if (!payment) return { kind: 'RETRY', reason: 'PAYMENT_NOT_VISIBLE_AT_PROVIDER' };
      if (!payment.providerOrderId) return { kind: 'IGNORE', reason: 'UNRELATED_PROVIDER_PAYMENT' };
      const session = await prisma.payment.findFirst({ where: { provider: provider.name, providerOrderId: payment.providerOrderId }, select: { id: true } });
      if (!session) {
        const order = await provider.fetchOrder(payment.providerOrderId);
        if (!order) return { kind: 'RETRY', reason: 'PROVIDER_ORDER_NOT_VISIBLE' };
        const ours = order.notes.source === 'protein-bowl' || (order.receipt !== null && UUID_RE.test(order.receipt));
        if (!ours) return { kind: 'IGNORE', reason: 'UNRELATED_PROVIDER_PAYMENT' };
        return { kind: 'RETRY', reason: 'PAYMENT_NOT_LOCAL_YET' }; // the payment reconciliation will adopt the provider order first
      }
      // the payment itself has not been seen yet: ledger it through the normal settlement path, then record the refund
      await PaymentSettlementService.settle({ paymentId: session.id, payment, provider: provider.name, via: 'WEBHOOK' });
      ledger = await prisma.providerPayment.findUnique({ where: { provider_providerPaymentId: { provider: provider.name, providerPaymentId: evidence.providerPaymentId } } });
      if (!ledger) return { kind: 'RETRY', reason: 'PAYMENT_NOT_LEDGERED_YET' };
    }

    await RefundSettlementService.recordExternal({ ledgerId: ledger.id, evidence, via: opts.via, context: opts.context });
    return { kind: 'APPLIED' };
  }

  // ================================================================================================ admin approval (DUPLICATE / AFTER_CANCELLATION)
  /**
   * SUPER_ADMIN (step-up enforced at the route) approves a FULL refund of ONE exact captured ledger payment that P7B flagged
   * DUPLICATE or AFTER_CANCELLATION. The target is derived from the ledger row: never the order's effective payment.
   */
  public static async approveForLedger(
    ledgerId: string,
    admin: { userId: string; roles: readonly string[] },
    note: string | null,
    context?: AuditContext
  ): Promise<{ refund: Refund; created: boolean }> {
    const peek = await prisma.providerPayment.findUnique({ where: { id: ledgerId }, select: { orderId: true } });
    if (!peek) throw new AppError('Payment not found', 404, 'PROVIDER_PAYMENT_NOT_FOUND');

    const result = await prisma.$transaction(
      async (tx) => {
        await lockOrder(tx, peek.orderId);
        await lockProviderPaymentById(tx, ledgerId);
        const ledger = await tx.providerPayment.findUnique({ where: { id: ledgerId } });
        const order = await tx.order.findUnique({ where: { id: peek.orderId }, select: { id: true, orderNumber: true, status: true, paidByProviderPaymentId: true } });
        if (!ledger || !order) throw new AppError('Payment not found', 404, 'PROVIDER_PAYMENT_NOT_FOUND');

        let trigger: RefundTrigger;
        let reasonCode: string;
        if (ledger.reconciliationStatus === RECON.DUPLICATE) {
          if (ledger.id === order.paidByProviderPaymentId) throw new AppError('The order\'s effective payment can never be refunded as a duplicate', 409, 'REFUND_TARGET_FORBIDDEN');
          trigger = REFUND_TRIGGER.DUPLICATE_CAPTURE;
          reasonCode = 'DUPLICATE_PAYMENT';
        } else if (ledger.reconciliationStatus === RECON.AFTER_CANCELLATION) {
          if (order.status !== 'CANCELLED') throw new AppError('The order is not cancelled', 409, 'REFUND_NOT_ALLOWED');
          trigger = REFUND_TRIGGER.AFTER_CANCELLATION;
          reasonCode = 'LATE_PAYMENT_AFTER_CANCELLATION';
        } else {
          throw new AppError('Only DUPLICATE or AFTER_CANCELLATION captured payments can be refunded here', 409, 'REFUND_NOT_APPLICABLE');
        }

        const r = await this.createIntent(tx, {
          order,
          ledgerId,
          trigger,
          reasonCode,
          reasonNote: note,
          requestedBy: { userId: admin.userId, kind: 'ADMIN' },
          context
        });
        if (r.created) {
          await AuditService.record(
            { actor: { userId: admin.userId, roles: admin.roles }, action: 'REFUND_APPROVED', entity: 'Refund', entityId: r.refund.id, payload: { orderNumber: order.orderNumber, trigger, reasonCode, amount: r.refund.amount.toFixed(2) }, context },
            tx
          );
        }
        return r;
      },
      { maxWait: 10000, timeout: 20000 }
    );
    if (result.created) this.kick(result.refund.id);
    return result;
  }
}
