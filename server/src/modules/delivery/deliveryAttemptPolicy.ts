import { z } from 'zod';
import { sanitizeNote } from '../refund/cancellationPolicy.js';

/**
 * APPROVED P9C business policy for failed-delivery resolution, as typed constants (not scattered literals).
 * The literal 3 in migration #15 (CHECK constraints) mirrors MAX_DELIVERY_ATTEMPTS; a test keeps them equal.
 */

/** Attempt 1 is the original delivery; the first retry is attempt 2, the second retry attempt 3. After attempt 3 fails only Cancel & Full Refund or the exceptional override remain. */
export const MAX_DELIVERY_ATTEMPTS = 3;

export const ATTEMPT_OUTCOMES = ['RETRY_SAME_DRIVER', 'REASSIGNED', 'UNDELIVERABLE_CANCELLED', 'ADMIN_OVERRIDE_DELIVERED'] as const;
export type AttemptOutcome = (typeof ATTEMPT_OUTCOMES)[number];

/** Reason codes the SUPER_ADMIN picks when resolving a failed attempt (structured; the free-text note is optional/bounded). */
export const RETRY_REASON_CODES = ['CUSTOMER_AVAILABLE_NOW', 'ADDRESS_CORRECTED', 'DRIVER_CHANGE', 'OPERATIONAL_RETRY', 'OTHER'] as const;
export const UNDELIVERABLE_REASON_CODES = ['CUSTOMER_REFUSED', 'CUSTOMER_UNREACHABLE', 'ADDRESS_UNDELIVERABLE', 'DELIVERY_UNAVAILABLE', 'OTHER'] as const;

const noteSchema = z
  .string()
  .max(1000) // transport bound only; the stored note is sanitized and cut to 200
  .optional()
  .transform((v) => sanitizeNote(v));

/** SAME_DRIVER retries with the current driver; REASSIGN hands the attempt to another driver of the SAME branch (also used for a pending ASSIGNED attempt). */
export const retryBodySchema = z
  .object({
    mode: z.enum(['SAME_DRIVER', 'REASSIGN']),
    driverEmployeeId: z.string().uuid().optional(),
    expectedAttemptNumber: z.number().int().min(1).max(MAX_DELIVERY_ATTEMPTS),
    expectedDriverId: z.string().uuid(),
    reasonCode: z.enum(RETRY_REASON_CODES),
    note: noteSchema
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.mode === 'REASSIGN' && !v.driverEmployeeId) ctx.addIssue({ code: 'custom', path: ['driverEmployeeId'], message: 'A driver is required to reassign' });
    if (v.mode === 'SAME_DRIVER' && v.driverEmployeeId) ctx.addIssue({ code: 'custom', path: ['driverEmployeeId'], message: 'A driver must not be given when retrying with the same driver' });
  });
export type RetryBody = z.infer<typeof retryBodySchema>;

export const undeliverableBodySchema = z
  .object({
    reasonCode: z.enum(UNDELIVERABLE_REASON_CODES),
    note: z
      .string()
      .max(1000)
      .transform((v) => sanitizeNote(v))
      .refine((v): v is string => typeof v === 'string' && v.length >= 10, { message: 'A note of at least 10 characters is required' }),
    expectedAttemptNumber: z.number().int().min(1).max(MAX_DELIVERY_ATTEMPTS),
    confirm: z.literal(true)
  })
  .strict();
export type UndeliverableBody = z.infer<typeof undeliverableBodySchema>;

export const attemptsParamsSchema = z.object({ orderId: z.string().min(1).max(64) });
