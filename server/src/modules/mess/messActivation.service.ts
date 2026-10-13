import { AuditContext, AuditService } from '../audit/audit.service.js';
import { OrderTransitionService } from '../order/orderTransition.service.js';
import { RefundService } from '../refund/refund.service.js';
import { REFUND_TRIGGER } from '../refund/refundStatus.js';
import { MessMealService } from './messMeal.service.js';
import { MessTx, SUBSCRIPTION_STATUS, businessDate, dateToString, lockRow } from './messPolicy.js';

export const MESS_START_PASSED_REASON = 'START_DATE_PASSED';
export const MESS_START_DAY_UNAVAILABLE_REASON = 'START_DAY_UNAVAILABLE';

/**
 * Activates a Kerala Mess subscription from a VERIFIED payment (P10A). It is called ONLY from PaymentSettlementService, inside the settlement
 * transaction, after the order is PAID + CONFIRMED (lock order: Order -> Payment session -> ProviderPayment -> MessSubscription). Browser
 * success, unverified, AUTHORIZED-only or UNKNOWN payments never reach it. It is idempotent: a replay is a no-op.
 *
 * Activation generates NO meals, writes NO wallet row and creates NO gate pass / handover code (those are P10B/P10C).
 */
export class MessActivationService {
  /**
   * Settlement hook. Activates when startDate >= business date (Asia/Kolkata). If the start date has ALREADY passed, the verified payment stays
   * recorded (APPLIED), the subscription is NEVER activated and its dates are NEVER shifted: the purchase is cancelled in this same transaction
   * with exactly one FULL refund intent (the provider is contacted after commit by the normal refund machinery). Lock order is unchanged:
   * Order -> Payment session -> ProviderPayment (all held by the settlement) -> MessSubscription.
   */
  public static async activateOrRefundInTx(tx: MessTx, order: { id: string; orderNumber: string }, ledgerId: string, context?: AuditContext): Promise<{ changed: boolean; subscriptionId: string | null; lateRefundId: string | null }> {
    const found = await tx.messSubscription.findUnique({ where: { purchaseOrderId: order.id }, select: { id: true, startDate: true, status: true, branchId: true, mealSlots: true, slotTimes: true } });
    if (found && found.status === SUBSCRIPTION_STATUS.PENDING_PAYMENT) {
      const start = dateToString(found.startDate);
      const today = businessDate();
      if (start < today) {
        await lockRow.subscription(tx, found.id);
        const fresh = await tx.messSubscription.findUniqueOrThrow({ where: { id: found.id }, select: { status: true } });
        if (fresh.status === SUBSCRIPTION_STATUS.PENDING_PAYMENT) {
          const refundId = await this.cancelWithFullRefund(tx, order, found.id, ledgerId, { trigger: REFUND_TRIGGER.MESS_START_DATE_PASSED, source: 'MESS_LATE_PAYMENT', reasonCode: MESS_START_PASSED_REASON, audit: 'MESS_LATE_PAYMENT_REFUNDED', extra: { startDate: start, businessDate: today } }, context);
          return { changed: true, subscriptionId: found.id, lateRefundId: refundId };
        }
      } else if (start === today) {
        // P10B same-day rule. Lock order: Order -> session -> ProviderPayment (held by the settlement) -> MessSubscription -> batch keys (slot order). The first-day check runs
        // under those batch locks, so a concurrent batch start either already committed (=> refuse here) or waits until this transaction has created the meals (=> attaches them).
        await lockRow.subscription(tx, found.id);
        const fresh = await tx.messSubscription.findUniqueOrThrow({ where: { id: found.id }, select: { status: true } });
        if (fresh.status === SUBSCRIPTION_STATUS.PENDING_PAYMENT) {
          const problem = await MessMealService.firstDayProblem(tx, { startDate: start, branchId: found.branchId, mealSlots: found.mealSlots, slotTimes: found.slotTimes }, tx);
          if (problem) {
            const refundId = await this.cancelWithFullRefund(tx, order, found.id, ledgerId, { trigger: REFUND_TRIGGER.MESS_START_DAY_UNAVAILABLE, source: 'MESS_START_DAY_UNAVAILABLE', reasonCode: MESS_START_DAY_UNAVAILABLE_REASON, audit: 'MESS_START_DAY_UNAVAILABLE_REFUNDED', extra: { startDate: start, slot: problem.slot, cause: problem.reason } }, context);
            return { changed: true, subscriptionId: found.id, lateRefundId: refundId };
          }
        }
      }
    }
    const r = await this.activateInTx(tx, order.id, context);
    return { ...r, lateRefundId: null };
  }

