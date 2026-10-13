import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { canonicalJson } from '../../config/commercePolicy.js';
import { AppError } from '../../middleware/error.middleware.js';
import { sanitizeNote } from '../refund/cancellationPolicy.js';

/**
 * Kerala Mess (P10A) vocabulary and validation. Nothing here is a PRICE or a TAX RATE: both are set explicitly by SUPER_ADMIN on each plan
 * and snapshotted at purchase. The only constants are structural (statuses, meal slots, reason codes, sanity bounds).
 */

export const MESS_PURCHASE_POLICY_ID = 'MESS_PURCHASE_V1';

export const MESS_APPROVAL_STATUS = { PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED' } as const;
export const SERVICE_POINT_STATUS = { ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE' } as const;
export const PLAN_STATUS = { DRAFT: 'DRAFT', ACTIVE: 'ACTIVE', ARCHIVED: 'ARCHIVED' } as const;
export const SUBSCRIPTION_STATUS = { PENDING_PAYMENT: 'PENDING_PAYMENT', ACTIVE: 'ACTIVE', COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED' } as const;
/** Subscriptions that occupy their date range and block service-point changes. */
export const OPEN_SUBSCRIPTION_STATUSES = ['PENDING_PAYMENT', 'ACTIVE'] as const;

export const MEAL_SLOTS = ['BREAKFAST', 'LUNCH', 'DINNER'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

/** The business calendar. There was no established timezone in the repository, so this is the explicit one for Kerala Mess dates. */
export const MESS_BUSINESS_TIMEZONE = 'Asia/Kolkata';

/** Sanity bounds (validation only, not business policy). */
export const MAX_DURATION_DAYS = 366;
export const MAX_LEAD_DAYS = 60;
export const MAX_PAUSE_CUTOFF_HOURS = 168;
export const MAX_PAUSES = 60;
export const MAX_START_AHEAD_DAYS = 366;
export const MAX_PRICE = 1_000_000;
/** P10B: how far ahead the kitchen may READ demand (informational beyond today). Batches can only be started for today. */
export const KITCHEN_DEMAND_HORIZON_DAYS = 7;
/** P10B: largest calendar window a customer can request in one call. */
export const MAX_CALENDAR_WINDOW_DAYS = 93;
export const MEAL_STATUS = { SCHEDULED: 'SCHEDULED', PAUSED: 'PAUSED', CANCELLED: 'CANCELLED', FULFILLED: 'FULFILLED', NOT_DELIVERED: 'NOT_DELIVERED' } as const;
/** Meal statuses that mean service already happened (P10C writes FULFILLED; CONSUMED is the legacy spelling). */
export const FULFILLED_MEAL_STATUSES = ['FULFILLED', 'CONSUMED'] as const;
export const BATCH_STATUS = { PREPARING: 'PREPARING', READY: 'READY' } as const;

// ------------------------------------------------------------------------------------------------ P10C bulk delivery vocabulary + policy
export const RUN_STATUS = { AVAILABLE: 'AVAILABLE', CLAIMED: 'CLAIMED', IN_TRANSIT: 'IN_TRANSIT', COMPLETED: 'COMPLETED', CLOSED: 'CLOSED' } as const;
export const STOP_STATUS = { PENDING: 'PENDING', FAILED: 'FAILED', HANDED_OVER: 'HANDED_OVER', CLOSED_UNDELIVERED: 'CLOSED_UNDELIVERED' } as const;
export const HANDOVER_METHOD = { CODE: 'CODE', ADMIN_OVERRIDE: 'ADMIN_OVERRIDE' } as const;
/** Attempt 1 is the first delivery attempt of a stop; a retry makes attemptCount + 1; a stop never exceeds this many attempts (mirrored by the DB CHECK in migration #18). */
export const MAX_DELIVERY_ATTEMPTS = 3;
/** The handover code lives 3 hours after issue, but never beyond the end of the meal's Asia/Kolkata business date. */
export const HANDOVER_CODE_TTL_MS = 3 * 60 * 60 * 1000;
export const MAX_HANDOVER_REGENERATIONS = 3;
export const MAX_HANDOVER_ATTEMPTS_PER_WINDOW = 5;
export const HANDOVER_LOCK_MS = 15 * 60 * 1000;
export const MAX_HANDOVER_LOCK_CYCLES = 3;
export const STOP_FAILURE_CODES = ['SERVICE_POINT_CLOSED', 'RECIPIENT_UNAVAILABLE', 'CODE_NOT_AVAILABLE', 'UNABLE_TO_REACH', 'VEHICLE_ISSUE', 'QUANTITY_MISMATCH', 'OTHER'] as const;
export const STOP_OVERRIDE_REASON_CODES = ['RECIPIENT_CANNOT_ACCESS_CODE', 'RECIPIENT_DEVICE_UNAVAILABLE', 'CODE_VERIFICATION_FAILURE', 'ACCESSIBILITY_ASSISTANCE', 'OPERATIONAL_EXCEPTION', 'OTHER'] as const;
/** Meal statuses that can never change again by themselves (PAUSED only once the resume window has closed - see MessCompletionService). */
export const TERMINAL_MEAL_STATUSES = ['FULFILLED', 'NOT_DELIVERED', 'CANCELLED', 'CONSUMED', 'SKIPPED'] as const;

/** First instant AFTER a meal's business date (exclusive end), in Asia/Kolkata. */
export function endOfBusinessDate(date: string): Date {
  return new Date(`${addDays(date, 1)}T00:00:00+05:30`);
}

export const ACCOUNT_REJECTION_REASON_CODES = ['INCOMPLETE_DETAILS', 'NOT_ELIGIBLE', 'SERVICE_POINT_MISMATCH', 'OTHER'] as const;
export const CUSTOMER_MESS_CANCEL_REASON_CODES = ['CHANGED_MIND', 'ORDERED_BY_MISTAKE', 'WRONG_PLAN', 'WRONG_START_DATE', 'OTHER'] as const;
export const ADMIN_MESS_CANCEL_REASON_CODES = ['PLAN_WITHDRAWN', 'SERVICE_UNAVAILABLE', 'ACCOUNT_ISSUE', 'PAYMENT_ISSUE', 'OPERATIONAL_ISSUE', 'OTHER'] as const;

// ------------------------------------------------------------------------------------------------ business dates
const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: MESS_BUSINESS_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Today's business date (YYYY-MM-DD) in the Mess business timezone. */
export function businessDate(now: Date = new Date()): string {
  return dateFormatter.format(now);
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function dateFromString(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function dateToString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number): string {
  const d = dateFromString(value);
  d.setUTCDate(d.getUTCDate() + days);
  return dateToString(d);
}

/** Inclusive last day of a term that starts on `startDate` and lasts `durationDays` days. */
export function termEnd(startDate: string, durationDays: number): string {
  return addDays(startDate, durationDays - 1);
}

// ------------------------------------------------------------------------------------------------ slot service times (P10B)
export const HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** null when valid, otherwise a short problem: exactly one strict HH:mm per enabled slot, no missing, no extra, no unknown key. */
export function slotTimesProblem(slotTimes: unknown, slots: readonly string[]): string | null {
  if (slotTimes === null || slotTimes === undefined || typeof slotTimes !== 'object' || Array.isArray(slotTimes)) return 'slotTimes must be set';
  const map = slotTimes as Record<string, unknown>;
  const keys = Object.keys(map);
  for (const k of keys) if (!slots.includes(k)) return `slotTimes has a time for a slot that is not enabled: ${k}`;
  for (const s of slots) {
    if (typeof map[s] !== 'string' || !HHMM_PATTERN.test(map[s] as string)) return `slotTimes needs a valid HH:mm time for ${s}`;
  }
  return null;
}

const dateString = (label: string) => z.string().refine(isValidDateString, { message: `${label} must be a valid date (YYYY-MM-DD)` });

// ------------------------------------------------------------------------------------------------ zod schemas
const text = (label: string, min: number, max: number) =>
  z
    .string()
    .transform((v) => v.replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(min, `${label} is required`).max(max, `${label} is too long`));

const optionalText = (max: number) =>
  z
    .string()
    .transform((v) => v.replace(/\s+/g, ' ').trim())
    .pipe(z.string().max(max))
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

const codeSchema = z
  .string()
  .transform((v) => v.trim().toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9_-]{1,39}$/, 'Code must be 2-40 characters: letters, digits, - or _'));

/** Decimal supplied as number or string; at most `places` decimals; never a float computation. */
function decimalInput(label: string, places: number) {
  return z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === 'number' ? String(v) : v.trim()))
    .pipe(z.string().regex(new RegExp(`^\\d{1,9}(\\.\\d{1,${places}})?$`), `${label} must be a non-negative number with at most ${places} decimals`));
}

export const priceSchema = decimalInput('Price', 2).refine((v) => Number(v) <= MAX_PRICE, { message: `Price must not exceed ${MAX_PRICE}` });
export const taxRateSchema = decimalInput('Tax rate', 4).refine((v) => Number(v) <= 1, { message: 'Tax rate must be a fraction between 0 and 1 (a fraction, not a percentage)' }); // a fraction, never a percentage

const slotTimesSchema = z
  .object({
    BREAKFAST: z.string().regex(HHMM_PATTERN, 'Use HH:mm (24-hour)').optional(),
    LUNCH: z.string().regex(HHMM_PATTERN, 'Use HH:mm (24-hour)').optional(),
    DINNER: z.string().regex(HHMM_PATTERN, 'Use HH:mm (24-hour)').optional()
  })
  .strict();

const slotsSchema = z
  .array(z.enum(MEAL_SLOTS))
  .max(MEAL_SLOTS.length)
  .refine((s) => new Set(s).size === s.length, { message: 'Meal slots must not contain duplicates' });

export const servicePointCreateSchema = z
  .object({
    code: codeSchema,
    name: text('Name', 2, 120),
    gateLabel: optionalText(80),
    deliveryInstructions: optionalText(300),
    addressLine: text('Address', 3, 200),
    city: text('City', 2, 80),
    postalCode: text('Postal code', 3, 12),
    branchId: z.string().uuid()
  })
  .strict();

export const servicePointUpdateSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    name: text('Name', 2, 120).optional(),
    gateLabel: optionalText(80),
    deliveryInstructions: optionalText(300),
    addressLine: text('Address', 3, 200).optional(),
    city: text('City', 2, 80).optional(),
    postalCode: text('Postal code', 3, 12).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional()
  })
  .strict();

