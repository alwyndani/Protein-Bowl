import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { BranchFilter, branchWhere } from '../../authz/branchScope.js';
import { AuditContext } from '../audit/audit.service.js';
import { OrderTransitionService, TransitionActor } from '../order/orderTransition.service.js';

export const KOT_STATUSES = ['QUEUED', 'PREPARING', 'READY', 'SERVED'] as const;

/** Tickets only move forward; SERVED is terminal (no regression). Same-status requests are idempotent no-ops. */
const KOT_TRANSITIONS: Record<string, readonly string[]> = {
  QUEUED: ['PREPARING'],
  PREPARING: ['READY'],
  READY: ['SERVED'],
  SERVED: []
};

export class KDSService {
  /**
   * Tickets for the branches in `filter`. The filter is computed by the authorization layer; `{ all: true }` is only
   * ever supplied for explicitly global roles. Kitchen staff only receive what they need (customer first name/ID, not the
   * full customer profile).
   */
  public static async getBranchTickets(filter: BranchFilter) {
    return await prisma.kitchenOrderTicket.findMany({
      where: branchWhere(filter),
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            orderType: true,
            createdAt: true,
            customerProfile: { select: { fullName: true } }
          }
        },
        branch: { select: { id: true, code: true, name: true } }
      },
      orderBy: { createdAt: 'asc' }
    });
  }

  /** Branch a ticket belongs to (null when the ticket does not exist) - used to authorize writes. */
  public static async findTicketBranch(kotId: string): Promise<string | null> {
    const ticket = await prisma.kitchenOrderTicket.findUnique({ where: { id: kotId }, select: { branchId: true } });
    return ticket?.branchId ?? null;
  }

  /**
   * Move a ticket forward. The ORDER status is changed only through OrderTransitionService, in the SAME transaction:
   * if the order may not enter that status (unpaid, no branch, wrong state, role/branch not permitted) the whole change
   * is rejected and the ticket is left untouched. Nothing here writes Order.status directly.
   */
  public static async updateKOTStatus(kotId: string, status: string, actor: TransitionActor, context?: AuditContext) {
    if (!(KOT_STATUSES as readonly string[]).includes(status)) {
      throw new AppError('Invalid KOT status', 400, 'INVALID_STATUS');
    }

    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "kitchen_order_tickets" WHERE "id" = ${kotId} FOR UPDATE`;
      const ticket = await tx.kitchenOrderTicket.findUnique({ where: { id: kotId }, select: { id: true, orderId: true, status: true } });
      if (!ticket) throw new AppError('KOT not found', 404, 'NOT_FOUND');

      if (ticket.status !== status) {
        if (!(KOT_TRANSITIONS[ticket.status] ?? []).includes(status)) {
          throw new AppError(`A ticket that is ${ticket.status} cannot become ${status}`, 409, 'INVALID_KOT_TRANSITION');
        }
        if (status === 'PREPARING' || status === 'READY') {
          await OrderTransitionService.transition({ orderId: ticket.orderId, to: status, actor, context }, tx);
        }
        await tx.kitchenOrderTicket.update({ where: { id: kotId }, data: { status } });
      }

      return await tx.kitchenOrderTicket.findUnique({
        where: { id: kotId },
        include: { order: { select: { id: true, orderNumber: true, status: true } } }
      });
    });
  }
}
