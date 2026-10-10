import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditService } from '../audit/audit.service.js';
import { lockRefund } from '../payment/paymentOps.js';
import { ProviderUnknownError } from '../payment/provider.types.js';
import { getPaymentProvider } from '../payment/providerRegistry.js';
import { RefundService } from './refund.service.js';
import { REFUND_STATUS } from './refundStatus.js';

/**
 * Operational (CLI-only) refund recovery. There is NO HTTP surface for any of this. Every action requires an operator and a
 * reason and writes an AuditLog row. None of them can mark a refund PROCESSED (only trusted provider evidence processed by the
 * refund settlement service can), set an amount, or pick a payment: a refund is addressed by its own id.
 */
export interface RefundOperator {
  operator: string;
  reason: string;
}

function requireOperator(op: RefundOperator): void {
  if (!op.operator || op.operator.trim().length < 2) throw new AppError('An operator name is required', 422, 'OPERATOR_REQUIRED');
  if (!op.reason || op.reason.trim().length < 5) throw new AppError('A reason of at least 5 characters is required', 422, 'REASON_REQUIRED');
}

const actorOf = (op: RefundOperator) => ({ userId: null, roles: [`CLI:${op.operator.trim().slice(0, 40)}`] });

export class RefundManualRecoveryService {
  /** Read-only summary (no provider call). */
  public static async inspect(refundId: string) {
    const r = await prisma.refund.findUnique({
      where: { id: refundId },
      select: { id: true, status: true, providerStatus: true, trigger: true, amount: true, currency: true, reasonCode: true, reviewFlag: true, failureCode: true, attemptCount: true, providerRefundId: true, submittedAt: true, processedAt: true, createdAt: true, order: { select: { orderNumber: true, status: true, paymentStatus: true } }, providerPayment: { select: { providerPaymentId: true, reconciliationStatus: true } } }
    });
    if (!r) throw new AppError('Refund not found', 404, 'REFUND_NOT_FOUND');
    return r;
  }

  /** UNKNOWN -> REVIEW by an operator (e.g. before deciding to abandon). */
  public static async flagForReview(refundId: string, op: RefundOperator) {
    requireOperator(op);
    const r = await prisma.refund.findUnique({ where: { id: refundId }, select: { status: true } });
    if (!r) throw new AppError('Refund not found', 404, 'REFUND_NOT_FOUND');
    if (r.status !== REFUND_STATUS.UNKNOWN) throw new AppError('Only an UNKNOWN refund can be moved to REVIEW', 409, 'REVIEW_REFUSED');
    await RefundService.markReview(refundId, 'OPERATOR_REVIEW', null);
    await AuditService.recordSafe({ actor: actorOf(op), action: 'REFUND_MANUAL_REVIEW', entity: 'Refund', entityId: refundId, payload: { reason: op.reason.trim().slice(0, 200) } });
    return { flagged: true };
  }

  /**
   * Ask the provider again (list by payment, exact receipt) and let the settlement service apply what it proves. Allowed for
   * UNKNOWN / REVIEW / PROCESSING refunds. It can only move a refund FORWARD on provider evidence.
   */
  public static async reconcile(refundId: string, op: RefundOperator) {
    requireOperator(op);
    const r = await prisma.refund.findUnique({ where: { id: refundId }, select: { status: true } });
    if (!r) throw new AppError('Refund not found', 404, 'REFUND_NOT_FOUND');
    if (![REFUND_STATUS.UNKNOWN, REFUND_STATUS.REVIEW, REFUND_STATUS.PROCESSING].includes(r.status as never)) {
      throw new AppError('Only UNKNOWN, REVIEW or PROCESSING refunds can be reconciled manually', 409, 'RECONCILE_REFUSED');
    }
    let outcome;
    try {
      outcome = await RefundService.resolveByLookup(refundId, getPaymentProvider(), 'MANUAL');
    } catch (err) {
      if (err instanceof ProviderUnknownError) throw new AppError('The provider could not be reached; nothing was changed', 503, 'PAYMENT_PROVIDER_UNAVAILABLE');
      throw err;
    }
    await AuditService.recordSafe({ actor: actorOf(op), action: 'REFUND_MANUAL_RECONCILE', entity: 'Refund', entityId: refundId, payload: { outcome, reason: op.reason.trim().slice(0, 200) } });
    return { outcome };
  }