  /** The captured payment stays recorded; the purchase never activates and its dates never move: ONE full refund intent + the narrow system cancellation + subscription CANCELLED. */
  private static async cancelWithFullRefund(
    tx: MessTx,
    order: { id: string; orderNumber: string },
    subscriptionId: string,
    ledgerId: string,
    p: { trigger: (typeof REFUND_TRIGGER)[keyof typeof REFUND_TRIGGER]; source: 'MESS_LATE_PAYMENT' | 'MESS_START_DAY_UNAVAILABLE'; reasonCode: string; audit: string; extra: Record<string, unknown> },
    context?: AuditContext
  ): Promise<string> {
    const intent = await RefundService.createIntent(tx, { order, ledgerId, trigger: p.trigger, reasonCode: p.reasonCode, reasonNote: null, requestedBy: { userId: null, kind: 'SYSTEM' }, context });
    await OrderTransitionService.transition({ orderId: order.id, to: 'CANCELLED', actor: { kind: 'SYSTEM', source: p.source }, reason: p.reasonCode, refundIntentId: intent.refund.id, context }, tx);
    await tx.messSubscription.updateMany({ where: { id: subscriptionId, status: SUBSCRIPTION_STATUS.PENDING_PAYMENT }, data: { status: SUBSCRIPTION_STATUS.CANCELLED, cancelledAt: new Date(), cancellationReasonCode: p.reasonCode } });
    await AuditService.record({ actor: null, action: p.audit, entity: 'MessSubscription', entityId: subscriptionId, payload: { orderId: order.id, refundId: intent.refund.id, ...p.extra }, context }, tx);
    return intent.refund.id;
  }

  public static async activateInTx(tx: MessTx, orderId: string, context?: AuditContext): Promise<{ changed: boolean; subscriptionId: string | null }> {
    const found = await tx.messSubscription.findUnique({ where: { purchaseOrderId: orderId }, select: { id: true } });
    if (!found) {
      // A paid Mess order without a subscription must never exist; keep the payment (money is real) and leave an audit trail for review.
      await AuditService.record({ actor: null, action: 'MESS_ACTIVATION_ANOMALY', entity: 'Order', entityId: orderId, payload: { reason: 'NO_SUBSCRIPTION_FOR_PAID_ORDER' }, context }, tx);
      return { changed: false, subscriptionId: null };
    }
    await lockRow.subscription(tx, found.id);
    const sub = await tx.messSubscription.findUniqueOrThrow({ where: { id: found.id }, select: { id: true, status: true, startDate: true, endDate: true, slotTimes: true, mealsGeneratedAt: true } });
    if (sub.status === SUBSCRIPTION_STATUS.ACTIVE) {
      // settlement replay: complete the entitlement if (and only if) it is a P10B subscription that is somehow still missing meals
      if (sub.slotTimes !== null && !sub.mealsGeneratedAt) await MessMealService.generateInTx(tx, sub.id, context);
      return { changed: false, subscriptionId: sub.id };
    }
    if (sub.status !== SUBSCRIPTION_STATUS.PENDING_PAYMENT) {
      await AuditService.record({ actor: null, action: 'MESS_ACTIVATION_ANOMALY', entity: 'MessSubscription', entityId: sub.id, payload: { reason: 'UNEXPECTED_STATUS', status: sub.status }, context }, tx);
      return { changed: false, subscriptionId: sub.id };
    }
    const cas = await tx.messSubscription.updateMany({ where: { id: sub.id, status: SUBSCRIPTION_STATUS.PENDING_PAYMENT }, data: { status: SUBSCRIPTION_STATUS.ACTIVE, activatedAt: new Date() } });
    if (cas.count === 1) {
      // P10B: activation and the COMPLETE meal entitlement are ONE invariant. A P10B subscription always carries its slot-time snapshot, so a generation
      // failure throws here and rolls the whole settlement back (the capture is then retried by the webhook retry / reconciliation, never lost or marked failed).
      // Only P10A-era subscriptions (no snapshot) stay ACTIVE without meals, to be backfilled by the CLI.
      if (sub.slotTimes !== null) await MessMealService.generateInTx(tx, sub.id, context);
      await AuditService.record(
        { actor: null, action: 'MESS_SUBSCRIPTION_ACTIVATED', entity: 'MessSubscription', entityId: sub.id, payload: { orderId, startDate: sub.startDate.toISOString().slice(0, 10), endDate: sub.endDate.toISOString().slice(0, 10) }, context },
        tx
      );
    }
    return { changed: cas.count === 1, subscriptionId: sub.id };
  }
}
