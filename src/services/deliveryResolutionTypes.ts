/** Admin-side failed-delivery resolution (P9C) types. Kept out of deliveryTypes.ts, which is the driver-facing vocabulary. */
export const RETRY_REASONS = [
  { code: 'CUSTOMER_AVAILABLE_NOW', label: 'Customer is available now' },
  { code: 'ADDRESS_CORRECTED', label: 'Address was corrected' },
  { code: 'DRIVER_CHANGE', label: 'Different driver needed' },
  { code: 'OPERATIONAL_RETRY', label: 'Operational retry' },
  { code: 'OTHER', label: 'Other' }
] as const;
export type RetryReasonCode = (typeof RETRY_REASONS)[number]['code'];

export const UNDELIVERABLE_REASONS = [
  { code: 'CUSTOMER_REFUSED', label: 'Customer refused the delivery' },
  { code: 'CUSTOMER_UNREACHABLE', label: 'Customer could not be reached' },
  { code: 'ADDRESS_UNDELIVERABLE', label: 'Address cannot be delivered to' },
  { code: 'DELIVERY_UNAVAILABLE', label: 'Delivery is not possible' },
  { code: 'OTHER', label: 'Other' }
] as const;
export type UndeliverableReasonCode = (typeof UNDELIVERABLE_REASONS)[number]['code'];

export interface RetryInput {
  mode: 'SAME_DRIVER' | 'REASSIGN';
  /** Required for REASSIGN, forbidden for SAME_DRIVER. */
  driverEmployeeId?: string;
  /** The attempt and driver this screen showed: a mismatch is a 409 instead of an overwrite. */
  expectedAttemptNumber: number;
  expectedDriverId: string;
  reasonCode: RetryReasonCode;
  note?: string;
}

export interface RetryResult {
  changed: boolean;
  orderId: string;
  orderNumber: string;
  action: 'RETRY_SAME_DRIVER' | 'REASSIGNED' | 'PENDING_REASSIGNED';
  attemptNumber: number;
  assignmentState: 'ASSIGNED';
  driverEmployeeId: string;
}

export interface UndeliverableInput {
  reasonCode: UndeliverableReasonCode;
  note: string;
  expectedAttemptNumber: number;
}

export interface UndeliverableResult {
  changed: boolean;
  orderId: string;
  orderNumber: string;
  status: string;
  attemptNumber: number;
}

export type AttemptOutcome = 'RETRY_SAME_DRIVER' | 'REASSIGNED' | 'UNDELIVERABLE_CANCELLED' | 'ADMIN_OVERRIDE_DELIVERED';

export interface DeliveryAttemptRecord {
  attemptNumber: number;
  driver: { employeeId: string; employeeCode: string; fullName: string } | null;
  branch: { id: string; code: string; name: string } | null;
  startedAt: string | null;
  failedAt: string | null;
  endedAt: string;
  failureReasonCode: string;
  outcome: AttemptOutcome;
  resolutionReasonCode: string;
  /** SUPER_ADMIN only: the server never sends these to MD. */
  failureNote?: string | null;
  resolutionNote?: string | null;
  resolvedByUserId?: string;
}

export interface DeliveryAttempts {
  orderId: string;
  orderNumber: string;
  maxAttempts: number;
  current: {
    attemptNumber: number;
    state: string | null;
    driver: { employeeId: string; employeeCode: string; fullName: string } | null;
    startedAt: string | null;
    failedAt: string | null;
    failureReasonCode: string | null;
    failureNote?: string | null;
    canRetry: boolean;
  } | null;
  attempts: DeliveryAttemptRecord[];
}

