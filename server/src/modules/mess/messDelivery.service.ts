/* B2a: driver (DELIVERY) operations removed; SUPER_ADMIN is the only operator. */
import { Prisma, RoleEnum } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditContext, AuditService } from '../audit/audit.service.js';
import { MessCompletionService } from './messCompletion.service.js';
import { generateHandoverCode, handoverHashesMatch, hashHandoverCode, normalizeHandoverCode } from './messHandoverCode.js';
import {
  HANDOVER_CODE_TTL_MS,
  HANDOVER_LOCK_MS,
  HANDOVER_METHOD,
  MAX_DELIVERY_ATTEMPTS,
  MAX_HANDOVER_ATTEMPTS_PER_WINDOW,
  MAX_HANDOVER_LOCK_CYCLES,
  MAX_HANDOVER_REGENERATIONS,
  MEAL_STATUS,
  RUN_STATUS,
  STOP_STATUS,
  addDays,
  businessDate,
  dateToString,
  endOfBusinessDate
} from './messPolicy.js';

/**
 * Kerala Mess BULK DELIVERY (P10C; B2a). A CHEF releases a READY kitchen batch into ONE run with one stop per frozen service point; ONE SUPER_ADMIN operator owns the run
 * (the DELIVERY driver surface was removed: claim, dispatch, handover, failure and retry are administrator operations, and a run a legacy driver still owns is taken over);
 * a stop is handed over all-or-nothing with a code that only a resident CUSTOMER of that stop can obtain. Entirely separate from the P9 per-order delivery
 * (no DeliveryAssignment / DeliveryProof / DeliveryAttempt, no Order). It performs NO financial mutation.
 *
 * Lock order (strictly increasing; matches every writer in P10B/P10C):
 *   customer -> Order -> payment session -> ProviderPayment -> MessSubscription -> batch advisory keys -> MessMealBatch -> MessDeliveryRun -> MessDeliveryStop -> MessMeal (by id)
 * Pause / cancellation take subscription -> meals (a suffix-compatible subset); release / handover / override / day-close take batch|run -> stop -> meals (id order).
 * Subscription completion is a SEPARATE transaction (subscription lock only), started after the handover commits.
 */
type Tx = Prisma.TransactionClient;

type Operator = { kind: 'ADMIN'; userId: string; roles: readonly string[] };
type AdminRunRow = { id: string; status: string; branchId: string; mealDate: Date; claimedByEmployeeId: string | null; claimedByUserId: string | null };

const lockRun = (tx: Tx, id: string) => tx.$queryRaw`SELECT "id" FROM "mess_delivery_runs" WHERE "id" = ${id} FOR UPDATE`;
const lockStop = (tx: Tx, id: string) => tx.$queryRaw`SELECT "id" FROM "mess_delivery_stops" WHERE "id" = ${id} FOR UPDATE`;
const lockBatch = (tx: Tx, id: string) => tx.$queryRaw`SELECT "id" FROM "mess_meal_batches" WHERE "id" = ${id} FOR UPDATE`;
type LockedMeal = { id: string; messSubscriptionId: string; status: string };
const lockStopMeals = (tx: Tx, stopId: string) =>
  tx.$queryRaw<LockedMeal[]>`SELECT "id", "messSubscriptionId", "status" FROM "mess_daily_orders" WHERE "deliveryStopId" = ${stopId} ORDER BY "id" FOR UPDATE`;

const STOP_SELECT = {
  id: true, servicePointName: true, gateLabel: true, addressLine: true, city: true, postalCode: true, deliveryInstructions: true, expectedQuantity: true,
  status: true, attemptCount: true, lastFailureCode: true, lastFailureNote: true, failedAt: true, codeHash: true, codeVersion: true, codeIssuedAt: true, codeExpiresAt: true,
  recipientCustomerProfileId: true, regenerationCount: true, failedCodeAttempts: true, lockCycles: true, lockedUntil: true, blockedAt: true,
  handedOverAt: true, handoverMethod: true, closedAt: true
} as const;
const RUN_SELECT = {
  id: true, branchId: true, mealDate: true, slot: true, status: true, stopCount: true, mealCount: true, releasedAt: true, claimedAt: true, dispatchedAt: true, completedAt: true, closedAt: true, claimedByEmployeeId: true, claimedByUserId: true,
  branch: { select: { id: true, code: true, name: true } },
  claimedBy: { select: { fullName: true, employeeCode: true } },
  stops: { orderBy: { servicePointName: 'asc' as const }, select: STOP_SELECT }
} as const;
type StopRow = Prisma.MessDeliveryStopGetPayload<{ select: typeof STOP_SELECT }>;
type RunRow = Prisma.MessDeliveryRunGetPayload<{ select: typeof RUN_SELECT }>;
export type DeliveryView = 'ADMIN';

export type ProofState = 'NOT_AVAILABLE' | 'CODE_NOT_ISSUED' | 'READY_FOR_VERIFICATION' | 'LOCKED' | 'CODE_BLOCKED' | 'CODE_EXPIRED' | 'VERIFIED';
function proofState(s: StopRow, now: Date): ProofState {
  if (s.status === STOP_STATUS.HANDED_OVER) return 'VERIFIED';
  if (s.status !== STOP_STATUS.PENDING) return 'NOT_AVAILABLE';
  if (!s.codeHash) return 'CODE_NOT_ISSUED';
  if (s.blockedAt) return 'CODE_BLOCKED';
  if (s.lockedUntil && s.lockedUntil.getTime() > now.getTime()) return 'LOCKED';
  if (s.codeExpiresAt && now.getTime() >= s.codeExpiresAt.getTime()) return 'CODE_EXPIRED';
  return 'READY_FOR_VERIFICATION';
}

