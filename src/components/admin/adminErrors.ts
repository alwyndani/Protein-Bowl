import { ApiRequestError } from '../../services/apiClient';

export type AdminErrorKind =
  | 'session-expired'
  | 'step-up-required'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'validation'
  | 'rate-limited'
  | 'network'
  | 'server'
  | 'cancelled'
  | 'unknown';

export interface AdminErrorInfo {
  kind: AdminErrorKind;
  status?: number;
  code?: string;
  /** Safe, user-facing text (never a stack trace). */
  message: string;
  /** Field-level messages for 422 responses ("email" -> "Invalid email address"). */
  fieldErrors: Record<string, string>;
}

/** Raised when the administrator dismisses the step-up dialog. Not an error to display. */
export class StepUpCancelledError extends Error {
  constructor() {
    super('Step-up cancelled');
    this.name = 'StepUpCancelledError';
  }
}

/** Friendly explanations for the backend's deterministic business guardrails (409/403 codes). */
const GUARDRAIL_MESSAGES: Record<string, string> = {
  LAST_ROLE: 'An account must keep at least one role. Deactivate the account instead of removing its last role.',
  ROLE_NOT_ASSIGNABLE: 'This role cannot be assigned or revoked through administration (SUPER_ADMIN and customer roles are managed separately).',
  MIXED_IDENTITY: 'Staff and customer identities must stay separate. This account cannot take on a staff role.',
  SELF_MODIFICATION_FORBIDDEN: 'You cannot change your own roles, branches or status.',
  LAST_SUPER_ADMIN: 'The last active Super Admin cannot be deactivated.',
  BRANCH_HAS_ACTIVE_STAFF: 'This branch still has active or pending staff assigned. Reassign them before deactivating the branch.',
  BRANCH_INACTIVE: 'Inactive branches cannot be newly assigned.',
  BRANCH_REQUIRED: 'Branch-scoped roles need at least one branch.',
  NOT_PENDING: 'An invitation can only be reissued while the account is still waiting for first-time setup.',
  INVITATION_PENDING: 'This account is waiting for invitation acceptance; it cannot be activated manually.',
  PASSWORD_SETUP_INCOMPLETE: 'This account never completed password setup, so it cannot be reactivated. Create a new invitation instead.',
  NO_EMPLOYEE_PROFILE: 'This account has no employee profile, so this change is not possible.',
  ACCOUNT_DELETED: 'This account has been deleted.',
  DUPLICATE: 'That value is already in use (email, phone, employee code or branch code).',
  CONCURRENT_MODIFICATION: 'Another change happened at the same time. Please retry.',
  // P8 kitchen routing
  ORDER_NOT_ROUTABLE: 'This order can no longer be routed (it may have been cancelled or accepted by a kitchen). The list has been refreshed.',
  KITCHEN_BRANCH_CHANGED: "Someone else changed this order's kitchen in the meantime. The list has been refreshed: review it and try again.",
  KITCHEN_BRANCH_INVALID: 'That kitchen branch is not available. Choose an active branch.',
  ORDER_STATE_CONFLICT: 'The order changed at the same time. The list has been refreshed: review it and try again.',
  // P9A delivery assignment
  DELIVERY_ASSIGNMENT_CHANGED: "Someone else changed this order's delivery assignment in the meantime. The list has been refreshed: review it and try again.",
  ORDER_NOT_ASSIGNABLE: 'Delivery can only be assigned while the order is ready and not yet out for delivery. The list has been refreshed.',
  DRIVER_INVALID: 'That driver cannot be assigned to this order. Choose an active driver of this branch.',
  // P9B exceptional handover confirmation
  ORDER_NOT_DISPATCHED: 'Only an order that is out for delivery can be confirmed. The list has been refreshed.',
  ALREADY_DELIVERED: 'This delivery has already been completed. The list has been refreshed.',
  INVALID_DELIVERY_STATE: 'This delivery is not in a state that can be confirmed. The list has been refreshed.',
  DELIVERY_NOT_FAILED: 'This delivery is not in a failed state, so it cannot be resolved that way. The list has been refreshed.',
  DELIVERY_ATTEMPT_CHANGED: 'This delivery changed in the meantime (another administrator or the driver acted). The list has been refreshed: review it and try again.',
  DELIVERY_ATTEMPT_LIMIT_REACHED: 'The maximum number of delivery attempts has been reached. Cancel the order with a full refund, or confirm the handover.',
  DRIVER_UNCHANGED: 'Choose a different driver, or retry with the same driver.',
  ORDER_NOT_CANCELLABLE: 'This order cannot be cancelled that way. The list has been refreshed.',
  CANCELLATION_NOT_ALLOWED: 'This order cannot be cancelled right now. The list has been refreshed.',
  REFUND_NOT_ALLOWED: 'A refund cannot be created for this order right now. Please check the payment and try again later.',
  REFUND_ALREADY_EXISTS: 'A refund already exists for this order.',
  EXTERNAL_REFUND_PRESENT: 'Money for this order was already refunded outside the application. It needs manual review.',
  ORDER_NOT_OPERATIONALLY_ELIGIBLE: 'This order is not eligible for completion right now. The list has been refreshed.'
};

