import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditContext, AuditService } from '../audit/audit.service.js';
import { lockOrder } from '../payment/paymentOps.js';
import { sanitizeNote } from '../refund/cancellationPolicy.js';

/**
 * P8 manual kitchen routing: SUPER_ADMIN assigns a CONFIRMED + PAID + DIRECT + ONLINE order to an active kitchen branch by setting the
 * existing Order.kitchenBranchId. It changes NOTHING else (no status, no payment, no refund, no KOT, no chef transition).
 * Payment settlement never routes: a confirmed order with no branch is UNROUTED and invisible to every chef.
 */
export const routingBodySchema = z
  .object({
    branchId: z.string().uuid(),
    /** The branch the admin SAW (null = was unrouted). A mismatch means somebody else changed it meanwhile (409). The key is required. */
    expectedBranchId: z.string().uuid().nullable(),
    reason: z
      .string()
      .max(1000)
      .transform((v) => sanitizeNote(v))
      .refine((v): v is string => typeof v === 'string' && v.length >= 3, { message: 'A reason of at least 3 characters is required' })
  })
  .strict();
export type RoutingBody = z.infer<typeof routingBodySchema>;

export const routingListQuerySchema = z
  .object({
    routing: z.enum(['unrouted', 'routed', 'all']).default('unrouted'),
    limit: z.coerce.number().int().min(1).max(100).default(50)
  })
  .strict();

export interface RoutingResult {
  changed: boolean;
  orderId: string;
  orderNumber: string;
  status: string;
  previousBranchId: string | null;
  kitchenBranch: { id: string; code: string; name: string };
}

export class KitchenRoutingService {
  public static async assign(orderId: string, body: RoutingBody, actor: { userId: string; roles: readonly string[] }, context?: AuditContext): Promise<RoutingResult> {
    return await prisma.$transaction(async (tx) => {
      // Lock order: the order row first (the same lock the transition service and cancellation use), then the branch row.
      await lockOrder(tx, orderId);
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { id: true, orderNumber: true, status: true, paymentStatus: true, paymentMethod: true, orderType: true, kitchenBranchId: true }
      });
      if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
      if (order.status !== 'CONFIRMED' || order.paymentStatus !== 'PAID' || order.orderType !== 'DIRECT' || order.paymentMethod !== 'ONLINE') {
        throw new AppError('This order cannot be routed to a kitchen right now', 409, 'ORDER_NOT_ROUTABLE');
      }

      const target = await tx.kitchenBranch.findUnique({ where: { id: body.branchId }, select: { id: true, code: true, name: true } });

      // Same branch as already assigned: an idempotent no-op (no write, no audit).
      if (order.kitchenBranchId === body.branchId && target) {
        return { changed: false, orderId: order.id, orderNumber: order.orderNumber, status: order.status, previousBranchId: order.kitchenBranchId, kitchenBranch: target };
      }
      if ((order.kitchenBranchId ?? null) !== body.expectedBranchId) {
        throw new AppError('The kitchen assignment changed in the meantime. Refresh and try again.', 409, 'KITCHEN_BRANCH_CHANGED');
      }

      // The target must exist and be active; FOR SHARE keeps a concurrent branch deactivation from slipping in between check and write.
      const locked = await tx.$queryRaw<Array<{ id: string; isActive: boolean }>>`SELECT "id", "isActive" FROM "kitchen_branches" WHERE "id" = ${body.branchId} FOR SHARE`;
      if (locked.length !== 1 || !locked[0].isActive || !target) {
        throw new AppError('The selected kitchen branch is not available', 422, 'KITCHEN_BRANCH_INVALID');
      }

      // Compare-and-set on status and previous branch: nothing but kitchenBranchId changes.
      const updated = await tx.order.updateMany({
        where: { id: order.id, status: 'CONFIRMED', kitchenBranchId: order.kitchenBranchId },
        data: { kitchenBranchId: body.branchId }
      });
      if (updated.count !== 1) throw new AppError('The order was changed by another request. Please retry.', 409, 'ORDER_STATE_CONFLICT');

      await AuditService.record(
        {
          actor: { userId: actor.userId, roles: actor.roles },
          action: order.kitchenBranchId ? 'ORDER_KITCHEN_BRANCH_REASSIGNED' : 'ORDER_KITCHEN_BRANCH_ASSIGNED',
          entity: 'Order',
          entityId: order.id,
          payload: { orderNumber: order.orderNumber, fromBranchId: order.kitchenBranchId, toBranchId: body.branchId, toBranchCode: target.code, reason: body.reason },
          context
        },
        tx
      );

      return { changed: true, orderId: order.id, orderNumber: order.orderNumber, status: order.status, previousBranchId: order.kitchenBranchId, kitchenBranch: target };
    });
  }

  /** SUPER_ADMIN read model: CONFIRMED + PAID customer orders by routing state. Routing-relevant fields only (area = city + postal code). */
  public static async list(routing: 'unrouted' | 'routed' | 'all', limit: number) {
    const where = {
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      orderType: 'DIRECT',
      paymentMethod: 'ONLINE',
      ...(routing === 'unrouted' ? { kitchenBranchId: null } : routing === 'routed' ? { kitchenBranchId: { not: null } } : {})
    };
    const serverTime = new Date();
    const [total, rows] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: [{ confirmedAt: 'asc' }, { orderNumber: 'asc' }],
        take: limit,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          confirmedAt: true,
          kitchenBranch: { select: { id: true, code: true, name: true } },
          // Only city + postalCode are ever read out of this snapshot (never name, phone, email or street).
          deliveryAddressSnapshot: true,
          items: { select: { id: true, itemTitle: true, variantName: true, quantity: true }, orderBy: [{ itemTitle: 'asc' }, { id: 'asc' }] }
        }
      })
    ]);
    const pick = (snapshot: unknown, key: 'city' | 'postalCode'): string | null => {
      const v = snapshot && typeof snapshot === 'object' ? (snapshot as Record<string, unknown>)[key] : null;
      return typeof v === 'string' ? v : null;
    };
    return {
      serverTime: serverTime.toISOString(),
      routing,
      total,
      truncated: total > rows.length,
      items: rows.map((r) => ({
        id: r.id,
        orderNumber: r.orderNumber,
        status: r.status,
        confirmedAt: r.confirmedAt ? r.confirmedAt.toISOString() : null,
        kitchenBranch: r.kitchenBranch,
        deliveryArea: { city: pick(r.deliveryAddressSnapshot, 'city'), postalCode: pick(r.deliveryAddressSnapshot, 'postalCode') },
        items: r.items.map((i) => ({ id: i.id, title: i.itemTitle, variantName: i.variantName, quantity: i.quantity }))
      }))
    };
  }
}
