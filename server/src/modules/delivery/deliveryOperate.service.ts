import { Prisma, RoleEnum } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditContext, AuditService } from '../audit/audit.service.js';
import { OrderTransitionService } from '../order/orderTransition.service.js';
import { sanitizeNote } from '../refund/cancellationPolicy.js';
import { DELIVERY_ORDER_SELECT, DeliveryOwnedOrderDto, serializeFailureNote, toOwnedDto } from './delivery.dto.js';
import { DeliveryService, ReportFailureBody, readyTimes } from './delivery.service.js';
import { archiveFailedAttempt } from './deliveryAttemptArchive.js';
import { MAX_DELIVERY_ATTEMPTS, RETRY_REASON_CODES } from './deliveryAttemptPolicy.js';
import { DeliveryProofService, lockProof } from './deliveryProof.service.js';
import { invalidateProof } from './deliveryResolution.service.js';

/**
 * Role simplification: SUPER_ADMIN operates delivery itself (dispatch, verify the customer's code, report a failure, resume, retry, take over from a legacy driver).
 * Every state-changing route in front of this service requires a fresh password step-up proof ('delivery:operate' + requireStepUp).
 *
 * Ownership model: a live assignment has EXACTLY ONE owner - a driver (driverId) OR an administrator operator (operatedByUserId); the database enforces it (CHECK).
 * Historical rows are never rewritten: a takeover only moves the LIVE assignment and records the previous driver in takenOverFromDriverId, and the audit trail.
 * An admin-operated job is shared by SUPER_ADMINs (every action records the acting administrator), so it can never be stranded by one person's absence.
 *
 * Nothing here weakens a safeguard: the order row is locked first (the lock the transition service, cancellation, refunds and payment settlement use),
 * ONLINE + PAID + DIRECT are re-read under that lock, the Delivery Code logic is the SAME single implementation (attempt window, lock cycles, block),
 * and nothing can mark an order delivered except a verified DeliveryProof. Cancel & Full Refund and the exceptional override keep their own services.
 */
type Tx = Prisma.TransactionClient;
type Admin = { userId: string; roles: readonly RoleEnum[] };

// ------------------------------------------------------------------------------------------------ request schemas
export const operateEmptyBodySchema = z.object({}).strict();

export const takeoverBodySchema = z
  .object({
    /** The driver the administrator SAW owning the job. A mismatch means somebody else changed it meanwhile (409). */
    expectedDriverId: z.string().uuid(),
    reason: z
      .string()
      .max(1000)
      .transform((v) => sanitizeNote(v))
      .refine((v): v is string => typeof v === 'string' && v.length >= 3, { message: 'A reason of at least 3 characters is required' })
  })
  .strict();
export type TakeoverBody = z.infer<typeof takeoverBodySchema>;

export const operatorRetryBodySchema = z
  .object({
    expectedAttemptNumber: z.number().int().min(1).max(MAX_DELIVERY_ATTEMPTS),
    reasonCode: z.enum(RETRY_REASON_CODES),
    note: z.string().max(1000).optional().transform((v) => sanitizeNote(v))
  })
  .strict();
export type OperatorRetryBody = z.infer<typeof operatorRetryBodySchema>;

const changed409 = () => new AppError('This delivery changed in the meantime. Refresh and try again.', 409, 'DELIVERY_ATTEMPT_CHANGED');

async function operatedDto(db: Tx | typeof prisma, orderId: string): Promise<DeliveryOwnedOrderDto> {
  const row = await db.order.findFirst({
    where: {
      id: orderId,
      orderType: 'DIRECT',
      paymentMethod: 'ONLINE',
      paymentStatus: 'PAID',
      status: { in: ['READY', 'DISPATCHED'] },
      delivery: { is: { operatedByUserId: { not: null } } }
    },
    select: DELIVERY_ORDER_SELECT
  });
  if (!row) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  const ready = await readyTimes(db, [row.id]);
  return toOwnedDto(row, ready.get(row.id));
}

function assertBaseEligible(order: { orderType: string; paymentMethod: string | null; kitchenBranchId: string | null }) {
  if (order.orderType !== 'DIRECT' || order.paymentMethod !== 'ONLINE' || !order.kitchenBranchId) {
    throw new AppError('This order is not eligible for delivery', 409, 'ORDER_NOT_OPERATIONALLY_ELIGIBLE');
  }
}

