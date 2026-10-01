import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class MDService {
  public static async getEnterpriseMetrics() {
    const totalOrdersCount = await prisma.order.count();
    const aggregateRevenue = await prisma.order.aggregate({
      where: { paymentStatus: 'PAID' },
      _sum: { netAmount: true }
    });

    const activeMessSubscriptions = await prisma.messSubscription.count({ where: { status: 'ACTIVE' } });
    const branches = await prisma.kitchenBranch.findMany({
      include: {
        _count: { select: { orders: true, employees: true } }
      }
    });

    const recentOrders = await prisma.order.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { kitchenBranch: true, customerProfile: true }
    });

    return {
      totalOrdersCount,
      totalRevenue: aggregateRevenue._sum.netAmount || 0,
      activeMessSubscriptions,
      branchesCount: branches.length,
      branches,
      recentOrders
    };
  }
}
