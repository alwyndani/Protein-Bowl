/**
 * P9A delivery DTOs. Built from EXPLICIT field lists only (never a broad Prisma model with fields deleted afterwards).
 *
 *  PRE-CLAIM / monitoring (`DeliveryAreaOrderDto`): what an unclaimed order, MD and the SUPER_ADMIN monitor may see - order reference, status,
 *    ready time, kitchen branch, bag items and the delivery AREA (city + postal code). NO name, phone, street, email, instructions,
 *    prices, payment method, refund data, provider ids, health data or auth data.
 *  POST-CLAIM (`DeliveryOwnedOrderDto`): ONLY the assigned DELIVERY employee. Adds first name, phone, the full address and the instructions
 *    from the IMMUTABLE order-time snapshot (never the customer's editable address book). Still NO email, prices, payment, refund, health data.
 *
 * Failure reports live in the existing DeliveryAssignment.deliveryNotes string in ONE server-produced format (see `serializeFailureNote`).
 */
import { Prisma } from '@prisma/client';
import { MAX_DELIVERY_ATTEMPTS } from './deliveryAttemptPolicy.js';
import { DriverProofState, MonitorProofState, PROOF_STATE_SELECT, driverProofState, monitorProofState } from './deliveryProofState.js';

export const DELIVERY_SECTION_LIMIT = 100;

export const FAILURE_REASON_CODES = ['CUSTOMER_UNAVAILABLE', 'CUSTOMER_UNREACHABLE', 'WRONG_ADDRESS', 'DELIVERY_REFUSED', 'OTHER'] as const;
export type FailureReasonCode = (typeof FAILURE_REASON_CODES)[number];

/** Assignment states used by P9A. PICKED_UP and DELIVERED exist in the legacy vocabulary but are never written by P9A. */
export type AssignmentState = 'ASSIGNED' | 'IN_TRANSIT' | 'FAILED';

// ------------------------------------------------------------------------------------------------ failure note format
/**
 * deliveryNotes format (version 1), produced ONLY by this function:
 *
 *     PBFAIL1:{"reasonCode":"<ALLOW-LISTED CODE>","note":"<sanitized text>"}      ("note" is omitted when there is none)
 *
 * It is a fixed prefix followed by canonical JSON with a fixed key order, so reading it back never relies on splitting free text:
 * the prefix is checked, the JSON is parsed and the reason code is re-validated against the allow-list. Anything else (including
 * legacy free-text notes) is reported as "unknown format" and never interpreted.
 */
export const FAILURE_NOTE_PREFIX = 'PBFAIL1:';

export function serializeFailureNote(reasonCode: FailureReasonCode, note: string | null): string {
  return FAILURE_NOTE_PREFIX + JSON.stringify(note ? { reasonCode, note } : { reasonCode });
}

export interface FailureReport {
  reasonCode: FailureReasonCode;
  note: string | null;
}