/** Never carries a code, hash, version, counters, recipient identity or customer data. Free-text failure notes go to SUPER_ADMIN only. */
export function toStopDto(s: StopRow, view: DeliveryView, now = new Date()) {
  return {
    id: s.id,
    servicePoint: { name: s.servicePointName, gateLabel: s.gateLabel, addressLine: s.addressLine, city: s.city, postalCode: s.postalCode, deliveryInstructions: s.deliveryInstructions },
    expectedQuantity: s.expectedQuantity,
    status: s.status,
    attempt: { number: s.attemptCount, max: MAX_DELIVERY_ATTEMPTS },
    failureCode: s.lastFailureCode,
    ...(view === 'ADMIN' ? { failureNote: s.lastFailureNote } : {}),
    proof: { state: proofState(s, now), lockedUntil: s.lockedUntil && s.lockedUntil.getTime() > now.getTime() ? s.lockedUntil.toISOString() : null },
    handedOverAt: s.handedOverAt ? s.handedOverAt.toISOString() : null,
    handoverMethod: s.handoverMethod,
    closedAt: s.closedAt ? s.closedAt.toISOString() : null
  };
}

/**
 * `exposeDriverId` adds the owning driver's employee id to the `driver` object. It exists ONLY so a SUPER_ADMIN can send it back as `expectedEmployeeId` when taking
 * the run over (the server compares it under the run lock); it is set by the SUPER_ADMIN monitor and the SUPER_ADMIN operate responses, never for a driver or for the CHEF release.
 */
export function toRunDto(r: RunRow, view: DeliveryView, now = new Date(), exposeDriverId = false) {
  return {
    id: r.id,
    branch: r.branch,
    mealDate: dateToString(r.mealDate),
    slot: r.slot,
    status: r.status,
    mealCount: r.mealCount,
    stopCount: r.stopCount,
    releasedAt: r.releasedAt.toISOString(),
    claimedAt: r.claimedAt ? r.claimedAt.toISOString() : null,
    dispatchedAt: r.dispatchedAt ? r.dispatchedAt.toISOString() : null,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    closedAt: r.closedAt ? r.closedAt.toISOString() : null,
    driver: r.claimedBy ? { ...(exposeDriverId && r.claimedByEmployeeId ? { employeeId: r.claimedByEmployeeId } : {}), name: r.claimedBy.fullName, employeeCode: r.claimedBy.employeeCode } : null,
    operator: r.claimedByUserId ? ('ADMIN' as const) : null,
    stops: r.stops.map((s) => toStopDto(s, view, now))
  };
}

export class MessDeliveryService {
  // ================================================================================================ release (CHEF)
  /**
   * Explicit CHEF release of a READY batch. ONE transaction: batch lock -> (existing run = replay) -> meal locks (id order) -> frozen service-point groups -> run + stops
   * with a snapshot of the service point -> every frozen meal gets its deliveryStopId. The stop quantities must sum to the batch's frozen meal count, else everything rolls back.
   */
  public static async release(actor: { userId: string; branchIds: string[] }, batchId: string, context?: AuditContext) {
    const peek = await prisma.messMealBatch.findUnique({ where: { id: batchId }, select: { branchId: true } });
    if (!peek || !actor.branchIds.includes(peek.branchId)) throw new AppError('Batch not found', 404, 'NOT_FOUND');
    return await prisma.$transaction(
      async (tx) => {
        await lockBatch(tx, batchId);
        const batch = await tx.messMealBatch.findUniqueOrThrow({ where: { id: batchId }, select: { id: true, branchId: true, mealDate: true, slot: true, status: true, mealCount: true, run: { select: { id: true } } } });
        if (batch.run) return { changed: false, run: await this.loadRunDto(tx, batch.run.id, 'ADMIN') };
        if (batch.status !== 'READY') throw new AppError('Only a batch that is marked ready can be released for delivery', 409, 'BATCH_NOT_READY');
        const mealDate = dateToString(batch.mealDate);
        if (mealDate < businessDate()) throw new AppError('This batch belongs to a day that has already ended', 409, 'BATCH_EXPIRED');

        const meals = await tx.$queryRaw<Array<LockedMeal & { servicePointId: string }>>`
          SELECT "id", "messSubscriptionId", "status", "servicePointId" FROM "mess_daily_orders" WHERE "batchId" = ${batchId} ORDER BY "id" FOR UPDATE`;
        if (meals.length !== batch.mealCount || meals.some((m) => m.status !== MEAL_STATUS.SCHEDULED)) throw new AppError('The batch membership changed. Please refresh.', 409, 'BATCH_CHANGED');
        const perSp = new Map<string, number>();
        for (const m of meals) perSp.set(m.servicePointId, (perSp.get(m.servicePointId) ?? 0) + 1);
        const spIds = [...perSp.keys()].sort();
        await tx.$queryRaw`SELECT "id" FROM "mess_service_points" WHERE "id" = ANY(${spIds}::text[]) ORDER BY "id" FOR SHARE`;
        const sps = await tx.messServicePoint.findMany({ where: { id: { in: spIds } }, select: { id: true, name: true, gateLabel: true, addressLine: true, city: true, postalCode: true, deliveryInstructions: true } });
        if (sps.length !== spIds.length) throw new AppError('A service point of this batch no longer exists', 409, 'BATCH_CHANGED');

        const run = await tx.messDeliveryRun.create({
          data: { batchId, branchId: batch.branchId, mealDate: batch.mealDate, slot: batch.slot, stopCount: spIds.length, mealCount: meals.length, releasedByUserId: actor.userId }
        });
        let total = 0;
        for (const sp of sps) {
          const qty = perSp.get(sp.id)!;
          const stop = await tx.messDeliveryStop.create({
            data: {
              runId: run.id, servicePointId: sp.id, servicePointName: sp.name, gateLabel: sp.gateLabel, addressLine: sp.addressLine, city: sp.city, postalCode: sp.postalCode,
              deliveryInstructions: sp.deliveryInstructions, expectedQuantity: qty
            }
          });
          const stamped = await tx.messMeal.updateMany({ where: { batchId, servicePointId: sp.id, status: MEAL_STATUS.SCHEDULED, deliveryStopId: null }, data: { deliveryStopId: stop.id } });
          if (stamped.count !== qty) throw new AppError('The batch membership changed. Please refresh.', 409, 'BATCH_CHANGED');
          total += qty;
        }
        if (total !== batch.mealCount) throw new AppError('The stop quantities do not match the batch', 409, 'BATCH_CHANGED');
        await AuditService.record(
          { actor: { userId: actor.userId, roles: [RoleEnum.CHEF] }, action: 'MESS_RUN_RELEASED', entity: 'MessDeliveryRun', entityId: run.id, payload: { batchId, branchId: batch.branchId, mealDate, slot: batch.slot, stops: spIds.length, meals: total }, context },
          tx
        );
        return { changed: true, run: await this.loadRunDto(tx, run.id, 'ADMIN') };
      },
      { maxWait: 10000, timeout: 30000 }
    ).catch((err) => {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return this.replayRelease(batchId); // a parallel release created the run first
      throw err;
    });
  }

