import { RoleEnum } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditContext, AuditService } from '../audit/audit.service.js';
import { OrderTransitionService, TransitionActor } from '../order/orderTransition.service.js';
import { MESS_ORDER_TYPE } from '../order/orderStatus.js';
import { Tx, lockOrder, lockProviderPaymentById, lockSession } from '../payment/paymentOps.js';
import { ADMIN_CANCELLABLE_STATES, CUSTOMER_CANCELLABLE_STATES, UNDELIVERABLE_REFUND_REASON_CODE } from './cancellationPolicy.js';
import { RefundService } from './refund.service.js';
import { LIVE_REFUND_STATUSES, REFUND_TRIGGER } from './refundStatus.js';
import { RefundViewService } from './refundView.service.js';

export interface MessCancelHooks {
  /** Called under the Order lock and the payment locks; takes the subscription lock and decides eligibility (throws to refuse). */
  verify: (tx: Tx) => Promise<'OK' | 'ALREADY_CANCELLED'>;
  /** Called after the order transition, in the same transaction. */
  finish: (tx: Tx) => Promise<void>;
}

export interface CancelResult {
  /** False when the order was already cancelled (idempotent repeat: no second cancellation, no second refund). */
  changed: boolean;
  orderId: string;
  orderNumber: string;
  refundId: string | null;
}

interface CancelCommand {
  orderId: string;
  actor: Extract<TransitionActor, { kind: 'USER' }>;
  byCustomer: boolean;
  reasonCode: string;
  note: string | null;
  /** P10A: set only by cancelMessPurchase. Replaces the DIRECT-only rule with the Kerala Mess purchase rules (verified and finished by MessCancellationService). */
  mess?: MessCancelHooks;
  /** P9C: set only by cancelUndeliverableInTx. Replaces the state allow-list with DISPATCHED (verified again by OrderTransitionService). */
  undeliverable?: { attemptNumber: number };
  context?: AuditContext;
}

/**
 * Order cancellation (P7C). One database transaction does everything that must be atomic:
 *   lock Order -> (paid) lock the applied ProviderPayment -> validate policy -> create the FULL Refund intent ->
 *   transition Order -> CANCELLED through OrderTransitionService -> audit -> commit.
 * The provider is contacted ONLY after the commit (best effort); the reconciliation worker guarantees submission.
 * Unpaid orders cancel with no Refund and their open payment sessions become unusable (never deleted).
 */
export class CancellationService {
  // ================================================================================================ customer
  public static async customerCancel(userId: string, orderId: string, body: { reasonCode: string; note: string | null }, context?: AuditContext) {
    const profile = await prisma.customerProfile.findUnique({ where: { userId }, select: { id: true } });
    const owned = profile ? await prisma.order.findFirst({ where: { id: orderId, customerProfileId: profile.id }, select: { id: true } }) : null;
    if (!profile || !owned) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND'); // other customers' orders are indistinguishable from missing ones

    const result = await this.cancel({
      orderId,
      actor: { kind: 'USER', userId, roles: [RoleEnum.CUSTOMER], customerProfileId: profile.id },
      byCustomer: true,
      reasonCode: body.reasonCode,
      note: body.note,
      context
    });
    return await RefundViewService.cancelResponse(result);
  }

  // ================================================================================================ SUPER_ADMIN (step-up enforced at the route)
  public static async adminCancel(admin: { userId: string; roles: readonly RoleEnum[] }, orderId: string, body: { reasonCode: string; note: string | null }, context?: AuditContext) {
    const result = await this.cancel({
      orderId,
      actor: { kind: 'USER', userId: admin.userId, roles: admin.roles, isGlobal: true },
      byCustomer: false,
      reasonCode: body.reasonCode,
      note: body.note,
      context
    });
    return await RefundViewService.cancelResponse(result);
  }

