import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class DeliveryService {
  public static async getDeliveryAssignments(driverId?: string) {
    const where: any = {};
    if (driverId) where.driverId = driverId;
    return await prisma.deliveryAssignment.findMany({
      where,
      include: {
        order: { include: { customerProfile: true } },
        driver: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  public static async updateDeliveryStatus(assignmentId: string, status: string, podImageUrl?: string, temp?: number) {
    const updated = await prisma.deliveryAssignment.update({
      where: { id: assignmentId },
      data: {
        status,
        podImageUrl: podImageUrl || undefined,
        temperatureC: temp || undefined,
        deliveryTime: status === 'DELIVERED' ? new Date() : undefined
      },
      include: { order: true }
    });

    if (status === 'DELIVERED') {
      await prisma.order.update({ where: { id: updated.orderId }, data: { status: 'DELIVERED' } });
    } else if (status === 'IN_TRANSIT') {
      await prisma.order.update({ where: { id: updated.orderId }, data: { status: 'DISPATCHED' } });
    }

    return updated;
  }
}