  private static async replayRelease(batchId: string) {
    const run = await prisma.messDeliveryRun.findUnique({ where: { batchId }, select: { id: true } });
    if (!run) throw new AppError('The batch could not be released. Please retry.', 409, 'BATCH_CHANGED');
    return { changed: false, run: await this.loadRunDto(prisma, run.id, 'ADMIN') };
  }

  private static async loadRunDto(db: Tx | typeof prisma, runId: string, view: DeliveryView, exposeDriverId = false) {
    const row = await db.messDeliveryRun.findUniqueOrThrow({ where: { id: runId }, select: RUN_SELECT });
    return toRunDto(row, view, new Date(), exposeDriverId);
  }

  // ================================================================================================ reads
  /** SUPER_ADMIN read-only monitor for ONE explicit branch (the last 3 business days). */
  public static async monitor(branchId: string, view: 'ADMIN') {
    const since = dateFromBusiness(addDays(businessDate(), -2));
    const rows = await prisma.messDeliveryRun.findMany({ where: { branchId, mealDate: { gte: since } }, orderBy: [{ mealDate: 'desc' }, { slot: 'asc' }], take: 60, select: RUN_SELECT });
    const now = new Date();
    return { serverTime: now.toISOString(), today: businessDate(), runs: rows.map((r) => toRunDto(r, view, now, true)) }; // SUPER_ADMIN only (see the route): the driver's employee id enables a takeover
  }

  // ================================================================================================ stop actions (SUPER_ADMIN operator)
  /** Locks run -> stop for an ADMINISTRATOR-operated run: no driver owns it and an administrator does (a driver-owned run needs a takeover first). */
  private static async lockAdminOperated(tx: Tx, runId: string, stopId: string) {
    await lockRun(tx, runId);
    const run = await tx.messDeliveryRun.findUnique({ where: { id: runId }, select: { id: true, status: true, branchId: true, mealDate: true, claimedByEmployeeId: true, claimedByUserId: true } });
    if (!run) throw new AppError('Delivery run not found', 404, 'NOT_FOUND');
    if (run.claimedByEmployeeId) throw new AppError('This run is owned by a driver. Take it over first.', 409, 'RUN_OWNED_BY_DRIVER');
    if (!run.claimedByUserId) throw new AppError('This run has not been claimed by an administrator', 409, 'RUN_NOT_OPERATED');
    const stopPeek = await tx.messDeliveryStop.findFirst({ where: { id: stopId, runId }, select: { id: true } });
    if (!stopPeek) throw new AppError('Stop not found', 404, 'NOT_FOUND');
    await lockStop(tx, stopId);
    const stop = await tx.messDeliveryStop.findUniqueOrThrow({ where: { id: stopId }, select: STOP_SELECT });
    return { run, stop };
  }

  private static lockFor(tx: Tx, _op: Operator, runId: string, stopId: string) {
    return this.lockAdminOperated(tx, runId, stopId);
  }

  private static async runFor(op: Operator, runId: string) {
    return await this.loadRunDto(prisma, runId, 'ADMIN', true); // administrator operations are SUPER_ADMIN only
  }

  private static assertWorkable(run: { status: string; mealDate: Date }) {
    if (run.status !== RUN_STATUS.IN_TRANSIT) throw new AppError('The run is not on the road', 409, 'RUN_NOT_IN_TRANSIT');
    if (dateToString(run.mealDate) < businessDate()) throw new AppError('The day of this run has already ended', 409, 'DELIVERY_DAY_ENDED');
  }

  /**
   * Verifies the handover code. Wrong attempts are committed (counter / lock / block) and the safe error is thrown only AFTER the transaction commits.
   * `receivedAt` is when the request ARRIVED: a code submitted before a concurrent regeneration committed is stale, not a guess, and is not counted.
   */
  /** Role simplification: a SUPER_ADMIN operating the run enters the resident's code (the SAME single implementation: attempts, lock cycles, block, expiry). */
  public static async verifyAsAdmin(admin: { userId: string; roles: readonly string[] }, runId: string, stopId: string, rawCode: string, receivedAt: Date, context?: AuditContext) {
    return await this.verifyAs({ kind: 'ADMIN', userId: admin.userId, roles: admin.roles }, runId, stopId, rawCode, receivedAt, context);
  }

