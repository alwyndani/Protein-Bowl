import { prisma } from '../../config/database.js';
import { AuditContext, AuditService } from '../audit/audit.service.js';
import { MessDeliveryService } from './messDelivery.service.js';
import { withinPauseWindow } from './messMeal.service.js';
import { MEAL_STATUS, STOP_STATUS, SUBSCRIPTION_STATUS, businessDate, dateFromString, lockRow } from './messPolicy.js';

/**
 * Kerala Mess subscription COMPLETION and day-close (P10C). Backend authoritative, idempotent, and independent of any scheduler:
 *   - an event-driven attempt runs (in its OWN transaction, subscription lock only) after every stop handover / override;
 *   - `closeDay` (CLI `npm run mess:close-day`, safe to re-run) closes expired stops, ends expired unreleased meals and re-attempts every completion.
 *
 * COMPLETION INVARIANT: an ACTIVE subscription with its full meal set becomes COMPLETED when EVERY meal is terminal:
 *   FULFILLED | NOT_DELIVERED | CANCELLED (+ legacy CONSUMED | SKIPPED), or PAUSED once the resume window has closed (a paused meal that can still be resumed is not
 *   final, so completing early would silently take the resume right away). SCHEDULED is never terminal, and a meal attached to a PENDING / FAILED stop is SCHEDULED, so an
 *   unresolved delivery stop blocks completion by itself. No financial effect whatsoever.
 */
export class MessCompletionService {
  /** Best-effort completion attempts after a commit; a failure is harmless (the day-close CLI re-attempts and the invariant is derived from the data). */
  public static async attempt(subscriptionIds: string[], context?: AuditContext): Promise<number> {
    let completed = 0;
    for (const id of subscriptionIds) {
      try {
        if (await this.tryComplete(id, context)) completed += 1;
      } catch (err) {
        console.error(JSON.stringify({ area: 'mess', event: 'completion_attempt_failed', subscriptionId: id, message: (err as Error).message }));
      }
    }
    return completed;
  }

  public static async tryComplete(subscriptionId: string, context?: AuditContext): Promise<boolean> {
    return await prisma.$transaction(async (tx) => {
      await lockRow.subscription(tx, subscriptionId);
      const sub = await tx.messSubscription.findUnique({ where: { id: subscriptionId }, select: { status: true, mealsGeneratedAt: true, totalMealsAllowed: true, pauseCutoffHours: true } });
      if (!sub || sub.status !== SUBSCRIPTION_STATUS.ACTIVE || !sub.mealsGeneratedAt) return false;
      const total = await tx.messMeal.count({ where: { messSubscriptionId: subscriptionId } });
      if (total !== sub.totalMealsAllowed) return false;
      // SCHEDULED is never terminal (this includes every meal attached to a PENDING / FAILED delivery stop).
      if ((await tx.messMeal.count({ where: { messSubscriptionId: subscriptionId, status: MEAL_STATUS.SCHEDULED } })) > 0) return false;
      // PAUSED is terminal ONLY once its resume window has closed: the SAME authoritative predicate pause / resume and the calendar use (strict: now < serviceAt - cutoff
      // keeps it resumable; AT the cutoff instant it is closed). One JS clock (Date.now()), never the database clock, so the boundary is deterministic and consistent.
      const cutoff = sub.pauseCutoffHours;
      if (cutoff !== null) {
        const nowMs = Date.now();
        const paused = await tx.messMeal.findMany({ where: { messSubscriptionId: subscriptionId, status: MEAL_STATUS.PAUSED }, select: { serviceAt: true } });
        if (paused.some((m) => withinPauseWindow(nowMs, m.serviceAt, cutoff))) return false;
      }
      const cas = await tx.messSubscription.updateMany({ where: { id: subscriptionId, status: SUBSCRIPTION_STATUS.ACTIVE }, data: { status: SUBSCRIPTION_STATUS.COMPLETED } });
      if (cas.count !== 1) return false;
      await AuditService.record({ actor: null, action: 'MESS_SUBSCRIPTION_COMPLETED', entity: 'MessSubscription', entityId: subscriptionId, payload: { meals: total }, context }, tx);
      return true;
    });
  }

