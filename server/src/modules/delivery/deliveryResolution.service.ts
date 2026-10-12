import { Prisma, RoleEnum } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditContext, AuditService } from '../audit/audit.service.js';
import { CancellationService } from '../refund/cancellation.service.js';
import { RefundService } from '../refund/refund.service.js';
import { RefundViewService } from '../refund/refundView.service.js';
import { DeliveryOrderNotVisible, DeliveryService, DriverCaller } from './delivery.service.js';
import { archiveFailedAttempt } from './deliveryAttemptArchive.js';
import { MAX_DELIVERY_ATTEMPTS, RetryBody, UndeliverableBody } from './deliveryAttemptPolicy.js';
import { lockProof } from './deliveryProof.service.js';
import { parseFailureNote } from './delivery.dto.js';

/**
 * P9C failed-delivery resolution. SUPER_ADMIN-only actions (step-up enforced at the route) plus the driver's Resume.
 *
 * Canonical states (no new OrderStatus): the Order stays DISPATCHED while a delivery exception is resolved.
 *   FAILED --retry / reassign (attempt < MAX)--> ASSIGNED (attempt + 1) --driver Resume--> IN_TRANSIT --valid NEW code--> DELIVERED
 *   ASSIGNED (pending retry) --reassign (same attempt, nothing archived)--> ASSIGNED (another driver)
 *   FAILED --Cancel & Full Refund--> Order CANCELLED + the existing P7C full refund
 *
 * Lock order everywhere: Order row -> DeliveryProof row (the assignment is covered by the order lock); the undeliverable path then follows
 * the P7C order (ProviderPayment -> Refund). Every action re-reads DIRECT + ONLINE + PAID + DISPATCHED under the order lock.
 * The failed attempt is archived in DeliveryAttempt BEFORE the live assignment is changed; an archive failure rolls everything back.
 */
type Tx = Prisma.TransactionClient;
type Admin = { userId: string; roles: readonly RoleEnum[] };

export interface RetryResult {
  changed: boolean;
  orderId: string;
  orderNumber: string;
  action: 'RETRY_SAME_DRIVER' | 'REASSIGNED' | 'PENDING_REASSIGNED';
  attemptNumber: number;
  assignmentState: 'ASSIGNED';
  driverEmployeeId: string;
}

const changedError = () => new AppError('This delivery changed in the meantime. Refresh and try again.', 409, 'DELIVERY_ATTEMPT_CHANGED');

function assertEligible(order: { orderType: string; paymentMethod: string | null; paymentStatus: string; status: string; kitchenBranchId: string | null }) {
  if (order.orderType !== 'DIRECT' || order.paymentMethod !== 'ONLINE' || order.paymentStatus !== 'PAID' || order.status !== 'DISPATCHED' || !order.kitchenBranchId) {
    throw new AppError('This order is not eligible for delivery resolution', 409, 'ORDER_NOT_OPERATIONALLY_ELIGIBLE');
  }
}