/** The caller must operate the job: no driver owns it and an administrator does. A driver-owned job needs a takeover first. */
function assertOperated(delivery: { driverId: string | null; operatedByUserId: string | null } | null | undefined) {
  if (!delivery) throw new AppError('This order has no delivery job', 409, 'DELIVERY_NOT_OPERATED');
  if (delivery.driverId) throw new AppError('This delivery is owned by a driver. Take it over first.', 409, 'DELIVERY_OWNED_BY_DRIVER');
  if (!delivery.operatedByUserId) throw new AppError('This delivery has not been started by an administrator', 409, 'DELIVERY_NOT_OPERATED');
}

export class DeliveryOperateService {
  // ------------------------------------------------------------------------------------------------ read
  /** One order the administrators operate, with the approved delivery data (first name, phone, address from the immutable snapshot). 404 for everything else. */
  public static async getOperatedOrder(orderId: string): Promise<DeliveryOwnedOrderDto> {
    return operatedDto(prisma, orderId);
  }

  // ------------------------------------------------------------------------------------------------ dispatch
  /**
   * READY -> DISPATCHED (collected, delivery started) by a SUPER_ADMIN. A job a driver owns must be taken over first. Through OrderTransitionService in the SAME
   * transaction as the assignment write, so a failure on either side rolls both back. A replay by an administrator is `changed:false`.
   */
  public static async dispatch(orderId: string, admin: Admin, context?: AuditContext): Promise<{ changed: boolean; order: DeliveryOwnedOrderDto }> {
    return await prisma.$transaction(async (tx) => {
      const order = await DeliveryService.lockAndLoad(tx, orderId);
      if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
      assertBaseEligible(order);
      const d = order.delivery;
      if (d?.driverId) throw new AppError('This delivery is owned by a driver. Take it over first.', 409, 'DELIVERY_OWNED_BY_DRIVER');

      let changed = false;
      if (order.status !== 'DISPATCHED') {
        if (order.paymentStatus !== 'PAID') throw new AppError('This order is no longer eligible for delivery', 409, 'ORDER_NOT_OPERATIONALLY_ELIGIBLE');
        await OrderTransitionService.transition(
          { orderId, to: 'DISPATCHED', actor: { kind: 'USER', userId: admin.userId, roles: admin.roles, isGlobal: true }, context },
          tx
        );
        const now = new Date();
        if (!d) {
          await tx.deliveryAssignment.create({ data: { orderId, driverId: null, operatedByUserId: admin.userId, branchId: order.kitchenBranchId, status: 'IN_TRANSIT', pickupTime: now } });
        } else {
          const updated = await tx.deliveryAssignment.updateMany({
            where: { id: d.id, driverId: null, status: 'ASSIGNED' },
            data: { operatedByUserId: d.operatedByUserId ?? admin.userId, branchId: order.kitchenBranchId, status: 'IN_TRANSIT', pickupTime: now, deliveryNotes: null }
          });
          if (updated.count !== 1) throw new AppError('The delivery assignment changed. Please refresh.', 409, 'ORDER_STATE_CONFLICT'); // rolls the transition back
        }
        changed = true;
        await AuditService.record(
          { actor: { userId: admin.userId, roles: admin.roles }, action: 'DELIVERY_DISPATCHED_BY_ADMIN', entity: 'Order', entityId: orderId, payload: { orderNumber: order.orderNumber, branchId: order.kitchenBranchId, operatorUserId: admin.userId }, context },
          tx
        );
      } else {
        assertOperated(d); // DISPATCHED: a replay is only meaningful for an administrator-operated job
      }
      return { changed, order: await operatedDto(tx, orderId) };
    });
  }

