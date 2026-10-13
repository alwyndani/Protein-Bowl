import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditContext, AuditService } from '../audit/audit.service.js';
import { lockOrder } from '../payment/paymentOps.js';
import {
  MAX_CALENDAR_WINDOW_DAYS,
  MEAL_STATUS,
  MessTx,
  SUBSCRIPTION_STATUS,
  addDays,
  businessDate,
  dateFromString,
  dateToString,
  lockRow,
  slotTimesProblem
} from './messPolicy.js';

/** The service INSTANT of a meal: its business date + the snapshotted HH:mm, in Asia/Kolkata (a fixed +05:30 offset, India has no daylight saving). */
export function serviceInstant(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm}:00+05:30`);
}

/** Last instant at which a pause/resume is still allowed is EXCLUSIVE: now must be strictly before serviceAt - cutoff. */
export function pauseDeadline(serviceAt: Date, pauseCutoffHours: number): Date {
  return new Date(serviceAt.getTime() - pauseCutoffHours * 3_600_000);
}

/** The pause/resume window: STRICTLY before serviceAt minus the snapshotted cutoff. At the boundary instant itself it is already closed. */
export function withinPauseWindow(nowMs: number, serviceAt: Date, pauseCutoffHours: number): boolean {
  return nowMs < pauseDeadline(serviceAt, pauseCutoffHours).getTime();
}

export type MealUnavailableReason = 'SUBSCRIPTION_NOT_ACTIVE' | 'MEAL_FROZEN' | 'PAUSE_CUTOFF_PASSED' | 'PAUSE_LIMIT_REACHED' | 'NOT_SCHEDULED' | 'NOT_PAUSED' | 'MEAL_CANCELLED';

const MEAL_AUDIT = { PAUSED: 'MESS_MEAL_PAUSED', RESUMED: 'MESS_MEAL_RESUMED', GENERATED: 'MESS_MEALS_GENERATED', BACKFILLED: 'MESS_SLOT_TIMES_BACKFILLED' };

export type FirstDayProblem = { slot: string; reason: 'SERVICE_TIME_PASSED' | 'BATCH_STARTED' };

export class MessMealService {
  // ================================================================================================ same-day first-day availability
  /**
   * P10B same-day rule. For a subscription whose first entitlement date is TODAY (Asia/Kolkata), EVERY purchased slot of that date must still be operationally
   * possible: its snapshotted service instant is strictly in the future (at exactly serviceAt it is already unavailable) AND no batch exists yet for its
   * branch/date/slot. Returns the first offending slot, or null. Future start dates are never affected (null). Nothing is ever omitted, shifted or replaced.
   * With `lockTx` the (branch, date, slot) batch keys are locked first (slot order, held to commit) and the checks then run inside that transaction, so batch start
   * and activation cannot both win; without it this is the non-authoritative pre-payment check.
   */
  public static async firstDayProblem(db: Prisma.TransactionClient | typeof prisma, s: { startDate: string; branchId: string | null; mealSlots: readonly string[]; slotTimes: unknown }, lockTx?: MessTx): Promise<FirstDayProblem | null> {
    if (s.startDate !== businessDate()) return null;
    if (!s.branchId || slotTimesProblem(s.slotTimes, s.mealSlots) !== null) return null; // a P10A-era subscription has no service times: it cannot be judged (and generates no meals)
    const times = s.slotTimes as Record<string, string>;
    const slots = [...s.mealSlots].sort();
    if (lockTx) for (const slot of slots) await lockRow.batchKey(lockTx, s.branchId, s.startDate, slot);
    const nowMs = Date.now(); // read AFTER any lock wait
    for (const slot of slots) {
      if (serviceInstant(s.startDate, times[slot]).getTime() <= nowMs) return { slot, reason: 'SERVICE_TIME_PASSED' };
    }
    const batch = await db.messMealBatch.findFirst({ where: { branchId: s.branchId, mealDate: dateFromString(s.startDate), slot: { in: slots } }, select: { slot: true }, orderBy: { slot: 'asc' } });
    if (batch) return { slot: batch.slot, reason: 'BATCH_STARTED' };
    return null;
  }

  // ================================================================================================ generation
  /**
   * Generates the COMPLETE meal entitlement of one subscription (every date startDate..endDate inclusive x every snapshotted slot).
   * Idempotent (unique subscription+date+slot, createMany skipDuplicates) and atomic with the caller's transaction: a count that does not
   * equal `totalMealsAllowed` throws, rolling the whole transaction back. `mealsGeneratedAt` is set only once the full set exists.
   */
  public static async generateInTx(tx: MessTx, subscriptionId: string, context?: AuditContext): Promise<{ created: number; total: number }> {
    await lockRow.subscription(tx, subscriptionId);
    const sub = await tx.messSubscription.findUniqueOrThrow({
      where: { id: subscriptionId },
      select: { id: true, status: true, startDate: true, endDate: true, mealSlots: true, slotTimes: true, branchId: true, servicePointId: true, totalMealsAllowed: true, mealsGeneratedAt: true }
    });
    if (sub.status !== SUBSCRIPTION_STATUS.ACTIVE) throw new AppError('Meals are generated only for an ACTIVE subscription', 409, 'MESS_NOT_ACTIVE');
    if (!sub.branchId || !sub.servicePointId) throw new AppError('The subscription has no branch / service point snapshot', 409, 'MESS_SNAPSHOT_MISSING');
    const problem = slotTimesProblem(sub.slotTimes, sub.mealSlots);
    if (problem) throw new AppError(`Meal service times are not configured: ${problem}`, 409, 'MESS_SLOT_TIMES_MISSING');
    const times = sub.slotTimes as Record<string, string>;

    const start = dateToString(sub.startDate);
    const end = dateToString(sub.endDate);
    const rows: Prisma.MessMealCreateManyInput[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) {
      for (const slot of sub.mealSlots) {
        rows.push({ messSubscriptionId: sub.id, mealDate: dateFromString(d), slot, status: MEAL_STATUS.SCHEDULED, branchId: sub.branchId, servicePointId: sub.servicePointId, serviceAt: serviceInstant(d, times[slot]) });
      }
    }
    if (rows.length !== sub.totalMealsAllowed) throw new AppError('The generated meal count does not match the purchased entitlement', 409, 'MESS_MEAL_COUNT_MISMATCH');

    const created = await tx.messMeal.createMany({ data: rows, skipDuplicates: true });
    const total = await tx.messMeal.count({ where: { messSubscriptionId: sub.id } });
    if (total !== sub.totalMealsAllowed) throw new AppError('The meal entitlement is incomplete after generation', 409, 'MESS_MEAL_COUNT_MISMATCH');
    if (!sub.mealsGeneratedAt) await tx.messSubscription.updateMany({ where: { id: sub.id, mealsGeneratedAt: null }, data: { mealsGeneratedAt: new Date() } });
    if (created.count > 0) {
      await AuditService.record({ actor: null, action: MEAL_AUDIT.GENERATED, entity: 'MessSubscription', entityId: sub.id, payload: { created: created.count, total }, context }, tx);
    }
    return { created: created.count, total };
  }

  /**
   * P10A-era subscription backfill (CLI only, never an HTTP endpoint). A subscription activated BEFORE P10B has no slot-time snapshot and no meals:
   * the plan's CURRENT valid slot times are copied into the subscription ONCE (never overwritten), then the full set is generated. Never touches money.
   */
  public static async backfillSubscription(subscriptionId: string, context?: AuditContext): Promise<{ changed: boolean; created: number; copiedSlotTimes: boolean }> {
    return await prisma.$transaction(
      async (tx) => {
        const peek = await tx.messSubscription.findUnique({ where: { id: subscriptionId }, select: { purchaseOrderId: true } });
        if (!peek || !peek.purchaseOrderId) throw new AppError('Subscription not found', 404, 'NOT_FOUND');
        await lockOrder(tx, peek.purchaseOrderId);
        await lockRow.subscription(tx, subscriptionId);
        const sub = await tx.messSubscription.findUniqueOrThrow({ where: { id: subscriptionId }, select: { id: true, status: true, mealSlots: true, slotTimes: true, mealsGeneratedAt: true, plan: { select: { slotTimes: true } } } });
        if (sub.status !== SUBSCRIPTION_STATUS.ACTIVE) throw new AppError('Only an ACTIVE subscription can be backfilled', 409, 'MESS_NOT_ACTIVE');
        if (sub.mealsGeneratedAt) return { changed: false, created: 0, copiedSlotTimes: false };
        let copied = false;
        if (sub.slotTimes === null) {
          const problem = slotTimesProblem(sub.plan.slotTimes, sub.mealSlots);
          if (problem) throw new AppError(`The plan has no valid service times yet: ${problem}`, 409, 'MESS_SLOT_TIMES_MISSING');
          const cas = await tx.messSubscription.updateMany({ where: { id: sub.id, slotTimes: { equals: Prisma.DbNull } }, data: { slotTimes: sub.plan.slotTimes as Prisma.InputJsonValue } });
          copied = cas.count === 1;
          if (copied) await AuditService.record({ actor: null, action: MEAL_AUDIT.BACKFILLED, entity: 'MessSubscription', entityId: sub.id, payload: { source: 'PLAN_CURRENT' }, context }, tx);
        }
        const r = await this.generateInTx(tx, sub.id, context);
        return { changed: r.created > 0 || copied, created: r.created, copiedSlotTimes: copied };
      },
      { maxWait: 10000, timeout: 60000 }
    );
  }

  /** Subscriptions that are ACTIVE with no complete meal set (only P10A-era ones, or an anomaly to look at). */
  public static async listBackfillCandidates(): Promise<string[]> {
    const rows = await prisma.messSubscription.findMany({ where: { status: SUBSCRIPTION_STATUS.ACTIVE, mealsGeneratedAt: null }, select: { id: true }, orderBy: { createdAt: 'asc' } });
    return rows.map((r) => r.id);
  }

  // ================================================================================================ calendar (customer)
  public static async calendar(userId: string, subscriptionId: string, query: { from?: string; to?: string }) {
    const profile = await prisma.customerProfile.findUnique({ where: { userId }, select: { id: true } });
    const sub = profile
      ? await prisma.messSubscription.findFirst({
          where: { id: subscriptionId, messAccount: { customerProfileId: profile.id } },
          select: { id: true, status: true, startDate: true, endDate: true, pauseCutoffHours: true, maxPauses: true, totalPausesUsed: true, mealsGeneratedAt: true }
        })
      : null;
    if (!sub) throw new AppError('Subscription not found', 404, 'NOT_FOUND');

    const today = businessDate();
    const start = dateToString(sub.startDate);
    const end = dateToString(sub.endDate);
    const from = query.from && query.from > start ? query.from : start > today ? start : today > end ? start : today;
    let to = query.to && query.to < end ? query.to : end;
    const maxTo = addDays(from, MAX_CALENDAR_WINDOW_DAYS - 1);
    if (!query.to && to > addDays(from, 30)) to = addDays(from, 30);
    if (to > maxTo) to = maxTo;
    if (from > to) return { subscription: this.calendarHeader(sub), meals: [] as unknown[] };

    const meals = await prisma.messMeal.findMany({
      where: { messSubscriptionId: sub.id, mealDate: { gte: dateFromString(from), lte: dateFromString(to) } },
      orderBy: [{ mealDate: 'asc' }, { serviceAt: 'asc' }],
      select: { id: true, mealDate: true, slot: true, status: true, serviceAt: true, batch: { select: { status: true } }, deliveryStop: { select: { run: { select: { status: true } } } } }
    });
    const now = Date.now();
    return {
      subscription: this.calendarHeader(sub),
      window: { from, to },
      meals: meals.map((m) => {
        const frozen = m.batch !== null;
        const afterCutoff = sub.pauseCutoffHours === null ? true : !withinPauseWindow(now, m.serviceAt, sub.pauseCutoffHours);
        const active = sub.status === SUBSCRIPTION_STATUS.ACTIVE;
        const limit = sub.maxPauses !== null && sub.totalPausesUsed >= sub.maxPauses;
        let canPause = false;
        let canResume = false;
        let reason: MealUnavailableReason | null = null;
        if (m.status === MEAL_STATUS.FULFILLED || m.status === MEAL_STATUS.NOT_DELIVERED) reason = 'NOT_SCHEDULED'; // P10C terminal operational states
        else if (!active) reason = 'SUBSCRIPTION_NOT_ACTIVE';
        else if (m.status === MEAL_STATUS.CANCELLED) reason = 'MEAL_CANCELLED';
        else if (frozen) reason = 'MEAL_FROZEN';
        else if (afterCutoff) reason = 'PAUSE_CUTOFF_PASSED';
        else if (m.status === MEAL_STATUS.SCHEDULED) {
          if (limit) reason = 'PAUSE_LIMIT_REACHED';
          else canPause = true;
        } else if (m.status === MEAL_STATUS.PAUSED) canResume = true;
        else reason = 'NOT_SCHEDULED';
        return {
          id: m.id,
          date: dateToString(m.mealDate),
          slot: m.slot,
          serviceAt: m.serviceAt.toISOString(),
          status: m.status,
          // P10C: derived, safe progression. READY is NOT fulfilment and OUT_FOR_DELIVERY is NOT fulfilment: only status FULFILLED means the stop handover was verified.
          kitchenState: m.batch ? (m.deliveryStop?.run.status === 'IN_TRANSIT' ? 'OUT_FOR_DELIVERY' : m.batch.status === 'READY' ? 'READY' : 'IN_PREPARATION') : 'NOT_STARTED',
          canPause,
          canResume,
          reason: canPause || canResume ? null : reason,
          forfeitIfPaused: true
        };
      })
    };
  }

  private static calendarHeader(sub: { status: string; maxPauses: number | null; totalPausesUsed: number; pauseCutoffHours: number | null; mealsGeneratedAt: Date | null }) {
    return { status: sub.status, pausesUsed: sub.totalPausesUsed, maxPauses: sub.maxPauses, pauseCutoffHours: sub.pauseCutoffHours, mealsReady: sub.mealsGeneratedAt !== null };
  }

  // ================================================================================================ pause / resume
  public static async pause(userId: string, subscriptionId: string, mealId: string, context?: AuditContext) {
    return await this.change(userId, subscriptionId, mealId, 'PAUSE', context);
  }
  public static async resume(userId: string, subscriptionId: string, mealId: string, context?: AuditContext) {
    return await this.change(userId, subscriptionId, mealId, 'RESUME', context);
  }

  /**
   * Lock order: subscription -> meal. A paused meal is FORFEITED: nothing here touches money, the term or the entitlement. Every SUCCESSFUL pause consumes one
   * lifetime allowance (a resume never gives it back) and both actions append immutable evidence.
   */
  private static async change(userId: string, subscriptionId: string, mealId: string, action: 'PAUSE' | 'RESUME', context?: AuditContext) {
    const profile = await prisma.customerProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new AppError('Subscription not found', 404, 'NOT_FOUND');
    return await prisma.$transaction(
      async (tx) => {
        const owned = await tx.messSubscription.findFirst({ where: { id: subscriptionId, messAccount: { customerProfileId: profile.id } }, select: { id: true } });
        const meal0 = owned ? await tx.messMeal.findFirst({ where: { id: mealId, messSubscriptionId: subscriptionId }, select: { id: true } }) : null;
        if (!owned || !meal0) throw new AppError('Meal not found', 404, 'NOT_FOUND');
        await lockRow.subscription(tx, subscriptionId);
        await tx.$queryRaw`SELECT "id" FROM "mess_daily_orders" WHERE "id" = ${mealId} FOR UPDATE`;
        const sub = await tx.messSubscription.findUniqueOrThrow({ where: { id: subscriptionId }, select: { status: true, pauseCutoffHours: true, maxPauses: true, totalPausesUsed: true } });
        const meal = await tx.messMeal.findUniqueOrThrow({ where: { id: mealId }, select: { status: true, batchId: true, serviceAt: true } });
        if (sub.status !== SUBSCRIPTION_STATUS.ACTIVE) throw new AppError('This subscription is not active', 409, 'SUBSCRIPTION_NOT_ACTIVE');

        const target = action === 'PAUSE' ? MEAL_STATUS.PAUSED : MEAL_STATUS.SCHEDULED;
        const source = action === 'PAUSE' ? MEAL_STATUS.SCHEDULED : MEAL_STATUS.PAUSED;
        if (meal.status === target) {
          // idempotent replay: a repeated pause is a no-op; a repeated resume only when this meal really was paused and resumed before
          if (action === 'PAUSE' || (await tx.messMealEvent.count({ where: { mealId, action: 'RESUME' } })) > 0) return { changed: false, mealId, status: meal.status, pausesUsed: sub.totalPausesUsed, maxPauses: sub.maxPauses };
        }
        if (meal.status === MEAL_STATUS.CANCELLED) throw new AppError('This meal was cancelled', 409, 'MEAL_CANCELLED');
        if (meal.batchId) throw new AppError('The kitchen has already started preparing this meal', 409, 'MEAL_FROZEN');
        if (meal.status !== source) throw new AppError(action === 'PAUSE' ? 'Only a scheduled meal can be paused' : 'Only a paused meal can be resumed', 409, action === 'PAUSE' ? 'MEAL_NOT_SCHEDULED' : 'MEAL_NOT_PAUSED');
        if (sub.pauseCutoffHours === null || !withinPauseWindow(Date.now(), meal.serviceAt, sub.pauseCutoffHours)) throw new AppError('The cut-off for this meal has passed', 409, 'PAUSE_CUTOFF_PASSED');

        let used = sub.totalPausesUsed;
        if (action === 'PAUSE') {
          if (sub.maxPauses === null) throw new AppError('Pausing is not available for this subscription', 409, 'PAUSE_LIMIT_REACHED');
          // lifetime allowance: incremented exactly once per successful pause, compare-and-set against the snapshotted maximum
          const inc = await tx.$executeRaw`UPDATE "mess_subscriptions" SET "totalPausesUsed" = "totalPausesUsed" + 1 WHERE "id" = ${subscriptionId} AND "totalPausesUsed" < ${sub.maxPauses}`;
          if (inc !== 1) throw new AppError('You have used all the pauses in this subscription', 409, 'PAUSE_LIMIT_REACHED');
          used += 1;
        }
        const moved = await tx.messMeal.updateMany({
          where: { id: mealId, status: source, batchId: null },
          data: { status: target, pausedAt: action === 'PAUSE' ? new Date() : null }
        });
        if (moved.count !== 1) throw new AppError('The meal was changed by another request. Please retry.', 409, 'MEAL_CHANGED');
        await tx.messMealEvent.create({ data: { messSubscriptionId: subscriptionId, mealId, action, actorUserId: userId, pausesUsedAfter: used } });
        await AuditService.record(
          { actor: { userId, roles: ['CUSTOMER'] }, action: action === 'PAUSE' ? MEAL_AUDIT.PAUSED : MEAL_AUDIT.RESUMED, entity: 'MessMeal', entityId: mealId, payload: { subscriptionId, pausesUsed: used }, context },
          tx
        );
        return { changed: true, mealId, status: target as string, pausesUsed: used, maxPauses: sub.maxPauses };
      },
      { maxWait: 10000, timeout: 20000 }
    );
  }
}
