import type { ApiOrder, CancellationState, CustomerCancelReasonCode, PaymentSummaryState, RefundState } from '../services/commerceTypes';

/**
 * Customer-facing copy for the THREE separate state machines (order, payment, refund). The raw enums never reach the screen, and the
 * three are never merged into one badge. Everything here is presentation only: the values come from the server.
 */

/** Centralised: there is NO approved support email/phone/link yet. Insert the real channel here later (and nowhere else). */
export const SUPPORT_COPY = 'Please contact Protein Bowl support.';

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

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? 'Status updating';
}

export type Tone = 'neutral' | 'good' | 'warn' | 'bad';

export interface Badge {
  label: string;
  tone: Tone;
}

export function orderBadge(order: Pick<ApiOrder, 'status'> & Partial<Pick<ApiOrder, 'delivery'>>): Badge {
  // P9C: while a delivery attempt is being resolved the order is still DISPATCHED in the database; the badge says what the customer should understand
  if (order.status === 'DISPATCHED' && order.delivery?.state === 'DELIVERY_ISSUE') return { label: 'Delivery issue', tone: 'warn' };
  if (order.status === 'DISPATCHED' && order.delivery?.state === 'RETRY_PLANNED') return { label: 'Delivery being rearranged', tone: 'warn' };
  const tone: Tone = order.status === 'CANCELLED' ? 'bad' : order.status === 'DELIVERED' ? 'good' : 'neutral';
  return { label: orderStatusLabel(order.status), tone };
}

/** P9C: generic, customer-safe wording for the derived delivery state. No reason, note, driver or security detail exists in the data. */
export function deliveryNotice(order: Pick<ApiOrder, 'status' | 'delivery'>): { title: string; body: string } | null {
  const d = order.delivery;
  if (!d) return null;
  const attempt = d.attemptNumber > 1 ? ` (attempt ${d.attemptNumber} of ${d.maxAttempts})` : '';
  if (d.state === 'DELIVERY_ISSUE') return { title: 'We could not complete your delivery yet', body: `We are arranging the next step${attempt}. You do not need to do anything.` };
  if (d.state === 'RETRY_PLANNED') return { title: 'Another delivery attempt is being arranged', body: `Your delivery partner will set off again${attempt}. Your delivery code becomes available once they are on the way.` };
  if (d.state === 'UNDELIVERABLE_REFUND_PENDING') return { title: 'We could not deliver your order', body: 'Your order was cancelled and you will be refunded in full. The refund status is shown below.' };
  if (d.state === 'ON_THE_WAY' && d.attemptNumber > 1) return { title: 'Out for delivery again', body: `Your delivery partner is on the way${attempt}. Generate a new delivery code to hand over to them.` };
  return null;
}

/** Payment badge from the server summary when present, else from the stored paymentStatus. */
export function paymentBadge(order: Pick<ApiOrder, 'status' | 'paymentStatus' | 'payment'>): Badge {
  const state: PaymentSummaryState | null = order.payment?.state ?? null;
  // REFUNDED first: the server summary reports state PAID for a refunded order (never start another payment), but the customer must see "Refunded".
  if (order.paymentStatus === 'REFUNDED') return { label: 'Refunded', tone: 'neutral' };
  if (state === 'PAID' || order.paymentStatus === 'PAID') return { label: 'Paid', tone: 'good' };
  if (order.status === 'CANCELLED') return { label: 'No payment taken', tone: 'neutral' };
  if (state === 'CONFIRMING') return { label: 'Payment being confirmed', tone: 'warn' };
  if (state === 'AWAITING_PAYMENT') return { label: 'Awaiting payment', tone: 'warn' };
  return { label: 'Payment pending', tone: 'warn' };
}

/** Refund badge: only when there is something to say (NO_REFUND shows nothing). */
export function refundBadge(order: Pick<ApiOrder, 'refund'>): Badge | null {
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

/** Refund notice copy per server state. No guaranteed date, no provider detail. `cancelled` adds the "order cancelled" lead-in. */
export function refundNoticeCopy(state: RefundState, cancelled: boolean): string | null {
  const lead = cancelled ? 'Order cancelled. ' : '';
  switch (state) {
    case 'NO_REFUND':
      return cancelled ? 'Order cancelled.' : null;
    case 'REFUND_PENDING':
      return `${lead}Your refund has been requested.`;
    case 'REFUND_PROCESSING':
      return 'Your refund is being processed.';
    case 'REFUNDED':
      return 'Your refund has been issued. It may take time to appear, depending on your bank or payment provider.';
    case 'REFUND_REVIEW_REQUIRED':
      return 'We are reviewing your refund and will update this page.';
    default:
      return null;
  }
}

export const CANCEL_REASON_LABELS: Record<CustomerCancelReasonCode, string> = {
  CHANGED_MIND: 'I changed my mind',
  ORDERED_BY_MISTAKE: 'I ordered by mistake',
  WRONG_ORDER: 'Wrong order',
  DELIVERY_TOO_LATE: 'Delivery is taking too long',
  OTHER: 'Other'
};

export const CANCEL_NOTE_MAX = 200;

export function cancellationAvailable(order: Pick<ApiOrder, 'cancellation'>): boolean {
  const state: CancellationState | undefined = order.cancellation?.state;
  return state === 'CANCELLATION_AVAILABLE' && order.cancellation?.allowed === true;
}