const planFields = {
  name: text('Name', 2, 120),
  description: optionalText(500),
  durationDays: z.number().int().min(1).max(MAX_DURATION_DAYS),
  basePrice: priceSchema,
  taxRate: taxRateSchema.nullable(),
  mealSlots: slotsSchema,
  pauseCutoffHours: z.number().int().min(0).max(MAX_PAUSE_CUTOFF_HOURS).nullable(),
  maxPauses: z.number().int().min(0).max(MAX_PAUSES).nullable(),
  minStartLeadDays: z.number().int().min(0).max(MAX_LEAD_DAYS).nullable(),
  validFrom: dateString('validFrom').nullable(),
  validUntil: dateString('validUntil').nullable(),
  branchId: z.string().uuid().nullable(),
  slotTimes: slotTimesSchema.nullable()
};

/** A plan is always created as a DRAFT (incomplete values are allowed); it only becomes sellable through the explicit activate action. */
export const planCreateSchema = z
  .object({
    code: codeSchema,
    name: planFields.name,
    description: planFields.description,
    durationDays: planFields.durationDays,
    basePrice: planFields.basePrice,
    taxRate: planFields.taxRate.optional(),
    mealSlots: planFields.mealSlots.optional(),
    pauseCutoffHours: planFields.pauseCutoffHours.optional(),
    maxPauses: planFields.maxPauses.optional(),
    minStartLeadDays: planFields.minStartLeadDays.optional(),
    validFrom: planFields.validFrom.optional(),
    validUntil: planFields.validUntil.optional(),
    branchId: planFields.branchId.optional(),
    slotTimes: planFields.slotTimes.optional()
  })
  .strict();