  private static async verifyAs(op: Operator, runId: string, stopId: string, rawCode: string, receivedAt: Date, context?: AuditContext) {
    const code = normalizeHandoverCode(rawCode);
    if (!code) throw new AppError('Enter the 6-digit handover code', 422, 'INVALID_HANDOVER_CODE_FORMAT');
    const userId = op.userId;
    const roles: readonly string[] = op.roles;
    const operatorPayload = { operatorUserId: op.userId };
    type Outcome = { kind: 'OK'; changed: boolean; subs: string[] } | { kind: 'ERROR'; error: AppError };
    let outcome: Outcome;
    outcome = await prisma.$transaction(
      async (tx): Promise<Outcome> => {
        const { run, stop } = await this.lockFor(tx, op, runId, stopId);
        const err = (message: string, status: number, name: string): Outcome => ({ kind: 'ERROR', error: new AppError(message, status, name) });
        if (stop.status === STOP_STATUS.HANDED_OVER) {
          const sameVerifier = (await tx.messDeliveryStop.count({ where: { id: stop.id, handedOverByUserId: userId } })) === 1;
          const replay = stop.handoverMethod === HANDOVER_METHOD.CODE && !!stop.codeHash && handoverHashesMatch(stop.codeHash, hashHandoverCode(stop.id, stop.codeVersion, code)) && sameVerifier;
          return replay ? { kind: 'OK', changed: false, subs: [] } : err('This stop has already been handed over', 409, 'ALREADY_HANDED_OVER');
        }
        if (stop.status === STOP_STATUS.CLOSED_UNDELIVERED) return err('This stop has been closed', 409, 'STOP_CLOSED');
        if (stop.status === STOP_STATUS.FAILED) return err('A problem was reported for this stop. Retry it first.', 409, 'STOP_FAILED');
        if (run.status !== RUN_STATUS.IN_TRANSIT) return err('The run is not on the road', 409, 'RUN_NOT_IN_TRANSIT');
        if (dateToString(run.mealDate) < businessDate()) return err('The day of this run has already ended', 409, 'DELIVERY_DAY_ENDED');
        if (!stop.codeHash || !stop.codeIssuedAt) return err('No resident has requested the handover code yet', 409, 'HANDOVER_CODE_NOT_ISSUED');
        if (stop.blockedAt) return err('This handover code is blocked. A resident must generate a new one.', 409, 'HANDOVER_CODE_BLOCKED');
        const now = new Date();
        if (stop.lockedUntil && stop.lockedUntil.getTime() > now.getTime()) return err('Handover code entry is temporarily locked', 409, 'HANDOVER_CODE_LOCKED');
        if (stop.codeExpiresAt && now.getTime() >= stop.codeExpiresAt.getTime()) return err('The handover code has expired. A resident must generate a new one.', 409, 'HANDOVER_CODE_EXPIRED');

        const match = handoverHashesMatch(stop.codeHash, hashHandoverCode(stop.id, stop.codeVersion, code));
        if (!match) {
          if (stop.codeIssuedAt.getTime() > receivedAt.getTime()) return err('A new handover code was generated. Ask for the latest one.', 409, 'HANDOVER_CODE_CHANGED');
          let failed = stop.failedCodeAttempts + 1;
          let cycles = stop.lockCycles;
          let lockedUntil = stop.lockedUntil;
          let blockedAt: Date | null = null;
          let result = 'WRONG';
          if (failed >= MAX_HANDOVER_ATTEMPTS_PER_WINDOW) {
            failed = 0;
            cycles += 1;
            lockedUntil = new Date(now.getTime() + HANDOVER_LOCK_MS);
            result = 'LOCKED';
            if (cycles >= MAX_HANDOVER_LOCK_CYCLES) {
              blockedAt = now;
              result = 'BLOCKED';
            }
          }
          await tx.messDeliveryStop.update({ where: { id: stop.id }, data: { failedCodeAttempts: failed, lockCycles: cycles, lockedUntil, ...(blockedAt ? { blockedAt } : {}) } });
          const actor = { userId, roles };
          await AuditService.record({ actor, action: 'MESS_HANDOVER_VERIFY_FAILED', entity: 'MessDeliveryStop', entityId: stop.id, payload: { runId, ...operatorPayload }, context }, tx);
          if (result !== 'WRONG') await AuditService.record({ actor, action: result === 'BLOCKED' ? 'MESS_HANDOVER_CODE_BLOCKED' : 'MESS_HANDOVER_VERIFY_LOCKED', entity: 'MessDeliveryStop', entityId: stop.id, payload: { runId, lockCycle: cycles }, context }, tx);
          return result === 'BLOCKED'
            ? err('This handover code is now blocked. A resident must generate a new one.', 409, 'HANDOVER_CODE_BLOCKED')
            : result === 'LOCKED'
              ? err('Too many incorrect codes. Handover code entry is locked for 15 minutes.', 409, 'HANDOVER_CODE_LOCKED')
              : err('The handover code is not correct', 422, 'INVALID_HANDOVER_CODE');
        }
        const subs = await this.completeStop(tx, { id: stop.id, expectedQuantity: stop.expectedQuantity }, run.id, {
          method: HANDOVER_METHOD.CODE, handedOverByUserId: userId, auditActor: { userId, roles }, context
        });
        return { kind: 'OK', changed: true, subs };
      },
      { maxWait: 10000, timeout: 30000 }
    );
    if (outcome.kind === 'ERROR') throw outcome.error;
    if (outcome.subs.length) await MessCompletionService.attempt(outcome.subs, context);
    return { changed: outcome.changed, run: await this.runFor(op, runId) };
  }

