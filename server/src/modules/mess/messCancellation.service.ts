import { RoleEnum } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditContext } from '../audit/audit.service.js';
import { CancellationService } from '../refund/cancellation.service.js';
import { RefundViewService } from '../refund/refundView.service.js';
import { FULFILLED_MEAL_STATUSES, MessTx, SUBSCRIPTION_STATUS, adminCancelSchema, businessDate, customerCancelSchema, dateToString, lockRow } from './messPolicy.js';

/**
 * P10B extension point: the number of meals already FULFILLED for a subscription. P10A generates no meals, so it is always 0, but the
 * cancellation rule "no fulfilled meal" is already evaluated here (under the subscription lock) so P10B only has to make this real.
 */
export async function fulfilledMealCount(tx: MessTx, subscriptionId: string): Promise<number> {
  return await tx.messMeal.count({ where: { messSubscriptionId: subscriptionId, status: { in: [...FULFILLED_MEAL_STATUSES] } } });
}

type Row = { status: string; startDate: Date };
type UserActor = Parameters<typeof CancellationService.cancelMessPurchase>[1]['actor'];

/**
 * Kerala Mess cancellation (P10A). FULL refunds only, through the P7C refund stack; no partial refund, proration, fee or wallet credit.
 *   - PENDING_PAYMENT: cancelled with no refund (open checkout sessions expire).
 *   - ACTIVE and NOT started (startDate after the business date) with no fulfilled meal: cancelled + the full payment refunded.
 *   - ACTIVE and started: refused for the customer. SUPER_ADMIN (step-up + reason) may cancel a started subscription ONLY while no meal has been fulfilled (full refund).
 */
export class MessCancellationService {
  /** Presentation hint only; the authoritative decision is re-made under the locks in `cancel`. */
  public static isCancellableNow(sub: Row & { purchaseOrder?: { status: string } | null }, today: string, admin: boolean): boolean {
    if (sub.purchaseOrder && sub.purchaseOrder.status === 'CANCELLED') return false;
    if (sub.status === SUBSCRIPTION_STATUS.PENDING_PAYMENT) return true;
    if (sub.status === SUBSCRIPTION_STATUS.ACTIVE) return admin || dateToString(sub.startDate) > today;
    return false;
  }

  public static async customerCancel(userId: string, subscriptionId: string, body: z.infer<typeof customerCancelSchema>, context?: AuditContext) {
    const profile = await prisma.customerProfile.findUnique({ where: { userId }, select: { id: true } });
    const owned = profile ? await prisma.messSubscription.findFirst({ where: { id: subscriptionId, messAccount: { customerProfileId: profile.id } }, select: { id: true, purchaseOrderId: true } }) : null;
    if (!profile || !owned || !owned.purchaseOrderId) throw new AppError('Subscription not found', 404, 'NOT_FOUND');
    return await this.cancel(owned.id, owned.purchaseOrderId, { actor: { kind: 'USER', userId, roles: [RoleEnum.CUSTOMER], customerProfileId: profile.id }, byCustomer: true, reasonCode: body.reasonCode, note: body.note ?? null }, context);
  }

  public static async adminCancel(admin: { userId: string; roles: readonly RoleEnum[] }, subscriptionId: string, body: z.infer<typeof adminCancelSchema>, context?: AuditContext) {
    const sub = await prisma.messSubscription.findUnique({ where: { id: subscriptionId }, select: { id: true, purchaseOrderId: true } });
    if (!sub || !sub.purchaseOrderId) throw new AppError('Subscription not found', 404, 'NOT_FOUND');
    return await this.cancel(sub.id, sub.purchaseOrderId, { actor: { kind: 'USER', userId: admin.userId, roles: admin.roles, isGlobal: true }, byCustomer: false, reasonCode: body.reasonCode, note: body.note ?? null }, context);
  }

  private static async cancel(subscriptionId: string, orderId: string, cmd: { actor: UserActor; byCustomer: boolean; reasonCode: string; note: string | null }, context?: AuditContext) {
    const result = await CancellationService.cancelMessPurchase(
      orderId,
      { ...cmd, context },
      {
        // runs under the Order lock and the (paid) ProviderPayment / checkout-session locks, THEN takes the subscription lock (global lock order)
        verify: async (tx) => {
          await lockRow.subscription(tx, subscriptionId);
          const sub = await tx.messSubscription.findUniqueOrThrow({ where: { id: subscriptionId }, select: { status: true, startDate: true } });
          if (sub.status === SUBSCRIPTION_STATUS.CANCELLED) return 'ALREADY_CANCELLED' as const;
          if (sub.status === SUBSCRIPTION_STATUS.PENDING_PAYMENT) return 'OK' as const;
          if (sub.status !== SUBSCRIPTION_STATUS.ACTIVE) throw new AppError('This subscription can no longer be cancelled', 409, 'MESS_CANCELLATION_NOT_ALLOWED');
          // P10B: lock every meal of this subscription (lock order subscription -> meals), so a kitchen batch attachment cannot slip in between the check and the cancellation
          await tx.$queryRaw`SELECT "id" FROM "mess_daily_orders" WHERE "messSubscriptionId" = ${subscriptionId} ORDER BY "id" FOR UPDATE`;
          if ((await tx.messMeal.count({ where: { messSubscriptionId: subscriptionId, batchId: { not: null } } })) > 0) throw new AppError('The kitchen has already started preparing meals for this subscription, so it can no longer be cancelled', 409, 'MESS_CANCELLATION_NOT_ALLOWED');
          if ((await fulfilledMealCount(tx, subscriptionId)) > 0) throw new AppError('Meals have already been served, so this subscription can no longer be cancelled', 409, 'MESS_CANCELLATION_NOT_ALLOWED');
          if (cmd.byCustomer && dateToString(sub.startDate) <= businessDate()) throw new AppError('This subscription has already started and can no longer be cancelled', 409, 'MESS_SUBSCRIPTION_STARTED');
          return 'OK' as const;
        },
        finish: async (tx) => {
          await tx.messMeal.updateMany({ where: { messSubscriptionId: subscriptionId, status: { in: ['SCHEDULED', 'PAUSED'] }, batchId: null }, data: { status: 'CANCELLED' } });
          await tx.messSubscription.updateMany({
            where: { id: subscriptionId, status: { in: [SUBSCRIPTION_STATUS.PENDING_PAYMENT, SUBSCRIPTION_STATUS.ACTIVE] } },
            data: { status: SUBSCRIPTION_STATUS.CANCELLED, cancelledAt: new Date(), cancellationReasonCode: cmd.reasonCode }
          });
        }
      }
    );
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { id: true, status: true, orderType: true, paymentStatus: true, paymentMethod: true, netAmount: true } });
    const derived = (await RefundViewService.deriveForOrders([order])).get(orderId);
    return { subscriptionId, status: 'CANCELLED' as const, alreadyCancelled: !result.changed, refund: derived?.refund ?? { state: 'NO_REFUND' }, payment: derived?.payment ?? null };
  }
}
