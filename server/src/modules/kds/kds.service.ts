import { Prisma, RoleEnum } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditContext, AuditService } from '../audit/audit.service.js';
import { OrderTransitionService } from '../order/orderTransition.service.js';
import {
  KITCHEN_ORDER_SELECT,
  KITCHEN_RECIPE_SELECT,
  KITCHEN_SECTION_LIMIT,
  KITCHEN_STATUSES,
  KitchenEventTimes,
  KitchenOrderDto,
  KitchenOrderRow,
  KitchenRecipeRow,
  KitchenStatus,
  toKitchenOrderDto
} from './kds.dto.js';

type Db = Prisma.TransactionClient | typeof prisma;

export interface KitchenSection {
  total: number;
  truncated: boolean;
  items: KitchenOrderDto[];
}
export interface KitchenQueue {
  serverTime: string;
  sectionLimit: number;
  sections: Record<KitchenStatus, KitchenSection>;
}

/** The three production kitchen actions and the transition each one maps to. Anything else is not a kitchen action. */
export const KITCHEN_ACTIONS = {
  accept: 'ACCEPTED',
  'start-preparing': 'PREPARING',
  'mark-ready': 'READY'
} as const;
export type KitchenAction = keyof typeof KITCHEN_ACTIONS;

/** Raised when an order is not visible to the caller: foreign branch, unrouted, not eligible or non-existent are indistinguishable. */
class KitchenOrderNotVisible extends AppError {
  constructor(public readonly existed: boolean) {
    super('Order not found', 404, 'ORDER_NOT_FOUND');
  }
}

/**
 * Orders the kitchen may work on. This predicate is the ONLY definition of kitchen eligibility:
 * DIRECT + ONLINE + PAID (so historical COD rows and refunded / unpaid orders never appear) and routed to one of the caller's branches
 * (an unrouted order has kitchenBranchId = NULL and can never match `in`).
 */
function eligibleWhere(branchIds: string[]): Prisma.OrderWhereInput {
  return { orderType: 'DIRECT', paymentMethod: 'ONLINE', paymentStatus: 'PAID', kitchenBranchId: { in: branchIds } };
}

export class KDSService {
  // ------------------------------------------------------------------------------------------------ reads
  public static async getQueue(branchIds: string[]): Promise<KitchenQueue> {
    const serverTime = new Date();
    const where = eligibleWhere(branchIds);

    const perStatus = await Promise.all(
      KITCHEN_STATUSES.map(async (status) => {
        const sectionWhere: Prisma.OrderWhereInput = { ...where, status };
        const orderBy: Prisma.OrderOrderByWithRelationInput[] =
          status === 'READY' ? [{ updatedAt: 'desc' }, { id: 'desc' }] : [{ confirmedAt: 'asc' }, { orderNumber: 'asc' }];
        const [total, rows] = await Promise.all([
          prisma.order.count({ where: sectionWhere }),
          prisma.order.findMany({ where: sectionWhere, orderBy, take: KITCHEN_SECTION_LIMIT, select: KITCHEN_ORDER_SELECT })
        ]);
        return { status, total, rows };
      })
    );

    const allRows = perStatus.flatMap((s) => s.rows);
    const hydration = await this.hydrate(prisma, allRows);

    const sections = {} as Record<KitchenStatus, KitchenSection>;
    for (const s of perStatus) {
      sections[s.status] = {
        total: s.total,
        truncated: s.total > s.rows.length,
        items: s.rows.map((row) => toKitchenOrderDto(row, hydration.events.get(row.id) ?? {}, hydration.recipeById, hydration.recipeIdByProductId, serverTime))
      };
    }
    return { serverTime: serverTime.toISOString(), sectionLimit: KITCHEN_SECTION_LIMIT, sections };
  }

  /** One order, only if it is a kitchen order (eligible + one of the four kitchen states) of one of the caller's branches. */
  public static async getOrder(orderId: string, branchIds: string[], db: Db = prisma): Promise<KitchenOrderDto | null> {
    const row = await db.order.findFirst({
      where: { ...eligibleWhere(branchIds), id: orderId, status: { in: [...KITCHEN_STATUSES] } },
      select: KITCHEN_ORDER_SELECT
    });
    if (!row) return null;
    const serverTime = new Date();
    const hydration = await this.hydrate(db, [row]);
    return toKitchenOrderDto(row, hydration.events.get(row.id) ?? {}, hydration.recipeById, hydration.recipeIdByProductId, serverTime);
  }

