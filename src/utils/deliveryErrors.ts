import { ApiRequestError } from '../services/apiClient';

/** What the UI should do next about a delivery error. */
export type DeliveryErrorAction = 'SIGN_IN' | 'REFRESH' | 'NONE';

export interface DeliveryErrorInfo {
  code: string | null;
  action: DeliveryErrorAction;
  /** Safe, fixed copy. Raw backend text is NEVER shown. */
  message: string;
}

const BY_CODE: Record<string, { message: string; action: DeliveryErrorAction }> = {
  ORDER_NOT_FOUND: { message: 'This order is no longer available to you. The list has been refreshed.', action: 'REFRESH' },
  ALREADY_CLAIMED: { message: 'Another driver has already claimed this order. The list has been refreshed.', action: 'REFRESH' },
  ORDER_NOT_CLAIMABLE: { message: 'This order is not ready for pickup (any more). The list has been refreshed.', action: 'REFRESH' },
  INVALID_ORDER_TRANSITION: { message: 'This order has already moved on, so that step is not possible. The list has been refreshed.', action: 'REFRESH' },
  ORDER_STATE_CONFLICT: { message: 'Another update happened at the same time. The list has been refreshed; please check and try again.', action: 'REFRESH' },
  ORDER_NOT_OPERATIONALLY_ELIGIBLE: { message: 'This order cannot be taken for delivery right now. The list has been refreshed.', action: 'REFRESH' },
  ORDER_NOT_DISPATCHED: { message: 'An issue can only be reported once the order is out for delivery.', action: 'REFRESH' },
  INVALID_DELIVERY_STATE: { message: 'This delivery is not in a state where that is possible. The list has been refreshed.', action: 'REFRESH' },
  NO_BRANCH_ASSIGNMENT: { message: 'Your account is not assigned to a branch yet. Please ask an administrator to assign you.', action: 'NONE' },
  NO_EMPLOYEE_PROFILE: { message: 'Your account has no employee profile yet. Please ask an administrator.', action: 'NONE' },
  BRANCH_FORBIDDEN: { message: 'You do not have access to that branch.', action: 'REFRESH' },
  BRANCH_REQUIRED: { message: 'Choose a branch first.', action: 'NONE' },
  BRANCH_NOT_FOUND: { message: 'That branch was not found.', action: 'NONE' },
  FORBIDDEN: { message: 'Your account is not allowed to do that.', action: 'NONE' },
  READ_ONLY_ROLE: { message: 'Your account has read-only access to delivery.', action: 'NONE' },
  // Delivery Code (P9B)
  INVALID_DELIVERY_CODE: { message: 'That code is not correct. Please check it with the customer and try again.', action: 'REFRESH' },
  INVALID_DELIVERY_CODE_FORMAT: { message: 'Enter the 6-digit delivery code.', action: 'NONE' },
  DELIVERY_CODE_NOT_ISSUED: { message: 'The customer has not generated a delivery code yet. Ask them to open their order and tap "Get my delivery code".', action: 'REFRESH' },
  DELIVERY_CODE_LOCKED: { message: 'Too many incorrect codes. Code entry is locked for a while; the list shows when it unlocks.', action: 'REFRESH' },
  DELIVERY_CODE_BLOCKED: { message: 'This code is blocked. The customer must generate a new delivery code.', action: 'REFRESH' },
  DELIVERY_CODE_CHANGED: { message: 'The customer generated a new delivery code. Ask for the latest one.', action: 'REFRESH' },
  DELIVERY_IN_EXCEPTION: { message: 'A problem was reported for this delivery, so it cannot be completed here. Please wait for instructions from the team.', action: 'REFRESH' },
  ALREADY_DELIVERED: { message: 'This delivery has already been completed. The list has been refreshed.', action: 'REFRESH' },
  DELIVERY_CODE_ALREADY_ISSUED: { message: 'You already generated a delivery code for this order. If you no longer have it, generate a new one.', action: 'REFRESH' },
  DELIVERY_CODE_NOT_AVAILABLE: { message: 'A delivery code is not available for this order right now.', action: 'REFRESH' },
  DELIVERY_CODE_REGENERATION_LIMIT: { message: 'The limit for new delivery codes on this order has been reached. Please contact Protein Bowl support.', action: 'NONE' },
  DELIVERY_CODE_REGENERATE_LIMIT: { message: 'You have generated several new codes recently. Please wait before generating another.', action: 'REFRESH' },
  // SUPER_ADMIN assignment
  DELIVERY_ASSIGNMENT_CHANGED: { message: "Someone else changed this order's delivery assignment. The list has been refreshed: review it and try again.", action: 'REFRESH' },
  ORDER_NOT_ASSIGNABLE: { message: 'Delivery can only be assigned while the order is ready and not yet out for delivery. The list has been refreshed.', action: 'REFRESH' },
  DRIVER_INVALID: { message: 'That driver cannot be assigned to this order. Choose an active driver of this branch.', action: 'NONE' },
  STEP_UP_REQUIRED: { message: 'Password confirmation is needed for this action. Please confirm your password and try again.', action: 'NONE' }
};

export function describeDeliveryError(err: unknown): DeliveryErrorInfo {
  if (!(err instanceof ApiRequestError)) return { code: null, action: 'NONE', message: 'Something went wrong. Please try again.' };
  const { code, status } = err;
  if (code === 'NETWORK_ERROR' || status === undefined) return { code, action: 'NONE', message: 'We could not reach the server. Please check your connection; the list will update when it is back.' };
  if (status === 401) return { code, action: 'SIGN_IN', message: 'Your session has expired. Please sign in again.' };
  const mapped = BY_CODE[code];
  if (mapped) return { code, ...mapped };
  if (status === 429) return { code, action: 'NONE', message: 'Too many requests. Please wait a moment and try again.' };
  if (status === 403) return { code, action: 'NONE', message: 'Your account is not allowed to do that.' };
  if (status === 404) return { code, action: 'REFRESH', message: 'This order is no longer available to you. The list has been refreshed.' };
  if (status === 409) return { code, action: 'REFRESH', message: 'The order changed in the meantime. The list has been refreshed.' };
  if (status === 422 || status === 400) return { code, action: 'NONE', message: 'That request was not valid. Please check it and try again.' };
  if (status >= 500) return { code, action: 'NONE', message: 'The server could not complete the request. Please try again shortly.' };
  return { code, action: 'NONE', message: 'Something went wrong. Please try again.' };
}
