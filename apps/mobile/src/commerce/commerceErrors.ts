import { ApiError } from '../api/ApiError';
import { messageForError } from '../copy/errorCopy';

/**
 * Customer-safe copy for the commerce flows, keyed ONLY by backend error codes that really exist (audited in server/src):
 * UNAVAILABLE_PRODUCT, INVALID_VARIANT, UNAVAILABLE_VARIANT, EMPTY_CART, INVALID_ADDRESS, the idempotency codes, CONFLICT,
 * PRODUCT_TAX_NOT_CONFIGURED, the quantity codes, MINIMUM_ORDER_NOT_MET, ORDER_TOTAL_TOO_LARGE, COD_NOT_ALLOWED,
 * INVALID_PAYMENT_METHOD, VALIDATION_ERROR, ORDER_NUMBER_UNAVAILABLE. The backend has NO serviceability, stock or price-change
 * codes, so none are mapped or invented. Raw server text and codes are never shown.
 */
const BY_CODE: Record<string, string> = {
  UNAVAILABLE_PRODUCT: 'This item is no longer available. Please remove it from your cart.',
  INVALID_VARIANT: 'That option is not available for this item.',
  UNAVAILABLE_VARIANT: 'That option is no longer available. Please remove it from your cart.',
  EMPTY_CART: 'Your cart is empty.',
  INVALID_ADDRESS: 'That delivery address is not valid. Please choose or add another address.',
  IDEMPOTENCY_KEY_REQUIRED: 'We could not place this order safely. Please try again.',
  INVALID_IDEMPOTENCY_KEY: 'We could not place this order safely. Please try again.',
  IDEMPOTENCY_KEY_REUSED: 'This order request no longer matches what you submitted. Please check My orders before trying again.',
  CONFLICT: 'That conflicted with another change. Please check your cart and orders, then try again.',
  PRODUCT_TAX_NOT_CONFIGURED: 'An item in your cart cannot be ordered right now. Please remove it and try again.',
  INVALID_QUANTITY: 'Choose a whole quantity of at least 1.',
  MAX_LINE_QUANTITY_EXCEEDED: 'That is more than can be ordered of a single item.',
  MAX_CART_QUANTITY_EXCEEDED: 'Your cart cannot hold that many items in total.',
  MINIMUM_ORDER_NOT_MET: 'Your order is below the minimum order amount. Add more items to continue.',
  ORDER_TOTAL_TOO_LARGE: 'This order total is too large to place. Please reduce your cart.',
  COD_NOT_ALLOWED: 'Only online payment is available.',
  INVALID_PAYMENT_METHOD: 'Only online payment is available.',
  VALIDATION_ERROR: 'Please check what you entered and try again.',
  ORDER_NUMBER_UNAVAILABLE: 'We could not create your order right now. Please try again shortly.'
};

export function commerceMessage(error: unknown): string {
  if (error instanceof ApiError && error.kind === 'http') {
    const mapped = BY_CODE[error.code];
    // 401 / 403 / 429 / 5xx keep the shared copy; the product 404 has no code so it is handled by status in the shared mapper.
    if (mapped && error.status !== 401 && error.status !== 403 && error.status !== 429 && error.status < 500) return mapped;
    if (error.status === 404) return 'We could not find that. It may have changed — please refresh.';
  }
  return messageForError(error, 'generic');
}

/** A write that cannot be performed because the device is offline (nothing is queued or faked). */
export const OFFLINE_WRITE_COPY = 'You appear to be offline. This change was not saved — please reconnect and try again.';

export function isOfflineError(error: unknown): boolean {
  return error instanceof ApiError && (error.kind === 'network' || error.kind === 'timeout');
}

/** The outcome of a state-changing request is UNKNOWN (it may have reached the server). Used for the order-create ambiguity path. */
export function isAmbiguousOutcome(error: unknown): boolean {
  return error instanceof ApiError && error.ambiguous;
}