export const planUpdateSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    name: planFields.name.optional(),
    description: planFields.description,
    durationDays: planFields.durationDays.optional(),
    basePrice: planFields.basePrice.optional(),
    taxRate: planFields.taxRate.optional(),
    mealSlots: planFields.mealSlots.optional(),
    pauseCutoffHours: planFields.pauseCutoffHours.optional(),
    maxPauses: planFields.maxPauses.optional(),
    minStartLeadDays: planFields.minStartLeadDays.optional(),
    validFrom: planFields.validFrom.optional(),
    validUntil: planFields.validUntil.optional(),
    branchId: planFields.branchId.optional(),
    slotTimes: planFields.slotTimes.optional()
  })
  .strict();

export const planActionSchema = z.object({ expectedVersion: z.number().int().min(1) }).strict();

export const accountWriteSchema = z
  .object({
    servicePointId: z.string().uuid(),
    roomNumber: text('Room number', 1, 20),
    studentIdCard: optionalText(40)
  })
  .strict();

export const purchaseBodySchema = z.object({ planId: z.string().uuid(), startDate: dateString('startDate') }).strict();

export const accountApproveSchema = z.object({ expectedServicePointId: z.string().uuid() }).strict();
export const accountRejectSchema = z
  .object({
    reasonCode: z.enum(ACCOUNT_REJECTION_REASON_CODES),
    note: z.string().max(400).optional().nullable()
  })
  .strict();

