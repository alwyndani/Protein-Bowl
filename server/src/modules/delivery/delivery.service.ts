import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { lockOrder } from '../payment/paymentOps.js';
import { sanitizeNote } from '../refund/cancellationPolicy.js';
import {
  DELIVERY_ORDER_SELECT,
  DELIVERY_SECTION_LIMIT,
  DeliveryMonitorOrderDto,
  DeliveryOrderRow,
  FAILURE_REASON_CODES,
  toMonitorDto
} from './delivery.dto.js';

/**
 * Delivery read model and shared helpers (B2a). The DELIVERY driver operations (queue, claim, dispatch, failure reporting, SUPER_ADMIN driver assignment) were REMOVED:
 * SUPER_ADMIN operates delivery through DeliveryOperateService. What remains is the SUPER_ADMIN monitor and the helpers the administrator operations share
 * (lockAndLoad, readyTimes, the failure-report schema).
 *
 * Every mutation that uses lockAndLoad runs in ONE transaction that locks the ORDER row first (the lock the transition service, cancellation, payment settlement
 * and kitchen routing already use) and decides eligibility from the locked database row, never from a client claim.
 */

// ------------------------------------------------------------------------------------------------ request schemas
export const reportFailureBodySchema = z
  .object({
    reasonCode: z.enum(FAILURE_REASON_CODES),
    note: z
      .string()
      .max(1000) // transport bound only; the stored note is sanitized and cut to 200
      .optional()
      .transform((v) => sanitizeNote(v))
  })
  .strict();
export type ReportFailureBody = z.infer<typeof reportFailureBodySchema>;

export const monitorQuerySchema = z.object({ branchId: z.string().min(1).max(64).optional() }).strict();

// ------------------------------------------------------------------------------------------------ helpers
type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

/** Orders delivery may work on: DIRECT + ONLINE + PAID (historical COD, unpaid and refunded orders never appear) routed to the given branches. */
function eligibleWhere(branchIds: string[]): Prisma.OrderWhereInput {
  return { orderType: 'DIRECT', paymentMethod: 'ONLINE', paymentStatus: 'PAID', kitchenBranchId: { in: branchIds } };
}

const unclaimed: Prisma.OrderWhereInput = { OR: [{ delivery: { is: null } }, { delivery: { is: { driverId: null, operatedByUserId: null } } }] };

export async function readyTimes(db: Db, orderIds: string[]): Promise<Map<string, Date>> {
  const map = new Map<string, Date>();
  if (orderIds.length === 0) return map;
  const events = await db.orderEvent.findMany({
    where: { orderId: { in: orderIds }, toStatus: 'READY' },
    select: { orderId: true, createdAt: true },
    orderBy: { createdAt: 'asc' }
  });
  for (const e of events) map.set(e.orderId, e.createdAt); // ascending => the latest wins
  return map;
}

interface Section<T> {
  total: number;
  truncated: boolean;
  items: T[];
}

async function section<T>(
  where: Prisma.OrderWhereInput,
  orderBy: Prisma.OrderOrderByWithRelationInput[],
  map: (row: DeliveryOrderRow, ready: Date | undefined) => T
): Promise<{ total: number; rows: DeliveryOrderRow[]; map: typeof map }> {
  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({ where, orderBy, take: DELIVERY_SECTION_LIMIT, select: DELIVERY_ORDER_SELECT })
  ]);
  return { total, rows, map };
}

function build<T>(s: { total: number; rows: DeliveryOrderRow[]; map: (r: DeliveryOrderRow, d: Date | undefined) => T }, ready: Map<string, Date>): Section<T> {
  return { total: s.total, truncated: s.total > s.rows.length, items: s.rows.map((r) => s.map(r, ready.get(r.id))) };
}

const readyOrder: Prisma.OrderOrderByWithRelationInput[] = [{ updatedAt: 'asc' }, { id: 'asc' }];
const dispatchedOrder: Prisma.OrderOrderByWithRelationInput[] = [{ updatedAt: 'desc' }, { id: 'desc' }];

// ------------------------------------------------------------------------------------------------ results
export interface MonitorQueue {
  serverTime: string;
  sectionLimit: number;
  sections: {
    unclaimed: Section<DeliveryMonitorOrderDto>;
    assigned: Section<DeliveryMonitorOrderDto>;
    dispatched: Section<DeliveryMonitorOrderDto>;
    exceptions: Section<DeliveryMonitorOrderDto>;
  };
}


export class DeliveryService {
  // ------------------------------------------------------------------------------------------------ reads
  /** Read-only monitoring of ONE explicit branch (SUPER_ADMIN): area-only order data plus the assignment owner and exceptions. */
  public static async getMonitor(branchId: string): Promise<MonitorQueue> {
    const serverTime = new Date();
    const base = eligibleWhere([branchId]);
    const failed = { delivery: { is: { status: 'FAILED' } } };
    const [unclaimedS, assignedS, dispatchedS, exceptionsS] = await Promise.all([
      section<DeliveryMonitorOrderDto>({ AND: [base, { status: 'READY' }, unclaimed] }, readyOrder, toMonitorDto),
      section<DeliveryMonitorOrderDto>({ ...base, status: 'READY', delivery: { is: { OR: [{ driverId: { not: null } }, { operatedByUserId: { not: null } }] } } }, readyOrder, toMonitorDto),
      section<DeliveryMonitorOrderDto>({ AND: [base, { status: 'DISPATCHED' }, { NOT: failed }] }, dispatchedOrder, toMonitorDto),
      section<DeliveryMonitorOrderDto>({ AND: [base, { status: 'DISPATCHED' }, failed] }, dispatchedOrder, toMonitorDto)
    ]);
    const ready = await readyTimes(prisma, [...unclaimedS.rows, ...assignedS.rows, ...dispatchedS.rows, ...exceptionsS.rows].map((r) => r.id));
    return {
      serverTime: serverTime.toISOString(),
      sectionLimit: DELIVERY_SECTION_LIMIT,
      sections: { unclaimed: build(unclaimedS, ready), assigned: build(assignedS, ready), dispatched: build(dispatchedS, ready), exceptions: build(exceptionsS, ready) }
    };
  }

  // ------------------------------------------------------------------------------------------------ shared by the administrator operations
  /** Locks the order, loads its operational facts and assignment. The caller then applies its own eligibility rule. */
  public static async lockAndLoad(tx: Tx, orderId: string) {
    await lockOrder(tx, orderId);
    return await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        orderType: true,
        paymentMethod: true,
        paymentStatus: true,
        kitchenBranchId: true,
        delivery: { select: { id: true, driverId: true, operatedByUserId: true, takenOverFromDriverId: true, status: true, branchId: true, attemptNumber: true, failedAt: true, pickupTime: true, deliveryNotes: true } }
      }
    });
  }
}
