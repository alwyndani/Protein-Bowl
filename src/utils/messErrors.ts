import { ApiRequestError } from '../services/apiClient';

/**
 * Customer-facing copy for the Kerala Mess API. Server `message` text is never rendered directly: every known code maps to fixed copy,
 * anything else gets generic text. Raw provider/DB errors never leave the server.
 */
export type MessErrorAction = 'SIGN_IN' | 'LEGACY_ROLE' | 'REFRESH' | 'NONE';

export interface MessUserError {
  code: string;
  action: MessErrorAction;
  message: string;
}

const TABLE: Record<string, { action: MessErrorAction; message: string }> = {
  UNAUTHORIZED: { action: 'SIGN_IN', message: 'Your session has expired. Please sign in again.' },
  TOKEN_EXPIRED: { action: 'SIGN_IN', message: 'Your session has expired. Please sign in again.' },
  ACCOUNT_INACTIVE: { action: 'SIGN_IN', message: 'Your session has ended. Please sign in again.' },
  MESS_CUSTOMER_LEGACY_ROLE: { action: 'LEGACY_ROLE', message: 'This account uses a legacy Kerala Mess role. Please contact Protein Bowl support to move it to a customer account.' },
  FORBIDDEN: { action: 'NONE', message: 'This account cannot use Kerala Mess.' },
  SERVICE_POINT_UNAVAILABLE: { action: 'REFRESH', message: 'That service point is not available any more. Please choose another one.' },
  ACCOUNT_CHANGE_BLOCKED: { action: 'NONE', message: 'You have an open Kerala Mess subscription, so your hostel details cannot be changed until it ends or is cancelled.' },
  MESS_ACCOUNT_REQUIRED: { action: 'REFRESH', message: 'Add your hostel details first.' },
  MESS_ACCOUNT_NOT_APPROVED: { action: 'REFRESH', message: 'Your Kerala Mess account has not been approved yet.' },
  PLAN_NOT_AVAILABLE: { action: 'REFRESH', message: 'This plan is not available right now. Please choose another plan.' },
  MESS_START_DAY_UNAVAILABLE: { action: 'NONE', message: "Today's meals can no longer be prepared for this plan. Please choose a later start date." },
  START_DATE_TOO_EARLY: { action: 'NONE', message: 'That start date is too early for this plan. Please pick a later date.' },
  START_DATE_TOO_LATE: { action: 'NONE', message: 'That start date is too far ahead. Please pick an earlier date.' },
  OPEN_PURCHASE_EXISTS: { action: 'REFRESH', message: 'You already have an unpaid Kerala Mess purchase. Pay for it or cancel it first.' },
  SUBSCRIPTION_OVERLAP: { action: 'NONE', message: 'This term overlaps with one of your existing subscriptions. Please pick a later start date.' },
  IDEMPOTENCY_KEY_REUSED: { action: 'REFRESH', message: 'That purchase request changed. Please review it and try again.' },
  MESS_SUBSCRIPTION_STARTED: { action: 'REFRESH', message: 'This subscription has already started, so it can no longer be cancelled here. Please contact Protein Bowl support.' },
  MESS_CANCELLATION_NOT_ALLOWED: { action: 'REFRESH', message: 'This subscription can no longer be cancelled here. Please contact Protein Bowl support.' },
  CANCELLATION_NOT_ALLOWED: { action: 'REFRESH', message: 'This subscription can no longer be cancelled here. Please contact Protein Bowl support.' },
  MEAL_FROZEN: { action: 'REFRESH', message: 'The kitchen has already started preparing this meal, so it can no longer be paused or resumed.' },
  PAUSE_CUTOFF_PASSED: { action: 'REFRESH', message: 'The cut-off for this meal has passed, so it can no longer be paused or resumed.' },
  PAUSE_LIMIT_REACHED: { action: 'REFRESH', message: 'You have used all the pauses in this subscription.' },
  SUBSCRIPTION_NOT_ACTIVE: { action: 'REFRESH', message: 'This subscription is not active.' },
  MEAL_CANCELLED: { action: 'REFRESH', message: 'This meal was cancelled.' },
  MEAL_NOT_SCHEDULED: { action: 'REFRESH', message: 'This meal can no longer be paused.' },
  MEAL_NOT_PAUSED: { action: 'REFRESH', message: 'This meal is not paused.' },
  BATCH_NOT_READY: { action: 'REFRESH', message: 'Only a batch that is marked ready can be released for delivery.' },
  BATCH_EXPIRED: { action: 'REFRESH', message: 'This batch belongs to a day that has already ended.' },
  BATCH_CHANGED: { action: 'REFRESH', message: 'This batch changed. Please refresh and try again.' },
  ALREADY_CLAIMED: { action: 'REFRESH', message: 'Another driver has already claimed this run.' },
  RUN_NOT_AVAILABLE: { action: 'REFRESH', message: 'This run is no longer available.' },
  RUN_NOT_CLAIMED: { action: 'REFRESH', message: 'Claim the run before starting it.' },
  RUN_NOT_IN_TRANSIT: { action: 'REFRESH', message: 'Start the run before confirming a handover.' },
  DELIVERY_DAY_ENDED: { action: 'REFRESH', message: 'The day of this run has ended, so it can no longer be worked on.' },
  HANDOVER_CODE_NOT_ISSUED: { action: 'NONE', message: 'No resident has requested the handover code yet. Ask a resident of this service point to open their meal calendar.' },
  HANDOVER_CODE_LOCKED: { action: 'REFRESH', message: 'Too many incorrect codes. Code entry is locked for a while.' },
  HANDOVER_CODE_BLOCKED: { action: 'REFRESH', message: 'This handover code is blocked. A resident must generate a new one.' },
  HANDOVER_CODE_EXPIRED: { action: 'REFRESH', message: 'The handover code has expired. A resident must generate a new one.' },
  HANDOVER_CODE_CHANGED: { action: 'NONE', message: 'A new handover code was generated. Ask the resident for the latest one.' },
  INVALID_HANDOVER_CODE: { action: 'NONE', message: 'That handover code is not correct.' },
  INVALID_HANDOVER_CODE_FORMAT: { action: 'NONE', message: 'Enter the 6-digit handover code.' },
  ALREADY_HANDED_OVER: { action: 'REFRESH', message: 'This stop has already been handed over.' },
  STOP_CLOSED: { action: 'REFRESH', message: 'This stop has been closed.' },
  STOP_FAILED: { action: 'REFRESH', message: 'A problem was reported for this stop. Retry it first.' },
  STOP_NOT_PENDING: { action: 'REFRESH', message: 'This stop is not waiting for a handover.' },
  STOP_NOT_FAILED: { action: 'REFRESH', message: 'Only a stop with a reported problem can be retried.' },
  STOP_CHANGED: { action: 'REFRESH', message: 'This stop just changed. Please refresh.' },
  STOP_QUANTITY_MISMATCH: { action: 'REFRESH', message: 'The meals of this stop changed, so nothing was confirmed. Please contact the Protein Bowl team.' },
  DELIVERY_ATTEMPT_LIMIT_REACHED: { action: 'REFRESH', message: 'The maximum number of delivery attempts for this stop has been reached.' },
  HANDOVER_NOT_AVAILABLE: { action: 'REFRESH', message: 'A handover code is not available for this meal right now.' },
  HANDOVER_CODE_ALREADY_ISSUED: { action: 'REFRESH', message: 'You already generated the handover code for your service point.' },
  HANDOVER_CODE_ISSUED_TO_ANOTHER: { action: 'REFRESH', message: 'A resident of your service point already holds the handover code for this delivery.' },
  HANDOVER_REGENERATION_LIMIT: { action: 'NONE', message: 'You cannot generate more new handover codes for this delivery.' },
  MEAL_CHANGED: { action: 'REFRESH', message: 'This meal was just changed. Please check its state and try again.' },
  NOT_FOUND: { action: 'REFRESH', message: 'We could not find that. Please refresh.' },
  TOO_MANY_REQUESTS: { action: 'NONE', message: 'Too many requests. Please wait a moment and try again.' },
  VALIDATION_ERROR: { action: 'NONE', message: 'Please check the details you entered.' }
};

