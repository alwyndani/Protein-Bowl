import { ApiRequestError } from '../services/apiClient';

/** What the UI should do next about a kitchen error. */
export type KitchenErrorAction = 'SIGN_IN' | 'REFRESH' | 'NONE';

export interface KitchenErrorInfo {
  code: string | null;
  action: KitchenErrorAction;
  /** Safe, fixed copy. Raw backend / provider text is NEVER shown. */
  message: string;
}

const BY_CODE: Record<string, { message: string; action: KitchenErrorAction }> = {
  ORDER_NOT_FOUND: { message: 'This order is no longer available in your kitchen. The queue has been refreshed.', action: 'REFRESH' },
  INVALID_ORDER_TRANSITION: { message: 'This order has already moved on (or was cancelled), so that step is not possible. The queue has been refreshed.', action: 'REFRESH' },
  ORDER_STATE_CONFLICT: { message: 'Another update happened at the same time. The queue has been refreshed; please check and try again.', action: 'REFRESH' },
  ORDER_NOT_OPERATIONALLY_ELIGIBLE: { message: 'This order cannot be worked on right now. The queue has been refreshed.', action: 'REFRESH' },
  NO_BRANCH_ASSIGNMENT: { message: 'Your account is not assigned to a kitchen branch yet. Please ask an administrator to assign you.', action: 'NONE' },
  BRANCH_FORBIDDEN: { message: 'You do not have access to that kitchen branch.', action: 'REFRESH' },
  BRANCH_REQUIRED: { message: 'Choose a kitchen branch to view its queue.', action: 'NONE' },
  FORBIDDEN: { message: 'Your account is not allowed to do that.', action: 'NONE' },
  READ_ONLY_ROLE: { message: 'Your account has read-only access to the kitchen.', action: 'NONE' },
  // SUPER_ADMIN routing
  ORDER_NOT_ROUTABLE: { message: 'This order can no longer be routed (it may have been cancelled or accepted). The list has been refreshed.', action: 'REFRESH' },
  KITCHEN_BRANCH_CHANGED: { message: 'Someone else changed this order\'s kitchen in the meantime. The list has been refreshed: please review and try again.', action: 'REFRESH' },
  KITCHEN_BRANCH_INVALID: { message: 'That kitchen branch is not available. Choose an active branch.', action: 'NONE' },
  STEP_UP_REQUIRED: { message: 'Password confirmation is needed for this action. Please confirm your password and try again.', action: 'NONE' }
};

export function describeKitchenError(err: unknown): KitchenErrorInfo {
  if (!(err instanceof ApiRequestError)) return { code: null, action: 'NONE', message: 'Something went wrong. Please try again.' };
  const { code, status } = err;
  if (code === 'NETWORK_ERROR' || status === undefined) return { code, action: 'NONE', message: 'We could not reach the server. Please check your connection; the queue will update when it is back.' };
  if (status === 401) return { code, action: 'SIGN_IN', message: 'Your session has expired. Please sign in again.' };
  if (status === 429) return { code, action: 'NONE', message: 'Too many requests. Please wait a moment and try again.' };
  const mapped = BY_CODE[code];
  if (mapped) return { code, ...mapped };
  if (status === 403) return { code, action: 'NONE', message: 'Your account is not allowed to do that.' };
  if (status === 404) return { code, action: 'REFRESH', message: 'This order is no longer available. The queue has been refreshed.' };
  if (status === 409) return { code, action: 'REFRESH', message: 'The order changed in the meantime. The queue has been refreshed.' };
  if (status === 422 || status === 400) return { code, action: 'NONE', message: 'That request was not valid. Please check it and try again.' };
  if (status >= 500) return { code, action: 'NONE', message: 'The server could not complete the request. Please try again shortly.' };
  return { code, action: 'NONE', message: 'Something went wrong. Please try again.' };
}