  // ------------------------------------------------------------------------------------------------ takeover
  /**
   * Moves a LIVE assignment from a legacy driver to the administrators. Only the live row changes (driver cleared, operator set, previous driver recorded);
   * status, attempt number, timestamps, failure notes and the Delivery Code state are untouched, and no history row is rewritten.
   */
  public static async takeover(orderId: string, body: TakeoverBody, admin: Admin, context?: AuditContext): Promise<{ changed: boolean; order: DeliveryOwnedOrderDto }> {
    return await prisma.$transaction(async (tx) => {
      const order = await DeliveryService.lockAndLoad(tx, orderId);
      if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
      assertBaseEligible(order);
      const d = order.delivery;
      if (!d) throw new AppError('This order has no delivery job', 409, 'DELIVERY_NOT_OPERATED');
      if (d.operatedByUserId && d.takenOverFromDriverId === body.expectedDriverId) {
        return { changed: false, order: await operatedDto(tx, orderId) }; // replay
      }
      if (!['READY', 'DISPATCHED'].includes(order.status) || order.paymentStatus !== 'PAID') {
        throw new AppError('This order is no longer eligible for delivery', 409, 'ORDER_NOT_OPERATIONALLY_ELIGIBLE');
      }
      if (!['ASSIGNED', 'IN_TRANSIT', 'FAILED'].includes(d.status)) throw new AppError('This delivery cannot be taken over in its current state', 409, 'INVALID_DELIVERY_STATE');
      if (d.driverId !== body.expectedDriverId) throw new AppError('The delivery assignment changed in the meantime. Refresh and try again.', 409, 'DELIVERY_ASSIGNMENT_CHANGED');

      const updated = await tx.deliveryAssignment.updateMany({
        where: { id: d.id, driverId: body.expectedDriverId, operatedByUserId: null, status: d.status, attemptNumber: d.attemptNumber },
        data: { driverId: null, operatedByUserId: admin.userId, takenOverFromDriverId: body.expectedDriverId }
      });
      if (updated.count !== 1) throw new AppError('The delivery assignment changed in the meantime. Refresh and try again.', 409, 'DELIVERY_ASSIGNMENT_CHANGED');
      await AuditService.record(
        {
          actor: { userId: admin.userId, roles: admin.roles },
          action: 'DELIVERY_TAKEN_OVER',
          entity: 'Order',
          entityId: orderId,
          payload: { orderNumber: order.orderNumber, fromDriverEmployeeId: body.expectedDriverId, operatorUserId: admin.userId, assignmentStatus: d.status, attemptNumber: d.attemptNumber, reason: body.reason },
          context
        },
        tx
      );
      return { changed: true, order: await operatedDto(tx, orderId) };
    });
  }

  // ------------------------------------------------------------------------------------------------ verify (the customer's code)
  public static async verifyDelivery(orderId: string, rawCode: string, admin: Admin, receivedAt: Date, context?: AuditContext) {
    return DeliveryProofService.verifyAsAdmin(orderId, rawCode, admin, receivedAt, context);
  }

  // ------------------------------------------------------------------------------------------------ report failure
  public static async reportFailure(orderId: string, body: ReportFailureBody, admin: Admin, context?: AuditContext): Promise<{ changed: boolean; order: DeliveryOwnedOrderDto }> {
    return await prisma.$transaction(async (tx) => {
      const order = await DeliveryService.lockAndLoad(tx, orderId);
      if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
      assertBaseEligible(order);
      assertOperated(order.delivery);
      if (order.status !== 'DISPATCHED') throw new AppError('Only an order that is out for delivery can be reported', 409, 'ORDER_NOT_DISPATCHED');
      const a = order.delivery!;
      let changed = false;
      if (a.status === 'FAILED') {
        // replay: the first report stands
      } else if (a.status === 'IN_TRANSIT') {
        const updated = await tx.deliveryAssignment.updateMany({
          where: { id: a.id, driverId: null, operatedByUserId: { not: null }, status: 'IN_TRANSIT' },
          data: { status: 'FAILED', deliveryNotes: serializeFailureNote(body.reasonCode, body.note ?? null), failedAt: new Date() }
        });
        if (updated.count !== 1) throw new AppError('The delivery assignment changed. Please refresh.', 409, 'ORDER_STATE_CONFLICT');
        changed = true;
        await AuditService.record(
          {
            actor: { userId: admin.userId, roles: admin.roles },
            action: 'DELIVERY_FAILURE_REPORTED',
            entity: 'Order',
            entityId: orderId,
            payload: { orderNumber: order.orderNumber, reasonCode: body.reasonCode, note: body.note ?? undefined, operatorUserId: admin.userId },
            context
          },
          tx
        );
      } else {
        throw new AppError('This delivery is not in a state that can be reported', 409, 'INVALID_DELIVERY_STATE');
      }
      return { changed, order: await operatedDto(tx, orderId) };
    });
  }

