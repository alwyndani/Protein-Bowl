import { isNativeCheckoutOpen, isRazorpayNativeAvailable, onNativeCheckoutSettled, onNativeCheckoutStateChange, openNativeCheckout } from './razorpayNative';

/**
 * Production Razorpay bridge: opens the native checkout and reduces its callback to a MINIMAL, typed result. It holds no payment state,
 * makes no backend request, stores nothing, logs nothing, and never reads provider free text (description), metadata, source, step or
 * reason: physical Android tests proved a user dismissal and a genuine failure are indistinguishable by those fields, so an error callback
 * of any cause is one neutral NOT_COMPLETED. NOTHING here proves payment or decides retry safety: only the backend does.
 */

/** Everything comes from the backend payment session (see checkoutMapping). */
export type CheckoutOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
};

/** What the checkout handed back when it reported completion. UNTRUSTED client evidence until the backend verify endpoint accepts it. */
export type CheckoutEvidence = {
  providerPaymentId: string;
  providerOrderId: string;
  signature: string;
};

export type CheckoutResult =
  /** A complete, well-formed callback for the requested provider order. Still only evidence, never proof of payment. */
  | { kind: 'EVIDENCE'; evidence: CheckoutEvidence }
  /** The checkout reported a failure or was closed (indistinguishable): refresh from the backend before anything else. */
  | { kind: 'NOT_COMPLETED' }
  /** The native module is not in this build (Expo Go). Nothing was opened. */
  | { kind: 'UNAVAILABLE' }
  /** A checkout is already open. Nothing new was opened. */
  | { kind: 'ALREADY_OPEN' }
  /** The checkout reported completion but the payload is incomplete or malformed: money may have moved. Never success, never failure. */
  | { kind: 'AMBIGUOUS' };

const PROVIDER_ID = /^[A-Za-z0-9_]{1,64}$/; // the same shape the backend verify endpoint accepts
const SIGNATURE = /^[A-Fa-f0-9]{64}$/;

export { isRazorpayNativeAvailable, isNativeCheckoutOpen, onNativeCheckoutSettled, onNativeCheckoutStateChange };

function toEvidence(payload: unknown, requestedOrderId: string): CheckoutResult {
  const r = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
  const id = r?.razorpay_payment_id;
  const order = r?.razorpay_order_id;
  const sig = r?.razorpay_signature;
  if (typeof id !== 'string' || !PROVIDER_ID.test(id) || typeof order !== 'string' || !PROVIDER_ID.test(order) || typeof sig !== 'string' || !SIGNATURE.test(sig)) {
    return { kind: 'AMBIGUOUS' };
  }
  // Evidence for a different provider order than the one that was opened is anomalous: keep it ambiguous rather than forward it.
  if (order !== requestedOrderId) return { kind: 'AMBIGUOUS' };
  return { kind: 'EVIDENCE', evidence: { providerPaymentId: id, providerOrderId: order, signature: sig } };
}

/** Opens the native checkout for the backend's provider order. Never throws. */
export async function openCheckout(options: CheckoutOptions): Promise<CheckoutResult> {
  const settled = await openNativeCheckout(options);
  switch (settled.kind) {
    case 'UNAVAILABLE':
      return { kind: 'UNAVAILABLE' };
    case 'IN_PROGRESS':
      return { kind: 'ALREADY_OPEN' };
    case 'REJECTED':
      return { kind: 'NOT_COMPLETED' };
    case 'RESOLVED':
      return toEvidence(settled.payload, options.order_id);
  }
}