  /**
   * The ONE place that turns a stop into HANDED_OVER: caller holds the run + stop locks. Fulfils EXACTLY this stop's frozen SCHEDULED meals (count must equal the
   * frozen expected quantity, else the whole transaction rolls back), then settles the run. Returns the affected subscription ids for the completion attempt.
   */
  private static async completeStop(
    tx: Tx,
    stop: { id: string; expectedQuantity: number },
    runId: string,
    p: { method: string; handedOverByEmployeeId?: string; handedOverByUserId?: string; override?: { userId: string; reasonCode: string; note: string }; auditActor: { userId: string; roles: readonly string[] }; context?: AuditContext }
  ): Promise<string[]> {
    const meals = await lockStopMeals(tx, stop.id);
    const open = meals.filter((m) => m.status === MEAL_STATUS.SCHEDULED);
    if (meals.length !== stop.expectedQuantity || open.length !== stop.expectedQuantity) throw new AppError('The stop quantity does not match its meals', 409, 'STOP_QUANTITY_MISMATCH');
    const now = new Date();
    const cas = await tx.messDeliveryStop.updateMany({
      where: { id: stop.id, status: STOP_STATUS.PENDING },
      data: {
        status: STOP_STATUS.HANDED_OVER, handedOverAt: now, handoverMethod: p.method, failedCodeAttempts: 0,
        ...(p.handedOverByEmployeeId ? { handedOverByEmployeeId: p.handedOverByEmployeeId } : {}),
        ...(p.handedOverByUserId ? { handedOverByUserId: p.handedOverByUserId } : {}),
        ...(p.override ? { overrideByUserId: p.override.userId, overrideReasonCode: p.override.reasonCode, overrideNote: p.override.note } : {})
      }
    });
    if (cas.count !== 1) throw new AppError('The stop changed. Please refresh.', 409, 'STOP_CHANGED');
    const done = await tx.messMeal.updateMany({ where: { deliveryStopId: stop.id, status: MEAL_STATUS.SCHEDULED }, data: { status: MEAL_STATUS.FULFILLED, fulfilledAt: now } });
    if (done.count !== stop.expectedQuantity) throw new AppError('The stop quantity does not match its meals', 409, 'STOP_QUANTITY_MISMATCH');
    await AuditService.record(
      {
        actor: p.auditActor,
        action: p.override ? 'MESS_STOP_OVERRIDDEN' : 'MESS_STOP_HANDED_OVER',
        entity: 'MessDeliveryStop',
        entityId: stop.id,
        payload: { runId, method: p.method, meals: done.count, ...(p.override ? { reasonCode: p.override.reasonCode, note: p.override.note } : {}) },
        context: p.context
      },
      tx
    );
    await this.settleRun(tx, runId, p.context);
    return [...new Set(meals.map((m) => m.messSubscriptionId))];
  }

  /** COMPLETED when every stop is HANDED_OVER; CLOSED when all are terminal and at least one is CLOSED_UNDELIVERED; otherwise unchanged. Caller holds the run lock. */
  public static async settleRun(tx: Tx, runId: string, context?: AuditContext): Promise<'COMPLETED' | 'CLOSED' | null> {
    const stops = await tx.messDeliveryStop.findMany({ where: { runId }, select: { status: true } });
    if (stops.length === 0 || stops.some((s) => s.status === STOP_STATUS.PENDING || s.status === STOP_STATUS.FAILED)) return null;
    const all = stops.every((s) => s.status === STOP_STATUS.HANDED_OVER);
    const now = new Date();
    const cas = await tx.messDeliveryRun.updateMany({
      where: { id: runId, status: { in: [RUN_STATUS.AVAILABLE, RUN_STATUS.CLAIMED, RUN_STATUS.IN_TRANSIT] } },
      data: all ? { status: RUN_STATUS.COMPLETED, completedAt: now } : { status: RUN_STATUS.CLOSED, closedAt: now }
    });
    if (cas.count !== 1) return null;
    await AuditService.record({ actor: null, action: all ? 'MESS_RUN_COMPLETED' : 'MESS_RUN_CLOSED', entity: 'MessDeliveryRun', entityId: runId, payload: { stops: stops.length }, context }, tx);
    return all ? 'COMPLETED' : 'CLOSED';
  }

  /** Operational failure report. No money, no meal change: the meals stay SCHEDULED until the stop is handed over or closed at day end. */
  public static async failAsAdmin(admin: { userId: string; roles: readonly string[] }, runId: string, stopId: string, body: { reasonCode: string; note?: string | null }, context?: AuditContext) {
    return await this.failAs({ kind: 'ADMIN', userId: admin.userId, roles: admin.roles }, runId, stopId, body, context);
  }

  private static async failAs(op: Operator, runId: string, stopId: string, body: { reasonCode: string; note?: string | null }, context?: AuditContext) {
    let changed = true;
    await prisma.$transaction(async (tx) => {
      const { run, stop } = await this.lockFor(tx, op, runId, stopId);
      if (stop.status === STOP_STATUS.FAILED) {
        changed = false; // replay
        return;
      }
      if (stop.status !== STOP_STATUS.PENDING) throw new AppError('This stop can no longer be reported', 409, 'STOP_NOT_PENDING');
      this.assertWorkable(run);
      const cas = await tx.messDeliveryStop.updateMany({
        where: { id: stop.id, status: STOP_STATUS.PENDING },
        data: { status: STOP_STATUS.FAILED, failedAt: new Date(), lastFailureCode: body.reasonCode, lastFailureNote: body.note ?? null, codeHash: null, codeIssuedAt: null, codeExpiresAt: null }
      });
      if (cas.count !== 1) throw new AppError('The stop changed. Please refresh.', 409, 'STOP_CHANGED');
      await AuditService.record({ actor: { userId: op.userId, roles: op.roles }, action: 'MESS_STOP_FAILED', entity: 'MessDeliveryStop', entityId: stop.id, payload: { runId, reasonCode: body.reasonCode, attempt: stop.attemptCount, ...(op.kind === 'ADMIN' ? { operatorUserId: op.userId } : {}) }, context }, tx);
    });
    return { changed, run: await this.runFor(op, runId) };
  }

  /**
   * FAILED -> PENDING. Attempt semantics: attemptCount is the number of the CURRENT attempt (starts at 1); a retry makes it +1 and is refused once it is already
   * MAX_DELIVERY_ATTEMPTS (so at most 3 attempts exist). The previous proof dies (codeVersion + 1, hash/recipient cleared) and a fresh resident may request a new code.
   */
  public static async retryAsAdmin(admin: { userId: string; roles: readonly string[] }, runId: string, stopId: string, context?: AuditContext) {
    return await this.retryAs({ kind: 'ADMIN', userId: admin.userId, roles: admin.roles }, runId, stopId, context);
  }

