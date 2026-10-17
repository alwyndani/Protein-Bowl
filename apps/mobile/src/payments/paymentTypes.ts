/**
 * Payment contracts, taken from the backend (server/src/modules/payment). Server-authoritative values only: nothing here is computed,
 * defaulted or inferred on the device, and none of it is local UI / native-checkout state.
 */

/** Backend payment SESSION status (`SESSION_STATUS`). */
export type PaymentSessionStatus = 'CREATED' | 'PENDING' | 'UNKNOWN' | 'SUCCESS' | 'EXPIRED' | 'FAILED' | 'ABANDONED';

/** POST /orders/:orderId/payment-attempts: the only data needed to open the provider checkout. No secrets. */
export interface CheckoutSession {
  attemptId: string;
  provider: string;
  /** PUBLIC provider key id. */
  keyId: string;
  providerOrderId: string;
  /** Minor units (paise). */
  amountMinor: number;
  currency: string;
  orderNumber: string;
  /** ISO timestamp. */
  expiresAt: string;
  status: PaymentSessionStatus;
}

/** GET /orders/:orderId/payment-attempts/:attemptId. Read-only status. */
export interface PaymentAttemptStatus {
  attemptId: string;
  status: PaymentSessionStatus;
  expiresAt: string | null;
  lastError: string | null;
  orderStatus: string;
  orderPaymentStatus: string;
}

/** POST .../verify. 200 = PAID, 202 = PENDING (the HTTP status is not part of the data). */
export interface VerifyOutcome {
  result: 'PAID' | 'PENDING';
  orderStatus: string;
  orderPaymentStatus: string;
}

/** Exactly what the provider checkout returned, and the ONLY fields the verify endpoint accepts. Untrusted until the backend verifies it. */
export interface PaymentEvidence {
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
}
