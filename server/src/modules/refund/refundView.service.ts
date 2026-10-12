import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { RECON } from '../payment/paymentStatus.js';
import { PaymentSummary, PaymentSummaryService } from '../payment/paymentSummary.service.js';
import { CUSTOMER_CANCELLABLE_STATES } from './cancellationPolicy.js';
import { LIVE_REFUND_STATUSES, PublicCancellationState, PublicRefundState, publicRefundState } from './refundStatus.js';

import { CustomerDeliveryView, DeliveryViewService } from '../delivery/deliveryView.service.js';

export interface DerivedOrderState {
  /** P9C (additive): customer-safe delivery label, present only once the order has been dispatched (or cancelled as undeliverable). */
  delivery?: CustomerDeliveryView;
  cancellation: { state: PublicCancellationState; allowed: boolean };
  refund: { state: PublicRefundState };
  /** P7D-G1: server-derived payment summary (authoritative for the web UI). */
  payment: PaymentSummary;
}

/** Worst/most-actionable first: what the customer should look at. */
const RANK: Record<PublicRefundState, number> = { NO_REFUND: 0, REFUNDED: 1, REFUND_PROCESSING: 2, REFUND_PENDING: 3, REFUND_REVIEW_REQUIRED: 4 };

/** Customer-safe projections. Never exposes provider ids, leases, attempt counters, internal flags or provider failure detail. */
export class RefundViewService {
  /** Derive the additive customer-order fields for many orders with TWO queries. */
  public static async deriveForOrders(orders: Array<{ id: string; status: string; orderType: string; paymentStatus: string; paymentMethod: string | null; netAmount: unknown }>): Promise<Map<string, DerivedOrderState>> {
    const ids = orders.map((o) => o.id);
    const out = new Map<string, DerivedOrderState>();
    const payments = await PaymentSummaryService.deriveForOrders(orders);
    const deliveries = await DeliveryViewService.deriveForOrders(orders);
    const refunds = ids.length ? await prisma.refund.findMany({ where: { orderId: { in: ids } }, select: { orderId: true, status: true, providerPaymentId: true } }) : [];
    const flagged = ids.length
      ? await prisma.providerPayment.findMany({ where: { orderId: { in: ids }, reconciliationStatus: { in: [RECON.DUPLICATE, RECON.AFTER_CANCELLATION] } }, select: { id: true, orderId: true } })
      : [];
    const refundedLedger = new Set(refunds.filter((r) => (LIVE_REFUND_STATUSES as readonly string[]).includes(r.status)).map((r) => r.providerPaymentId));

    for (const o of orders) {
      let best: PublicRefundState = 'NO_REFUND';
      for (const r of refunds.filter((x) => x.orderId === o.id)) {
        const s = publicRefundState(r.status);
        if (s && RANK[s] > RANK[best]) best = s;
      }
      // money was taken twice / after cancellation and no refund has been approved yet: the customer should know it is being looked at
      if (flagged.some((f) => f.orderId === o.id && !refundedLedger.has(f.id))) best = 'REFUND_REVIEW_REQUIRED';

      const cancelled = o.status === 'CANCELLED';
      const allowed = !cancelled && o.orderType === 'DIRECT' && (CUSTOMER_CANCELLABLE_STATES as readonly string[]).includes(o.status) && (o.paymentStatus === 'PENDING' || o.paymentStatus === 'PAID');
      out.set(o.id, {
        cancellation: { state: cancelled ? 'CANCELLED' : allowed ? 'CANCELLATION_AVAILABLE' : 'CANCELLATION_NOT_ALLOWED', allowed },
        refund: { state: best },
        payment: payments.get(o.id)!,
        ...(deliveries.has(o.id) ? { delivery: deliveries.get(o.id)! } : {})
      });
    }
    return out;
  }

  public static async cancelResponse(result: { changed: boolean; orderId: string; orderNumber: string }) {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: result.orderId }, select: { id: true, status: true, orderType: true, paymentStatus: true, paymentMethod: true, netAmount: true, cancelledAt: true } });
    const derived = (await this.deriveForOrders([order])).get(order.id)!;
    return {
      orderId: order.id,
      orderNumber: result.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      cancelledAt: order.cancelledAt,
      alreadyCancelled: !result.changed,
      cancellation: derived.cancellation,
      refund: derived.refund,
      payment: derived.payment
    };
  }

  /** GET /orders/:orderId/refunds (owner only; another customer's order is a safe 404). */
  public static async listForCustomerOrder(userId: string, orderId: string) {
    const profile = await prisma.customerProfile.findUnique({ where: { userId }, select: { id: true } });
    const order = profile ? await prisma.order.findFirst({ where: { id: orderId, customerProfileId: profile.id }, select: { id: true, status: true, orderType: true, paymentStatus: true, paymentMethod: true, netAmount: true } }) : null;
    if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');

    const refunds = await prisma.refund.findMany({ where: { orderId: order.id }, orderBy: { createdAt: 'asc' }, select: { id: true, amount: true, currency: true, status: true, createdAt: true, processedAt: true } });
    const items = refunds
      .map((r) => ({ id: r.id, state: publicRefundState(r.status), amount: r.amount, currency: r.currency, requestedAt: r.createdAt, processedAt: r.processedAt }))
      .filter((r) => r.state !== null);
    const derived = (await this.deriveForOrders([order])).get(order.id)!;
    return { orderId: order.id, ...derived, refunds: items };
  }
}
