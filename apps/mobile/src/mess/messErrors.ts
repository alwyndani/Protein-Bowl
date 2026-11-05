import { ApiError } from '../api/ApiError';
import { messageForError } from '../copy/errorCopy';
import { START_DATE_PASSED_COPY } from './labels';

/**
 * Customer-safe copy for Kerala Mess, keyed ONLY by backend error codes that exist in server/src/modules/mess. Raw server text and
 * codes are never shown. 401 / 403 / 429 / 5xx and network failures keep the shared copy.
 */
const BY_CODE: Record<string, string> = {
  MESS_ACCOUNT_REQUIRED: 'Please add your hostel details first.',
  MESS_ACCOUNT_NOT_APPROVED: 'Your Kerala Mess account has not been approved yet.',
  SERVICE_POINT_UNAVAILABLE: 'That service point is not available right now. Please choose another.',
  PLAN_NOT_AVAILABLE: 'This plan is not available right now.',
  START_DATE_TOO_EARLY: 'That start date is too soon for this plan. Please choose a later date.',
  START_DATE_TOO_LATE: 'That start date is too far ahead. Please choose an earlier date.',
  MESS_START_DAY_UNAVAILABLE: "Today's meals can no longer be prepared for this plan. Please choose a later start date.",
  MESS_START_DATE_PASSED: START_DATE_PASSED_COPY,
  OPEN_PURCHASE_EXISTS: 'You already have an unpaid Kerala Mess purchase. Pay for it or cancel it first.',
  SUBSCRIPTION_OVERLAP: 'This plan would overlap one of your existing subscriptions.',
  ACCOUNT_CHANGE_BLOCKED: 'You have an open subscription, so your hostel details cannot be changed until it ends or is cancelled.',
  IDEMPOTENCY_KEY_REUSED: 'This request no longer matches what you submitted. Please check My subscriptions before trying again.',
  CONFLICT: 'That conflicted with another change. Please refresh and try again.',
  MESS_CANCELLATION_NOT_ALLOWED: 'This subscription can no longer be cancelled.',
  MESS_SUBSCRIPTION_STARTED: 'This subscription has already started and can no longer be cancelled.',
  SUBSCRIPTION_NOT_ACTIVE: 'This subscription is not active.',
  MEAL_CANCELLED: 'This meal was cancelled.',
  MEAL_FROZEN: 'The kitchen has already started preparing this meal.',
  MEAL_NOT_SCHEDULED: 'Only a scheduled meal can be paused.',
  MEAL_NOT_PAUSED: 'Only a paused meal can be resumed.',
  PAUSE_CUTOFF_PASSED: 'The cut-off for this meal has passed.',
  PAUSE_LIMIT_REACHED: 'You have used all the pauses in this subscription.',
  MEAL_CHANGED: 'This meal was just changed. Please refresh and try again.',
  HANDOVER_NOT_AVAILABLE: 'A handover code is not available for this meal right now.',
  HANDOVER_CODE_ALREADY_ISSUED: 'You already generated the handover code. Use "Generate a new code" if you need another.',
  HANDOVER_CODE_ISSUED_TO_ANOTHER: 'A handover code was already issued to another resident of your service point.',
  HANDOVER_CODE_NOT_ISSUED: 'Only the resident who generated the code can generate a new one.',
  HANDOVER_REGENERATION_LIMIT: 'The maximum number of new codes has been reached.',
  VALIDATION_ERROR: 'Please check what you entered and try again.',
  ORDER_NUMBER_UNAVAILABLE: 'We could not create your purchase right now. Please try again shortly.'
};

export function messMessage(error: unknown): string {
  if (error instanceof ApiError && error.kind === 'http') {
    const mapped = BY_CODE[error.code];
    if (mapped && error.status !== 401 && error.status !== 403 && error.status !== 429 && error.status < 500) return mapped;
    if (error.status === 404) return 'We could not find that. It may have changed - please refresh.';
  }
  return messageForError(error, 'generic');
}

/** True when the failure means the customer must sign in again or cannot use this feature at all (nothing to retry). */
export function isAuthFailure(error: unknown): boolean {
  return error instanceof ApiError && error.kind === 'http' && (error.status === 401 || error.status === 403);
}