const noteField = z
  .string()
  .max(400)
  .optional()
  .nullable()
  .transform((v) => sanitizeNote(v));

export const customerCancelSchema = z.object({ reasonCode: z.enum(CUSTOMER_MESS_CANCEL_REASON_CODES), note: noteField }).strict();
export const adminCancelSchema = z.object({ reasonCode: z.enum(ADMIN_MESS_CANCEL_REASON_CODES), note: noteField }).strict();

export const listQuerySchema = z
  .object({
    status: z.string().max(30).optional(),
    servicePointId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50)
  })
  .strict();

export const idParams = z.object({ id: z.string().uuid() });
export const mealParams = z.object({ id: z.string().uuid(), mealId: z.string().uuid() });
export const calendarQuerySchema = z.object({ from: dateString('from').optional(), to: dateString('to').optional() }).strict();
export const kitchenReadQuerySchema = z.object({ branchId: z.string().uuid().optional(), from: dateString('from').optional(), to: dateString('to').optional() }).strict();
export const runParams = z.object({ id: z.string().uuid() });
export const stopParams = z.object({ id: z.string().uuid(), stopId: z.string().uuid() });
export const deliveryQuerySchema = z.object({ branchId: z.string().uuid().optional() }).strict();
/** The code is a plain bounded string: a zod error never echoes the value. */
export const handoverVerifySchema = z.object({ code: z.string().min(1).max(32) }).strict();
export const stopFailSchema = z
  .object({
    reasonCode: z.enum(STOP_FAILURE_CODES),
    note: z.string().max(1000).transform((v) => sanitizeNote(v)).optional()
  })
  .strict()
  .refine((b) => b.reasonCode !== 'OTHER' || (typeof b.note === 'string' && b.note.length >= 3), { message: 'A short note is required for OTHER', path: ['note'] });
export const stopOverrideSchema = z
  .object({
    reasonCode: z.enum(STOP_OVERRIDE_REASON_CODES),
    note: z
      .string()
      .max(1000)
      .transform((v) => sanitizeNote(v))
      .refine((v): v is string => typeof v === 'string' && v.length >= 10, { message: 'A note of at least 10 characters is required' }),
    confirm: z.literal(true)
  })
  .strict();
export const batchStartSchema = z.object({ branchId: z.string().uuid(), mealDate: dateString('mealDate'), slot: z.enum(MEAL_SLOTS) }).strict();
export const emptyBodySchema = z.object({}).strict();

// ------------------------------------------------------------------------------------------------ plan completeness (ACTIVE requires everything)
export interface PlanDraftValues {
  basePrice: Prisma.Decimal | string | number;
  taxRate: Prisma.Decimal | string | number | null;
  durationDays: number;
  mealSlots: readonly string[];
  pauseCutoffHours: number | null;
  maxPauses: number | null;
  minStartLeadDays: number | null;
  validFrom: Date | null;
  validUntil: Date | null;
  slotTimes: unknown;
}