  private static async retryAs(op: Operator, runId: string, stopId: string, context?: AuditContext) {
    let changed = true;
    await prisma.$transaction(async (tx) => {
      const { run, stop } = await this.lockFor(tx, op, runId, stopId);
      if (stop.status === STOP_STATUS.PENDING) {
        changed = false;
        return;
      }
      if (stop.status !== STOP_STATUS.FAILED) throw new AppError('Only a stop with a reported problem can be retried', 409, 'STOP_NOT_FAILED');
      this.assertWorkable(run);
      if (stop.attemptCount >= MAX_DELIVERY_ATTEMPTS) throw new AppError('The maximum number of delivery attempts has been reached', 409, 'DELIVERY_ATTEMPT_LIMIT_REACHED');
      const cas = await tx.messDeliveryStop.updateMany({
        where: { id: stop.id, status: STOP_STATUS.FAILED, attemptCount: stop.attemptCount },
        data: {
          status: STOP_STATUS.PENDING, attemptCount: stop.attemptCount + 1, codeVersion: stop.codeVersion + 1, codeHash: null, codeIssuedAt: null, codeExpiresAt: null, recipientCustomerProfileId: null,
          failedCodeAttempts: 0, lockCycles: 0, lockedUntil: null, blockedAt: null
        }
      });
      if (cas.count !== 1) throw new AppError('The stop changed. Please refresh.', 409, 'STOP_CHANGED');
      await AuditService.record({ actor: { userId: op.userId, roles: op.roles }, action: 'MESS_STOP_RETRIED', entity: 'MessDeliveryStop', entityId: stop.id, payload: { runId, attempt: stop.attemptCount + 1, ...(op.kind === 'ADMIN' ? { operatorUserId: op.userId } : {}) }, context }, tx);
    });
    return { changed, run: await this.runFor(op, runId) };
  }

  // ================================================================================================ SUPER_ADMIN operation of a run (role simplification)
  /**
   * An administrator operates a run exactly like a driver would, with EXACTLY ONE owner (employee OR administrator, enforced by a CHECK). Claim, dispatch, takeover
   * and the stop actions each need a step-up proof at the route. A run a driver owns must be taken over first. Nothing here touches money or meals directly.
   */
  private static async adminRun<T extends { changed: boolean }>(runId: string, fn: (tx: Tx, run: AdminRunRow) => Promise<T>) {
    const result = await prisma.$transaction(async (tx) => {
      await lockRun(tx, runId);
      const run = await tx.messDeliveryRun.findUnique({ where: { id: runId }, select: { id: true, status: true, branchId: true, mealDate: true, claimedByEmployeeId: true, claimedByUserId: true } });
      if (!run) throw new AppError('Delivery run not found', 404, 'NOT_FOUND');
      return await fn(tx, run);
    });
    return { changed: result.changed, run: await this.loadRunDto(prisma, runId, 'ADMIN', true) };
  }

  public static async adminClaim(admin: { userId: string; roles: readonly string[] }, runId: string, context?: AuditContext) {
    return await this.adminRun(runId, async (tx, run) => {
      if (run.claimedByUserId && run.status !== RUN_STATUS.AVAILABLE) return { changed: false }; // an administrator already operates it
      if (run.status !== RUN_STATUS.AVAILABLE) throw run.claimedByEmployeeId ? new AppError('This run is owned by a driver. Take it over first.', 409, 'RUN_OWNED_BY_DRIVER') : new AppError('This run is not available', 409, 'RUN_NOT_AVAILABLE');
      if (dateToString(run.mealDate) < businessDate()) throw new AppError('The day of this run has already ended', 409, 'DELIVERY_DAY_ENDED');
      const cas = await tx.messDeliveryRun.updateMany({ where: { id: run.id, status: RUN_STATUS.AVAILABLE, claimedByEmployeeId: null, claimedByUserId: null }, data: { status: RUN_STATUS.CLAIMED, claimedByUserId: admin.userId, claimedAt: new Date() } });
      if (cas.count !== 1) throw new AppError('This run was already claimed', 409, 'ALREADY_CLAIMED');
      await AuditService.record({ actor: { userId: admin.userId, roles: admin.roles }, action: 'MESS_RUN_CLAIMED', entity: 'MessDeliveryRun', entityId: run.id, payload: { operatorUserId: admin.userId }, context }, tx);
      return { changed: true };
    });
  }

  public static async adminDispatch(admin: { userId: string; roles: readonly string[] }, runId: string, context?: AuditContext) {
    return await this.adminRun(runId, async (tx, run) => {
      if (run.claimedByEmployeeId) throw new AppError('This run is owned by a driver. Take it over first.', 409, 'RUN_OWNED_BY_DRIVER');
      if (!run.claimedByUserId) throw new AppError('This run has not been claimed by an administrator', 409, 'RUN_NOT_OPERATED');
      if (run.status === RUN_STATUS.IN_TRANSIT) return { changed: false };
      if (run.status !== RUN_STATUS.CLAIMED) throw new AppError('Only a claimed run can be dispatched', 409, 'RUN_NOT_CLAIMED');
      if (dateToString(run.mealDate) < businessDate()) throw new AppError('The day of this run has already ended', 409, 'DELIVERY_DAY_ENDED');
      const cas = await tx.messDeliveryRun.updateMany({ where: { id: run.id, status: RUN_STATUS.CLAIMED, claimedByEmployeeId: null, claimedByUserId: { not: null } }, data: { status: RUN_STATUS.IN_TRANSIT, dispatchedAt: new Date() } });
      if (cas.count !== 1) throw new AppError('The run changed. Please refresh.', 409, 'RUN_CHANGED');
      await AuditService.record({ actor: { userId: admin.userId, roles: admin.roles }, action: 'MESS_RUN_DISPATCHED', entity: 'MessDeliveryRun', entityId: run.id, payload: { operatorUserId: admin.userId }, context }, tx);
      return { changed: true };
    });
  }

