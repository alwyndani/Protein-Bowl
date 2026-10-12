/**
 * P9A delivery types: exactly what the delivery API returns (explicit allow-lists).
 * Pre-claim / monitoring orders carry the delivery AREA only. Only the driver who owns an order receives the delivery details.
 * No type here has a price, payment, refund or provider field: the delivery UI has no payment-collection concept.
 */
export interface DeliveryBranchRef {
  id: string;
  code: string;
  name: string;
}

export interface DeliveryItem {
  id: string;
  title: string;
  variantName: string | null;
  quantity: number;
}

export interface DeliveryAreaOrder {
  id: string;
  orderNumber: string;
  status: 'READY' | 'DISPATCHED';
  readyAt: string | null;
  kitchenBranch: DeliveryBranchRef | null;
  area: { city: string | null; postalCode: string | null };
  items: DeliveryItem[];
}

export type AssignmentState = 'ASSIGNED' | 'IN_TRANSIT' | 'FAILED';
export type DriverProofState = 'CODE_NOT_ISSUED' | 'READY_FOR_VERIFICATION' | 'LOCKED' | 'CODE_BLOCKED' | 'VERIFIED';
export type MonitorProofState = 'NOT_ISSUED' | 'ISSUED' | 'LOCKED' | 'CODE_BLOCKED' | 'VERIFIED' | 'OVERRIDDEN';
export type CustomerProofState = 'NOT_AVAILABLE' | 'NOT_ISSUED' | 'ISSUED' | 'LOCKED' | 'CODE_BLOCKED' | 'VERIFIED';

/** Post-claim order: only ever received by the assigned driver. */
export interface DeliveryOwnedOrder extends DeliveryAreaOrder {
  delivery: {
    firstName: string | null;
    phone: string | null;
    address: { line1: string | null; line2: string | null; city: string | null; state: string | null; postalCode: string | null };
    instructions: string | null;
  };
  /** P9C: state ASSIGNED on an out-for-delivery order = a retry is waiting for the driver to press "Start delivery again" (Resume). */
  assignment: { state: AssignmentState; pickupTime: string | null; issueReported: boolean; attemptNumber: number; maxAttempts: number };
  /** Delivery Code state for a dispatched order: STATE only (no counters, no code, no hash). null before dispatch. */
  proof: { state: DriverProofState; lockedUntil: string | null } | null;
}

export interface DeliverySection<T> {
  total: number;
  truncated: boolean;
  items: T[];
}

export interface DriverQueue {
  serverTime: string;
  sectionLimit: number;
  sections: {
    available: DeliverySection<DeliveryAreaOrder>;
    mine: DeliverySection<DeliveryOwnedOrder>;
    outForDelivery: DeliverySection<DeliveryOwnedOrder>;
  };
  /** The branches the SERVER authorized for this account (the only ones the selector may offer). */
  branches: DeliveryBranchRef[];
  selectedBranchIds: string[];
}

export const FAILURE_REASONS = [
  { code: 'CUSTOMER_UNAVAILABLE', label: 'Customer not available' },
  { code: 'CUSTOMER_UNREACHABLE', label: 'Customer not reachable' },
  { code: 'WRONG_ADDRESS', label: 'Wrong or incomplete address' },
  { code: 'DELIVERY_REFUSED', label: 'Delivery refused' },
  { code: 'OTHER', label: 'Other' }
] as const;
export type FailureReasonCode = (typeof FAILURE_REASONS)[number]['code'];

export interface FailureReportInput {
  reasonCode: FailureReasonCode;
  note?: string;
}

export type DriverAction = 'claim' | 'dispatch' | 'resume';

export interface DriverActionResult {
  changed: boolean;
  order: DeliveryOwnedOrder;
}

// ---- SUPER_ADMIN / MD monitor
export interface DeliveryMonitorOrder extends DeliveryAreaOrder {
  assignment: {
    state: AssignmentState | null;
    driver: { employeeId: string; employeeCode: string; fullName: string } | null;
    pickupTime: string | null;
    attemptNumber: number;
  };
  /** P9C: attempt < maxAttempts and the assignment is FAILED. */
  canRetry: boolean;
  maxAttempts: number;
  /** P9C: DISPATCHED + ASSIGNED: the retry was arranged but the driver has not resumed yet. */
  retryPending: boolean;
  exception: { reasonCode: FailureReasonCode; note: string | null } | null;
  proofState: MonitorProofState | null;
}

export interface DeliveryMonitor {
  serverTime: string;
  sectionLimit: number;
  sections: {
    unclaimed: DeliverySection<DeliveryMonitorOrder>;
    assigned: DeliverySection<DeliveryMonitorOrder>;
    dispatched: DeliverySection<DeliveryMonitorOrder>;
    exceptions: DeliverySection<DeliveryMonitorOrder>;
  };
  branch: DeliveryBranchRef;
  readOnly: boolean;
}

export interface AssignableDriver {
  employeeId: string;
  employeeCode: string;
  fullName: string;
}

export interface AssignmentInput {
  /** null = unassign */
  driverEmployeeId: string | null;
  /** The driver this screen showed (null = unclaimed). A mismatch is a 409 instead of an overwrite. */
  expectedDriverId: string | null;
  reason: string;
}

export interface AssignmentResult {
  changed: boolean;
  orderId: string;
  orderNumber: string;
  action: 'ASSIGNED' | 'REASSIGNED' | 'UNASSIGNED' | 'NONE';
  previousDriverId: string | null;
  driverEmployeeId: string | null;
}

// ---- Delivery Code (P9B)
export interface VerifyDeliveryResult {
  changed: boolean;
  order: { id: string; orderNumber: string; status: string; deliveredAt: string };
}

export const OVERRIDE_REASONS = [
  { code: 'CUSTOMER_CANNOT_ACCESS_CODE', label: 'Customer cannot access the code' },
  { code: 'CUSTOMER_DEVICE_UNAVAILABLE', label: 'Customer device unavailable' },
  { code: 'CODE_VERIFICATION_FAILURE', label: 'Code verification failure' },
  { code: 'ACCESSIBILITY_ASSISTANCE', label: 'Accessibility assistance' },
  { code: 'OPERATIONAL_EXCEPTION', label: 'Operational exception' },
  { code: 'OTHER', label: 'Other' }
] as const;
export type OverrideReasonCode = (typeof OVERRIDE_REASONS)[number]['code'];

export interface OverrideInput {
  reasonCode: OverrideReasonCode;
  note: string;
}

export interface OverrideResult {
  changed: boolean;
  orderId: string;
  orderNumber: string;
  status: string;
  previousAssignmentStatus: string | null;
}

/** Customer-facing proof state. The plaintext code exists ONLY in the response of issue / regenerate. */
export interface CustomerProof {
  state: CustomerProofState;
  issuedAt: string | null;
  lockedUntil: string | null;
}
export interface IssuedDeliveryCode extends CustomerProof {
  code: string;
}
