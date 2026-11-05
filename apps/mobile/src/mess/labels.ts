import type { MessAccount, MessMeal, MessSubscription } from './types';
import type { Badge } from '../commerce/labels';

/** Presentation only. Every value comes from the server; nothing here derives state or money. */
export const NOT_PROVIDED = 'Not provided';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SLOT_LABELS: Record<string, string> = { BREAKFAST: 'Breakfast', LUNCH: 'Lunch', DINNER: 'Dinner' };
const SLOT_ORDER = ['BREAKFAST', 'LUNCH', 'DINNER'];

export const slotLabel = (slot: string): string => SLOT_LABELS[slot] ?? 'Meal';
export const slotsLabel = (slots: string[] | null | undefined): string => (slots && slots.length ? [...slots].sort((a, b) => SLOT_ORDER.indexOf(a) - SLOT_ORDER.indexOf(b)).map(slotLabel).join(', ') : NOT_PROVIDED);

/** "2026-11-05" -> "5 Nov 2026" (pure string handling; no time zone involved). Anything else renders as the dash. */
export function formatDay(value: string | null | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '—';
  const [y, m, d] = value.split('-');
  const month = MONTHS[Number(m) - 1];
  return month ? `${Number(d)} ${month} ${y}` : '—';
}

/** Strict calendar check for the start-date input (YYYY-MM-DD, a real date). */
export function isValidDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const t = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === value;
}

/** Shown when the selected start date is behind us: the server refuses payment for such a term (MESS_START_DATE_PASSED). */
export const START_DATE_PASSED_COPY = 'The start date of this subscription has passed, so it can no longer be paid. Please cancel it and buy again with a later start date.';

/** True when `startDate` (YYYY-MM-DD) is before today's date in India (fixed +05:30 offset, the business calendar). Guidance only: the server decides. */
export function startDatePassed(startDate: string | null | undefined, nowMs: number = Date.now()): boolean {
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return false;
  return startDate < new Date(nowMs + 330 * 60 * 1000).toISOString().slice(0, 10);
}

/** Suggested start date: today in India (fixed +05:30 offset, matching the business calendar) plus the plan's lead days. A hint only: the server decides. */
export function suggestedStartDay(leadDays: number, nowMs: number = Date.now()): string {
  const ist = new Date(nowMs + 330 * 60 * 1000 + Math.max(0, leadDays) * 86_400_000);
  return ist.toISOString().slice(0, 10);
}

export function hhmm(value: string | null | undefined): string {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return NOT_PROVIDED;
  const h = Number(value.slice(0, 2));
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${value.slice(3)} ${h < 12 ? 'am' : 'pm'}`;
}

export function approvalBadge(account: Pick<MessAccount, 'approvalStatus'>): Badge {
  switch (account.approvalStatus) {
    case 'APPROVED':
      return { label: 'Approved', tone: 'good' };
    case 'REJECTED':
      return { label: 'Not approved', tone: 'bad' };
    default:
      return { label: 'Waiting for approval', tone: 'warn' };
  }
}

const REJECTION_COPY: Record<string, string> = {
  INCOMPLETE_DETAILS: 'Some of your details were incomplete. Please update them and submit again.',
  NOT_ELIGIBLE: 'Your account is not eligible for Kerala Mess.',
  SERVICE_POINT_MISMATCH: 'The service point did not match your hostel. Please choose the right one and submit again.',
  OTHER: 'Your details could not be approved. Please update them and submit again.'
};
export const rejectionCopy = (code: string | null): string => (code && REJECTION_COPY[code]) || REJECTION_COPY.OTHER;

export function subscriptionBadge(s: Pick<MessSubscription, 'status'>): Badge {
  switch (s.status) {
    case 'ACTIVE':
      return { label: 'Active', tone: 'good' };
    case 'PENDING_PAYMENT':
      return { label: 'Payment required', tone: 'warn' };
    case 'COMPLETED':
      return { label: 'Completed', tone: 'neutral' };
    case 'CANCELLED':
      return { label: 'Cancelled', tone: 'bad' };
    default:
      return { label: 'Status updating', tone: 'neutral' };
  }
}

/** Payment pill from the server's payment summary and the purchase order's payment status. null = nothing to say. */
export function subscriptionPaymentBadge(s: Pick<MessSubscription, 'status' | 'payment' | 'purchaseOrder' | 'refund'>): Badge | null {
  if (s.refund?.state === 'REFUNDED') return { label: 'Refunded', tone: 'neutral' };
  if (s.payment?.state === 'PAID' || s.purchaseOrder?.paymentStatus === 'PAID') return { label: 'Paid', tone: 'good' };
  if (s.status !== 'PENDING_PAYMENT') return null;
  if (s.payment?.state === 'CONFIRMING') return { label: 'Payment being confirmed', tone: 'warn' };
  return { label: 'Payment required', tone: 'warn' };
}

/** Customer wording for the server-derived refund state of a subscription. */
export function refundCopy(state: string | null | undefined): string {
  switch (state) {
    case 'NO_REFUND':
      return 'No refund is recorded for this subscription.';
    case 'REFUND_PENDING':
      return 'Your full refund has been requested.';
    case 'REFUND_PROCESSING':
      return 'Your full refund is being processed.';
    case 'REFUNDED':
      return 'Your full refund has been issued.';
    case 'REFUND_REVIEW_REQUIRED':
      return 'Your refund is under review by Protein Bowl support.';
    default:
      return NOT_PROVIDED;
  }
}

export function mealBadge(m: Pick<MessMeal, 'status' | 'kitchenState'>): Badge {
  switch (m.status) {
    case 'PAUSED':
      return { label: 'Paused', tone: 'warn' };
    case 'CANCELLED':
      return { label: 'Cancelled', tone: 'bad' };
    case 'FULFILLED':
      return { label: 'Delivered', tone: 'good' };
    case 'NOT_DELIVERED':
      return { label: 'Not delivered', tone: 'bad' };
    case 'SCHEDULED':
      if (m.kitchenState === 'OUT_FOR_DELIVERY') return { label: 'Out for delivery', tone: 'good' };
      if (m.kitchenState === 'READY') return { label: 'Ready', tone: 'good' };
      if (m.kitchenState === 'IN_PREPARATION') return { label: 'Being prepared', tone: 'neutral' };
      return { label: 'Scheduled', tone: 'neutral' };
    default:
      return { label: 'Status updating', tone: 'neutral' };
  }
}

const REASON_COPY: Record<string, string> = {
  SUBSCRIPTION_NOT_ACTIVE: 'The subscription is not active.',
  MEAL_FROZEN: 'The kitchen has started this meal.',
  PAUSE_CUTOFF_PASSED: 'The cut-off has passed.',
  PAUSE_LIMIT_REACHED: 'You have used all your pauses.',
  NOT_SCHEDULED: 'This meal cannot be changed.',
  NOT_PAUSED: 'This meal is not paused.',
  MEAL_CANCELLED: 'This meal was cancelled.'
};
export const reasonCopy = (reason: string | null): string | null => (reason ? REASON_COPY[reason] ?? 'This meal cannot be changed.' : null);

export const PAUSE_FORFEIT_COPY = 'A paused meal is not refunded, replaced or added to the end of your plan.';
