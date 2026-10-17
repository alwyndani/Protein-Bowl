import { ApiError } from '../api/ApiError';

/**
 * Backend error codes emitted by the payment-attempt routes. This module only NAMES them: an HTTP error is never turned into a financial
 * conclusion here. The (later) flow layer decides recovery, and only backend-authoritative state may make a new payment safe.
 */
export const PAYMENT_ERROR_CODES = [
  'PAYMENT_ALREADY_COMPLETED', // 409
  'ORDER_NOT_PAYABLE', // 409
  'PAYMENT_ATTEMPT_IN_PROGRESS', // 409
  'PAYMENT_AMOUNT_TOO_SMALL', // 422
  'PAYMENT_AMOUNT_MISMATCH', // 422 (verify)
  'PAYMENT_CURRENCY_MISMATCH', // 422 (verify)
  'PAYMENT_VERIFICATION_FAILED', // 400 (verify)
  'PAYMENT_ATTEMPT_NOT_FOUND', // 404
  'PAYMENT_PROVIDER_UNAVAILABLE', // 503 (fail closed: the provider state could not be proven)
  'ORDER_NOT_FOUND' // 404
] as const;

export type PaymentErrorCode = (typeof PAYMENT_ERROR_CODES)[number];

export interface PaymentErrorInfo {
  /** The backend's stable code, when it is one of the payment codes above. */
  code: PaymentErrorCode | null;
  status: number;
  /** The request's outcome is UNKNOWN (network / timeout / unreadable answer / 5xx). Distinct from a definitive refusal. */
  ambiguous: boolean;
}

export function paymentErrorInfo(error: unknown): PaymentErrorInfo | null {
  if (!(error instanceof ApiError)) return null;
  const known = (PAYMENT_ERROR_CODES as readonly string[]).includes(error.code) ? (error.code as PaymentErrorCode) : null;
  return { code: known, status: error.status, ambiguous: error.ambiguous };
}
