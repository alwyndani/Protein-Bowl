import { z } from 'zod';

/**
 * APPROVED P7C business policy, expressed as typed constants (state-based only: no timers, no fees).
 * Changing any of this is a business decision, not an engineering one.
 */

/** States from which the OWNING CUSTOMER may cancel. ACCEPTED and later: never. */
export const CUSTOMER_CANCELLABLE_STATES = ['PENDING', 'CONFIRMED'] as const;

/** States the NEW SUPER_ADMIN financial cancellation path supports. PREPARING/READY are deliberately NOT here (P8/P9 own them). */
export const ADMIN_CANCELLABLE_STATES = ['PENDING', 'CONFIRMED', 'ACCEPTED'] as const;

/** States where a paid-order cancellation (with refund) may pass the order-transition gate at all. */
export const PAID_CANCELLATION_FROM_STATES = ['CONFIRMED', 'ACCEPTED'] as const;

export const CUSTOMER_REASON_CODES = ['CHANGED_MIND', 'ORDERED_BY_MISTAKE', 'WRONG_ORDER', 'DELIVERY_TOO_LATE', 'OTHER'] as const;
export const ADMIN_REASON_CODES = ['ITEM_UNAVAILABLE', 'KITCHEN_UNAVAILABLE', 'DELIVERY_UNAVAILABLE', 'PAYMENT_ISSUE', 'OPERATIONAL_ISSUE', 'OTHER'] as const;

/** Reason codes written for refunds whose trigger is not a cancellation (derived by the server, never sent by a client). */
export const SYSTEM_REASON_CODES = ['DUPLICATE_PAYMENT', 'LATE_PAYMENT_AFTER_CANCELLATION', 'EXTERNAL_REFUND', 'DELIVERY_FAILED'] as const;

/** P9C: the refund reason written by the undeliverable path (server-derived, never accepted from a client, deliberately NOT in ADMIN_REASON_CODES). */
export const UNDELIVERABLE_REFUND_REASON_CODE = 'DELIVERY_FAILED';

export const NOTE_MAX_LENGTH = 200;

// C0/C1 controls, zero-width / bidi / format characters, line & paragraph separators, BOM (code point ranges, no regex escapes)
const STRIPPED_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00, 0x1f],
  [0x7f, 0x9f],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x206f],
  [0xfeff, 0xfeff]
];
const isStripped = (code: number): boolean => STRIPPED_RANGES.some(([lo, hi]) => code >= lo && code <= hi);

/** trim + strip control characters (incl. newlines/tabs and zero-width/format characters) + collapse spaces + bound the length. null when empty. */
export function sanitizeNote(value: string | undefined | null): string | null {
  return sanitizeBoundedText(value, NOTE_MAX_LENGTH);
}

/** The shared sanitizer behind notes and delivery instructions: same character stripping, caller-chosen maximum length. */
export function sanitizeBoundedText(value: string | undefined | null, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = Array.from(value)
    .map((ch) => (isStripped(ch.codePointAt(0) ?? 0) ? ' ' : ch))
    .join('')
    .replace(/ {2,}/g, ' ')
    .trim();
  return cleaned.length === 0 ? null : cleaned.slice(0, maxLength);
}

const noteSchema = z
  .string()
  .max(1000) // transport-level bound only; the stored note is sanitized and cut to NOTE_MAX_LENGTH
  .optional()
  .transform((v) => sanitizeNote(v));

export const customerCancelBodySchema = z.object({ reasonCode: z.enum(CUSTOMER_REASON_CODES), note: noteSchema }).strict();
export const adminCancelBodySchema = z.object({ reasonCode: z.enum(ADMIN_REASON_CODES), note: noteSchema }).strict();
export const refundApprovalBodySchema = z.object({ note: noteSchema }).strict();

export type CustomerCancelBody = z.infer<typeof customerCancelBodySchema>;
export type AdminCancelBody = z.infer<typeof adminCancelBodySchema>;
