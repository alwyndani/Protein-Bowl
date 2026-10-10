import { Prisma, RoleEnum } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditContext, AuditService } from '../audit/audit.service.js';
import {
  KITCHEN_BRANCH_REQUIRED_FOR,
  OPERATIONAL_ORDER_STATUSES,
  ORDER_TRANSITIONS,
  OrderStatus,
  PAID_ORDER_CANCELLATION_SUPPORTED,
  PAID_PAYMENT_STATUSES,
  TERMINAL_ORDER_STATUSES,
  TRANSITION_PARTIES,
  TransitionParty,
  isOrderStatus,
  transitionKey
} from './orderStatus.js';

export type TransitionActor =
  | { kind: 'SYSTEM'; source: 'PAYMENT_VERIFICATION' | 'PAYMENT_EXPIRY' }
  | {
      kind: 'USER';
      userId: string;
      roles: readonly RoleEnum[];
      /** Set for CUSTOMER actors: the CustomerProfile that must own the order. */
      customerProfileId?: string | null;
      /** Branches the actor is assigned to (ignored when isGlobal). */
      branchIds?: readonly string[];
      /** SUPER_ADMIN style global scope. */
      isGlobal?: boolean;
    };

export interface TransitionRequest {
  orderId: string;
  to: OrderStatus;
  actor: TransitionActor;
  reason?: string | null;
  context?: AuditContext;
}

export interface TransitionResult {
  /** False when the order was already in the requested status (an idempotent no-op: no event, no audit). */
  changed: boolean;
  order: { id: string; orderNumber: string; status: string; paymentStatus: string; paymentMethod: string | null };
  eventId: string | null;
}

type Tx = Prisma.TransactionClient;

/**
 * The ONLY place that may change `Order.status` after creation.
 *
 * Inside one transaction it: locks the order row, validates the move against the allow-list, authorizes the actor
 * (and ownership/branch), enforces payment eligibility, performs a compare-and-set update, writes exactly one
 * OrderEvent and one audit row. Same-status requests are idempotent no-ops. Pass `tx` to join a caller's transaction
 * (KDS/delivery do, so the ticket/assignment change and the order change commit or roll back together).
 */
export class OrderTransitionService {
  public static async transition(request: TransitionRequest, tx?: Tx): Promise<TransitionResult> {
    if (tx) return this.run(request, tx);
    return await prisma.$transaction((inner) => this.run(request, inner));
  }