  /** Moves a CLAIMED / IN_TRANSIT run from a legacy driver to the administrators. Only the live run row changes; the previous driver is recorded on it and in the audit trail. */
  public static async adminTakeover(admin: { userId: string; roles: readonly string[] }, runId: string, body: { expectedEmployeeId: string; reason: string }, context?: AuditContext) {
    return await this.adminRun(runId, async (tx, run) => {
      if (run.claimedByUserId && !run.claimedByEmployeeId) {
        const taken = await tx.messDeliveryRun.count({ where: { id: run.id, takenOverFromEmployeeId: body.expectedEmployeeId } });
        if (taken === 1) return { changed: false }; // replay
      }
      if (![RUN_STATUS.CLAIMED, RUN_STATUS.IN_TRANSIT].includes(run.status as never)) throw new AppError('This run cannot be taken over in its current state', 409, 'RUN_NOT_TAKEOVER_ELIGIBLE');
      if (run.claimedByEmployeeId !== body.expectedEmployeeId) throw new AppError('The run owner changed in the meantime. Refresh and try again.', 409, 'RUN_OWNER_CHANGED');
      const cas = await tx.messDeliveryRun.updateMany({
        where: { id: run.id, status: run.status, claimedByEmployeeId: body.expectedEmployeeId, claimedByUserId: null },
        data: { claimedByEmployeeId: null, claimedByUserId: admin.userId, takenOverFromEmployeeId: body.expectedEmployeeId }
      });
      if (cas.count !== 1) throw new AppError('The run owner changed in the meantime. Refresh and try again.', 409, 'RUN_OWNER_CHANGED');
      await AuditService.record(
        { actor: { userId: admin.userId, roles: admin.roles }, action: 'MESS_RUN_TAKEN_OVER', entity: 'MessDeliveryRun', entityId: run.id, payload: { fromDriverEmployeeId: body.expectedEmployeeId, operatorUserId: admin.userId, status: run.status, reason: body.reason }, context },
        tx
      );
      return { changed: true };
    });
  }

  // ================================================================================================ SUPER_ADMIN exceptional override
  /** Exceptional handover confirmation: does NOT reveal or regenerate a code and does not pretend one was verified (method ADMIN_OVERRIDE, reason + note audited). */
  public static async override(actor: { userId: string; roles: readonly string[] }, stopId: string, body: { reasonCode: string; note: string }, context?: AuditContext) {
    const peek = await prisma.messDeliveryStop.findUnique({ where: { id: stopId }, select: { runId: true } });
    if (!peek) throw new AppError('Stop not found', 404, 'NOT_FOUND');
    const subs = await prisma.$transaction(
      async (tx) => {
        await lockRun(tx, peek.runId);
        await lockStop(tx, stopId);
        const run = await tx.messDeliveryRun.findUniqueOrThrow({ where: { id: peek.runId }, select: { id: true, status: true, mealDate: true } });
        const stop = await tx.messDeliveryStop.findUniqueOrThrow({ where: { id: stopId }, select: { id: true, status: true, expectedQuantity: true, handoverMethod: true } });
        if (stop.status === STOP_STATUS.HANDED_OVER && stop.handoverMethod === HANDOVER_METHOD.ADMIN_OVERRIDE) return null; // replay
        if (stop.status !== STOP_STATUS.PENDING) throw new AppError('Only a pending stop can be confirmed this way', 409, 'STOP_NOT_PENDING');
        this.assertWorkable(run);
        return await this.completeStop(tx, stop, run.id, { method: HANDOVER_METHOD.ADMIN_OVERRIDE, override: { userId: actor.userId, reasonCode: body.reasonCode, note: body.note }, auditActor: actor, context });
      },
      { maxWait: 10000, timeout: 30000 }
    );
    if (subs && subs.length) await MessCompletionService.attempt(subs, context);
    return { changed: subs !== null };
  }

  // ================================================================================================ resident CUSTOMER: handover code
  private static async residentMeal(userId: string, subscriptionId: string, mealId: string) {
    const profile = await prisma.customerProfile.findUnique({ where: { userId }, select: { id: true } });
    const meal = profile
      ? await prisma.messMeal.findFirst({
          where: { id: mealId, messSubscriptionId: subscriptionId, messSubscription: { messAccount: { customerProfileId: profile.id } } },
          select: { id: true, status: true, deliveryStopId: true, deliveryStop: { select: { runId: true } } }
        })
      : null;
    if (!profile || !meal) throw new AppError('Meal not found', 404, 'NOT_FOUND');
    return { profileId: profile.id, meal };
  }

  /** Safe state for the resident. The plaintext code is NEVER part of it. */
  public static async handoverState(userId: string, subscriptionId: string, mealId: string) {
    const { profileId, meal } = await this.residentMeal(userId, subscriptionId, mealId);
    if (!meal.deliveryStopId || !meal.deliveryStop) return { state: 'NOT_AVAILABLE' as const };
    const stop = await prisma.messDeliveryStop.findUniqueOrThrow({ where: { id: meal.deliveryStopId }, select: { ...STOP_SELECT, run: { select: { status: true, mealDate: true } } } });
    return this.residentView(stop, stop.run, meal.status, profileId, new Date());
  }

