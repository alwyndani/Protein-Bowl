/**
 * P7C refund vocabulary. Two statuses are kept strictly apart:
 *  - Refund.status          = the Protein Bowl (PB) refund status below;
 *  - Refund.providerStatus  = what the provider says about the refund (PENDING | PROCESSED | FAILED).
 * There is deliberately NO PB "FAILED" state: a provider failure keeps providerStatus/failureCode/failureReason and the PB
 * refund moves to REVIEW. A timeout / reset / 5xx / unreadable answer / crash is NEVER a definite failure: it is UNKNOWN.
 */
export const REFUND_STATUS = {
  REQUESTED: 'REQUESTED', // intent persisted (with the cancellation, or by an admin approval); the provider was NOT contacted yet
  SUBMITTING: 'SUBMITTING', // a worker took the single REQUESTED -> SUBMITTING compare-and-set: the provider create call is (being) made
  PROCESSING: 'PROCESSING', // the provider accepted it and reports it pending
  PROCESSED: 'PROCESSED', // final success (monotonic: never regresses)
  UNKNOWN: 'UNKNOWN', // the outcome of the provider call is not known: resolved by exact-receipt lookup, never by a second create
  REVIEW: 'REVIEW', // needs a human (provider failure/rejection, mismatch, ambiguity, unresolved UNKNOWN)
  ABANDONED: 'ABANDONED' // an operator closed the intent after verifying that the provider holds no live refund for it
} as const;
export type RefundStatus = (typeof REFUND_STATUS)[keyof typeof REFUND_STATUS];

/** The ONLY legal PB moves. PROCESSED and ABANDONED are terminal. */
export const REFUND_TRANSITIONS: Readonly<Record<RefundStatus, readonly RefundStatus[]>> = Object.freeze({
  REQUESTED: ['SUBMITTING'],
  SUBMITTING: ['PROCESSING', 'PROCESSED', 'UNKNOWN', 'REVIEW'],
  UNKNOWN: ['PROCESSING', 'PROCESSED', 'REVIEW'],
  PROCESSING: ['PROCESSED', 'REVIEW'],
  REVIEW: ['PROCESSING', 'PROCESSED', 'ABANDONED'],
  PROCESSED: [],
  ABANDONED: []
});

export function refundMayMove(from: string, to: RefundStatus): boolean {
  return (REFUND_TRANSITIONS[from as RefundStatus] ?? []).includes(to);
}

/** Statuses in which a refund still "occupies" its payment (everything except ABANDONED). */
export const LIVE_REFUND_STATUSES: readonly string[] = ['REQUESTED', 'SUBMITTING', 'PROCESSING', 'PROCESSED', 'UNKNOWN', 'REVIEW'];

export const REFUND_TRIGGER = {
  CUSTOMER_CANCELLATION: 'CUSTOMER_CANCELLATION',
  ADMIN_CANCELLATION: 'ADMIN_CANCELLATION',
  DUPLICATE_CAPTURE: 'DUPLICATE_CAPTURE',
  AFTER_CANCELLATION: 'AFTER_CANCELLATION',
  EXTERNAL: 'EXTERNAL'
} as const;
export type RefundTrigger = (typeof REFUND_TRIGGER)[keyof typeof REFUND_TRIGGER];

export type ProviderRefundStatusValue = 'PENDING' | 'PROCESSED' | 'FAILED';

/** Customer-visible, derived refund states (P7D will render them). */
export type PublicRefundState = 'NO_REFUND' | 'REFUND_PENDING' | 'REFUND_PROCESSING' | 'REFUNDED' | 'REFUND_REVIEW_REQUIRED';
export type PublicCancellationState = 'CANCELLATION_AVAILABLE' | 'CANCELLATION_NOT_ALLOWED' | 'CANCELLED';

export function publicRefundState(status: string): PublicRefundState | null {
  switch (status) {
    case 'REQUESTED':
    case 'SUBMITTING':
    case 'UNKNOWN':
      return 'REFUND_PENDING';
    case 'PROCESSING':
      return 'REFUND_PROCESSING';
    case 'PROCESSED':
      return 'REFUNDED';
    case 'REVIEW':
      return 'REFUND_REVIEW_REQUIRED';
    default:
      return null; // ABANDONED is internal history
  }
}
