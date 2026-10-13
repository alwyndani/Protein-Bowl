import { Prisma, RoleEnum } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditContext, AuditService } from '../audit/audit.service.js';
import { PAID_CANCELLATION_FROM_STATES } from '../refund/cancellationPolicy.js';
import {
  KITCHEN_BRANCH_REQUIRED_FOR,
  MESS_ORDER_EDGES,
  MESS_ORDER_TYPE,
  OPERATIONAL_ORDER_STATUSES,
  ORDER_TRANSITIONS,
  OrderStatus,
  PAID_PAYMENT_STATUSES,
  TERMINAL_ORDER_STATUSES,
  TRANSITION_PARTIES,
  TransitionParty,
  isOrderStatus,
  transitionKey
} from './orderStatus.js';

export type TransitionActor =
  | { kind: 'SYSTEM'; source: 'PAYMENT_VERIFICATION' | 'PAYMENT_EXPIRY' | 'MESS_LATE_PAYMENT' | 'MESS_START_DAY_UNAVAILABLE' }
  /**
   * P9B: the proof-backed DISPATCHED -> DELIVERED move. Constructed ONLY by DeliveryProofService, but the transition never trusts the
   * kind: it independently requires a verified DeliveryProof row (same order, same method, verifiedAt set) inside the caller's transaction.
   */
  | { kind: 'PROOF'; method: 'PIN' | 'ADMIN_OVERRIDE'; proofId: string; userId: string; roles: readonly RoleEnum[] }
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
  /** P7C: id of the Refund intent created in the SAME transaction (required to cancel an order whose money was received). Only the cancellation service passes it. */
  refundIntentId?: string;
  /**
   * P9C: set ONLY by CancellationService.cancelUndeliverableInTx for the DISPATCHED -> CANCELLED undeliverable path. It proves nothing by itself:
   * the transition independently requires a FAILED assignment of that attempt, an archived UNDELIVERABLE_CANCELLED DeliveryAttempt row and a REQUESTED refund.
   */
  deliveryUndeliverable?: { attemptNumber: number };
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
    if (request.actor.kind === 'PROOF' && !tx) {
      throw new AppError('A proof-backed transition must run inside the proof transaction', 409, 'INVALID_ORDER_TRANSITION');
    }
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
    if (order.orderType === MESS_ORDER_TYPE) {
      // P10A: a Mess purchase may only be confirmed by verified payment or cancelled; nothing kitchen/delivery related ever applies.
      if (!MESS_ORDER_EDGES.includes(transitionKey(from, to))) {
        throw new AppError('This order type does not support this transition', 409, 'INVALID_ORDER_TRANSITION');
      }
    } else if (order.orderType !== 'DIRECT') {
      // POS/aggregator orders have their own lifecycles (later phases); never drive them through the direct-order policy.
      throw new AppError('This order type does not support this transition yet', 409, 'INVALID_ORDER_TRANSITION');
    }

    if (actor.kind === 'SYSTEM' && (actor.source === 'MESS_LATE_PAYMENT' || actor.source === 'MESS_START_DAY_UNAVAILABLE')) {
      // P10A/P10B: the ONLY system cancellations of a CONFIRMED order: a Kerala Mess purchase paid after its start date (MESS_LATE_PAYMENT) or paid when a first-day meal could no
      // longer be prepared (MESS_START_DAY_UNAVAILABLE), always together with its full refund intent (verified below). Never a DIRECT order.
      if (order.orderType !== MESS_ORDER_TYPE || from !== 'CONFIRMED' || to !== 'CANCELLED' || !request.refundIntentId) {
        throw new AppError('This system cancellation is not allowed', 403, 'ORDER_TRANSITION_FORBIDDEN');
      }
    } else {
      this.assertActorMayPerform(actor, from, to, order.customerProfileId);
    }

    if (to === 'DELIVERED') {
      // Defence in depth: even a correctly-typed PROOF actor needs real, verified evidence for THIS order, and the order must still be ONLINE.
      if (actor.kind !== 'PROOF' || order.paymentMethod !== 'ONLINE') {
        throw new AppError('This order cannot be marked delivered', 409, 'ORDER_NOT_OPERATIONALLY_ELIGIBLE');
      }
      const evidence = await tx.deliveryProof.count({ where: { id: actor.proofId, orderId, verifiedAt: { not: null }, method: actor.method } });
      if (evidence !== 1) throw new AppError('Delivery has not been verified', 403, 'ORDER_TRANSITION_FORBIDDEN');
    }

    if (to === 'CANCELLED') {
      await this.assertCancellable(tx, { id: order.id, paymentStatus: order.paymentStatus, paymentMethod: order.paymentMethod }, from, actor, request);
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
        actorUserId: actor.kind === 'SYSTEM' ? null : actor.userId,
        actorRole: actor.kind === 'SYSTEM' ? `SYSTEM:${actor.source}` : actor.roles.join(','),
        reason: request.reason?.trim() || null
      }
    });

    await AuditService.record(
      {
        actor: actor.kind === 'SYSTEM' ? null : { userId: actor.userId, roles: actor.roles },
        action: 'ORDER_STATUS_CHANGED',
        entity: 'Order',
        entityId: orderId,
        payload: {
          orderNumber: order.orderNumber,
          from,
          to,
          actorKind: actor.kind,
          source: actor.kind === 'SYSTEM' ? actor.source : undefined,
          method: actor.kind === 'PROOF' ? actor.method : undefined,
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
    } else if (actor.kind === 'PROOF') {
      permitted = allowed.includes('DELIVERY_PROOF');
    } else {
      for (const party of allowed) {
        if (party === 'SYSTEM' || party === 'DELIVERY_PROOF') continue;
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

  private static async assertCancellable(tx: Tx, order: { id: string; paymentStatus: string; paymentMethod: string | null }, from: OrderStatus, actor: TransitionActor, request: TransitionRequest): Promise<void> {
    if (from === 'DISPATCHED') {
      // P9C: the ONLY way out of DISPATCHED other than DELIVERED. Everything is re-verified here, under the order lock and in the caller's transaction.
      const undeliverable = request.deliveryUndeliverable;
      const adminActor = actor.kind === 'USER' && actor.roles.includes(RoleEnum.SUPER_ADMIN) && actor.isGlobal === true;
      const ok =
        !!undeliverable &&
        adminActor &&
        order.paymentMethod === 'ONLINE' &&
        order.paymentStatus === 'PAID' &&
        !!request.refundIntentId &&
        (await tx.refund.count({ where: { id: request.refundIntentId, orderId: order.id, status: 'REQUESTED' } })) === 1 &&
        (await tx.deliveryAssignment.count({ where: { orderId: order.id, status: 'FAILED', attemptNumber: undeliverable.attemptNumber } })) === 1 &&
        (await tx.deliveryAttempt.count({ where: { orderId: order.id, attemptNumber: undeliverable.attemptNumber, outcome: 'UNDELIVERABLE_CANCELLED' } })) === 1;
      if (!ok) throw new AppError('An order that is out for delivery cannot be cancelled', 409, 'ORDER_NOT_CANCELLABLE');
    } else if (request.deliveryUndeliverable) {
      throw new AppError('Invalid cancellation request', 409, 'ORDER_NOT_CANCELLABLE');
    }
    if (from !== 'DISPATCHED' && (PAID_PAYMENT_STATUSES as readonly string[]).includes(order.paymentStatus)) {
      const intentOk =
        !!request.refundIntentId &&
        (PAID_CANCELLATION_FROM_STATES as readonly string[]).includes(from) &&
        (await tx.refund.count({ where: { id: request.refundIntentId, orderId: order.id, status: 'REQUESTED' } })) === 1;
      if (!intentOk) {
        throw new AppError('A paid order can only be cancelled together with its refund', 409, 'ORDER_NOT_CANCELLABLE');
      }
    }
    if (actor.kind === 'USER' && actor.roles.includes(RoleEnum.SUPER_ADMIN) && (!request.reason || request.reason.trim().length < 3)) {
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
