/**
 * Vocabulary for P7B. Three concepts are kept explicit and never confused:
 *  - PROVIDER payment status        -> ProviderPayment.providerStatus (what the provider says about ONE payment)
 *  - PB payment SESSION status      -> Payment.status                (one provider order / checkout session)
 *  - ORDER payment status           -> Order.paymentStatus           (PENDING | PAID in P7B)
 */

/** Payment session (Payment row) statuses. */
export const SESSION_STATUS = {
  CREATED: 'CREATED', // intent persisted, provider not (known to be) called
  PENDING: 'PENDING', // provider order exists and is payable
  UNKNOWN: 'UNKNOWN', // provider-order creation outcome unknown: stays under reconciliation, never auto-abandoned
  SUCCESS: 'SUCCESS', // a captured provider payment was observed for this provider order
  EXPIRED: 'EXPIRED', // application TTL elapsed (renewable; late captures are still ledgered)
  FAILED: 'FAILED', // DEFINITE failure: the provider rejected order creation
  ABANDONED: 'ABANDONED' // closed manually by an operator (audited CLI action)
} as const;
export type SessionStatus = (typeof SESSION_STATUS)[keyof typeof SESSION_STATUS];

/** Sessions that still count as "the" open session for an order. */
export const OPEN_SESSION_STATUSES: readonly string[] = [SESSION_STATUS.CREATED, SESSION_STATUS.PENDING, SESSION_STATUS.UNKNOWN, SESSION_STATUS.EXPIRED];

/** Provider payment statuses (ledger), strictly monotonic by rank. */
export type ProviderPaymentStatus = 'CREATED' | 'FAILED' | 'AUTHORIZED' | 'CAPTURED' | 'REFUNDED';
export const PROVIDER_STATUS_RANK: Readonly<Record<ProviderPaymentStatus, number>> = Object.freeze({
  CREATED: 0,
  FAILED: 1,
  AUTHORIZED: 2,
  CAPTURED: 3,
  REFUNDED: 4
});

export function isProviderStatus(v: unknown): v is ProviderPaymentStatus {
  return typeof v === 'string' && v in PROVIDER_STATUS_RANK;
}

/** True when moving from `from` to `to` is allowed (never backwards: CAPTURED can never become FAILED/AUTHORIZED). */
export function providerStatusMayAdvance(from: string, to: ProviderPaymentStatus): boolean {
  const current = isProviderStatus(from) ? PROVIDER_STATUS_RANK[from] : -1;
  return PROVIDER_STATUS_RANK[to] > current;
}

/** Ledger reconciliation outcomes. */
export const RECON = {
  PENDING: 'PENDING',
  APPLIED: 'APPLIED',
  DUPLICATE: 'DUPLICATE',
  AFTER_CANCELLATION: 'AFTER_CANCELLATION',
  AMOUNT_MISMATCH: 'AMOUNT_MISMATCH',
  CURRENCY_MISMATCH: 'CURRENCY_MISMATCH',
  REVIEWED: 'REVIEWED'
} as const;
export type ReconciliationStatus = (typeof RECON)[keyof typeof RECON];
export const FLAGGED_RECON: readonly string[] = [RECON.DUPLICATE, RECON.AFTER_CANCELLATION, RECON.AMOUNT_MISMATCH, RECON.CURRENCY_MISMATCH];
/** A decided outcome that must never be re-decided. */
export const DECIDED_RECON: readonly string[] = [RECON.APPLIED, RECON.DUPLICATE, RECON.AFTER_CANCELLATION, RECON.AMOUNT_MISMATCH, RECON.CURRENCY_MISMATCH, RECON.REVIEWED];

/** Webhook event statuses. */
export const EVENT_STATUS = {
  RECEIVED: 'RECEIVED',
  PROCESSED: 'PROCESSED',
  IGNORED: 'IGNORED',
  RETRY_PENDING: 'RETRY_PENDING',
  FAILED: 'FAILED'
} as const;

export type FirstSeenVia = 'CHECKOUT_VERIFY' | 'WEBHOOK' | 'RECONCILIATION';

export const DEFAULT_CURRENCY = 'INR' as const;

/**
 * Retry-safety marker (P11C-2 D1). Written on a PENDING / EXPIRED session when the provider could not be inspected while a payment
 * start (or a customer verification) needed to know whether money may already have moved. While it is set the session counts as
 * UNRESOLVED (order payment summary = CONFIRMING, canStartPayment = false). It is cleared by the next successful provider inspection or
 * reconciliation pass. "Unable to prove safe to retry" always means "do not allow another payment yet".
 */
export const PROVIDER_STATE_UNVERIFIED = 'PROVIDER_STATE_UNVERIFIED';
/** Every lastError value that means "the provider's payment state could not be established for this session". */
export const PROVIDER_STATE_UNVERIFIED_ERRORS: readonly string[] = [PROVIDER_STATE_UNVERIFIED, 'VERIFY_FETCH_UNAVAILABLE'];
