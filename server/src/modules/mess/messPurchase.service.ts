import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditContext, AuditService } from '../audit/audit.service.js';
import { lockCustomerCheckout } from '../commerce/checkoutLock.js';
import { MESS_ORDER_TYPE } from '../order/orderStatus.js';
import { nextOrderNumber } from '../order/orderNumber.js';
import { RefundViewService } from '../refund/refundView.service.js';
import { toAdminSubscriptionDto, toCustomerSubscriptionDto, toPublicPlanDto } from './messDto.js';
import { MessMealService } from './messMeal.service.js';
import { MessPricingService } from './messPricing.service.js';
import {
  MAX_START_AHEAD_DAYS,
  MESS_APPROVAL_STATUS,
  MESS_PURCHASE_POLICY_ID,
  OPEN_SUBSCRIPTION_STATUSES,
  PLAN_STATUS,
  SERVICE_POINT_STATUS,
  SUBSCRIPTION_STATUS,
  addDays,
  businessDate,
  computePurchaseFingerprint,
  dateFromString,
  dateToString,
  isUniqueViolation,
  lockRow,
  planWithinWindow,
  slotTimesProblem,
  purchaseBodySchema,
  termEnd
} from './messPolicy.js';
import { MessCancellationService } from './messCancellation.service.js';

const MAX_ORDER_NUMBER_ATTEMPTS = 5;

const SUB_INCLUDE = {
  plan: { select: { code: true, name: true, durationDays: true, mealsPerDay: true } },
  servicePoint: { select: { id: true, name: true, gateLabel: true, city: true } },
  purchaseOrder: { select: { id: true, orderNumber: true, netAmount: true, totalAmount: true, taxAmount: true, paymentStatus: true, status: true, orderType: true, paymentMethod: true } }
} as const;

type SubWithRelations = Prisma.MessSubscriptionGetPayload<{ include: typeof SUB_INCLUDE }>;

/** Kerala Mess purchase (P10A): ONE serialized transaction creates the subscription (PENDING_PAYMENT) and its payment Order. */
export class MessPurchaseService {
  // ================================================================================================ plans visible to customers
  public static async listSellablePlans(servicePointId?: string) {
    const today = businessDate();
    let branchId: string | null | undefined;
    if (servicePointId) {
      const sp = await prisma.messServicePoint.findFirst({ where: { id: servicePointId, status: SERVICE_POINT_STATUS.ACTIVE }, select: { branchId: true } });
      if (!sp) return [];
      branchId = sp.branchId;
    }
    const plans = await prisma.messSubscriptionPlan.findMany({
      where: { status: PLAN_STATUS.ACTIVE, ...(branchId ? { OR: [{ branchId: null }, { branchId }] } : {}) },
      orderBy: { createdAt: 'asc' }
    });
    // a plan without valid service times cannot produce meals: it is not sold (P10B)
    return plans.filter((p) => planWithinWindow(p, today) && slotTimesProblem(p.slotTimes, p.mealSlots) === null).map((p) => toPublicPlanDto(p));
  }