export function parseFailureNote(value: string | null | undefined): FailureReport | null {
  if (typeof value !== 'string' || !value.startsWith(FAILURE_NOTE_PREFIX)) return null;
  try {
    const parsed: unknown = JSON.parse(value.slice(FAILURE_NOTE_PREFIX.length));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const { reasonCode, note } = parsed as { reasonCode?: unknown; note?: unknown };
    if (typeof reasonCode !== 'string' || !(FAILURE_REASON_CODES as readonly string[]).includes(reasonCode)) return null;
    if (note !== undefined && typeof note !== 'string') return null;
    return { reasonCode: reasonCode as FailureReasonCode, note: typeof note === 'string' && note.length > 0 ? note : null };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------------------------------------ selects
/** The ONLY order/order_items/assignment columns read for the delivery module. (The address snapshot is one JSON column: only whitelisted keys are ever read out of it.) */
export const DELIVERY_ORDER_SELECT = Prisma.validator<Prisma.OrderSelect>()({
  id: true,
  orderNumber: true,
  status: true,
  kitchenBranchId: true,
  kitchenBranch: { select: { id: true, code: true, name: true } },
  deliveryAddressSnapshot: true,
  items: {
    select: { id: true, itemTitle: true, variantName: true, quantity: true },
    orderBy: [{ itemTitle: 'asc' }, { id: 'asc' }]
  },
  // P9B: proof STATE only (never the code hash)
  deliveryProof: { select: PROOF_STATE_SELECT },
  delivery: {
    select: {
      id: true,
      driverId: true,
      status: true,
      pickupTime: true,
      deliveryNotes: true,
      attemptNumber: true,
      driver: { select: { id: true, employeeCode: true, fullName: true } }
    }
  }
});
export type DeliveryOrderRow = Prisma.OrderGetPayload<{ select: typeof DELIVERY_ORDER_SELECT }>;

// ------------------------------------------------------------------------------------------------ snapshot readers
function snapshotString(snapshot: unknown, key: string): string | null {
  const v = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? (snapshot as Record<string, unknown>)[key] : null;
  return typeof v === 'string' && v.length > 0 ? v : null;
}

// ------------------------------------------------------------------------------------------------ DTOs
export interface DeliveryItemDto {
  id: string;
  title: string;
  variantName: string | null;
  quantity: number;
}

export interface DeliveryAreaOrderDto {
  id: string;
  orderNumber: string;
  status: 'READY' | 'DISPATCHED';
  readyAt: string | null;
  kitchenBranch: { id: string; code: string; name: string } | null;
  area: { city: string | null; postalCode: string | null };
  items: DeliveryItemDto[];
}

export interface DeliveryOwnedOrderDto extends DeliveryAreaOrderDto {
  delivery: {
    firstName: string | null;
    phone: string | null;
    address: { line1: string | null; line2: string | null; city: string | null; state: string | null; postalCode: string | null };
    instructions: string | null;
  };
  /** P9C: attemptNumber 1..maxAttempts. state ASSIGNED on a DISPATCHED order = a retry is waiting for the driver to Resume. */
  assignment: { state: AssignmentState; pickupTime: string | null; issueReported: boolean; attemptNumber: number; maxAttempts: number };
  /** P9B: safe Delivery Code state for a DISPATCHED order (no counters, no hash). null before dispatch. */
  proof: { state: DriverProofState; lockedUntil: string | null } | null;
}

export interface DeliveryMonitorOrderDto extends DeliveryAreaOrderDto {
  assignment: {
    state: AssignmentState | null;
    driver: { employeeId: string; employeeCode: string; fullName: string } | null;
    pickupTime: string | null;
    attemptNumber: number;
  };
  /** P9C: the failed attempt can still be retried / reassigned (attempt < maxAttempts). Only meaningful when exception is set. */
  canRetry: boolean;
  maxAttempts: number;
  /** P9C: DISPATCHED + assignment ASSIGNED = a retry is pending (the driver has not resumed yet), so SUPER_ADMIN may hand it to another driver. */
  retryPending: boolean;
  /** Only for DISPATCHED orders whose assignment is FAILED. */
  exception: FailureReport | null;
  /** P9B: proof state only (null before dispatch). */
  proofState: MonitorProofState | null;
}

function toAreaBase(row: DeliveryOrderRow, readyAt: Date | undefined): DeliveryAreaOrderDto {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    status: row.status === 'DISPATCHED' ? 'DISPATCHED' : 'READY',
    readyAt: readyAt ? readyAt.toISOString() : null,
    kitchenBranch: row.kitchenBranch,
    area: { city: snapshotString(row.deliveryAddressSnapshot, 'city'), postalCode: snapshotString(row.deliveryAddressSnapshot, 'postalCode') },
    items: row.items.map((i) => ({ id: i.id, title: i.itemTitle, variantName: i.variantName, quantity: i.quantity }))
  };
}

export function toAreaDto(row: DeliveryOrderRow, readyAt: Date | undefined): DeliveryAreaOrderDto {
  return toAreaBase(row, readyAt);
}

export function assignmentState(status: string | null | undefined): AssignmentState | null {
  return status === 'IN_TRANSIT' ? 'IN_TRANSIT' : status === 'FAILED' ? 'FAILED' : status === 'ASSIGNED' ? 'ASSIGNED' : null;
}

export function toOwnedDto(row: DeliveryOrderRow, readyAt: Date | undefined): DeliveryOwnedOrderDto {
  const snap = row.deliveryAddressSnapshot;
  const recipient = snapshotString(snap, 'recipientName');
  const state = assignmentState(row.delivery?.status) ?? 'ASSIGNED';
  return {
    ...toAreaBase(row, readyAt),
    delivery: {
      firstName: recipient ? recipient.split(/\s+/)[0] : null,
      phone: snapshotString(snap, 'phone'),
      address: {
        line1: snapshotString(snap, 'addressLine1'),
        line2: snapshotString(snap, 'addressLine2'),
        city: snapshotString(snap, 'city'),
        state: snapshotString(snap, 'state'),
        postalCode: snapshotString(snap, 'postalCode')
      },
      instructions: snapshotString(snap, 'deliveryInstructions')
    },
    assignment: { state, pickupTime: row.delivery?.pickupTime ? row.delivery.pickupTime.toISOString() : null, issueReported: state === 'FAILED', attemptNumber: row.delivery?.attemptNumber ?? 1, maxAttempts: MAX_DELIVERY_ATTEMPTS },
    proof: row.status === 'DISPATCHED' ? driverProofState(row.deliveryProof, new Date()) : null
  };
}

export function toMonitorDto(row: DeliveryOrderRow, readyAt: Date | undefined): DeliveryMonitorOrderDto {
  const a = row.delivery;
  const state = assignmentState(a?.status);
  return {
    ...toAreaBase(row, readyAt),
    assignment: {
      state: a?.driverId ? state ?? 'ASSIGNED' : null,
      driver: a?.driver ? { employeeId: a.driver.id, employeeCode: a.driver.employeeCode, fullName: a.driver.fullName } : null,
      pickupTime: a?.pickupTime ? a.pickupTime.toISOString() : null,
      attemptNumber: a?.attemptNumber ?? 1
    },
    canRetry: row.status === 'DISPATCHED' && state === 'FAILED' && (a?.attemptNumber ?? 1) < MAX_DELIVERY_ATTEMPTS,
    maxAttempts: MAX_DELIVERY_ATTEMPTS,
    retryPending: row.status === 'DISPATCHED' && state === 'ASSIGNED',
    exception: row.status === 'DISPATCHED' && state === 'FAILED' ? (parseFailureNote(a?.deliveryNotes) ?? { reasonCode: 'OTHER', note: null }) : null,
    proofState: row.status === 'DISPATCHED' ? monitorProofState(row.deliveryProof, new Date()) : null
  };
}