  /**
   * Day close. 1) every PENDING / FAILED stop of a finished business day -> CLOSED_UNDELIVERED, exactly its still-SCHEDULED meals -> NOT_DELIVERED, run settled;
   * 2) every expired UNRELEASED meal -> NOT_DELIVERED; 3) completion attempts. Never touches a future meal, a PAUSED / CANCELLED / FULFILLED meal, or any meal of today.
   *
   * Expired-unreleased predicate (exact): status = 'SCHEDULED' AND deliveryStopId IS NULL AND mealDate < business date (Asia/Kolkata).
   */
  public static async closeDay(context?: AuditContext) {
    const today = businessDate();
    const todayDate = dateFromString(today);
    const touched = new Set<string>();
    let stopsClosed = 0;
    let mealsNotDelivered = 0;

    const stops = await prisma.messDeliveryStop.findMany({ where: { status: { in: [STOP_STATUS.PENDING, STOP_STATUS.FAILED] }, run: { mealDate: { lt: todayDate } } }, select: { id: true, runId: true }, orderBy: { id: 'asc' } });
    for (const st of stops) {
      const r = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "mess_delivery_runs" WHERE "id" = ${st.runId} FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "mess_delivery_stops" WHERE "id" = ${st.id} FOR UPDATE`;
        const stop = await tx.messDeliveryStop.findUniqueOrThrow({ where: { id: st.id }, select: { status: true, run: { select: { mealDate: true } } } });
        if ((stop.status !== STOP_STATUS.PENDING && stop.status !== STOP_STATUS.FAILED) || stop.run.mealDate.getTime() >= todayDate.getTime()) return null;
        const meals = await tx.$queryRaw<Array<{ id: string; messSubscriptionId: string }>>`
          SELECT "id", "messSubscriptionId" FROM "mess_daily_orders" WHERE "deliveryStopId" = ${st.id} ORDER BY "id" FOR UPDATE`;
        const upd = await tx.messDeliveryStop.updateMany({
          where: { id: st.id, status: { in: [STOP_STATUS.PENDING, STOP_STATUS.FAILED] } },
          data: { status: STOP_STATUS.CLOSED_UNDELIVERED, closedAt: new Date(), codeHash: null, codeIssuedAt: null, codeExpiresAt: null }
        });
        if (upd.count !== 1) return null;
        const nd = await tx.messMeal.updateMany({ where: { deliveryStopId: st.id, status: MEAL_STATUS.SCHEDULED }, data: { status: MEAL_STATUS.NOT_DELIVERED } });
        await AuditService.record({ actor: null, action: 'MESS_STOP_CLOSED_UNDELIVERED', entity: 'MessDeliveryStop', entityId: st.id, payload: { runId: st.runId, meals: nd.count }, context }, tx);
        await MessDeliveryService.settleRun(tx, st.runId, context);
        return { subs: [...new Set(meals.map((m) => m.messSubscriptionId))], meals: nd.count };
      });
      if (r) {
        stopsClosed += 1;
        mealsNotDelivered += r.meals;
        r.subs.forEach((s) => touched.add(s));
      }
    }

    // expired, never-released meals (late activation / backfill / a batch that was never released)
    const subs = await prisma.messMeal.findMany({ where: { status: MEAL_STATUS.SCHEDULED, deliveryStopId: null, mealDate: { lt: todayDate } }, distinct: ['messSubscriptionId'], select: { messSubscriptionId: true }, take: 1000 });
    let unreleased = 0;
    for (const { messSubscriptionId } of subs) {
      const n = await prisma.$transaction(async (tx) => {
        await lockRow.subscription(tx, messSubscriptionId);
        await tx.$queryRaw`SELECT "id" FROM "mess_daily_orders" WHERE "messSubscriptionId" = ${messSubscriptionId} AND "status" = 'SCHEDULED' AND "deliveryStopId" IS NULL AND "date" < ${today}::date ORDER BY "id" FOR UPDATE`;
        const upd = await tx.messMeal.updateMany({ where: { messSubscriptionId, status: MEAL_STATUS.SCHEDULED, deliveryStopId: null, mealDate: { lt: todayDate } }, data: { status: MEAL_STATUS.NOT_DELIVERED } });
        if (upd.count > 0) await AuditService.record({ actor: null, action: 'MESS_MEALS_EXPIRED', entity: 'MessSubscription', entityId: messSubscriptionId, payload: { meals: upd.count }, context }, tx);
        return upd.count;
      });
      if (n > 0) {
        unreleased += n;
        touched.add(messSubscriptionId);
      }
    }
    mealsNotDelivered += unreleased;

    // completion: everything touched + every ACTIVE subscription that no longer has a SCHEDULED meal
    const idle = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT s."id" FROM "mess_subscriptions" s
      WHERE s."status" = 'ACTIVE' AND s."mealsGeneratedAt" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "mess_daily_orders" m WHERE m."messSubscriptionId" = s."id" AND m."status" = 'SCHEDULED')`;
    idle.forEach((r) => touched.add(r.id));
    const completed = await this.attempt([...touched], context);
    return { businessDate: today, stopsClosed, mealsNotDelivered, unreleasedMealsExpired: unreleased, subscriptionsChecked: touched.size, subscriptionsCompleted: completed };
  }
}