  // ================================================================================================ purchase
  public static async purchase(userId: string, idempotencyKey: string, body: z.infer<typeof purchaseBodySchema>, context?: AuditContext) {
    const profile = await prisma.customerProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new AppError('Customer profile not found', 404, 'NOT_FOUND');
    const fingerprint = computePurchaseFingerprint({ customerProfileId: profile.id, planId: body.planId, startDate: body.startDate });

    for (let attempt = 0; attempt < MAX_ORDER_NUMBER_ATTEMPTS; attempt++) {
      try {
        const out = await prisma.$transaction(async (tx) => {
          // Serializes this customer's account edits and purchases (a waiting duplicate sees the committed outcome).
          await lockCustomerCheckout(tx, profile.id);

          const replay = await tx.order.findFirst({ where: { customerProfileId: profile.id, idempotencyKey }, select: { id: true, orderType: true, requestFingerprint: true, messSubscription: { select: { id: true } } } });
          if (replay) {
            if (replay.orderType !== MESS_ORDER_TYPE || replay.requestFingerprint !== fingerprint || !replay.messSubscription) {
              throw new AppError('This idempotency key was already used for a different request', 409, 'IDEMPOTENCY_KEY_REUSED');
            }
            return { subscriptionId: replay.messSubscription.id, replay: true };
          }

          const account = await tx.messAccount.findUnique({ where: { customerProfileId: profile.id } });
          if (!account) throw new AppError('Register your hostel details first', 409, 'MESS_ACCOUNT_REQUIRED');
          if (account.approvalStatus !== MESS_APPROVAL_STATUS.APPROVED || !account.servicePointId) throw new AppError('Your Kerala Mess account has not been approved yet', 409, 'MESS_ACCOUNT_NOT_APPROVED');

          await lockRow.servicePointShared(tx, account.servicePointId);
          await lockRow.planShared(tx, body.planId);
          const sp = await tx.messServicePoint.findUnique({ where: { id: account.servicePointId }, include: { branch: { select: { isActive: true } } } });
          if (!sp || sp.status !== SERVICE_POINT_STATUS.ACTIVE || !sp.branch.isActive) throw new AppError('Your service point is not available for new subscriptions', 409, 'SERVICE_POINT_UNAVAILABLE');
          const plan = await tx.messSubscriptionPlan.findUnique({ where: { id: body.planId } });
          if (!plan || plan.status !== PLAN_STATUS.ACTIVE) throw new AppError('This plan is not available', 404, 'PLAN_NOT_AVAILABLE');

          const today = businessDate();
          if (!planWithinWindow(plan, today)) throw new AppError('This plan is not on sale right now', 409, 'PLAN_NOT_AVAILABLE');
          if (plan.branchId && plan.branchId !== sp.branchId) throw new AppError('This plan is not available at your service point', 409, 'PLAN_NOT_AVAILABLE');
          if (plan.taxRate === null || plan.minStartLeadDays === null || plan.pauseCutoffHours === null || plan.maxPauses === null || plan.mealSlots.length === 0) {
            throw new AppError('This plan is not available', 409, 'PLAN_NOT_AVAILABLE'); // an ACTIVE plan is complete (DB CHECK); defence in depth
          }
          if (slotTimesProblem(plan.slotTimes, plan.mealSlots) !== null) throw new AppError('This plan is not available', 409, 'PLAN_NOT_AVAILABLE'); // P10B: no service times => no meals => not sold

          const earliest = addDays(today, plan.minStartLeadDays);
          if (body.startDate < earliest) throw new AppError(`The earliest start date for this plan is ${earliest}`, 422, 'START_DATE_TOO_EARLY');
          if (body.startDate > addDays(today, MAX_START_AHEAD_DAYS)) throw new AppError('The start date is too far in the future', 422, 'START_DATE_TOO_LATE');
          // P10B: a same-day start must still be fully serviceable (every first-day slot in the future, no batch started): refused BEFORE any money is asked for.
          if (await MessMealService.firstDayProblem(tx, { startDate: body.startDate, branchId: sp.branchId, mealSlots: plan.mealSlots, slotTimes: plan.slotTimes })) {
            throw new AppError("Today's meals can no longer be prepared for this plan. Please choose a later start date.", 409, 'MESS_START_DAY_UNAVAILABLE');
          }
          const endDate = termEnd(body.startDate, plan.durationDays);

          const open = await tx.messSubscription.findMany({
            where: { messAccountId: account.id, status: { in: [...OPEN_SUBSCRIPTION_STATUSES] } },
            select: { id: true, status: true, startDate: true, endDate: true }
          });
          const pending = open.find((s) => s.status === SUBSCRIPTION_STATUS.PENDING_PAYMENT);
          if (pending) throw new AppError('You already have an unpaid Kerala Mess purchase. Pay for it or cancel it first.', 409, 'OPEN_PURCHASE_EXISTS');
          const overlapping = open.find((s) => dateToString(s.startDate) <= endDate && dateToString(s.endDate) >= body.startDate);
          if (overlapping) throw new AppError('This term overlaps with one of your existing subscriptions', 409, 'SUBSCRIPTION_OVERLAP');

          const pricing = MessPricingService.calculate({ basePrice: plan.basePrice, taxRate: plan.taxRate });
          const planSnapshot = {
            policy: MESS_PURCHASE_POLICY_ID,
            planId: plan.id,
            planVersion: plan.version,
            code: plan.code,
            name: plan.name,
            durationDays: plan.durationDays,
            mealsPerDay: plan.mealsPerDay,
            mealSlots: plan.mealSlots,
            basePrice: pricing.subtotal,
            minStartLeadDays: plan.minStartLeadDays,
            pauseCutoffHours: plan.pauseCutoffHours,
            maxPauses: plan.maxPauses,
            slotTimes: plan.slotTimes,
            pricing: { subtotal: pricing.subtotal, taxRate: pricing.taxRate, taxAmount: pricing.taxAmount, total: pricing.total },
            servicePointId: sp.id,
            branchId: sp.branchId,
            businessDate: today
          };

          const order = await tx.order.create({
            data: {
              orderNumber: nextOrderNumber(),
              idempotencyKey,
              requestFingerprint: fingerprint,
              pricingSnapshot: planSnapshot as unknown as Prisma.InputJsonValue,
              customerProfileId: profile.id,
              status: 'PENDING',
              orderType: MESS_ORDER_TYPE,
              totalAmount: pricing.subtotal,
              discountAmount: 0,
              taxAmount: pricing.taxAmount,
              deliveryFee: 0,
              packagingFee: 0,
              containerDepositTotal: 0,
              netAmount: pricing.total,
              paymentStatus: 'PENDING',
              paymentMethod: 'ONLINE',
              isGuest: false,
              items: {
                create: [{ productId: null, variantId: null, recipeId: null, itemTitle: plan.name, variantName: plan.mealSlots.join(' + '), sku: plan.code, unitPrice: pricing.subtotal, quantity: 1, taxRate: pricing.taxRate, taxAmount: pricing.taxAmount, containerDeposit: 0, totalPrice: pricing.total }]
              }
            }
          });
          await tx.orderEvent.create({ data: { orderId: order.id, fromStatus: null, toStatus: 'PENDING', actorUserId: userId, actorRole: 'CUSTOMER' } });

          const subscription = await tx.messSubscription.create({
            data: {
              messAccountId: account.id,
              planId: plan.id,
              status: SUBSCRIPTION_STATUS.PENDING_PAYMENT,
              startDate: dateFromString(body.startDate),
              endDate: dateFromString(endDate),
              totalMealsAllowed: plan.durationDays * plan.mealsPerDay,
              mealsRemaining: plan.durationDays * plan.mealsPerDay,
              purchaseOrderId: order.id,
              servicePointId: sp.id,
              branchId: sp.branchId,
              mealSlots: plan.mealSlots,
              pauseCutoffHours: plan.pauseCutoffHours,
              maxPauses: plan.maxPauses,
              slotTimes: plan.slotTimes as Prisma.InputJsonValue,
              planSnapshot: planSnapshot as unknown as Prisma.InputJsonValue
            }
          });
          await AuditService.record(
            {
              actor: { userId, roles: ['CUSTOMER'] },
              action: 'MESS_PURCHASE_CREATED',
              entity: 'MessSubscription',
              entityId: subscription.id,
              payload: { orderNumber: order.orderNumber, planCode: plan.code, startDate: body.startDate, endDate, total: pricing.total, policy: MESS_PURCHASE_POLICY_ID },
              context
            },
            tx
          );
          return { subscriptionId: subscription.id, replay: false };
        }, { maxWait: 10000, timeout: 20000 });

        return { replay: out.replay, subscription: await this.getOwned(userId, out.subscriptionId) };
      } catch (err) {
        if (isUniqueViolation(err)) {
          const t = String(Array.isArray(err.meta?.target) ? (err.meta?.target as string[]).join(',') : (err.meta?.target ?? ''));
          if (t.includes('orderNumber')) continue; // draw a new order number and retry the whole transaction
          if (t.includes('idempotencyKey')) {
            const raced = await prisma.order.findFirst({ where: { customerProfileId: profile.id, idempotencyKey }, select: { requestFingerprint: true, orderType: true, messSubscription: { select: { id: true } } } });
            if (raced && raced.orderType === MESS_ORDER_TYPE && raced.requestFingerprint === fingerprint && raced.messSubscription) return { replay: true, subscription: await this.getOwned(userId, raced.messSubscription.id) };
          }
          if (t.includes('one_pending') || t.includes('messAccountId')) throw new AppError('You already have an unpaid Kerala Mess purchase. Pay for it or cancel it first.', 409, 'OPEN_PURCHASE_EXISTS');
          throw new AppError('The purchase could not be completed because of a conflicting request. Please retry.', 409, 'CONFLICT');
        }
        throw err;
      }
    }
    throw new AppError('We could not allocate an order number. Please retry.', 503, 'ORDER_NUMBER_UNAVAILABLE');
  }

