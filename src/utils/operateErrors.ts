import { ApiRequestError } from '../services/apiClient';
import { StepUpCancelledError } from '../components/admin/adminErrors';

/**
 * Administrator-facing copy for the SUPER_ADMIN delivery operations (direct orders and Kerala Mess runs).
 * Server `message` text is never rendered: every known code maps to fixed copy, anything else gets generic text by status.
 */
export type OperateErrorKind = 'cancelled' | 'session-expired' | 'step-up-required' | 'wrong-password' | 'validation' | 'other';

export interface OperateErrorInfo {
  kind: OperateErrorKind;
  code: string | null;
  /** Safe, fixed copy ('' for a cancelled step-up). */
  message: string;
  /** The screen the administrator was looking at is probably out of date: reload it. */
  refresh: boolean;
}

const REFRESHED = ' The list has been refreshed.';

const BY_CODE: Record<string, { message: string; refresh: boolean }> = {
  // ---- direct-order delivery
  ORDER_NOT_FOUND: { message: 'This order is not available for delivery operation (any more).' + REFRESHED, refresh: true },
  NOT_FOUND: { message: 'That record was not found. It may have changed.' + REFRESHED, refresh: true },
  DELIVERY_OWNED_BY_DRIVER: { message: 'A driver still owns this delivery. Take it over first.' + REFRESHED, refresh: true },
  DELIVERY_NOT_OPERATED: { message: 'This delivery has not been started by an administrator yet.' + REFRESHED, refresh: true },
  ORDER_NOT_OPERATIONALLY_ELIGIBLE: { message: 'This order is not eligible for delivery right now (it may have been cancelled or refunded).' + REFRESHED, refresh: true },
  ORDER_NOT_DISPATCHED: { message: 'This step is only possible once the order is out for delivery.' + REFRESHED, refresh: true },
  ORDER_STATE_CONFLICT: { message: 'Another update happened at the same time. Review the list and try again.' + REFRESHED, refresh: true },
  INVALID_ORDER_TRANSITION: { message: 'This order has already moved on, so that step is not possible.' + REFRESHED, refresh: true },
  INVALID_DELIVERY_STATE: { message: 'This delivery is not in a state where that is possible.' + REFRESHED, refresh: true },
  DELIVERY_ASSIGNMENT_CHANGED: { message: 'The delivery owner changed in the meantime. Review it and try again.' + REFRESHED, refresh: true },
  DELIVERY_ATTEMPT_CHANGED: { message: 'This delivery changed in the meantime. Review it and try again.' + REFRESHED, refresh: true },
  DELIVERY_NOT_FAILED: { message: 'Only a delivery with a reported problem can be retried.' + REFRESHED, refresh: true },
  DELIVERY_ATTEMPT_LIMIT_REACHED: { message: 'The maximum number of delivery attempts has been reached. Use Cancel & Full Refund or the exceptional handover in the Delivery section.' + REFRESHED, refresh: true },
  DELIVERY_IN_EXCEPTION: { message: 'A problem was reported for this delivery. Retry it first.' + REFRESHED, refresh: true },
  ALREADY_DELIVERED: { message: 'This delivery has already been completed.' + REFRESHED, refresh: true },
  INVALID_DELIVERY_CODE: { message: 'That code is not correct. Check it with the customer and try again.', refresh: true },
  INVALID_DELIVERY_CODE_FORMAT: { message: 'Enter the 6-digit delivery code.', refresh: false },
  DELIVERY_CODE_NOT_ISSUED: { message: 'The customer has not generated a delivery code yet. Ask them to open their order and tap "Get my delivery code".', refresh: true },
  DELIVERY_CODE_LOCKED: { message: 'Too many incorrect codes. Code entry is locked for a while; the list shows when it unlocks.', refresh: true },
  DELIVERY_CODE_BLOCKED: { message: 'This code is blocked. The customer must generate a new delivery code.', refresh: true },
  DELIVERY_CODE_CHANGED: { message: 'The customer generated a new delivery code. Ask for the latest one.', refresh: true },
  // ---- Kerala Mess runs and stops
  RUN_OWNED_BY_DRIVER: { message: 'A driver still owns this run.' + REFRESHED, refresh: true },
  RUN_NOT_OPERATED: { message: 'This run has not been claimed by an administrator yet.' + REFRESHED, refresh: true },
  RUN_NOT_CLAIMED: { message: 'Claim the run before starting it.' + REFRESHED, refresh: true },
  RUN_NOT_AVAILABLE: { message: 'This run is no longer available to claim.' + REFRESHED, refresh: true },
  RUN_NOT_IN_TRANSIT: { message: 'Start the run before confirming a handover.' + REFRESHED, refresh: true },
  RUN_CHANGED: { message: 'This run changed in the meantime.' + REFRESHED, refresh: true },
  RUN_OWNER_CHANGED: { message: 'The run owner changed in the meantime.' + REFRESHED, refresh: true },
  RUN_NOT_TAKEOVER_ELIGIBLE: { message: 'This run cannot be taken over in its current state.' + REFRESHED, refresh: true },
  ALREADY_CLAIMED: { message: 'This run is already claimed.' + REFRESHED, refresh: true },
  DELIVERY_DAY_ENDED: { message: 'The day of this run has already ended, so it can no longer be worked.' + REFRESHED, refresh: true },
  STOP_NOT_PENDING: { message: 'This stop is not waiting for a handover.' + REFRESHED, refresh: true },
  STOP_NOT_FAILED: { message: 'Only a stop with a reported problem can be retried.' + REFRESHED, refresh: true },
  STOP_CHANGED: { message: 'This stop just changed.' + REFRESHED, refresh: true },
  STOP_CLOSED: { message: 'This stop has been closed.' + REFRESHED, refresh: true },
  STOP_FAILED: { message: 'A problem was reported for this stop. Retry it first.' + REFRESHED, refresh: true },
  STOP_QUANTITY_MISMATCH: { message: 'The meals of this stop changed, so nothing was confirmed.' + REFRESHED, refresh: true },
  HANDOVER_CODE_NOT_ISSUED: { message: 'No resident has requested the handover code yet. Ask a resident of this service point to open their meal calendar.', refresh: true },
  HANDOVER_CODE_LOCKED: { message: 'Too many incorrect codes. Code entry is locked for a while.', refresh: true },
  HANDOVER_CODE_BLOCKED: { message: 'This handover code is blocked. A resident must generate a new one.', refresh: true },
  HANDOVER_CODE_EXPIRED: { message: 'The handover code has expired. A resident must generate a new one.', refresh: true },
  HANDOVER_CODE_CHANGED: { message: 'A new handover code was generated. Ask the resident for the latest one.', refresh: true },
  INVALID_HANDOVER_CODE: { message: 'That handover code is not correct.', refresh: true },
  INVALID_HANDOVER_CODE_FORMAT: { message: 'Enter the 6-digit handover code.', refresh: false }
};