/** Problems that make a plan unsellable. Empty array = may be ACTIVE. Used by the service AND mirrored by the DB CHECK constraint. */
export function planActivationProblems(p: PlanDraftValues): string[] {
  const problems: string[] = [];
  const price = new Prisma.Decimal(p.basePrice);
  if (!(price.greaterThan(0) && price.lessThanOrEqualTo(MAX_PRICE))) problems.push('basePrice must be greater than 0');
  if (p.taxRate === null || p.taxRate === undefined) problems.push('taxRate must be set explicitly');
  else {
    const t = new Prisma.Decimal(p.taxRate);
    if (t.isNegative() || t.greaterThan(1)) problems.push('taxRate must be between 0 and 1');
  }
  if (!Number.isInteger(p.durationDays) || p.durationDays < 1) problems.push('durationDays must be at least 1');
  if (p.mealSlots.length < 1) problems.push('at least one meal slot is required');
  if (new Set(p.mealSlots).size !== p.mealSlots.length) problems.push('meal slots must not repeat');
  if (p.mealSlots.some((s) => !(MEAL_SLOTS as readonly string[]).includes(s))) problems.push('unknown meal slot');
  if (p.pauseCutoffHours === null) problems.push('pauseCutoffHours must be set');
  if (p.maxPauses === null) problems.push('maxPauses must be set');
  if (p.minStartLeadDays === null) problems.push('minStartLeadDays must be set');
  if (p.validFrom && p.validUntil && !(p.validFrom.getTime() < p.validUntil.getTime())) problems.push('validUntil must be after validFrom');
  const stProblem = slotTimesProblem(p.slotTimes, p.mealSlots);
  if (stProblem) problems.push(stProblem);
  return problems;
}

export function assertPlanActivatable(p: PlanDraftValues): void {
  const problems = planActivationProblems(p);
  if (problems.length) throw new AppError(`This plan is not complete enough to sell: ${problems.join('; ')}`, 422, 'PLAN_INCOMPLETE');
}

/** True when the plan may be sold on the given business date. */
export function planWithinWindow(plan: { validFrom: Date | null; validUntil: Date | null }, today: string): boolean {
  if (plan.validFrom && today < dateToString(plan.validFrom)) return false;
  if (plan.validUntil && today > dateToString(plan.validUntil)) return false;
  return true;
}

// ------------------------------------------------------------------------------------------------ idempotency fingerprint
export function computePurchaseFingerprint(input: { customerProfileId: string; planId: string; startDate: string }): string {
  return createHash('sha256')
    .update(canonicalJson({ v: 1, policy: MESS_PURCHASE_POLICY_ID, customerProfileId: input.customerProfileId, planId: input.planId, startDate: input.startDate }))
    .digest('hex');
}

// ------------------------------------------------------------------------------------------------ locks
export type MessTx = Prisma.TransactionClient;

export const lockRow = {
  account: (tx: MessTx, id: string) => tx.$queryRaw`SELECT "id" FROM "mess_accounts" WHERE "id" = ${id} FOR UPDATE`,
  plan: (tx: MessTx, id: string) => tx.$queryRaw`SELECT "id" FROM "mess_subscription_plans" WHERE "id" = ${id} FOR UPDATE`,
  planShared: (tx: MessTx, id: string) => tx.$queryRaw`SELECT "id" FROM "mess_subscription_plans" WHERE "id" = ${id} FOR SHARE`,
  servicePoint: (tx: MessTx, id: string) => tx.$queryRaw`SELECT "id" FROM "mess_service_points" WHERE "id" = ${id} FOR UPDATE`,
  servicePointShared: (tx: MessTx, id: string) => tx.$queryRaw`SELECT "id" FROM "mess_service_points" WHERE "id" = ${id} FOR SHARE`,
  subscription: (tx: MessTx, id: string) => tx.$queryRaw`SELECT "id" FROM "mess_subscriptions" WHERE "id" = ${id} FOR UPDATE`,
  /**
   * P10B same-day rule: the transaction-scoped lock of ONE (branch, date, slot) batch key. BOTH batch start and the first-day check of a same-day activation take it,
   * so exactly one of them goes first: either the meal exists before the batch freezes (and is attached), or the batch exists first (and the purchase cannot activate).
   * Held until commit. A settlement takes several keys in slot order; batch start takes exactly one and nothing else first, so no cycle is possible.
   */
  batchKey: (tx: MessTx, branchId: string, date: string, slot: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`pb-mess-batch|${branchId}|${date}|${slot}`}, 0))`
};

export function isUniqueViolation(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
