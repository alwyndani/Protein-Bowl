import { ApiRequestError } from '../services/apiClient';
import { SUPPORT_COPY } from './orderLabels';

/**
 * Explicit code -> customer copy mapping for the financial flows. Arbitrary server `message` text is NEVER rendered, except for a
 * tiny allow-list of customer-safe validation codes (minimum order, quantity limits) whose server text is designed for customers.
 * Raw provider errors can never reach the screen: they never leave the server, and unknown codes get generic copy.
 */
export type ErrorAction =
  | 'SIGN_IN' // the session is gone: ask the customer to sign in and continue
  | 'REFRESH_ORDER' // trusted server state decides what happens next
  | 'CONFIRMING' // payment truth unresolved: never invite another payment
  | 'RETRY' // a manual retry is safe (the user decides)
  | 'SUPPORT'
  | 'INLINE' // show next to the field
  | 'NONE';

export interface UserFacingError {
  code: string;
  action: ErrorAction;
  message: string;
}

const PASSTHROUGH_CODES = new Set(['MINIMUM_ORDER_NOT_MET', 'MAX_LINE_QUANTITY_EXCEEDED', 'MAX_CART_QUANTITY_EXCEEDED', 'INVALID_QUANTITY']);

const TABLE: Record<string, { action: ErrorAction; message: string }> = {
  // session
  UNAUTHORIZED: { action: 'SIGN_IN', message: 'Your session has expired. Please sign in again.' },
  TOKEN_EXPIRED: { action: 'SIGN_IN', message: 'Your session has expired. Please sign in again.' },
  ACCOUNT_INACTIVE: { action: 'SIGN_IN', message: 'Your session has ended. Please sign in again.' },
  FORBIDDEN: { action: 'NONE', message: 'This action is not available for your account.' },
  // lookups (a missing order and someone else's order look identical on purpose)
  ORDER_NOT_FOUND: { action: 'NONE', message: 'Order not found.' },
  NOT_FOUND: { action: 'NONE', message: 'Order not found.' },
  // payment
  PAYMENT_ALREADY_COMPLETED: { action: 'REFRESH_ORDER', message: 'This order has already been paid.' },
  ORDER_NOT_PAYABLE: { action: 'REFRESH_ORDER', message: 'This order can no longer be paid online.' },
  PAYMENT_ATTEMPT_IN_PROGRESS: { action: 'CONFIRMING', message: 'Payment is being confirmed. Please do not pay again yet.' },
  PAYMENT_AMOUNT_TOO_SMALL: { action: 'NONE', message: 'This order total is too small to be paid online.' },
  PAYMENT_PROVIDER_UNAVAILABLE: { action: 'RETRY', message: 'The payment service is temporarily unavailable. No payment was taken. Please try again shortly.' },
  PAYMENT_VERIFICATION_FAILED: { action: 'REFRESH_ORDER', message: `We could not confirm this payment yet. Please do not pay again. If you were charged, it will be reconciled. ${SUPPORT_COPY}` },
  PAYMENT_AMOUNT_MISMATCH: { action: 'SUPPORT', message: `We could not match this payment to your order. Please do not pay again. ${SUPPORT_COPY}` },
  PAYMENT_CURRENCY_MISMATCH: { action: 'SUPPORT', message: `We could not match this payment to your order. Please do not pay again. ${SUPPORT_COPY}` },
  PAYMENT_ATTEMPT_NOT_FOUND: { action: 'REFRESH_ORDER', message: 'This payment session is no longer available. We are refreshing your order.' },
  // cancellation / refunds
  CANCELLATION_NOT_ALLOWED: { action: 'REFRESH_ORDER', message: 'This order can no longer be cancelled.' },
  CANCELLATION_STATE_NOT_SUPPORTED: { action: 'REFRESH_ORDER', message: 'This order can no longer be cancelled.' },
  ORDER_NOT_CANCELLABLE: { action: 'REFRESH_ORDER', message: 'This order can no longer be cancelled.' },
  INVALID_ORDER_TRANSITION: { action: 'REFRESH_ORDER', message: 'This order can no longer be cancelled.' },
  EXTERNAL_REFUND_PRESENT: { action: 'SUPPORT', message: `This cancellation needs a manual review. ${SUPPORT_COPY}` },
  REFUND_ALREADY_EXISTS: { action: 'REFRESH_ORDER', message: 'A refund for this order already exists. We are refreshing your order.' },
  // generic
  TOO_MANY_REQUESTS: { action: 'RETRY', message: 'Too many attempts. Please wait a moment and try again.' },
  VALIDATION_ERROR: { action: 'INLINE', message: 'Please check the details you entered and try again.' },
  IDEMPOTENCY_KEY_REUSED: { action: 'NONE', message: 'This order was already submitted. Please check your orders.' },
  NETWORK_ERROR: { action: 'RETRY', message: 'We could not reach the server. Please check your connection and try again.' }
};

const SERVER_ERROR = { action: 'RETRY' as ErrorAction, message: 'Something went wrong on our side. Please try again in a moment.' };
const UNKNOWN_CLIENT_ERROR = { action: 'NONE' as ErrorAction, message: 'We could not complete that request.' };

export function describeError(err: unknown): UserFacingError {
  if (!(err instanceof ApiRequestError)) {
    return { code: 'UNEXPECTED_ERROR', ...SERVER_ERROR };
  }
  const code = err.code || 'REQUEST_FAILED';
  const status = err.status;

  if (PASSTHROUGH_CODES.has(code) && status !== undefined && status >= 400 && status < 500 && err.message) {
    return { code, action: 'INLINE', message: err.message };
  }
  if (status === 401) return { code: 'UNAUTHORIZED', ...TABLE.UNAUTHORIZED };
  if (status === 429) return { code: 'TOO_MANY_REQUESTS', ...TABLE.TOO_MANY_REQUESTS };
  if (TABLE[code]) return { code, ...TABLE[code] };
  if (status !== undefined && status >= 500) return { code, ...SERVER_ERROR };
  if (status === 404) return { code, ...TABLE.ORDER_NOT_FOUND };
  if (status === 403) return { code, ...TABLE.FORBIDDEN };
  if (status === 422) return { code, ...TABLE.VALIDATION_ERROR };
  return { code, ...UNKNOWN_CLIENT_ERROR };
}

export function isSessionExpired(err: unknown): boolean {
  return describeError(err).action === 'SIGN_IN';
}