  // ================================================================================================ P10A Kerala Mess purchase (called ONLY by MessCancellationService)
  public static async cancelMessPurchase(
    orderId: string,
    p: { actor: Extract<TransitionActor, { kind: 'USER' }>; byCustomer: boolean; reasonCode: string; note: string | null; context?: AuditContext },
    hooks: MessCancelHooks
  ): Promise<CancelResult> {
    return await this.cancel({ orderId, actor: p.actor, byCustomer: p.byCustomer, reasonCode: p.reasonCode, note: p.note, context: p.context, mess: hooks });
  }

  // ================================================================================================ P9C undeliverable (called ONLY by DeliveryResolutionService)
  /**
   * Cancels a DISPATCHED order whose delivery attempt FAILED permanently, inside the CALLER's transaction (which has already locked the
   * order and archived the attempt as UNDELIVERABLE_CANCELLED). Creates the FULL refund intent exactly like every other cancellation; the provider
   * is contacted only after the caller commits (RefundService.kick), and the reconciliation worker guarantees submission.
   */
  public static async cancelUndeliverableInTx(
    tx: Tx,
    admin: { userId: string; roles: readonly RoleEnum[] },
    orderId: string,
    attemptNumber: number,
    note: string | null,
    context?: AuditContext
  ): Promise<CancelResult> {
    return await this.cancelTx(tx, {
      orderId,
      actor: { kind: 'USER', userId: admin.userId, roles: admin.roles, isGlobal: true },
      byCustomer: false,
      reasonCode: UNDELIVERABLE_REFUND_REASON_CODE,
      note,
      undeliverable: { attemptNumber },
      context
    });
  }

  // ================================================================================================ core
  private static async cancel(cmd: CancelCommand): Promise<CancelResult> {
    const result = await prisma.$transaction(async (tx) => await this.cancelTx(tx, cmd), { maxWait: 10000, timeout: 20000 });
    RefundService.kick(result.changed ? result.refundId : null); // best effort AFTER the commit; the worker is what guarantees it
    return result;
  }

