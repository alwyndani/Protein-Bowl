import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { BranchFilter, branchWhere } from '../../authz/branchScope.js';

export const KOT_STATUSES = ['QUEUED', 'PREPARING', 'READY', 'SERVED'] as const;

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

  public static async updateKOTStatus(kotId: string, status: string) {
    if (!(KOT_STATUSES as readonly string[]).includes(status)) {
      throw new AppError('Invalid KOT status', 400, 'INVALID_STATUS');
    }

    const updated = await prisma.kitchenOrderTicket.update({
      where: { id: kotId },
      data: { status },
      include: { order: { select: { id: true, orderNumber: true, status: true } } }
    });

    // Sync order status
    if (status === 'PREPARING') {
      await prisma.order.update({ where: { id: updated.orderId }, data: { status: 'PREPARING' } });
    } else if (status === 'READY') {
      await prisma.order.update({ where: { id: updated.orderId }, data: { status: 'READY' } });
    }
    return updated;
  }
}
