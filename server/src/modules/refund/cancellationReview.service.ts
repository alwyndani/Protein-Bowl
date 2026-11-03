import { RoleEnum } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditContext, AuditService } from '../audit/audit.service.js';
import { lockOrder } from '../payment/paymentOps.js';
import { CancellationService } from './cancellation.service.js';
import { REVIEWABLE_CANCELLATION_STATES } from './cancellationPolicy.js';
import { RefundService } from './refund.service.js';
import { RefundViewService } from './refundView.service.js';

export const REQUEST_STATUS = { PENDING: 'PENDING', APPROVED: 'APPROVED', DECLINED: 'DECLINED' } as const;

/**
 * Staff-reviewed cancellation of a PAID order the kitchen has already accepted or started (ACCEPTED, PREPARING, READY).
 * The customer REQUESTS; nothing is promised. SUPER_ADMIN APPROVES (one transaction: request -> APPROVED, order -> CANCELLED, FULL refund intent;
 * the provider is contacted only after the commit and the reconciliation worker guarantees it) or DECLINES with a reason shown to the customer.
 * If the approval cannot complete (order moved on, payment not refundable, refund conflict) the whole transaction rolls back and the request stays PENDING.
 */
export class CancellationReviewService {
  // ------------------------------------------------------------------ customer
  public static async request(userId: string, orderId: string, body: { reasonCode: string; note: string | null }, context?: AuditContext) {
    const profile = await prisma.customerProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');

    const created = await prisma.$transaction(async (tx) => {
      await lockOrder(tx, orderId);
      const order = await tx.order.findFirst({
        where: { id: orderId, customerProfileId: profile.id },
        select: { id: true, orderNumber: true, status: true, orderType: true, paymentStatus: true, paymentMethod: true }
      });
      if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND'); // other customers' orders are indistinguishable from missing ones

      const existing = await tx.cancellationRequest.findMany({ where: { orderId }, select: { id: true, status: true } });
      const open = existing.find((r) => r.status === REQUEST_STATUS.PENDING);
      if (open) return { id: open.id, replay: true };
      if (existing.some((r) => r.status === REQUEST_STATUS.DECLINED)) {
        throw new AppError('Your earlier request for this order was reviewed and declined', 409, 'CANCELLATION_REQUEST_DECLINED');
      }
      const eligible =
        order.orderType === 'DIRECT' &&
        order.paymentMethod === 'ONLINE' &&
        order.paymentStatus === 'PAID' &&
        (REVIEWABLE_CANCELLATION_STATES as readonly string[]).includes(order.status);
      if (!eligible) throw new AppError('A cancellation request is not possible for this order', 409, 'CANCELLATION_REQUEST_NOT_ALLOWED');

      const row = await tx.cancellationRequest.create({ data: { orderId, requestedByUserId: userId, reasonCode: body.reasonCode, note: body.note } });
      await AuditService.record(
        { actor: { userId, roles: [RoleEnum.CUSTOMER] }, action: 'CANCELLATION_REQUESTED', entity: 'Order', entityId: orderId, payload: { orderNumber: order.orderNumber, requestId: row.id, from: order.status, reasonCode: body.reasonCode }, context },
        tx
      );
      return { id: row.id, replay: false };
    });

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { id: true, status: true, orderType: true, paymentStatus: true, paymentMethod: true, netAmount: true } });
    const derived = (await RefundViewService.deriveForOrders([order])).get(orderId)!;
    return { requestId: created.id, alreadyRequested: created.replay, status: order.status, cancellationRequest: derived.cancellationRequest, refund: derived.refund };
  }

  // ------------------------------------------------------------------ SUPER_ADMIN
  public static async list(opts: { status?: string; page: number; pageSize: number }) {
    const where = opts.status ? { status: opts.status } : {};
    const [total, items] = await Promise.all([
      prisma.cancellationRequest.count({ where }),
      prisma.cancellationRequest.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
        select: {
          id: true,
          status: true,
          reasonCode: true,
          note: true,
          decisionNote: true,
          decidedAt: true,
          createdAt: true,
          order: { select: { id: true, orderNumber: true, status: true, paymentStatus: true, netAmount: true, kitchenBranchId: true } }
        }
      })
    ]);
    return { items, page: opts.page, pageSize: opts.pageSize, total, totalPages: Math.max(1, Math.ceil(total / opts.pageSize)) };
  }

  public static async approve(admin: { userId: string; roles: readonly RoleEnum[] }, requestId: string, note: string | null, context?: AuditContext) {
    const found = await prisma.cancellationRequest.findUnique({ where: { id: requestId }, select: { orderId: true } });
    if (!found) throw new AppError('Cancellation request not found', 404, 'CANCELLATION_REQUEST_NOT_FOUND');

    const result = await prisma.$transaction(
      async (tx) => {
        await lockOrder(tx, found.orderId);
        const req = await tx.cancellationRequest.findUniqueOrThrow({ where: { id: requestId } });
        if (req.status === REQUEST_STATUS.APPROVED) return { replay: true as const, refundId: null as string | null, orderId: found.orderId, orderNumber: '' };
        if (req.status !== REQUEST_STATUS.PENDING) throw new AppError('This request was already decided', 409, 'CANCELLATION_REQUEST_DECIDED');

        const flipped = await tx.cancellationRequest.updateMany({
          where: { id: requestId, status: REQUEST_STATUS.PENDING },
          data: { status: REQUEST_STATUS.APPROVED, decidedByUserId: admin.userId, decisionNote: note, decidedAt: new Date() }
        });
        if (flipped.count !== 1) throw new AppError('This request was already decided', 409, 'CANCELLATION_REQUEST_DECIDED');

        const cancelled = await CancellationService.cancelReviewedInTx(tx, admin, found.orderId, { id: req.id, reasonCode: req.reasonCode, note: req.note }, context);
        await AuditService.record(
          { actor: { userId: admin.userId, roles: admin.roles }, action: 'CANCELLATION_REQUEST_APPROVED', entity: 'Order', entityId: found.orderId, payload: { requestId, refundId: cancelled.refundId }, context },
          tx
        );
        return { replay: false as const, refundId: cancelled.refundId, orderId: cancelled.orderId, orderNumber: cancelled.orderNumber };
      },
      { maxWait: 10000, timeout: 20000 }
    );
    if (!result.replay) RefundService.kick(result.refundId); // best effort AFTER the commit; the worker is what guarantees it
    return { requestId, status: REQUEST_STATUS.APPROVED, alreadyApproved: result.replay, orderId: result.orderId, refundId: result.refundId };
  }

  public static async decline(admin: { userId: string; roles: readonly RoleEnum[] }, requestId: string, note: string, context?: AuditContext) {
    const found = await prisma.cancellationRequest.findUnique({ where: { id: requestId }, select: { orderId: true } });
    if (!found) throw new AppError('Cancellation request not found', 404, 'CANCELLATION_REQUEST_NOT_FOUND');
    return await prisma.$transaction(async (tx) => {
      await lockOrder(tx, found.orderId);
      const req = await tx.cancellationRequest.findUniqueOrThrow({ where: { id: requestId } });
      if (req.status === REQUEST_STATUS.DECLINED) return { requestId, status: REQUEST_STATUS.DECLINED, alreadyDeclined: true };
      const flipped = await tx.cancellationRequest.updateMany({
        where: { id: requestId, status: REQUEST_STATUS.PENDING },
        data: { status: REQUEST_STATUS.DECLINED, decidedByUserId: admin.userId, decisionNote: note, decidedAt: new Date() }
      });
      if (flipped.count !== 1) throw new AppError('This request was already decided', 409, 'CANCELLATION_REQUEST_DECIDED');
      await AuditService.record(
        { actor: { userId: admin.userId, roles: admin.roles }, action: 'CANCELLATION_REQUEST_DECLINED', entity: 'Order', entityId: found.orderId, payload: { requestId }, context },
        tx
      );
      return { requestId, status: REQUEST_STATUS.DECLINED, alreadyDeclined: false };
    });
  }
}