export function describeOperateError(err: unknown): OperateErrorInfo {
  if (err instanceof StepUpCancelledError) return { kind: 'cancelled', code: null, message: '', refresh: false };
  if (!(err instanceof ApiRequestError)) return { kind: 'other', code: null, message: 'Something went wrong. Please try again.', refresh: false };

  const { code, status } = err;
  if (code === 'NETWORK_ERROR' || status === undefined) {
    return { kind: 'other', code, message: 'Could not reach the server. Check your connection and try again. Nothing was confirmed.', refresh: false };
  }
  if (status === 401) {
    if (code === 'STEP_UP_FAILED') return { kind: 'wrong-password', code, message: 'That password is not correct.', refresh: false };
    return { kind: 'session-expired', code, message: 'Your session has ended. Please sign in again.', refresh: false };
  }
  if (code === 'STEP_UP_REQUIRED') {
    return { kind: 'step-up-required', code, message: 'Password verification expired or was rejected. Confirm your password and try again.', refresh: false };
  }
  const mapped = BY_CODE[code];
  if (mapped) return { kind: 'other', code, ...mapped };
  if (status === 429) return { kind: 'other', code, message: 'Too many attempts. Please wait a moment before trying again.', refresh: false };
  if (status === 403) return { kind: 'other', code, message: 'You are not authorized to do that.', refresh: false };
  if (status === 404) return { kind: 'other', code, message: 'That record was not found.' + REFRESHED, refresh: true };
  if (status === 409) return { kind: 'other', code, message: 'This changed in the meantime.' + REFRESHED, refresh: true };
  if (status === 400 || status === 422) return { kind: 'validation', code, message: 'That request was not valid. Please check the details and try again.', refresh: false };
  if (status >= 500) return { kind: 'other', code, message: 'The server could not complete the request. Nothing was confirmed. Please try again shortly.', refresh: false };
  return { kind: 'other', code, message: 'Something went wrong. Please try again.', refresh: false };
}
