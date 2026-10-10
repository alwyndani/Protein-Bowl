import { createHash } from 'node:crypto';
import { AppError } from '../../middleware/error.middleware.js';
import { canonicalJson } from '../../config/commercePolicy.js';

/** 8-128 characters; letters, digits and . _ : - (must start alphanumeric). Bounded so a key can never be abused as a payload. */
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

/**
 * The idempotency key must be supplied explicitly by the client (header `x-idempotency-key`, or the legacy body field).
 * The server NEVER invents one: a generated key would make every retry look like a brand-new order.
 */
export function resolveIdempotencyKey(headerValue: unknown, bodyValue: unknown): string {
  const header = Array.isArray(headerValue) ? headerValue : headerValue === undefined ? [] : [headerValue];
  if (header.length > 1) throw new AppError('Provide exactly one idempotency key', 400, 'INVALID_IDEMPOTENCY_KEY');

  const fromHeader = header.length === 1 ? header[0] : undefined;
  const candidates = [fromHeader, bodyValue].filter((v) => v !== undefined && v !== null && v !== '');

  if (candidates.length === 0) {
    throw new AppError('An idempotency key is required to create an order (send the x-idempotency-key header)', 400, 'IDEMPOTENCY_KEY_REQUIRED');
  }
  if (candidates.some((c) => typeof c !== 'string')) {
    throw new AppError('The idempotency key is not valid', 400, 'INVALID_IDEMPOTENCY_KEY');
  }
  const keys = candidates as string[];
  if (keys.length === 2 && keys[0] !== keys[1]) {
    throw new AppError('Conflicting idempotency keys were supplied', 400, 'INVALID_IDEMPOTENCY_KEY');
  }
  const key = keys[0];
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new AppError('The idempotency key must be 8-128 characters (letters, digits, . _ : -)', 400, 'INVALID_IDEMPOTENCY_KEY');
  }
  return key;
}

export interface FingerprintInput {
  customerProfileId: string;
  addressId: string;
  paymentMethod: string;
  deliveryInstructions?: string | null;
  items: Array<{ productId: string; variantId?: string | null; quantity: number }>;
  /** Identity of the exact pricing rules applied (policy snapshot hash). */
  policyHash: string;
}

/**
 * SHA-256 over a CANONICAL form (sorted keys, sorted items) of everything that defines "the same checkout request":
 * customer scope, address, payment method, instructions, the cart lines and the pricing policy. Nothing secret is
 * included, and nothing in the hash input is stored - only the digest.
 */
export function computeRequestFingerprint(input: FingerprintInput): string {
  const items = input.items
    .map((i) => ({ productId: i.productId, variantId: i.variantId ?? null, quantity: i.quantity }))
    .sort((a, b) => {
      const ka = `${a.productId}:${a.variantId ?? ''}`;
      const kb = `${b.productId}:${b.variantId ?? ''}`;
      return ka < kb ? -1 : ka > kb ? 1 : a.quantity - b.quantity;
    });
  const body = {
    v: 1,
    customerProfileId: input.customerProfileId,
    addressId: input.addressId,
    paymentMethod: input.paymentMethod,
    deliveryInstructions: (input.deliveryInstructions ?? '').trim(),
    items,
    policyHash: input.policyHash
  };
  return createHash('sha256').update(canonicalJson(body)).digest('hex');
}
