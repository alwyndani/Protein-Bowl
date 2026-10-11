import { sanitizeBoundedText } from '../refund/cancellationPolicy.js';

/** P9A: maximum stored length of the optional customer delivery instructions (the API validator allows the same bound). */
export const DELIVERY_INSTRUCTIONS_MAX = 500;

/**
 * The ONE sanitizer for customer delivery instructions: control / zero-width / bidi characters become spaces, runs of spaces collapse,
 * the result is trimmed and bounded. null when nothing is left. The persisted snapshot value and the idempotency fingerprint both use it,
 * so the stored value is exactly the value that was fingerprinted.
 */
export function sanitizeDeliveryInstructions(value: string | undefined | null): string | null {
  return sanitizeBoundedText(value, DELIVERY_INSTRUCTIONS_MAX);
}
