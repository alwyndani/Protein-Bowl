import type { CustomerOrder } from './types';

/**
 * Customer-facing wording for the separate order / payment / refund / cancellation / delivery states (same terminology as the web).
 * Presentation only: every value comes from the server; nothing here derives state. Read-only in P11B (no action is offered).
 */
export type Tone = 'neutral' | 'good' | 'warn' | 'bad';
export interface Badge {
  label: string;
  tone: Tone;
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Order placed',
  CONFIRMED: 'Confirmed',
  ACCEPTED: 'Accepted by the kitchen',
  PREPARING: 'Being prepared',
  READY: 'Ready',
  DISPATCHED: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled'
};

export const orderStatusLabel = (status: string): string => ORDER_STATUS_LABELS[status] ?? 'Status updating';

export function orderBadge(order: Pick<CustomerOrder, 'status' | 'delivery'>): Badge {
  if (order.status === 'DISPATCHED' && order.delivery?.state === 'DELIVERY_ISSUE') return { label: 'Delivery issue', tone: 'warn' };
  if (order.status === 'DISPATCHED' && order.delivery?.state === 'RETRY_PLANNED') return { label: 'Delivery being rearranged', tone: 'warn' };
  const tone: Tone = order.status === 'CANCELLED' ? 'bad' : order.status === 'DELIVERED' ? 'good' : 'neutral';
  return { label: orderStatusLabel(order.status), tone };
}

export function paymentBadge(order: Pick<CustomerOrder, 'status' | 'paymentStatus' | 'payment'>): Badge {
  const state = order.payment?.state ?? null;
  if (order.paymentStatus === 'REFUNDED') return { label: 'Refunded', tone: 'neutral' };
  if (state === 'PAID' || order.paymentStatus === 'PAID') return { label: 'Paid', tone: 'good' };
  if (order.status === 'CANCELLED') return { label: 'No payment taken', tone: 'neutral' };
  if (state === 'CONFIRMING') return { label: 'Payment being confirmed', tone: 'warn' };
  if (state === 'AWAITING_PAYMENT') return { label: 'Awaiting payment', tone: 'warn' };
  return { label: 'Payment required', tone: 'warn' };
}

export function refundBadge(order: Pick<CustomerOrder, 'refund'>): Badge | null {
  switch (order.refund?.state) {
    case 'REFUND_PENDING':
      return { label: 'Refund requested', tone: 'warn' };
    case 'REFUND_PROCESSING':
      return { label: 'Refund processing', tone: 'warn' };
    case 'REFUNDED':
      return { label: 'Refund issued', tone: 'good' };
    case 'REFUND_REVIEW_REQUIRED':
      return { label: 'Refund under review', tone: 'warn' };
    default:
      return null;
  }
}

export function cancellationNotice(order: Pick<CustomerOrder, 'cancellation'>): string | null {
  return order.cancellation?.state === 'CANCELLED' ? 'This order was cancelled.' : null;
}

/** Generic, customer-safe delivery wording (no reason, note, driver or security detail exists in the data). Read-only. */
export function deliveryNotice(order: Pick<CustomerOrder, 'delivery'>): { title: string; body: string } | null {
  const d = order.delivery;
  if (!d) return null;
  const attempt = d.attemptNumber > 1 ? ` (attempt ${d.attemptNumber} of ${d.maxAttempts})` : '';
  switch (d.state) {
    case 'DELIVERY_ISSUE':
      return { title: 'We could not complete your delivery yet', body: `We are arranging the next step${attempt}. You do not need to do anything.` };
    case 'RETRY_PLANNED':
      return { title: 'Another delivery attempt is being arranged', body: `Your delivery partner will set off again${attempt}.` };
    case 'UNDELIVERABLE_REFUND_PENDING':
      return { title: 'We could not deliver your order', body: 'Your order was cancelled and you will be refunded in full.' };
    case 'ON_THE_WAY':
      return { title: 'Out for delivery', body: `Your order is on its way${attempt}.` };
    case 'DELIVERED':
      return { title: 'Delivered', body: 'Your order has been delivered.' };
    default:
      return null;
  }
}

/** The honest P11B wording for an order that still needs online payment. It never implies confirmation or payment. */
export const PAYMENT_REQUIRED_COPY = 'Payment is required before your order can be confirmed. Online payment from this app is coming soon; your order is saved and is not confirmed yet.';