/** The target must be an ACTIVE DELIVERY employee authorized for THIS order's branch (FOR SHARE: a concurrent deactivation waits). Never cross-branch. */
async function assertAssignableDriver(tx: Tx, driverId: string, branchId: string): Promise<void> {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "employee_profiles" WHERE "id" = ${driverId} FOR SHARE`;
  const driver =
    locked.length === 1
      ? await tx.employeeProfile.findFirst({
          where: {
            id: driverId,
            user: { status: 'ACTIVE', deletedAt: null, roles: { some: { role: RoleEnum.DELIVERY } } },
            OR: [{ assignedBranchId: branchId }, { branchAssignments: { some: { branchId } } }]
          },
          select: { id: true }
        })
      : null;
  if (!driver) throw new AppError('The selected driver cannot be assigned to this order', 422, 'DRIVER_INVALID');
}

/** Invalidates the previous attempt's code: new version, no hash, no current-attempt lock state. Regeneration counters/window are PRESERVED. */
async function invalidateProof(tx: Tx, orderId: string): Promise<void> {
  await tx.deliveryProof.update({
    where: { orderId },
    data: { codeVersion: { increment: 1 }, codeHash: null, issuedAt: null, failedAttempts: 0, lockCycles: 0, lockedUntil: null, blockedAt: null }
  });
}

export class DeliveryResolutionService {
  // ------------------------------------------------------------------------------------------------ retry / reassign
  public static async retry(orderId: string, body: RetryBody, admin: Admin, context?: AuditContext): Promise<RetryResult> {
    return await prisma.$transaction(
      async (tx) => {
        const order = await DeliveryService.lockAndLoad(tx, orderId);
        if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
        assertEligible(order);
        const a = order.delivery;
        if (!a || !a.driverId) throw new AppError('This delivery has no driver', 409, 'DELIVERY_NOT_FAILED');
        const branchId = order.kitchenBranchId!;

        // -------- B1: a retry that is already ASSIGNED but not yet resumed may be handed to another driver (SAME attempt, nothing archived)
        if (a.status === 'ASSIGNED') {
          if (body.mode !== 'REASSIGN') throw new AppError('This delivery is waiting for its driver to resume; only a reassignment is possible', 409, 'INVALID_DELIVERY_STATE');
          if (a.attemptNumber < 2) throw new AppError('This delivery is not a pending retry', 409, 'DELIVERY_NOT_FAILED');
          if (a.attemptNumber !== body.expectedAttemptNumber || a.driverId !== body.expectedDriverId) throw changedError();
          if (body.driverEmployeeId === a.driverId) throw new AppError('The selected driver already owns this attempt', 422, 'DRIVER_UNCHANGED');
          await assertAssignableDriver(tx, body.driverEmployeeId!, branchId);
          const updated = await tx.deliveryAssignment.updateMany({
            where: { id: a.id, status: 'ASSIGNED', driverId: a.driverId, attemptNumber: a.attemptNumber },
            data: { driverId: body.driverEmployeeId!, branchId }
          });
          if (updated.count !== 1) throw changedError();
          await AuditService.record(
            {
              actor: { userId: admin.userId, roles: admin.roles },
              action: 'DELIVERY_PENDING_REASSIGNED',
              entity: 'Order',
              entityId: orderId,
              payload: { orderNumber: order.orderNumber, attemptNumber: a.attemptNumber, previousDriverEmployeeId: a.driverId, driverEmployeeId: body.driverEmployeeId, reasonCode: body.reasonCode },
              context
            },
            tx
          );
          return { changed: true, orderId, orderNumber: order.orderNumber, action: 'PENDING_REASSIGNED' as const, attemptNumber: a.attemptNumber, assignmentState: 'ASSIGNED' as const, driverEmployeeId: body.driverEmployeeId! };
        }

        // -------- FAILED -> next attempt
        if (a.status !== 'FAILED') throw new AppError('Only a failed delivery attempt can be retried', 409, 'DELIVERY_NOT_FAILED');
        if (a.attemptNumber !== body.expectedAttemptNumber || a.driverId !== body.expectedDriverId) throw changedError();
        if (a.attemptNumber >= MAX_DELIVERY_ATTEMPTS) {
          throw new AppError('The maximum number of delivery attempts has been reached. Cancel the order with a full refund or confirm the handover.', 409, 'DELIVERY_ATTEMPT_LIMIT_REACHED');
        }
        const reassign = body.mode === 'REASSIGN';
        if (reassign && body.driverEmployeeId === a.driverId) throw new AppError('Choose a different driver, or retry with the same driver', 422, 'DRIVER_UNCHANGED');
        const targetDriverId = reassign ? body.driverEmployeeId! : a.driverId;
        await assertAssignableDriver(tx, targetDriverId, branchId);

        const proofRow = await lockProof(tx, orderId);
        // 1) archive FIRST (insert failure => the whole transaction rolls back and the FAILED assignment is untouched)
        await archiveFailedAttempt(tx, {
          orderId,
          kitchenBranchId: order.kitchenBranchId,
          assignment: a,
          proofCodeVersion: proofRow.codeVersion,
          outcome: reassign ? 'REASSIGNED' : 'RETRY_SAME_DRIVER',
          resolvedByUserId: admin.userId,
          resolutionReasonCode: body.reasonCode,
          resolutionNote: body.note ?? null
        });
        // 2) only now reuse the live assignment for the next attempt
        const updated = await tx.deliveryAssignment.updateMany({
          where: { id: a.id, status: 'FAILED', driverId: a.driverId, attemptNumber: a.attemptNumber },
          data: { status: 'ASSIGNED', attemptNumber: a.attemptNumber + 1, driverId: targetDriverId, branchId, pickupTime: null, deliveryTime: null, deliveryNotes: null, failedAt: null }
        });
        if (updated.count !== 1) throw changedError();
        // 3) the previous attempt's code can never work again
        await invalidateProof(tx, orderId);
        await AuditService.record(
          {
            actor: { userId: admin.userId, roles: admin.roles },
            action: reassign ? 'DELIVERY_REASSIGNED_AFTER_FAILURE' : 'DELIVERY_RETRY_SAME_DRIVER',
            entity: 'Order',
            entityId: orderId,
            payload: {
              orderNumber: order.orderNumber,
              previousAttemptNumber: a.attemptNumber,
              attemptNumber: a.attemptNumber + 1,
              previousDriverEmployeeId: a.driverId,
              driverEmployeeId: targetDriverId,
              reasonCode: body.reasonCode,
              outcome: reassign ? 'REASSIGNED' : 'RETRY_SAME_DRIVER'
            },
            context
          },
          tx
        );
        return {
          changed: true,
          orderId,
          orderNumber: order.orderNumber,
          action: reassign ? ('REASSIGNED' as const) : ('RETRY_SAME_DRIVER' as const),
          attemptNumber: a.attemptNumber + 1,
          assignmentState: 'ASSIGNED' as const,
          driverEmployeeId: targetDriverId
        };
      },
      { maxWait: 10000, timeout: 20000 }
    );
  }

  // ------------------------------------------------------------------------------------------------ driver Resume
  /** ASSIGNED -> IN_TRANSIT for the assigned driver. No financial effect; the Order stays DISPATCHED. */
  public static async resume(orderId: string, caller: DriverCaller, context?: AuditContext) {
    try {
      return await prisma.$transaction(async (tx) => {
        const order = await DeliveryService.lockAndLoad(tx, orderId);
        const visible =
          !!order &&
          order.orderType === 'DIRECT' &&
          order.paymentMethod === 'ONLINE' &&
          !!order.kitchenBranchId &&
          caller.branchIds.includes(order.kitchenBranchId) &&
          order.delivery?.driverId === caller.employeeProfileId;
        if (!visible || !order) throw new DeliveryOrderNotVisible(!!order, 'write');
        if (order.status !== 'DISPATCHED') throw new AppError('Only an order that is out for delivery can be resumed', 409, 'ORDER_NOT_DISPATCHED');
        if (order.paymentStatus !== 'PAID') throw new AppError('This order is no longer eligible for delivery', 409, 'ORDER_NOT_OPERATIONALLY_ELIGIBLE');

        const a = order.delivery!;
        let changed = false;
        if (a.status === 'IN_TRANSIT') {
          // replay: nothing to do
        } else if (a.status === 'FAILED') {
          throw new AppError('A problem was reported for this delivery. Please wait for instructions from the team.', 409, 'DELIVERY_IN_EXCEPTION');
        } else if (a.status === 'ASSIGNED' && a.attemptNumber <= MAX_DELIVERY_ATTEMPTS) {
          const updated = await tx.deliveryAssignment.updateMany({
            where: { id: a.id, driverId: caller.employeeProfileId, status: 'ASSIGNED', attemptNumber: a.attemptNumber },
            data: { status: 'IN_TRANSIT', pickupTime: new Date() }
          });
          if (updated.count !== 1) throw new AppError('The delivery assignment changed. Please refresh.', 409, 'ORDER_STATE_CONFLICT');
          changed = true;
          await AuditService.record(
            {
              actor: { userId: caller.userId, roles: [RoleEnum.DELIVERY] },
              action: 'DELIVERY_RESUMED',
              entity: 'Order',
              entityId: orderId,
              payload: { orderNumber: order.orderNumber, attemptNumber: a.attemptNumber, driverEmployeeId: caller.employeeProfileId },
              context
            },
            tx
          );
        } else {
          throw new AppError('This delivery is not in a state that can be resumed', 409, 'INVALID_DELIVERY_STATE');
        }
        const dto = await DeliveryService.getOwnedOrder(orderId, caller, tx);
        if (!dto) throw new DeliveryOrderNotVisible(true, 'write');
        return { changed, order: dto };
      });
    } catch (err) {
      return DeliveryService.denyAudit(err, caller, 'resume', orderId, context);
    }
  }

  // ------------------------------------------------------------------------------------------------ Cancel & Full Refund
  /**
   * One transaction: lock Order -> lock proof -> archive the attempt as UNDELIVERABLE_CANCELLED -> P7C cancellation (ProviderPayment lock, FULL
   * refund intent, DISPATCHED -> CANCELLED through OrderTransitionService, audits) -> invalidate the code -> audit. The provider is contacted
   * only AFTER the commit (RefundService.kick) and the reconciliation worker guarantees submission. This service never calls a provider.
   */
  public static async markUndeliverable(orderId: string, body: UndeliverableBody, admin: Admin, context?: AuditContext) {
    const result = await prisma.$transaction(
      async (tx) => {
        const order = await DeliveryService.lockAndLoad(tx, orderId);
        if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');

        if (order.status === 'CANCELLED') {
          // idempotent replay: only for the SAME already-archived attempt
          const archived = await tx.deliveryAttempt.count({ where: { orderId, attemptNumber: body.expectedAttemptNumber, outcome: 'UNDELIVERABLE_CANCELLED' } });
          if (archived !== 1) throw new AppError('This order is not eligible for delivery resolution', 409, 'ORDER_NOT_OPERATIONALLY_ELIGIBLE');
          const refund = await tx.refund.findFirst({ where: { orderId }, orderBy: { createdAt: 'asc' }, select: { id: true } });
          return { changed: false, orderId, orderNumber: order.orderNumber, refundId: refund?.id ?? null, attemptNumber: body.expectedAttemptNumber };
        }
        assertEligible(order);
        const a = order.delivery;
        if (!a || a.status !== 'FAILED') throw new AppError('Only a failed delivery attempt can be closed as undeliverable', 409, 'DELIVERY_NOT_FAILED');
        if (a.attemptNumber !== body.expectedAttemptNumber) throw changedError();

        const proofRow = await lockProof(tx, orderId);
        await archiveFailedAttempt(tx, {
          orderId,
          kitchenBranchId: order.kitchenBranchId,
          assignment: a,
          proofCodeVersion: proofRow.codeVersion,
          outcome: 'UNDELIVERABLE_CANCELLED',
          resolvedByUserId: admin.userId,
          resolutionReasonCode: body.reasonCode,
          resolutionNote: body.note
        });
        // the admin note stays in DeliveryAttempt; the generic cancellation audit/refund rows carry no free-text delivery note
        const cancelled = await CancellationService.cancelUndeliverableInTx(tx, admin, orderId, a.attemptNumber, null, context);
        await invalidateProof(tx, orderId);
        await AuditService.record(
          {
            actor: { userId: admin.userId, roles: admin.roles },
            action: 'DELIVERY_UNDELIVERABLE',
            entity: 'Order',
            entityId: orderId,
            payload: { orderNumber: order.orderNumber, attemptNumber: a.attemptNumber, reasonCode: body.reasonCode, refundId: cancelled.refundId, outcome: 'UNDELIVERABLE_CANCELLED' },
            context
          },
          tx
        );
        return { changed: true, orderId, orderNumber: order.orderNumber, refundId: cancelled.refundId, attemptNumber: a.attemptNumber };
      },
      { maxWait: 10000, timeout: 20000 }
    );
    RefundService.kick(result.changed ? result.refundId : null); // best effort AFTER the commit; the worker is what guarantees it
    const view = await RefundViewService.cancelResponse(result);
    return { ...view, attemptNumber: result.attemptNumber, changed: result.changed };
  }

  // ------------------------------------------------------------------------------------------------ attempt history (read)
  /**
   * Attempt history of one order. SUPER_ADMIN also receives the operational notes; MD (read-only) receives structured fields ONLY:
   * no failure note, no resolution note, no resolver identity, no security internals.
   */
  public static async getAttempts(orderId: string, viewer: 'SUPER_ADMIN' | 'MD') {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        orderType: true,
        delivery: { select: { attemptNumber: true, status: true, pickupTime: true, failedAt: true, deliveryNotes: true, driver: { select: { id: true, employeeCode: true, fullName: true } } } }
      }
    });
    if (!order || order.orderType !== 'DIRECT') throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    const rows = await prisma.deliveryAttempt.findMany({
      where: { orderId },
      orderBy: { attemptNumber: 'asc' },
      select: {
        attemptNumber: true,
        startedAt: true,
        failedAt: true,
        failureReasonCode: true,
        failureNote: true,
        outcome: true,
        resolvedByUserId: true,
        resolutionReasonCode: true,
        resolutionNote: true,
        endedAt: true,
        driver: { select: { id: true, employeeCode: true, fullName: true } },
        branch: { select: { id: true, code: true, name: true } }
      }
    });
    const isAdmin = viewer === 'SUPER_ADMIN';
    const a = order.delivery;
    const state = a ? (a.status === 'IN_TRANSIT' || a.status === 'FAILED' || a.status === 'ASSIGNED' || a.status === 'DELIVERED' ? a.status : null) : null;
    const failure = a?.status === 'FAILED' ? (parseFailureNote(a.deliveryNotes) ?? { reasonCode: 'OTHER', note: null }) : null;
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      maxAttempts: MAX_DELIVERY_ATTEMPTS,
      current: a
        ? {
            attemptNumber: a.attemptNumber,
            state,
            driver: a.driver ? { employeeId: a.driver.id, employeeCode: a.driver.employeeCode, fullName: a.driver.fullName } : null,
            startedAt: a.pickupTime ? a.pickupTime.toISOString() : null,
            failedAt: a.failedAt ? a.failedAt.toISOString() : null,
            failureReasonCode: failure ? failure.reasonCode : null,
            ...(isAdmin && failure ? { failureNote: failure.note } : {}),
            canRetry: order.status === 'DISPATCHED' && a.status === 'FAILED' && a.attemptNumber < MAX_DELIVERY_ATTEMPTS
          }
        : null,
      attempts: rows.map((r) => ({
        attemptNumber: r.attemptNumber,
        driver: r.driver ? { employeeId: r.driver.id, employeeCode: r.driver.employeeCode, fullName: r.driver.fullName } : null,
        branch: r.branch,
        startedAt: r.startedAt ? r.startedAt.toISOString() : null,
        failedAt: r.failedAt ? r.failedAt.toISOString() : null,
        endedAt: r.endedAt.toISOString(),
        failureReasonCode: r.failureReasonCode,
        outcome: r.outcome,
        resolutionReasonCode: r.resolutionReasonCode,
        ...(isAdmin ? { failureNote: r.failureNote, resolutionNote: r.resolutionNote, resolvedByUserId: r.resolvedByUserId } : {})
      }))
    };
  }
}
