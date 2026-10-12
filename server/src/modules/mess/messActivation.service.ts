import { AuditContext, AuditService } from '../audit/audit.service.js';
import { OrderTransitionService } from '../order/orderTransition.service.js';
import { RefundService } from '../refund/refund.service.js';
import { REFUND_TRIGGER } from '../refund/refundStatus.js';
import { MessTx, SUBSCRIPTION_STATUS, businessDate, dateToString, lockRow } from './messPolicy.js';

export const MESS_START_PASSED_REASON = 'START_DATE_PASSED';

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
    const found = await tx.messSubscription.findUnique({ where: { purchaseOrderId: order.id }, select: { id: true, startDate: true, status: true } });
    if (found && found.status === SUBSCRIPTION_STATUS.PENDING_PAYMENT && dateToString(found.startDate) < businessDate()) {
      await lockRow.subscription(tx, found.id);
      const fresh = await tx.messSubscription.findUniqueOrThrow({ where: { id: found.id }, select: { status: true } });
      if (fresh.status === SUBSCRIPTION_STATUS.PENDING_PAYMENT) {
        const intent = await RefundService.createIntent(tx, {
          order,
          ledgerId,
          trigger: REFUND_TRIGGER.MESS_START_DATE_PASSED,
          reasonCode: MESS_START_PASSED_REASON,
          reasonNote: null,
          requestedBy: { userId: null, kind: 'SYSTEM' },
          context
        });
        await OrderTransitionService.transition({ orderId: order.id, to: 'CANCELLED', actor: { kind: 'SYSTEM', source: 'MESS_LATE_PAYMENT' }, reason: MESS_START_PASSED_REASON, refundIntentId: intent.refund.id, context }, tx);
        await tx.messSubscription.updateMany({ where: { id: found.id, status: SUBSCRIPTION_STATUS.PENDING_PAYMENT }, data: { status: SUBSCRIPTION_STATUS.CANCELLED, cancelledAt: new Date(), cancellationReasonCode: MESS_START_PASSED_REASON } });
        await AuditService.record({ actor: null, action: 'MESS_LATE_PAYMENT_REFUNDED', entity: 'MessSubscription', entityId: found.id, payload: { orderId: order.id, refundId: intent.refund.id, startDate: dateToString(found.startDate), businessDate: businessDate() }, context }, tx);
        return { changed: true, subscriptionId: found.id, lateRefundId: intent.refund.id };
      }
    }
    const r = await this.activateInTx(tx, order.id, context);
    return { ...r, lateRefundId: null };
  }

  public static async activateInTx(tx: MessTx, orderId: string, context?: AuditContext): Promise<{ changed: boolean; subscriptionId: string | null }> {
    const found = await tx.messSubscription.findUnique({ where: { purchaseOrderId: orderId }, select: { id: true } });
    if (!found) {
      // A paid Mess order without a subscription must never exist; keep the payment (money is real) and leave an audit trail for review.
      await AuditService.record({ actor: null, action: 'MESS_ACTIVATION_ANOMALY', entity: 'Order', entityId: orderId, payload: { reason: 'NO_SUBSCRIPTION_FOR_PAID_ORDER' }, context }, tx);
      return { changed: false, subscriptionId: null };
    }
    await lockRow.subscription(tx, found.id);
    const sub = await tx.messSubscription.findUniqueOrThrow({ where: { id: found.id }, select: { id: true, status: true, startDate: true, endDate: true } });
    if (sub.status === SUBSCRIPTION_STATUS.ACTIVE) return { changed: false, subscriptionId: sub.id };
    if (sub.status !== SUBSCRIPTION_STATUS.PENDING_PAYMENT) {
      await AuditService.record({ actor: null, action: 'MESS_ACTIVATION_ANOMALY', entity: 'MessSubscription', entityId: sub.id, payload: { reason: 'UNEXPECTED_STATUS', status: sub.status }, context }, tx);
      return { changed: false, subscriptionId: sub.id };
    }
    const cas = await tx.messSubscription.updateMany({ where: { id: sub.id, status: SUBSCRIPTION_STATUS.PENDING_PAYMENT }, data: { status: SUBSCRIPTION_STATUS.ACTIVE, activatedAt: new Date() } });
    if (cas.count === 1) {
      await AuditService.record(
        { actor: null, action: 'MESS_SUBSCRIPTION_ACTIVATED', entity: 'MessSubscription', entityId: sub.id, payload: { orderId, startDate: sub.startDate.toISOString().slice(0, 10), endDate: sub.endDate.toISOString().slice(0, 10) }, context },
        tx
      );
    }
    return { changed: cas.count === 1, subscriptionId: sub.id };
  }
}
