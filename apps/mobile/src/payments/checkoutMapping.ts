import type { CheckoutOptions } from './razorpayBridge';
import type { CheckoutSession } from './paymentTypes';

/**
 * Pure mapping from the BACKEND payment session to the native checkout options. Every financial value (key, provider order, amount,
 * currency) comes from the session: never from the cart, the checkout preview, a local calculation or a hard-coded order. Invalid input
 * fails CLOSED (the native checkout is not opened) and the reason is a fixed code, never a value.
 */
export type CheckoutMappingFailure = 'UNSUPPORTED_PROVIDER' | 'INVALID_KEY' | 'INVALID_PROVIDER_ORDER' | 'INVALID_AMOUNT' | 'UNSUPPORTED_CURRENCY' | 'SESSION_NOT_PAYABLE';

export type CheckoutMapping = { ok: true; options: CheckoutOptions } | { ok: false; reason: CheckoutMappingFailure };

const KEY_ID = /^[A-Za-z0-9_]{8,64}$/;
const PROVIDER_ORDER_ID = /^[A-Za-z0-9_]{1,64}$/;
const ORDER_NUMBER = /^PB-\d{6}-[A-Z0-9]{6}$/;
const SUPPORTED_CURRENCY = 'INR'; // the only currency the backend creates sessions in

export function buildCheckoutOptions(session: CheckoutSession): CheckoutMapping {
  if (session.provider !== 'razorpay') return { ok: false, reason: 'UNSUPPORTED_PROVIDER' };
  if (typeof session.keyId !== 'string' || !KEY_ID.test(session.keyId)) return { ok: false, reason: 'INVALID_KEY' };
  if (typeof session.providerOrderId !== 'string' || !PROVIDER_ORDER_ID.test(session.providerOrderId)) return { ok: false, reason: 'INVALID_PROVIDER_ORDER' };
  if (typeof session.amountMinor !== 'number' || !Number.isSafeInteger(session.amountMinor) || session.amountMinor <= 0) return { ok: false, reason: 'INVALID_AMOUNT' };
  if (session.currency !== SUPPORTED_CURRENCY) return { ok: false, reason: 'UNSUPPORTED_CURRENCY' };
  if (session.status !== 'PENDING') return { ok: false, reason: 'SESSION_NOT_PAYABLE' };
  return {
    ok: true,
    options: {
      key: session.keyId,
      order_id: session.providerOrderId,
      amount: session.amountMinor,
      currency: session.currency,
      name: 'Protein Bowl',
      description: ORDER_NUMBER.test(session.orderNumber) ? `Order ${session.orderNumber}` : 'Protein Bowl order'
    }
  };
}
