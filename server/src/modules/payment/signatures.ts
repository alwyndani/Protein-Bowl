import { createHmac, timingSafeEqual } from 'node:crypto';

/** HMAC-SHA256, lowercase hex digest. */
export function hmacSha256Hex(secret: string, message: string | Buffer): string {
  return createHmac('sha256', secret).update(message).digest('hex');
}

/**
 * Constant-time comparison of two strings (hex signatures). Different lengths are rejected without an early,
 * length-dependent comparison of the contents.
 */
export function safeEqualStrings(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) {
    // still do a comparison of equal-length buffers so timing does not depend on where the inputs differ
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

/** Verify `signature` = HMAC-SHA256(secret, message) in constant time. */
export function verifyHmacSignature(secret: string, message: string | Buffer, signature: string | undefined): boolean {
  if (typeof signature !== 'string' || signature.length === 0) return false;
  return safeEqualStrings(hmacSha256Hex(secret, message), signature.trim().toLowerCase());
}
