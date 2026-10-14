import * as Crypto from 'expo-crypto';

/** Matches the backend's accepted format: 8-128 chars, letters/digits and . _ : -, starting alphanumeric. */
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

/**
 * A fresh idempotency key for ONE checkout attempt. The randomness comes from the platform CSPRNG through the documented, Expo SDK 52
 * compatible `expo-crypto` API (`Crypto.randomUUID()`: a v4 UUID from java.util.UUID.randomUUID / SecureRandom on Android and the
 * system UUID generator on iOS). There is deliberately NO Math.random / Date.now / counter fallback: if the native generator is
 * unavailable this THROWS and no order is sent.
 */
export function newIdempotencyKey(): string {
  const key = `IK-${Crypto.randomUUID()}`;
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) throw new Error('IDEMPOTENCY_KEY_GENERATION_FAILED');
  return key;
}