  private static async run(request: TransitionRequest, tx: Tx): Promise<TransitionResult> {
    const { orderId, to, actor } = request;
    if (!isOrderStatus(to)) {
      throw new AppError('Unknown order status', 422, 'INVALID_ORDER_STATUS');
    }

    // Serialize every status change of this order (also against concurrent payment/cancel flows added later).
    await tx.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        orderType: true,
        customerProfileId: true,
        kitchenBranchId: true
      }
    });
    if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');

    // A customer may only ever see/act on their own order - anything else is indistinguishable from "not found".
    if (actor.kind === 'USER' && this.isCustomerActor(actor) && order.customerProfileId !== actor.customerProfileId) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    const from = order.status;
    const summary = { id: order.id, orderNumber: order.orderNumber, paymentStatus: order.paymentStatus, paymentMethod: order.paymentMethod };

    if (from === to) {
      return { changed: false, order: { ...summary, status: from }, eventId: null };
    }

    if (!isOrderStatus(from) || !(ORDER_TRANSITIONS[from] as readonly string[]).includes(to)) {
      throw new AppError(`An order that is ${from} cannot become ${to}`, 409, 'INVALID_ORDER_TRANSITION');
    }
    if (order.orderType !== 'DIRECT') {
      // Mess/POS/aggregator orders have their own lifecycles (later phases); never drive them through the direct-order policy.
      throw new AppError('This order type does not support this transition yet', 409, 'INVALID_ORDER_TRANSITION');
    }

    this.assertActorMayPerform(actor, from, to, order.customerProfileId);

    if (to === 'CANCELLED') {
      this.assertCancellable(order.paymentStatus, actor, request.reason);
    }

    if ((OPERATIONAL_ORDER_STATUSES as readonly string[]).includes(to)) {
      this.assertOperationallyEligible(order, to);
      this.assertBranchScope(actor, order.kitchenBranchId);
    }

    const now = new Date();
    const data: Prisma.OrderUpdateManyMutationInput = { status: to };
    if (to === 'CONFIRMED') data.confirmedAt = now;
    if (to === 'CANCELLED') {
      data.cancelledAt = now;
      data.cancellationReason = request.reason?.trim() || null;
    }

    // Compare-and-set: succeeds only if nobody changed the status since we read it (defence in depth next to the row lock).
    const updated = await tx.order.updateMany({ where: { id: orderId, status: from }, data });
    if (updated.count !== 1) {
      throw new AppError('The order was changed by another request. Please retry.', 409, 'ORDER_STATE_CONFLICT');
    }

    const event = await tx.orderEvent.create({
      data: {
        orderId,
        fromStatus: from,
        toStatus: to,
        actorUserId: actor.kind === 'USER' ? actor.userId : null,
        actorRole: actor.kind === 'USER' ? actor.roles.join(',') : `SYSTEM:${actor.source}`,
        reason: request.reason?.trim() || null
      }
    });

    await AuditService.record(
      {
        actor: actor.kind === 'USER' ? { userId: actor.userId, roles: actor.roles } : null,
        action: 'ORDER_STATUS_CHANGED',
        entity: 'Order',
        entityId: orderId,
        payload: {
          orderNumber: order.orderNumber,
          from,
          to,
          actorKind: actor.kind,
          source: actor.kind === 'SYSTEM' ? actor.source : undefined,
          reason: request.reason?.trim() || undefined
        },
        context: request.context
      },
      tx
    );

    return { changed: true, order: { ...summary, status: to }, eventId: event.id };
  }

  private static isCustomerActor(actor: Extract<TransitionActor, { kind: 'USER' }>): boolean {
    return actor.roles.includes(RoleEnum.CUSTOMER) && !actor.roles.includes(RoleEnum.SUPER_ADMIN);
  }

  private static assertActorMayPerform(actor: TransitionActor, from: OrderStatus, to: OrderStatus, orderCustomerProfileId: string | null): void {
    const allowed: readonly TransitionParty[] = TRANSITION_PARTIES[transitionKey(from, to)] ?? [];
    let permitted = false;

    if (actor.kind === 'SYSTEM') {
      permitted = allowed.includes('SYSTEM');
    } else {
      for (const party of allowed) {
        if (party === 'SYSTEM') continue;
        if (party === 'CUSTOMER_OWNER') {
          if (actor.roles.includes(RoleEnum.CUSTOMER) && !!actor.customerProfileId && actor.customerProfileId === orderCustomerProfileId) permitted = true;
        } else if (actor.roles.includes(party as RoleEnum)) {
          permitted = true;
        }
      }
    }

    if (!permitted) {
      throw new AppError(`You are not allowed to move an order from ${from} to ${to}`, 403, 'ORDER_TRANSITION_FORBIDDEN');
    }
  }

  private static assertCancellable(paymentStatus: string, actor: TransitionActor, reason?: string | null): void {
    if (!PAID_ORDER_CANCELLATION_SUPPORTED && (PAID_PAYMENT_STATUSES as readonly string[]).includes(paymentStatus)) {
      throw new AppError('A paid order cannot be cancelled until the refund workflow is available', 409, 'ORDER_NOT_CANCELLABLE');
    }
    if (actor.kind === 'USER' && actor.roles.includes(RoleEnum.SUPER_ADMIN) && (!reason || reason.trim().length < 3)) {
      throw new AppError('A reason is required to cancel an order as an administrator', 422, 'REASON_REQUIRED');
    }
  }

  /**
   * Payment gate. An order may only become operational (confirmed, in the kitchen, on the road...) when it is eligible:
   * in P7A that means it has been PAID by a trusted payment path. COD confirmation belongs to P7B, so a COD order
   * stays PENDING here. There is no test-only or role-based bypass.
   */
  private static assertOperationallyEligible(order: { paymentStatus: string; kitchenBranchId: string | null }, to: OrderStatus): void {
    if (order.paymentStatus !== 'PAID') {
      throw new AppError('This order has not been paid, so it cannot move into fulfilment', 409, 'ORDER_NOT_OPERATIONALLY_ELIGIBLE');
    }
    if ((KITCHEN_BRANCH_REQUIRED_FOR as readonly string[]).includes(to) && !order.kitchenBranchId) {
      throw new AppError('This order has no kitchen branch assigned yet', 409, 'ORDER_NOT_OPERATIONALLY_ELIGIBLE');
    }
  }

  /** Branch-scoped staff may only act on orders of their own branches (global roles are unrestricted). */
  private static assertBranchScope(actor: TransitionActor, kitchenBranchId: string | null): void {
    if (actor.kind !== 'USER' || actor.isGlobal) return;
    if (this.isCustomerActor(actor)) return;
    if (!kitchenBranchId || !(actor.branchIds ?? []).includes(kitchenBranchId)) {
      throw new AppError('This order belongs to a branch you are not assigned to', 403, 'BRANCH_FORBIDDEN');
    }
  }

  /** Terminal statuses cannot change; exposed for callers that need to branch on it. */
  public static isTerminal(status: string): boolean {
    return (TERMINAL_ORDER_STATUSES as readonly string[]).includes(status);
  }
}
