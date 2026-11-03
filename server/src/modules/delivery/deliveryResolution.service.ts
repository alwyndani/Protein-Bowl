import { Prisma, RoleEnum } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditContext, AuditService } from '../audit/audit.service.js';
import { CancellationService } from '../refund/cancellation.service.js';
import { RefundService } from '../refund/refund.service.js';
import { RefundViewService } from '../refund/refundView.service.js';
import { DeliveryService } from './delivery.service.js';
import { archiveFailedAttempt } from './deliveryAttemptArchive.js';
import { MAX_DELIVERY_ATTEMPTS, UndeliverableBody } from './deliveryAttemptPolicy.js';
import { lockProof } from './deliveryProof.service.js';
import { parseFailureNote } from './delivery.dto.js';

/**
 * Failed-delivery resolution (P9C, B2a). What remains here is Cancel & Full Refund (markUndeliverable), the attempt history (getAttempts) and invalidateProof.
 * The driver-based retry / reassign and the driver Resume were REMOVED with the DELIVERY role: a SUPER_ADMIN retries and resumes through DeliveryOperateService.
 *
 * Canonical states (no new OrderStatus): the Order stays DISPATCHED while a delivery exception is resolved.
 *   FAILED --retry (attempt < MAX)--> ASSIGNED (attempt + 1) --resume--> IN_TRANSIT --valid NEW code--> DELIVERED
 *   FAILED --Cancel & Full Refund--> Order CANCELLED + the existing P7C full refund
 *
 * Lock order everywhere: Order row -> DeliveryProof row (the assignment is covered by the order lock); the undeliverable path then follows
 * the P7C order (ProviderPayment -> Refund). Every action re-reads DIRECT + ONLINE + PAID + DISPATCHED under the order lock.
 * The failed attempt is archived in DeliveryAttempt BEFORE the live assignment is changed; an archive failure rolls everything back.
 */
type Tx = Prisma.TransactionClient;
type Admin = { userId: string; roles: readonly RoleEnum[] };

const changedError = () => new AppError('This delivery changed in the meantime. Refresh and try again.', 409, 'DELIVERY_ATTEMPT_CHANGED');

function assertEligible(order: { orderType: string; paymentMethod: string | null; paymentStatus: string; status: string; kitchenBranchId: string | null }) {
  if (order.orderType !== 'DIRECT' || order.paymentMethod !== 'ONLINE' || order.paymentStatus !== 'PAID' || order.status !== 'DISPATCHED' || !order.kitchenBranchId) {
    throw new AppError('This order is not eligible for delivery resolution', 409, 'ORDER_NOT_OPERATIONALLY_ELIGIBLE');
  }
}

/** Invalidates the previous attempt's code: new version, no hash, no current-attempt lock state. Regeneration counters/window are PRESERVED. */
export async function invalidateProof(tx: Tx, orderId: string): Promise<void> {
  await tx.deliveryProof.update({
    where: { orderId },
    data: { codeVersion: { increment: 1 }, codeHash: null, issuedAt: null, failedAttempts: 0, lockCycles: 0, lockedUntil: null, blockedAt: null }
  });
}

export class DeliveryResolutionService {
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
  public static async getAttempts(orderId: string, viewer: 'SUPER_ADMIN') {
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
