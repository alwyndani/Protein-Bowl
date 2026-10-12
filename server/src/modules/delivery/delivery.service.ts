import { Prisma, RoleEnum } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditContext, AuditService } from '../audit/audit.service.js';
import { OrderTransitionService } from '../order/orderTransition.service.js';
import { lockOrder } from '../payment/paymentOps.js';
import { sanitizeNote } from '../refund/cancellationPolicy.js';
import {
  DELIVERY_ORDER_SELECT,
  DELIVERY_SECTION_LIMIT,
  DeliveryAreaOrderDto,
  DeliveryMonitorOrderDto,
  DeliveryOrderRow,
  DeliveryOwnedOrderDto,
  FAILURE_REASON_CODES,
  serializeFailureNote,
  toAreaDto,
  toMonitorDto,
  toOwnedDto
} from './delivery.dto.js';

/**
 * P9A delivery operations: READY queue, DELIVERY self-claim, SUPER_ADMIN assignment, dispatch (READY -> DISPATCHED) and failure reporting.
 * P9A STOPS AT DISPATCHED: nothing here can produce DELIVERED (proof of delivery is P9B).
 *
 * Every mutation runs in ONE transaction that locks the ORDER row first (the lock the transition service, cancellation, payment settlement
 * and kitchen routing already use) and decides visibility / ownership / eligibility from the locked database row, never from a client claim.
 * The unique DeliveryAssignment.orderId is the last-resort backstop.
 */

// ------------------------------------------------------------------------------------------------ request schemas
export const emptyBodySchema = z.object({}).strict();

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

export const assignmentBodySchema = z
  .object({
    driverEmployeeId: z.string().uuid().nullable(),
    /** The driver the admin SAW on screen (null = unclaimed). A mismatch means somebody else changed it meanwhile (409). The key is required. */
    expectedDriverId: z.string().uuid().nullable(),
    reason: z
      .string()
      .max(1000)
      .transform((v) => sanitizeNote(v))
      .refine((v): v is string => typeof v === 'string' && v.length >= 3, { message: 'A reason of at least 3 characters is required' })
  })
  .strict();
export type AssignmentBody = z.infer<typeof assignmentBodySchema>;

export const monitorQuerySchema = z.object({ branchId: z.string().min(1).max(64).optional() }).strict();

// ------------------------------------------------------------------------------------------------ helpers
type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

export interface DriverCaller {
  userId: string;
  employeeProfileId: string;
  branchIds: string[];
}

/** An order that is not visible to the caller (foreign branch, not owned, ineligible, non-existent): ONE indistinguishable 404. */
export class DeliveryOrderNotVisible extends AppError {
  constructor(public readonly existed: boolean, public readonly mode: string) {
    super('Order not found', 404, 'ORDER_NOT_FOUND');
  }
}

/** Orders delivery may work on: DIRECT + ONLINE + PAID (historical COD, unpaid and refunded orders never appear) routed to the given branches. */
function eligibleWhere(branchIds: string[]): Prisma.OrderWhereInput {
  return { orderType: 'DIRECT', paymentMethod: 'ONLINE', paymentStatus: 'PAID', kitchenBranchId: { in: branchIds } };
}

const unclaimed: Prisma.OrderWhereInput = { OR: [{ delivery: { is: null } }, { delivery: { is: { driverId: null } } }] };