  // ================================================================================================ reads (owner only; anything else is a safe 404)
  public static async listForCustomer(userId: string) {
    const profile = await prisma.customerProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) return [];
    const rows = await prisma.messSubscription.findMany({ where: { messAccount: { customerProfileId: profile.id } }, include: SUB_INCLUDE, orderBy: { createdAt: 'desc' }, take: 50 });
    return await this.presentMany(rows);
  }

  public static async getOwned(userId: string, subscriptionId: string) {
    const profile = await prisma.customerProfile.findUnique({ where: { userId }, select: { id: true } });
    const row = profile ? await prisma.messSubscription.findFirst({ where: { id: subscriptionId, messAccount: { customerProfileId: profile.id } }, include: SUB_INCLUDE }) : null;
    if (!row) throw new AppError('Subscription not found', 404, 'NOT_FOUND');
    return (await this.presentMany([row]))[0];
  }

  private static async presentMany(rows: SubWithRelations[]) {
    const orders = rows.filter((r) => r.purchaseOrder).map((r) => ({ id: r.purchaseOrder!.id, status: r.purchaseOrder!.status, orderType: r.purchaseOrder!.orderType, paymentStatus: r.purchaseOrder!.paymentStatus, paymentMethod: r.purchaseOrder!.paymentMethod, netAmount: r.purchaseOrder!.netAmount }));
    const derived = await RefundViewService.deriveForOrders(orders);
    const today = businessDate();
    return rows.map((r) => toCustomerSubscriptionDto(r, r.purchaseOrder ? derived.get(r.purchaseOrder.id) : undefined, MessCancellationService.isCancellableNow(r, today, false)));
  }

  // ================================================================================================ staff reads (MD included, read-only)
  public static async listForStaff(query: { status?: string; servicePointId?: string; limit: number }) {
    const where = { ...(query.status ? { status: query.status } : {}), ...(query.servicePointId ? { servicePointId: query.servicePointId } : {}) };
    const [rows, total] = await Promise.all([
      prisma.messSubscription.findMany({
        where,
        include: { ...SUB_INCLUDE, branch: { select: { id: true, code: true, name: true } }, messAccount: { select: { roomNumber: true, customerProfile: { select: { fullName: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: query.limit
      }),
      prisma.messSubscription.count({ where })
    ]);
    const orders = rows.filter((r) => r.purchaseOrder).map((r) => ({ id: r.purchaseOrder!.id, status: r.purchaseOrder!.status, orderType: r.purchaseOrder!.orderType, paymentStatus: r.purchaseOrder!.paymentStatus, paymentMethod: r.purchaseOrder!.paymentMethod, netAmount: r.purchaseOrder!.netAmount }));
    const derived = await RefundViewService.deriveForOrders(orders);
    const today = businessDate();
    return { subscriptions: rows.map((r) => toAdminSubscriptionDto(r, r.purchaseOrder ? derived.get(r.purchaseOrder.id) : undefined, MessCancellationService.isCancellableNow(r, today, true))), total };
  }
}