/** 422 answers that carry their own safe copy (a wrong code is not a form-validation problem). */
const HANDOVER_422 = new Set(['INVALID_HANDOVER_CODE', 'INVALID_HANDOVER_CODE_FORMAT']);

export function describeMessError(err: unknown): MessUserError {
  if (err instanceof ApiRequestError) {
    if (err.status === 401) return { code: 'UNAUTHORIZED', ...TABLE.UNAUTHORIZED };
    if (err.status === 422 && !HANDOVER_422.has(err.code)) return { code: err.code, ...TABLE.VALIDATION_ERROR };
    const hit = TABLE[err.code];
    if (hit) return { code: err.code, ...hit };
    if (err.status === 429) return { code: 'TOO_MANY_REQUESTS', ...TABLE.TOO_MANY_REQUESTS };
    if (err.status === 404) return { code: err.code, ...TABLE.NOT_FOUND };
    return { code: err.code, action: 'NONE', message: 'Something went wrong. Please try again, or contact Protein Bowl support if it keeps happening.' };
  }
  return { code: 'NETWORK', action: 'NONE', message: 'We could not reach the server. Please check your connection and try again.' };
}

export const MESS_CANCEL_REASONS: Array<{ code: string; label: string }> = [
  { code: 'CHANGED_MIND', label: 'I changed my mind' },
  { code: 'ORDERED_BY_MISTAKE', label: 'I ordered by mistake' },
  { code: 'WRONG_PLAN', label: 'I chose the wrong plan' },
  { code: 'WRONG_START_DATE', label: 'I chose the wrong start date' },
  { code: 'OTHER', label: 'Another reason' }
];

export const REJECTION_LABELS: Record<string, string> = {
  INCOMPLETE_DETAILS: 'Some of your details were incomplete.',
  NOT_ELIGIBLE: 'The account was not eligible for this service point.',
  SERVICE_POINT_MISMATCH: 'The selected service point did not match your details.',
  OTHER: 'The account could not be approved.'
};