  /** Batched lookups for a set of rows: status timestamps from OrderEvent, and recipe projections (new rows by recipeId, legacy rows via product). */
  private static async hydrate(db: Db, rows: KitchenOrderRow[]) {
    const events = new Map<string, KitchenEventTimes>();
    const recipeById = new Map<string, KitchenRecipeRow>();
    const recipeIdByProductId = new Map<string, string | null>();
    if (rows.length === 0) return { events, recipeById, recipeIdByProductId };

    const orderIds = rows.map((r) => r.id);
    const eventRows = await db.orderEvent.findMany({
      where: { orderId: { in: orderIds }, toStatus: { in: ['ACCEPTED', 'PREPARING', 'READY'] } },
      select: { orderId: true, toStatus: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    });
    for (const e of eventRows) {
      const cur = events.get(e.orderId) ?? {};
      cur[e.toStatus as 'ACCEPTED' | 'PREPARING' | 'READY'] = e.createdAt; // ascending order => the latest event wins
      events.set(e.orderId, cur);
    }

    const legacyProductIds = new Set<string>();
    const recipeIds = new Set<string>();
    for (const r of rows) {
      for (const item of r.items) {
        if (item.recipeId) recipeIds.add(item.recipeId);
        else if (item.productId) legacyProductIds.add(item.productId);
      }
    }
    if (legacyProductIds.size > 0) {
      const products = await db.product.findMany({ where: { id: { in: [...legacyProductIds] } }, select: { id: true, recipeId: true } });
      for (const p of products) {
        recipeIdByProductId.set(p.id, p.recipeId);
        if (p.recipeId) recipeIds.add(p.recipeId);
      }
    }
    if (recipeIds.size > 0) {
      const recipes = await db.recipe.findMany({ where: { id: { in: [...recipeIds] } }, select: KITCHEN_RECIPE_SELECT });
      for (const r of recipes) recipeById.set(r.id, r as KitchenRecipeRow);
    }
    return { events, recipeById, recipeIdByProductId };
  }

  // ------------------------------------------------------------------------------------------------ actions
  /**
   * One kitchen action, in ONE transaction: lock the order row, decide visibility from database truth, then run the transition through
   * OrderTransitionService (which re-checks status, payment, branch, and writes OrderEvent + audit). Visibility and transition therefore
   * see the same locked row (no check-then-act gap), and the database decides every race.
   *
   * A foreign-branch, unrouted, ineligible or non-existent order is the same 404 (existence is not revealed); an attempt on an existing
   * order is audited as BRANCH_ACCESS_DENIED.
   */
  public static async act(
    orderId: string,
    action: KitchenAction,
    caller: { userId: string; branchIds: string[] },
    context?: AuditContext
  ): Promise<{ changed: boolean; order: KitchenOrderDto }> {
    const to = KITCHEN_ACTIONS[action];
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${orderId} FOR UPDATE`;
        const order = await tx.order.findUnique({
          where: { id: orderId },
          select: { orderType: true, paymentMethod: true, paymentStatus: true, kitchenBranchId: true }
        });
        const visible =
          !!order &&
          order.orderType === 'DIRECT' &&
          order.paymentMethod === 'ONLINE' &&
          order.paymentStatus === 'PAID' &&
          !!order.kitchenBranchId &&
          caller.branchIds.includes(order.kitchenBranchId);
        if (!visible) throw new KitchenOrderNotVisible(!!order);

        const result = await OrderTransitionService.transition(
          { orderId, to, actor: { kind: 'USER', userId: caller.userId, roles: [RoleEnum.CHEF], branchIds: caller.branchIds, isGlobal: false }, context },
          tx
        );
        const dto = await this.getOrder(orderId, caller.branchIds, tx);
        if (!dto) throw new KitchenOrderNotVisible(true);
        return { changed: result.changed, order: dto };
      });
    } catch (err) {
      if (err instanceof KitchenOrderNotVisible) {
        if (err.existed) {
          await AuditService.recordSafe({
            actor: { userId: caller.userId, roles: [RoleEnum.CHEF] },
            action: 'BRANCH_ACCESS_DENIED',
            entity: 'KitchenOrder',
            entityId: orderId,
            payload: { mode: 'write', action, code: 'ORDER_NOT_VISIBLE' },
            context
          });
        }
        throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
      }
      // Defence in depth: the transition's own branch gate must look exactly like "not found" to the kitchen API.
      if (err instanceof AppError && err.errorCode === 'BRANCH_FORBIDDEN') throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
      throw err;
    }
  }
}
