import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { deliveryProofConfig } from '../../config/deliveryProofConfig.js';

/**
 * P10C service-point handover code primitives. Only the HMAC of the code is ever stored; the plaintext exists in ONE response (to the resident customer who
 * requested it) and in that customer's component memory. A Mess-specific HMAC domain keeps these hashes unusable anywhere else (e.g. as a P9 delivery code).
 */
export const HANDOVER_CODE_LENGTH = 6;

/** Uniformly random 6-digit code from the OS CSPRNG, left-padded. Never derived from anything. */
export function generateHandoverCode(): string {
  return String(randomInt(0, 10 ** HANDOVER_CODE_LENGTH)).padStart(HANDOVER_CODE_LENGTH, '0');
}

export function hashHandoverCode(stopId: string, codeVersion: number, code: string): string {
  return createHmac('sha256', deliveryProofConfig.secret).update(`pb-mess-handover|v1|${stopId}|${codeVersion}|${code}`).digest('hex');
}

export function handoverHashesMatch(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** "123456", "123 456" and "123-456" all become "123456"; anything else is not a handover code. null never echoes the input. */
export function normalizeHandoverCode(input: string): string | null {
  const compact = input.trim().replace(/[\s-]/g, '');
  return /^\d{6}$/.test(compact) ? compact : null;
}