/** "Validation failed: email: Invalid email; roles: Too many" -> { email: ..., roles: ... } */
export function parseValidationMessage(message: string): Record<string, string> {
  const out: Record<string, string> = {};
  const body = message.replace(/^Validation failed:\s*/i, '');
  for (const part of body.split(/;\s*/)) {
    const idx = part.indexOf(':');
    if (idx <= 0) continue;
    const path = part.slice(0, idx).trim();
    const text = part.slice(idx + 1).trim();
    if (path && text && !(path in out)) out[path] = text;
  }
  return out;
}

export function describeAdminError(err: unknown): AdminErrorInfo {
  if (err instanceof StepUpCancelledError) {
    return { kind: 'cancelled', message: '', fieldErrors: {} };
  }

  if (!(err instanceof ApiRequestError)) {
    return { kind: 'unknown', message: 'Something went wrong. Please try again.', fieldErrors: {} };
  }

  const { status, code } = err;
  const base = { status, code, fieldErrors: {} as Record<string, string> };

  if (code === 'NETWORK_ERROR' || status === undefined) {
    return { ...base, kind: 'network', message: 'Could not reach the server. Check your connection and try again.' };
  }
  if (status === 429) {
    return { ...base, kind: 'rate-limited', message: 'Too many attempts. Please wait a few minutes before trying again.' };
  }
  if (status === 401) {
    if (code === 'STEP_UP_FAILED') return { ...base, kind: 'forbidden', message: 'That password is not correct.' };
    return { ...base, kind: 'session-expired', message: 'Your session has ended. Please sign in again.' };
  }
  if (status === 403) {
    if (code === 'STEP_UP_REQUIRED') {
      return { ...base, kind: 'step-up-required', message: 'Password verification expired or was rejected. Confirm your password and try again.' };
    }
    return { ...base, kind: 'forbidden', message: GUARDRAIL_MESSAGES[code ?? ''] ?? 'You are not authorized to perform this action.' };
  }
  if (status === 404) {
    return { ...base, kind: 'not-found', message: 'That record was not found. It may have been removed.' };
  }
  if (status === 409) {
    return { ...base, kind: 'conflict', message: GUARDRAIL_MESSAGES[code ?? ''] ?? err.message ?? 'That change conflicts with the current state.' };
  }
  if (status === 422 || status === 400) {
    // Only the schema-validation envelope carries "path: message" pairs; other 4xx messages (e.g. PASSWORD_POLICY) are plain text.
    const fieldErrors = code === 'VALIDATION_ERROR' ? parseValidationMessage(err.message) : {};
    const hasFields = Object.keys(fieldErrors).length > 0;
    return {
      ...base,
      kind: 'validation',
      fieldErrors,
      message: GUARDRAIL_MESSAGES[code ?? ''] ?? (hasFields ? 'Please correct the highlighted fields.' : err.message || 'The request was not valid.')
    };
  }
  if (status >= 500) {
    return { ...base, kind: 'server', message: 'The server could not complete the request. Please try again later.' };
  }
  return { ...base, kind: 'unknown', message: err.message || 'Something went wrong. Please try again.' };
}
