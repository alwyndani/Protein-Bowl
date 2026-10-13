import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditContext, AuditService } from '../audit/audit.service.js';
import { BATCH_STATUS, KITCHEN_DEMAND_HORIZON_DAYS, MEAL_STATUS, SUBSCRIPTION_STATUS, addDays, businessDate, dateFromString, dateToString, isUniqueViolation, lockRow } from './messPolicy.js';

type Db = Prisma.TransactionClient | typeof prisma;

/** Frozen membership of a batch = the meal rows attached to it. The breakdown is derived ONLY from them (never from today's account / service-point configuration). */
async function breakdownFor(db: Db, batchIds: string[]) {
  if (batchIds.length === 0) return new Map<string, Array<{ servicePoint: { id: string; name: string; gateLabel: string | null }; mealCount: number }>>();
  const groups = await db.messMeal.groupBy({ by: ['batchId', 'servicePointId'], where: { batchId: { in: batchIds } }, _count: { _all: true } });
  const sps = await db.messServicePoint.findMany({ where: { id: { in: [...new Set(groups.map((g) => g.servicePointId))] } }, select: { id: true, name: true, gateLabel: true } });
  const spById = new Map(sps.map((s) => [s.id, s]));
  const out = new Map<string, Array<{ servicePoint: { id: string; name: string; gateLabel: string | null }; mealCount: number }>>();
  for (const g of groups) {
    const sp = spById.get(g.servicePointId)!;
    const list = out.get(g.batchId!) ?? [];
    list.push({ servicePoint: { id: sp.id, name: sp.name, gateLabel: sp.gateLabel }, mealCount: g._count._all });
    out.set(g.batchId!, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.servicePoint.name.localeCompare(b.servicePoint.name));
  return out;
}

const BATCH_SELECT = {
  id: true, mealDate: true, slot: true, status: true, mealCount: true, startedAt: true, readyAt: true,
  branch: { select: { id: true, code: true, name: true } }
} as const;

type BatchRow = Prisma.MessMealBatchGetPayload<{ select: typeof BATCH_SELECT }>;

function toBatchDto(b: BatchRow, breakdown: Array<{ servicePoint: { id: string; name: string; gateLabel: string | null }; mealCount: number }> | undefined) {
  return {
    id: b.id, branch: b.branch, mealDate: dateToString(b.mealDate), slot: b.slot, status: b.status, mealCount: b.mealCount,
    startedAt: b.startedAt.toISOString(), readyAt: b.readyAt ? b.readyAt.toISOString() : null,
    servicePoints: breakdown ?? []
  };
}

/**
 * Kerala Mess KITCHEN (P10B). Completely separate from the P8 DIRECT-order kitchen: its own tables, routes and permissions.
 * Demand and batches carry counts only: never a customer name, phone, room, student id, health or payment datum.
 */
export class MessKitchenService {
  // ================================================================================================ demand (read)
  public static async demand(branchIds: string[], range: { from?: string; to?: string }) {
    const today = businessDate();
    const horizon = addDays(today, KITCHEN_DEMAND_HORIZON_DAYS);
    const from = range.from && range.from > today ? range.from : today;
    const to = range.to && range.to < horizon ? range.to : horizon;
    if (from > to) return { today, from, to, groups: [] as unknown[] };

    const rows = await prisma.messMeal.groupBy({
      by: ['branchId', 'mealDate', 'slot', 'servicePointId'],
      where: { branchId: { in: branchIds }, mealDate: { gte: dateFromString(from), lte: dateFromString(to) }, status: MEAL_STATUS.SCHEDULED, batchId: null, messSubscription: { status: SUBSCRIPTION_STATUS.ACTIVE } },
      _count: { _all: true }
    });
    const [sps, branches, batches] = await Promise.all([
      prisma.messServicePoint.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.servicePointId))] } }, select: { id: true, name: true, gateLabel: true } }),
      prisma.kitchenBranch.findMany({ where: { id: { in: branchIds } }, select: { id: true, code: true, name: true } }),
      prisma.messMealBatch.findMany({ where: { branchId: { in: branchIds }, mealDate: { gte: dateFromString(from), lte: dateFromString(to) } }, select: { branchId: true, mealDate: true, slot: true, status: true } })
    ]);
    const spById = new Map(sps.map((s) => [s.id, s]));
    const branchById = new Map(branches.map((b) => [b.id, b]));
    const batchKey = (b: string, d: string, s: string) => `${b}|${d}|${s}`;
    const batchByKey = new Map(batches.map((b) => [batchKey(b.branchId, dateToString(b.mealDate), b.slot), b.status]));

    type Group = { branch: { id: string; code: string; name: string }; mealDate: string; slot: string; batchStatus: string | null; canStart: boolean; total: number; servicePoints: Array<{ servicePoint: { id: string; name: string; gateLabel: string | null }; mealCount: number }> };
    const groups = new Map<string, Group>();
    for (const r of rows) {
      const date = dateToString(r.mealDate);
      const key = batchKey(r.branchId, date, r.slot);
      const g = groups.get(key) ?? { branch: branchById.get(r.branchId)!, mealDate: date, slot: r.slot, batchStatus: batchByKey.get(key) ?? null, canStart: date === today && !batchByKey.has(key), total: 0, servicePoints: [] };
      const sp = spById.get(r.servicePointId)!;
      g.servicePoints.push({ servicePoint: { id: sp.id, name: sp.name, gateLabel: sp.gateLabel }, mealCount: r._count._all });
      g.total += r._count._all;
      groups.set(key, g);
    }
    const list = [...groups.values()].sort((a, b) => (a.mealDate + a.slot).localeCompare(b.mealDate + b.slot));
    for (const g of list) g.servicePoints.sort((a, b) => a.servicePoint.name.localeCompare(b.servicePoint.name));
    return { today, from, to, groups: list };
  }

  public static async batches(branchIds: string[], range: { from?: string; to?: string }) {
    const today = businessDate();
    const from = range.from ?? addDays(today, -2);
    const to = range.to ?? addDays(today, KITCHEN_DEMAND_HORIZON_DAYS);
    const rows = await prisma.messMealBatch.findMany({
      where: { branchId: { in: branchIds }, mealDate: { gte: dateFromString(from), lte: dateFromString(to) } },
      orderBy: [{ mealDate: 'desc' }, { slot: 'asc' }],
      take: 100,
      select: BATCH_SELECT
    });
    const breakdown = await breakdownFor(prisma, rows.map((r) => r.id));
    return { today, batches: rows.map((r) => toBatchDto(r, breakdown.get(r.id))) };
  }

  // ================================================================================================ start (CHEF)
  /**
   * Starts the aggregate batch for ONE branch + meal date + slot. Only for TODAY (Asia/Kolkata). The eligible SCHEDULED meals of ACTIVE subscriptions are attached in
   * ONE statement (compare-and-set on status + batchId IS NULL), so a racing pause and the attachment have exactly one winner. 0 eligible meals => 409.
   */
  public static async start(actor: { userId: string; branchIds: string[] }, body: { branchId: string; mealDate: string; slot: string }, context?: AuditContext) {
    if (!actor.branchIds.includes(body.branchId)) throw new AppError('You do not have access to the requested branch', 403, 'BRANCH_FORBIDDEN');
    if (body.mealDate !== businessDate()) throw new AppError('A batch can only be started for today', 409, 'BATCH_DATE_NOT_TODAY');

    const existing = async () => {
      const b = await prisma.messMealBatch.findUnique({ where: { branchId_mealDate_slot: { branchId: body.branchId, mealDate: dateFromString(body.mealDate), slot: body.slot } }, select: BATCH_SELECT });
      if (!b) return null;
      const bd = await breakdownFor(prisma, [b.id]);
      return { changed: false, batch: toBatchDto(b, bd.get(b.id)) };
    };
    const already = await existing();
    if (already) return already;

    try {
      return await prisma.$transaction(
        async (tx) => {
          // P10B same-day rule: the first statement takes the (branch, date, slot) batch key shared with the same-day activation check, so exactly one of them goes first.
          await lockRow.batchKey(tx, body.branchId, body.mealDate, body.slot);
          const created = await tx.messMealBatch.create({ data: { branchId: body.branchId, mealDate: dateFromString(body.mealDate), slot: body.slot, status: BATCH_STATUS.PREPARING, mealCount: 1, startedByUserId: actor.userId } });
          const attached = await tx.$executeRaw`
            UPDATE "mess_daily_orders" m SET "batchId" = ${created.id}, "updatedAt" = now()
            FROM "mess_subscriptions" s
            WHERE s."id" = m."messSubscriptionId" AND s."status" = 'ACTIVE'
              AND m."branchId" = ${body.branchId} AND m."date" = ${body.mealDate}::date AND m."slot" = ${body.slot}
              AND m."status" = 'SCHEDULED' AND m."batchId" IS NULL`;
          if (attached < 1) throw new AppError('There are no scheduled meals to prepare for this slot', 409, 'NO_ELIGIBLE_MEALS');
          const counted = await tx.messMeal.count({ where: { batchId: created.id } });
          if (counted !== attached) throw new AppError('The batch membership could not be verified. Please retry.', 409, 'BATCH_CHANGED');
          await tx.messMealBatch.update({ where: { id: created.id }, data: { mealCount: attached } });
          await AuditService.record({ actor: { userId: actor.userId, roles: ['CHEF'] }, action: 'MESS_BATCH_STARTED', entity: 'MessMealBatch', entityId: created.id, payload: { branchId: body.branchId, mealDate: body.mealDate, slot: body.slot, mealCount: attached }, context }, tx);
          const row = await tx.messMealBatch.findUniqueOrThrow({ where: { id: created.id }, select: BATCH_SELECT });
          const bd = await breakdownFor(tx, [row.id]);
          return { changed: true, batch: toBatchDto(row, bd.get(row.id)) };
        },
        { maxWait: 10000, timeout: 30000 }
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        const raced = await existing();
        if (raced) return raced; // another CHEF (or a double click) started it first: same batch, no duplicate
      }
      throw err;
    }
  }

  // ================================================================================================ ready (CHEF)
  public static async markReady(actor: { userId: string; branchIds: string[] }, batchId: string, context?: AuditContext) {
    const peek = await prisma.messMealBatch.findUnique({ where: { id: batchId }, select: { branchId: true } });
    // an unknown batch and a batch of another branch are indistinguishable
    if (!peek || !actor.branchIds.includes(peek.branchId)) throw new AppError('Batch not found', 404, 'NOT_FOUND');
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "mess_meal_batches" WHERE "id" = ${batchId} FOR UPDATE`;
      const cur = await tx.messMealBatch.findUniqueOrThrow({ where: { id: batchId }, select: { status: true } });
      let changed = false;
      if (cur.status === BATCH_STATUS.PREPARING) {
        const cas = await tx.messMealBatch.updateMany({ where: { id: batchId, status: BATCH_STATUS.PREPARING }, data: { status: BATCH_STATUS.READY, readyAt: new Date(), readyByUserId: actor.userId } });
        changed = cas.count === 1;
        if (changed) await AuditService.record({ actor: { userId: actor.userId, roles: ['CHEF'] }, action: 'MESS_BATCH_READY', entity: 'MessMealBatch', entityId: batchId, payload: {}, context }, tx);
      }
      const row = await tx.messMealBatch.findUniqueOrThrow({ where: { id: batchId }, select: BATCH_SELECT });
      const bd = await breakdownFor(tx, [batchId]);
      return { changed, batch: toBatchDto(row, bd.get(batchId)) };
    });
  }
}
