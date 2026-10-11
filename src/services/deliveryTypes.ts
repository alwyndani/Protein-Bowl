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

/** Post-claim order: only ever received by the assigned driver. */
export interface DeliveryOwnedOrder extends DeliveryAreaOrder {
  delivery: {
    firstName: string | null;
    phone: string | null;
    address: { line1: string | null; line2: string | null; city: string | null; state: string | null; postalCode: string | null };
    instructions: string | null;
  };
  assignment: { state: AssignmentState; pickupTime: string | null; issueReported: boolean };
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

export type DriverAction = 'claim' | 'dispatch';

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
  };
  exception: { reasonCode: FailureReasonCode; note: string | null } | null;
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