async function readyTimes(db: Db, orderIds: string[]): Promise<Map<string, Date>> {
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
export interface DriverQueue {
  serverTime: string;
  sectionLimit: number;
  sections: {
    available: Section<DeliveryAreaOrderDto>;
    mine: Section<DeliveryOwnedOrderDto>;
    outForDelivery: Section<DeliveryOwnedOrderDto>;
  };
}
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

export interface AssignmentResult {
  changed: boolean;
  orderId: string;
  orderNumber: string;
  action: 'ASSIGNED' | 'REASSIGNED' | 'UNASSIGNED' | 'NONE';
  previousDriverId: string | null;
  driverEmployeeId: string | null;
}

export class DeliveryService {
  // ------------------------------------------------------------------------------------------------ reads
  /**
   * The DELIVERY employee's queue (own branches only). Orders owned by ANOTHER driver are not listed at all, so no private detail
   * of someone else's claim can leak; unclaimed orders carry the area-only DTO, own orders the full approved delivery DTO.
   */
  public static async getDriverQueue(caller: DriverCaller): Promise<DriverQueue> {
    const serverTime = new Date();
    const base = eligibleWhere(caller.branchIds);
    const mineWhere = { driverId: caller.employeeProfileId };
    const [available, mine, out] = await Promise.all([
      section<DeliveryAreaOrderDto>({ AND: [base, { status: 'READY' }, unclaimed] }, readyOrder, toAreaDto),
      section<DeliveryOwnedOrderDto>({ ...base, status: 'READY', delivery: { is: mineWhere } }, readyOrder, toOwnedDto),
      section<DeliveryOwnedOrderDto>({ ...base, status: 'DISPATCHED', delivery: { is: mineWhere } }, dispatchedOrder, toOwnedDto)
    ]);
    const ready = await readyTimes(prisma, [...available.rows, ...mine.rows, ...out.rows].map((r) => r.id));
    return {
      serverTime: serverTime.toISOString(),
      sectionLimit: DELIVERY_SECTION_LIMIT,
      sections: { available: build(available, ready), mine: build(mine, ready), outForDelivery: build(out, ready) }
    };
  }

  /** Read-only monitoring of ONE explicit branch (SUPER_ADMIN, MD): area-only order data plus the assignment owner and exceptions. */
  public static async getMonitor(branchId: string): Promise<MonitorQueue> {
    const serverTime = new Date();
    const base = eligibleWhere([branchId]);
    const failed = { delivery: { is: { status: 'FAILED' } } };
    const [unclaimedS, assignedS, dispatchedS, exceptionsS] = await Promise.all([
      section<DeliveryMonitorOrderDto>({ AND: [base, { status: 'READY' }, unclaimed] }, readyOrder, toMonitorDto),
      section<DeliveryMonitorOrderDto>({ ...base, status: 'READY', delivery: { is: { driverId: { not: null } } } }, readyOrder, toMonitorDto),
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

  /** One of the caller's OWN orders (READY or DISPATCHED) with the full approved delivery data; null for everything else. */
  public static async getOwnedOrder(orderId: string, caller: DriverCaller, db: Db = prisma): Promise<DeliveryOwnedOrderDto | null> {
    const row = await db.order.findFirst({
      where: { ...eligibleWhere(caller.branchIds), id: orderId, status: { in: ['READY', 'DISPATCHED'] }, delivery: { is: { driverId: caller.employeeProfileId } } },
      select: DELIVERY_ORDER_SELECT
    });
    if (!row) return null;
    const ready = await readyTimes(db, [row.id]);
    return toOwnedDto(row, ready.get(row.id));
  }

  /** Active DELIVERY employees authorized for one branch (the SUPER_ADMIN assignment picker). Staff identity data only. */
  public static async listAssignableDrivers(branchId: string) {
    const rows = await prisma.employeeProfile.findMany({
      where: {
        user: { status: 'ACTIVE', deletedAt: null, roles: { some: { role: RoleEnum.DELIVERY } } },
        OR: [{ assignedBranchId: branchId }, { branchAssignments: { some: { branchId } } }]
      },
      select: { id: true, employeeCode: true, fullName: true },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      take: 200
    });
    return rows.map((r) => ({ employeeId: r.id, employeeCode: r.employeeCode, fullName: r.fullName }));
  }

  // ------------------------------------------------------------------------------------------------ driver mutations
  /** Locks the order, loads its operational facts and assignment. The caller then applies its own visibility rule. */
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
        delivery: { select: { id: true, driverId: true, status: true, branchId: true, attemptNumber: true, failedAt: true, pickupTime: true, deliveryNotes: true } }
      }
    });
  }

  public static async denyAudit(err: unknown, caller: DriverCaller, action: string, orderId: string, context?: AuditContext): Promise<never> {
    if (err instanceof DeliveryOrderNotVisible) {
      if (err.existed) {
        await AuditService.recordSafe({
          actor: { userId: caller.userId, roles: [RoleEnum.DELIVERY] },
          action: 'BRANCH_ACCESS_DENIED',
          entity: 'DeliveryOrder',
          entityId: orderId,
          payload: { mode: err.mode, action, code: 'ORDER_NOT_VISIBLE' },
          context
        });
      }
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }
    // Defence in depth: the transition's own branch gate must look exactly like "not found" to the delivery API.
    if (err instanceof AppError && err.errorCode === 'BRANCH_FORBIDDEN') throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    throw err;
  }

  /** DELIVERY self-claim. Order.status is NOT touched. */
  public static async claim(orderId: string, caller: DriverCaller, context?: AuditContext): Promise<{ changed: boolean; order: DeliveryOwnedOrderDto }> {
    try {
      return await prisma.$transaction(async (tx) => {
        const order = await this.lockAndLoad(tx, orderId);
        const visible =
          !!order &&
          order.orderType === 'DIRECT' &&
          order.paymentMethod === 'ONLINE' &&
          order.paymentStatus === 'PAID' &&
          !!order.kitchenBranchId &&
          caller.branchIds.includes(order.kitchenBranchId);
        if (!visible || !order) throw new DeliveryOrderNotVisible(!!order, 'write');

        const owner = order.delivery?.driverId ?? null;
        let changed = false;
        if (owner === caller.employeeProfileId && ['READY', 'DISPATCHED'].includes(order.status)) {
          // owner replay: nothing to do
        } else if (owner) {
          throw new AppError('This order has already been claimed', 409, 'ALREADY_CLAIMED');
        } else if (order.status !== 'READY') {
          throw new AppError('This order is not ready for pickup', 409, 'ORDER_NOT_CLAIMABLE');
        } else {
          if (order.delivery) {
            const updated = await tx.deliveryAssignment.updateMany({
              where: { id: order.delivery.id, driverId: null },
              data: { driverId: caller.employeeProfileId, branchId: order.kitchenBranchId, status: 'ASSIGNED', pickupTime: null, deliveryNotes: null }
            });
            if (updated.count !== 1) throw new AppError('This order has already been claimed', 409, 'ALREADY_CLAIMED');
          } else {
            await tx.deliveryAssignment.create({
              data: { orderId: order.id, driverId: caller.employeeProfileId, branchId: order.kitchenBranchId, status: 'ASSIGNED' }
            });
          }
          changed = true;
          await AuditService.record(
            {
              actor: { userId: caller.userId, roles: [RoleEnum.DELIVERY] },
              action: 'DELIVERY_CLAIMED',
              entity: 'Order',
              entityId: order.id,
              payload: { orderNumber: order.orderNumber, branchId: order.kitchenBranchId, driverEmployeeId: caller.employeeProfileId },
              context
            },
            tx
          );
        }
        const dto = await this.getOwnedOrder(orderId, caller, tx);
        if (!dto) throw new DeliveryOrderNotVisible(true, 'write');
        return { changed, order: dto };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError('This order has already been claimed', 409, 'ALREADY_CLAIMED'); // unique(orderId) backstop
      }
      return this.denyAudit(err, caller, 'claim', orderId, context);
    }
  }

  /**
   * READY -> DISPATCHED for the OWNER only, through OrderTransitionService in the same transaction. Ownership, branch and payment are
   * re-read under the order lock, so a refund / cancellation / reassignment that committed first makes this fail safely.
   * Dispatch represents the pickup: the assignment goes ASSIGNED -> IN_TRANSIT with pickupTime (PICKED_UP is never used).
   */
  public static async dispatch(orderId: string, caller: DriverCaller, context?: AuditContext): Promise<{ changed: boolean; order: DeliveryOwnedOrderDto }> {
    try {
      return await prisma.$transaction(async (tx) => {
        const order = await this.lockAndLoad(tx, orderId);
        const visible =
          !!order &&
          order.orderType === 'DIRECT' &&
          order.paymentMethod === 'ONLINE' &&
          !!order.kitchenBranchId &&
          caller.branchIds.includes(order.kitchenBranchId) &&
          order.delivery?.driverId === caller.employeeProfileId;
        if (!visible || !order) throw new DeliveryOrderNotVisible(!!order, 'write');

        let changed = false;
        if (order.status !== 'DISPATCHED') {
          if (order.paymentStatus !== 'PAID') {
            throw new AppError('This order is no longer eligible for delivery', 409, 'ORDER_NOT_OPERATIONALLY_ELIGIBLE');
          }
          const transition = await OrderTransitionService.transition(
            {
              orderId,
              to: 'DISPATCHED',
              actor: { kind: 'USER', userId: caller.userId, roles: [RoleEnum.DELIVERY], branchIds: caller.branchIds, isGlobal: false },
              context
            },
            tx
          );
          changed = transition.changed;
          if (changed) {
            const updated = await tx.deliveryAssignment.updateMany({
              where: { id: order.delivery!.id, driverId: caller.employeeProfileId, status: 'ASSIGNED' },
              data: { status: 'IN_TRANSIT', pickupTime: new Date() }
            });
            if (updated.count !== 1) throw new AppError('The delivery assignment changed. Please refresh.', 409, 'ORDER_STATE_CONFLICT'); // rolls the transition back
          }
        }
        const dto = await this.getOwnedOrder(orderId, caller, tx);
        if (!dto) throw new DeliveryOrderNotVisible(true, 'write');
        return { changed, order: dto };
      });
    } catch (err) {
      return this.denyAudit(err, caller, 'dispatch', orderId, context);
    }
  }

  /**
   * The owner reports that a DISPATCHED delivery failed: assignment -> FAILED, the order STAYS DISPATCHED (no cancellation, refund,
   * payment change, return to kitchen or delivery). The structured reason is serialized by the SERVER into deliveryNotes.
   */
  public static async reportFailure(orderId: string, body: ReportFailureBody, caller: DriverCaller, context?: AuditContext): Promise<{ changed: boolean; order: DeliveryOwnedOrderDto }> {
    try {
      return await prisma.$transaction(async (tx) => {
        const order = await this.lockAndLoad(tx, orderId);
        const visible =
          !!order &&
          order.orderType === 'DIRECT' &&
          order.paymentMethod === 'ONLINE' &&
          !!order.kitchenBranchId &&
          caller.branchIds.includes(order.kitchenBranchId) &&
          order.delivery?.driverId === caller.employeeProfileId;
        if (!visible || !order) throw new DeliveryOrderNotVisible(!!order, 'write');
        if (order.status !== 'DISPATCHED') throw new AppError('Only an order that is out for delivery can be reported', 409, 'ORDER_NOT_DISPATCHED');

        let changed = false;
        const state = order.delivery!.status;
        if (state === 'FAILED') {
          // replay: the first report stands
        } else if (state === 'IN_TRANSIT') {
          const updated = await tx.deliveryAssignment.updateMany({
            where: { id: order.delivery!.id, driverId: caller.employeeProfileId, status: 'IN_TRANSIT' },
            data: { status: 'FAILED', deliveryNotes: serializeFailureNote(body.reasonCode, body.note ?? null), failedAt: new Date() }
          });
          if (updated.count !== 1) throw new AppError('The delivery assignment changed. Please refresh.', 409, 'ORDER_STATE_CONFLICT');
          changed = true;
          await AuditService.record(
            {
              actor: { userId: caller.userId, roles: [RoleEnum.DELIVERY] },
              action: 'DELIVERY_FAILURE_REPORTED',
              entity: 'Order',
              entityId: order.id,
              payload: { orderNumber: order.orderNumber, reasonCode: body.reasonCode, note: body.note ?? undefined, driverEmployeeId: caller.employeeProfileId },
              context
            },
            tx
          );
        } else {
          throw new AppError('This delivery is not in a state that can be reported', 409, 'INVALID_DELIVERY_STATE');
        }
        const dto = await this.getOwnedOrder(orderId, caller, tx);
        if (!dto) throw new DeliveryOrderNotVisible(true, 'write');
        return { changed, order: dto };
      });
    } catch (err) {
      return this.denyAudit(err, caller, 'report-failure', orderId, context);
    }
  }

  // ------------------------------------------------------------------------------------------------ SUPER_ADMIN assignment
  /**
   * Assign / reassign / unassign (driverEmployeeId = null) a READY, eligible order. Never after DISPATCHED. Changes ONLY the assignment
   * (no Order.status, no payment, no kitchen state). A no-op writes nothing and no audit row.
   */
  public static async assign(orderId: string, body: AssignmentBody, actor: { userId: string; roles: readonly string[] }, context?: AuditContext): Promise<AssignmentResult> {
    try {
      return await prisma.$transaction(async (tx) => {
        const order = await this.lockAndLoad(tx, orderId);
        if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
        if (order.orderType !== 'DIRECT' || order.paymentMethod !== 'ONLINE' || order.paymentStatus !== 'PAID' || !order.kitchenBranchId || order.status !== 'READY') {
          throw new AppError('Delivery can only be assigned while the order is READY and eligible', 409, 'ORDER_NOT_ASSIGNABLE');
        }
        const current = order.delivery?.driverId ?? null;
        const target = body.driverEmployeeId;

        if (target === current) {
          return { changed: false, orderId: order.id, orderNumber: order.orderNumber, action: 'NONE' as const, previousDriverId: current, driverEmployeeId: current };
        }
        if (current !== body.expectedDriverId) {
          throw new AppError('The delivery assignment changed in the meantime. Refresh and try again.', 409, 'DELIVERY_ASSIGNMENT_CHANGED');
        }

        if (target) {
          // The target must be an ACTIVE DELIVERY employee authorized for THIS order's branch (FOR SHARE: a concurrent deactivation waits).
          const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "employee_profiles" WHERE "id" = ${target} FOR SHARE`;
          const driver = locked.length === 1
            ? await tx.employeeProfile.findFirst({
                where: {
                  id: target,
                  user: { status: 'ACTIVE', deletedAt: null, roles: { some: { role: RoleEnum.DELIVERY } } },
                  OR: [{ assignedBranchId: order.kitchenBranchId }, { branchAssignments: { some: { branchId: order.kitchenBranchId } } }]
                },
                select: { id: true }
              })
            : null;
          if (!driver) throw new AppError('The selected driver cannot be assigned to this order', 422, 'DRIVER_INVALID');
        }

        if (order.delivery) {
          const updated = await tx.deliveryAssignment.updateMany({
            where: { id: order.delivery.id, driverId: current, status: 'ASSIGNED' },
            data: { driverId: target, branchId: order.kitchenBranchId, status: 'ASSIGNED', pickupTime: null, deliveryNotes: null }
          });
          if (updated.count !== 1) throw new AppError('The delivery assignment changed in the meantime. Refresh and try again.', 409, 'DELIVERY_ASSIGNMENT_CHANGED');
        } else {
          await tx.deliveryAssignment.create({ data: { orderId: order.id, driverId: target, branchId: order.kitchenBranchId, status: 'ASSIGNED' } });
        }

        const action = !current ? 'ASSIGNED' : target ? 'REASSIGNED' : 'UNASSIGNED';
        await AuditService.record(
          {
            actor,
            action: `DELIVERY_${action}`,
            entity: 'Order',
            entityId: order.id,
            payload: { orderNumber: order.orderNumber, branchId: order.kitchenBranchId, fromDriverId: current, toDriverId: target, reason: body.reason },
            context
          },
          tx
        );
        return { changed: true, orderId: order.id, orderNumber: order.orderNumber, action, previousDriverId: current, driverEmployeeId: target };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError('The delivery assignment changed in the meantime. Refresh and try again.', 409, 'DELIVERY_ASSIGNMENT_CHANGED');
      }
      throw err;
    }
  }
}
