import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class KDSService {
  public static async getBranchTickets(branchId?: string) {
    const where: any = {};
    if (branchId) where.branchId = branchId;

    return await prisma.kitchenOrderTicket.findMany({
      where,
      include: {
        order: {
          include: { customerProfile: true }
        },
        branch: true
      },
      orderBy: { createdAt: 'asc' }
    });
  }

  public static async updateKOTStatus(kotId: string, status: string) {
    const validStatuses = ['QUEUED', 'PREPARING', 'READY', 'SERVED'];
    if (!validStatuses.includes(status)) throw new Error('Invalid KOT status');

    const updated = await prisma.kitchenOrderTicket.update({
      where: { id: kotId },
      data: { status },
      include: { order: true }
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