  private static async cancelTx(tx: Tx, cmd: CancelCommand): Promise<CancelResult> {
    await lockOrder(tx, cmd.orderId);
    const order = await tx.order.findUnique({
      where: { id: cmd.orderId },
      select: { id: true, orderNumber: true, status: true, orderType: true, paymentStatus: true, customerProfileId: true, paidByProviderPaymentId: true }
    });
    if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    if (cmd.byCustomer && order.customerProfileId !== cmd.actor.customerProfileId) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');

    // Idempotent repeat: an already cancelled order is returned as is (never a second cancellation or refund).
    if (order.status === 'CANCELLED') {
      if (cmd.mess) await cmd.mess.verify(tx); // takes the subscription lock only; the order is already cancelled
      const existing = await tx.refund.findFirst({ where: { orderId: order.id, trigger: { in: [REFUND_TRIGGER.CUSTOMER_CANCELLATION, REFUND_TRIGGER.ADMIN_CANCELLATION] }, status: { in: [...LIVE_REFUND_STATUSES] } }, select: { id: true } });
      return { changed: false, orderId: order.id, orderNumber: order.orderNumber, refundId: existing?.id ?? null };
    }

    // DIRECT orders cancel through the food-order routes; a Mess purchase ONLY through the Mess service (which supplies its hooks). Never mixed.
    if (cmd.mess ? order.orderType !== MESS_ORDER_TYPE : order.orderType !== 'DIRECT') throw new AppError('This order cannot be cancelled here', 409, 'CANCELLATION_NOT_ALLOWED');
    if (cmd.mess && cmd.undeliverable) throw new AppError('This order cannot be cancelled here', 409, 'CANCELLATION_NOT_ALLOWED');

    const allowedStates: readonly string[] = cmd.undeliverable ? ['DISPATCHED'] : cmd.byCustomer ? CUSTOMER_CANCELLABLE_STATES : ADMIN_CANCELLABLE_STATES;
    if (!allowedStates.includes(order.status)) {
      if (!cmd.byCustomer && (order.status === 'PREPARING' || order.status === 'READY')) {
        throw new AppError('Cancellation of an order that is already being prepared is not supported yet', 409, 'CANCELLATION_STATE_NOT_SUPPORTED');
      }
      throw new AppError('This order can no longer be cancelled', 409, 'CANCELLATION_NOT_ALLOWED');
    }

    // The kitchen must not have started physical work on it (kitchen/delivery side effects belong to P8/P9).
    const kot = await tx.kitchenOrderTicket.findUnique({ where: { orderId: order.id }, select: { status: true } });
    if (kot && kot.status !== 'QUEUED') throw new AppError('The kitchen has already started this order', 409, 'CANCELLATION_STATE_NOT_SUPPORTED');

    let refundId: string | undefined;
    let sessionsClosed = 0;

    if (cmd.undeliverable && order.paymentStatus !== 'PAID') throw new AppError('This order cannot be cancelled', 409, 'CANCELLATION_NOT_ALLOWED');
    if (order.paymentStatus === 'PAID') {
      if (!order.paidByProviderPaymentId) throw new AppError('The paid order has no effective payment on record; manual review is required', 409, 'CANCELLATION_NOT_ALLOWED');
      await lockProviderPaymentById(tx, order.paidByProviderPaymentId);
      const ledger = await tx.providerPayment.findUnique({ where: { id: order.paidByProviderPaymentId } });
      if (!ledger || ledger.reconciliationStatus !== 'APPLIED') throw new AppError('The order\'s effective payment is not in a refundable state', 409, 'CANCELLATION_NOT_ALLOWED');
      if (cmd.mess) await cmd.mess.verify(tx);
      const intent = await RefundService.createIntent(tx, {
        order,
        ledgerId: ledger.id,
        trigger: cmd.byCustomer ? REFUND_TRIGGER.CUSTOMER_CANCELLATION : REFUND_TRIGGER.ADMIN_CANCELLATION,
        reasonCode: cmd.reasonCode,
        reasonNote: cmd.note,
        requestedBy: { userId: cmd.actor.userId, kind: cmd.byCustomer ? 'CUSTOMER' : 'ADMIN' },
        context: cmd.context
      });
      refundId = intent.refund.id;
    } else if (order.paymentStatus === 'PENDING') {
      // Unpaid: no refund. Open checkout sessions stop being usable; they are kept (history + late-capture reconciliation).
      const open = await tx.payment.findMany({ where: { orderId: order.id, provider: { not: null }, status: 'PENDING' }, select: { id: true }, orderBy: { id: 'asc' } });
      for (const s of open) await lockSession(tx, s.id);
      const closed = await tx.payment.updateMany({ where: { id: { in: open.map((s) => s.id) }, status: 'PENDING' }, data: { status: 'EXPIRED', expiresAt: new Date() } });
      sessionsClosed = closed.count;
      if (cmd.mess) await cmd.mess.verify(tx);
    } else {
      throw new AppError('This order cannot be cancelled', 409, 'CANCELLATION_NOT_ALLOWED');
    }

    await AuditService.record(
      {
        actor: { userId: cmd.actor.userId, roles: cmd.actor.roles },
        action: 'ORDER_CANCELLATION_REQUESTED',
        entity: 'Order',
        entityId: order.id,
        payload: { orderNumber: order.orderNumber, from: order.status, reasonCode: cmd.reasonCode, note: cmd.note ?? undefined, actorKind: cmd.byCustomer ? 'CUSTOMER' : 'ADMIN', refundId, sessionsClosed },
        context: cmd.context
      },
      tx
    );

    await OrderTransitionService.transition({ orderId: order.id, to: 'CANCELLED', actor: cmd.actor, reason: cmd.reasonCode, refundIntentId: refundId, deliveryUndeliverable: cmd.undeliverable, context: cmd.context }, tx);
    if (cmd.mess) await cmd.mess.finish(tx);
    return { changed: true, orderId: order.id, orderNumber: order.orderNumber, refundId: refundId ?? null };
  }
}