  /**
   * REVIEW -> ABANDONED. Refused unless the provider could be asked AND shows no refund for this intent (no exact receipt match,
   * and no provider refund id is known). The operator must additionally confirm: an empty provider listing is not a proof by
   * itself (its consistency is unverified), so the human accepts that responsibility explicitly.
   */
  public static async abandon(refundId: string, op: RefundOperator, confirmAbsentAtProvider: boolean) {
    requireOperator(op);
    if (!confirmAbsentAtProvider) throw new AppError('Confirm that the provider holds no refund for this intent (--confirm-absent-at-provider)', 422, 'CONFIRMATION_REQUIRED');
    const refund = await prisma.refund.findUnique({ where: { id: refundId }, include: { providerPayment: true } });
    if (!refund) throw new AppError('Refund not found', 404, 'REFUND_NOT_FOUND');
    if (refund.status === REFUND_STATUS.ABANDONED) return { abandoned: true, alreadyAbandoned: true };
    if (refund.status !== REFUND_STATUS.REVIEW) throw new AppError('Only a REVIEW refund can be abandoned', 409, 'ABANDON_REFUSED');
    if (refund.providerRefundId) throw new AppError('A provider refund id is known for this intent; reconcile it instead of abandoning it', 409, 'ABANDON_REFUSED');
    if (refund.trigger === 'EXTERNAL') throw new AppError('An external refund records money that already moved and cannot be abandoned', 409, 'ABANDON_REFUSED');
    // ABANDONED frees the payment for ANOTHER refund, so absence must be PROVEN. The provider listing alone is not authoritative
    // (its consistency is unverified): the intent's own history must show that no refund can exist -
    //   (a) the provider was never called (refused by the external-refund guard), or
    //   (b) the provider gave a DOCUMENTED rejection that creates nothing (providerStatus REJECTED).
    // A refund that reached REVIEW from a timeout / lost response / persistence failure / ambiguity can never be abandoned.
    const neverSent = refund.reviewFlag === 'EXTERNAL_REFUND_PRESENT' && refund.providerStatus === null;
    const provedRejected = refund.providerStatus === 'REJECTED';
    if (!neverSent && !provedRejected) {
      throw new AppError('The provider outcome of this intent is not provably "nothing created"; it cannot be abandoned (reconcile it, or let the provider evidence arrive)', 409, 'ABANDON_REFUSED');
    }

    let listed;
    try {
      listed = await getPaymentProvider().listPaymentRefunds(refund.providerPayment.providerPaymentId);
    } catch (err) {
      if (err instanceof ProviderUnknownError) throw new AppError('The provider could not be reached; nothing was changed', 503, 'PAYMENT_PROVIDER_UNAVAILABLE');
      throw err;
    }
    const sameReceipt = listed.filter((x) => x.receipt === refund.id);
    if (sameReceipt.length > 0) throw new AppError('The provider holds a refund for this intent (or the listing is ambiguous); reconcile it instead of abandoning it', 409, 'ABANDON_REFUSED');

    await prisma.$transaction(async (tx) => {
      await lockRefund(tx, refund.id);
      const fresh = await tx.refund.findUniqueOrThrow({ where: { id: refund.id } });
      if (fresh.status !== REFUND_STATUS.REVIEW) throw new AppError('The refund changed while abandoning; nothing was changed', 409, 'ABANDON_REFUSED');
      await tx.refund.update({ where: { id: refund.id }, data: { status: REFUND_STATUS.ABANDONED, reviewFlag: 'ABANDONED', nextAttemptAt: null, lockedUntil: null, lockedBy: null } });
      await AuditService.record({ actor: actorOf(op), action: 'REFUND_MANUAL_ABANDONED', entity: 'Refund', entityId: refund.id, payload: { previousStatus: fresh.status, reason: op.reason.trim().slice(0, 200) } }, tx);
    });
    return { abandoned: true, alreadyAbandoned: false };
  }

  /** Acknowledge an EXTERNAL refund after a human reviewed it (clears the review flag; the money stays counted). */
  public static async acknowledgeExternal(refundId: string, op: RefundOperator) {
    requireOperator(op);
    const refund = await prisma.refund.findUnique({ where: { id: refundId }, select: { trigger: true, reviewFlag: true } });
    if (!refund) throw new AppError('Refund not found', 404, 'REFUND_NOT_FOUND');
    if (refund.trigger !== 'EXTERNAL') throw new AppError('Only an EXTERNAL refund can be acknowledged', 409, 'ACK_REFUSED');
    await prisma.$transaction(async (tx) => {
      await lockRefund(tx, refundId);
      await tx.refund.update({ where: { id: refundId }, data: { reviewFlag: 'EXTERNAL_ACKNOWLEDGED' } });
      await AuditService.record({ actor: actorOf(op), action: 'REFUND_EXTERNAL_ACKNOWLEDGED', entity: 'Refund', entityId: refundId, payload: { reason: op.reason.trim().slice(0, 200) } }, tx);
    });
    return { acknowledged: true };
  }
}