  // ------------------------------------------------------------------------------------------------ retry (FAILED -> next attempt, same operator) and resume
  /**
   * FAILED -> ASSIGNED (attempt + 1) for an administrator-operated job, with the same archive-first rule as P9C: the failed attempt is written to DeliveryAttempt
   * BEFORE the live assignment is reused (an insert failure rolls everything back), and the previous attempt's code can never work again.
   */
  public static async retry(orderId: string, body: OperatorRetryBody, admin: Admin, context?: AuditContext) {
    return await prisma.$transaction(
      async (tx) => {
        const order = await DeliveryService.lockAndLoad(tx, orderId);
        if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
        assertBaseEligible(order);
        if (order.paymentStatus !== 'PAID' || order.status !== 'DISPATCHED') throw new AppError('This order is not eligible for delivery resolution', 409, 'ORDER_NOT_OPERATIONALLY_ELIGIBLE');
        assertOperated(order.delivery);
        const a = order.delivery!;
        if (a.status !== 'FAILED') throw new AppError('Only a failed delivery attempt can be retried', 409, 'DELIVERY_NOT_FAILED');
        if (a.attemptNumber !== body.expectedAttemptNumber) throw changed409();
        if (a.attemptNumber >= MAX_DELIVERY_ATTEMPTS) {
          throw new AppError('The maximum number of delivery attempts has been reached. Cancel the order with a full refund or confirm the handover.', 409, 'DELIVERY_ATTEMPT_LIMIT_REACHED');
        }
        const proofRow = await lockProof(tx, orderId);
        await archiveFailedAttempt(tx, {
          orderId,
          kitchenBranchId: order.kitchenBranchId,
          assignment: a,
          proofCodeVersion: proofRow.codeVersion,
          outcome: 'RETRY_SAME_DRIVER',
          resolvedByUserId: admin.userId,
          resolutionReasonCode: body.reasonCode,
          resolutionNote: body.note ?? null
        });
        const updated = await tx.deliveryAssignment.updateMany({
          where: { id: a.id, status: 'FAILED', driverId: null, operatedByUserId: { not: null }, attemptNumber: a.attemptNumber },
          data: { status: 'ASSIGNED', attemptNumber: a.attemptNumber + 1, pickupTime: null, deliveryTime: null, deliveryNotes: null, failedAt: null }
        });
        if (updated.count !== 1) throw changed409();
        await invalidateProof(tx, orderId);
        await AuditService.record(
          {
            actor: { userId: admin.userId, roles: admin.roles },
            action: 'DELIVERY_RETRY_SAME_OPERATOR',
            entity: 'Order',
            entityId: orderId,
            payload: { orderNumber: order.orderNumber, previousAttemptNumber: a.attemptNumber, attemptNumber: a.attemptNumber + 1, operatorUserId: admin.userId, reasonCode: body.reasonCode, outcome: 'RETRY_SAME_DRIVER' },
            context
          },
          tx
        );
        return { changed: true, orderId, orderNumber: order.orderNumber, attemptNumber: a.attemptNumber + 1, assignmentState: 'ASSIGNED' as const };
      },
      { maxWait: 10000, timeout: 20000 }
    );
  }

  /** ASSIGNED -> IN_TRANSIT (the retry attempt starts). No financial effect; the order stays DISPATCHED. */
  public static async resume(orderId: string, admin: Admin, context?: AuditContext): Promise<{ changed: boolean; order: DeliveryOwnedOrderDto }> {
    return await prisma.$transaction(async (tx) => {
      const order = await DeliveryService.lockAndLoad(tx, orderId);
      if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
      assertBaseEligible(order);
      assertOperated(order.delivery);
      if (order.status !== 'DISPATCHED') throw new AppError('Only an order that is out for delivery can be resumed', 409, 'ORDER_NOT_DISPATCHED');
      if (order.paymentStatus !== 'PAID') throw new AppError('This order is no longer eligible for delivery', 409, 'ORDER_NOT_OPERATIONALLY_ELIGIBLE');
      const a = order.delivery!;
      let changed = false;
      if (a.status === 'IN_TRANSIT') {
        // replay: nothing to do
      } else if (a.status === 'FAILED') {
        throw new AppError('A problem was reported for this delivery. Retry it first.', 409, 'DELIVERY_IN_EXCEPTION');
      } else if (a.status === 'ASSIGNED' && a.attemptNumber <= MAX_DELIVERY_ATTEMPTS) {
        const updated = await tx.deliveryAssignment.updateMany({
          where: { id: a.id, driverId: null, operatedByUserId: { not: null }, status: 'ASSIGNED', attemptNumber: a.attemptNumber },
          data: { status: 'IN_TRANSIT', pickupTime: new Date() }
        });
        if (updated.count !== 1) throw new AppError('The delivery assignment changed. Please refresh.', 409, 'ORDER_STATE_CONFLICT');
        changed = true;
        await AuditService.record(
          { actor: { userId: admin.userId, roles: admin.roles }, action: 'DELIVERY_RESUMED', entity: 'Order', entityId: orderId, payload: { orderNumber: order.orderNumber, attemptNumber: a.attemptNumber, operatorUserId: admin.userId }, context },
          tx
        );
      } else {
        throw new AppError('This delivery is not in a state that can be resumed', 409, 'INVALID_DELIVERY_STATE');
      }
      return { changed, order: await operatedDto(tx, orderId) };
    });
  }
}
