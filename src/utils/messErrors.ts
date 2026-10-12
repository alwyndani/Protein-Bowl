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
  START_DATE_TOO_EARLY: { action: 'NONE', message: 'That start date is too early for this plan. Please pick a later date.' },
  START_DATE_TOO_LATE: { action: 'NONE', message: 'That start date is too far ahead. Please pick an earlier date.' },
  OPEN_PURCHASE_EXISTS: { action: 'REFRESH', message: 'You already have an unpaid Kerala Mess purchase. Pay for it or cancel it first.' },
  SUBSCRIPTION_OVERLAP: { action: 'NONE', message: 'This term overlaps with one of your existing subscriptions. Please pick a later start date.' },
  IDEMPOTENCY_KEY_REUSED: { action: 'REFRESH', message: 'That purchase request changed. Please review it and try again.' },
  MESS_SUBSCRIPTION_STARTED: { action: 'REFRESH', message: 'This subscription has already started, so it can no longer be cancelled here. Please contact Protein Bowl support.' },
  MESS_CANCELLATION_NOT_ALLOWED: { action: 'REFRESH', message: 'This subscription can no longer be cancelled here. Please contact Protein Bowl support.' },
  CANCELLATION_NOT_ALLOWED: { action: 'REFRESH', message: 'This subscription can no longer be cancelled here. Please contact Protein Bowl support.' },
  NOT_FOUND: { action: 'REFRESH', message: 'We could not find that. Please refresh.' },
  TOO_MANY_REQUESTS: { action: 'NONE', message: 'Too many requests. Please wait a moment and try again.' },
  VALIDATION_ERROR: { action: 'NONE', message: 'Please check the details you entered.' }
};

export function describeMessError(err: unknown): MessUserError {
  if (err instanceof ApiRequestError) {
    if (err.status === 401) return { code: 'UNAUTHORIZED', ...TABLE.UNAUTHORIZED };
    if (err.status === 422) return { code: err.code, ...TABLE.VALIDATION_ERROR };
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