  private static residentView(stop: StopRow, run: { status: string; mealDate: Date }, mealStatus: string, profileId: string, now: Date) {
    type S = { state: 'NOT_AVAILABLE' | 'NOT_ISSUED' | 'ISSUED_TO_YOU' | 'ISSUED_TO_ANOTHER' | 'LOCKED' | 'CODE_BLOCKED' | 'CODE_EXPIRED' | 'VERIFIED'; expiresAt?: string; regenerationsLeft?: number; lockedUntil?: string };
    if (stop.status === STOP_STATUS.HANDED_OVER || mealStatus === MEAL_STATUS.FULFILLED) return { state: 'VERIFIED' } as S;
    if (run.status !== RUN_STATUS.IN_TRANSIT || stop.status !== STOP_STATUS.PENDING || mealStatus !== MEAL_STATUS.SCHEDULED || now.getTime() >= endOfBusinessDate(dateToString(run.mealDate)).getTime()) return { state: 'NOT_AVAILABLE' } as S;
    if (!stop.recipientCustomerProfileId || !stop.codeHash) return { state: 'NOT_ISSUED' } as S;
    if (stop.recipientCustomerProfileId !== profileId) return { state: 'ISSUED_TO_ANOTHER' } as S; // non-identifying
    const left = Math.max(0, MAX_HANDOVER_REGENERATIONS - stop.regenerationCount);
    if (stop.blockedAt) return { state: 'CODE_BLOCKED', regenerationsLeft: left } as S;
    if (stop.lockedUntil && stop.lockedUntil.getTime() > now.getTime()) return { state: 'LOCKED', lockedUntil: stop.lockedUntil.toISOString(), regenerationsLeft: left } as S;
    if (stop.codeExpiresAt && now.getTime() >= stop.codeExpiresAt.getTime()) return { state: 'CODE_EXPIRED', regenerationsLeft: left } as S;
    return { state: 'ISSUED_TO_YOU', expiresAt: stop.codeExpiresAt ? stop.codeExpiresAt.toISOString() : undefined, regenerationsLeft: left } as S;
  }

  /**
   * ISSUE: the first resident of the stop who asks becomes THE recipient and receives the plaintext once. REGENERATE: only that recipient. The plaintext is
   * returned here and nowhere else (never to DELIVERY / CHEF / SUPER_ADMIN / MD, never audited or logged).
   */
  public static async issueHandoverCode(userId: string, subscriptionId: string, mealId: string, mode: 'ISSUE' | 'REGENERATE', context?: AuditContext) {
    const { profileId, meal } = await this.residentMeal(userId, subscriptionId, mealId);
    if (!meal.deliveryStopId || !meal.deliveryStop) throw new AppError('A handover code is not available for this meal', 409, 'HANDOVER_NOT_AVAILABLE');
    const runId = meal.deliveryStop.runId;
    const stopId = meal.deliveryStopId;
    return await prisma.$transaction(
      async (tx) => {
        await lockRun(tx, runId);
        await lockStop(tx, stopId);
        const run = await tx.messDeliveryRun.findUniqueOrThrow({ where: { id: runId }, select: { status: true, mealDate: true } });
        const stop = await tx.messDeliveryStop.findUniqueOrThrow({ where: { id: stopId }, select: STOP_SELECT });
        const mealNow = await tx.messMeal.findUniqueOrThrow({ where: { id: mealId }, select: { status: true } });
        const now = new Date();
        const dayEnd = endOfBusinessDate(dateToString(run.mealDate));
        if (run.status !== RUN_STATUS.IN_TRANSIT || stop.status !== STOP_STATUS.PENDING || mealNow.status !== MEAL_STATUS.SCHEDULED || now.getTime() >= dayEnd.getTime()) {
          throw new AppError('A handover code is not available for this meal right now', 409, 'HANDOVER_NOT_AVAILABLE');
        }
        let regenerated = false;
        if (mode === 'ISSUE') {
          if (stop.recipientCustomerProfileId && stop.codeHash) {
            throw stop.recipientCustomerProfileId === profileId
              ? new AppError('You already generated the handover code. Use "Generate a new code" if you need another.', 409, 'HANDOVER_CODE_ALREADY_ISSUED')
              : new AppError('A handover code was already issued to another resident of your service point', 409, 'HANDOVER_CODE_ISSUED_TO_ANOTHER');
          }
        } else {
          if (!stop.codeHash || stop.recipientCustomerProfileId !== profileId) throw new AppError('Only the resident who generated the handover code can generate a new one', 409, 'HANDOVER_CODE_NOT_ISSUED');
          if (stop.regenerationCount >= MAX_HANDOVER_REGENERATIONS) throw new AppError('The maximum number of new handover codes has been reached', 409, 'HANDOVER_REGENERATION_LIMIT');
          regenerated = true;
        }
        const code = generateHandoverCode();
        const version = stop.codeVersion + 1;
        const expiresAt = new Date(Math.min(now.getTime() + HANDOVER_CODE_TTL_MS, dayEnd.getTime()));
        const cas = await tx.messDeliveryStop.updateMany({
          where: { id: stopId, status: STOP_STATUS.PENDING, codeVersion: stop.codeVersion, ...(regenerated ? { recipientCustomerProfileId: profileId } : { recipientCustomerProfileId: null }) },
          data: {
            codeHash: hashHandoverCode(stopId, version, code), codeVersion: version, codeIssuedAt: now, codeExpiresAt: expiresAt, recipientCustomerProfileId: profileId,
            failedCodeAttempts: 0, lockCycles: 0, lockedUntil: null, blockedAt: null, ...(regenerated ? { regenerationCount: stop.regenerationCount + 1 } : {})
          }
        });
        if (cas.count !== 1) throw new AppError('The handover code was just issued to someone else', 409, 'HANDOVER_CODE_ISSUED_TO_ANOTHER');
        await AuditService.record(
          { actor: { userId, roles: [RoleEnum.CUSTOMER] }, action: regenerated ? 'MESS_HANDOVER_CODE_REGENERATED' : 'MESS_HANDOVER_CODE_ISSUED', entity: 'MessDeliveryStop', entityId: stopId, payload: { runId, codeVersion: version }, context },
          tx
        );
        return { state: 'ISSUED_TO_YOU' as const, code, expiresAt: expiresAt.toISOString(), regenerationsLeft: Math.max(0, MAX_HANDOVER_REGENERATIONS - (stop.regenerationCount + (regenerated ? 1 : 0))) };
      },
      { maxWait: 10000, timeout: 30000 }
    );
  }
}

function dateFromBusiness(d: string): Date {
  return new Date(`${d}T00:00:00.000Z`);
}
