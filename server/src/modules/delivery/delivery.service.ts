import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';

export const DELIVERY_STATUSES = ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED'] as const;

export interface DeliveryAssignmentFilter {
  driverId?: string;
  branchId?: string;
}

export class DeliveryService {
  /**
   * Assignments matching the filter. The filter is built by the authorization layer: drivers are always restricted to
   * their own EmployeeProfile id; only explicitly global roles may filter by arbitrary driver/branch.
   * Only the order fields a fulfilment role needs are returned (no full customer profile).
   */
  public static async getDeliveryAssignments(filter: DeliveryAssignmentFilter) {
    const where: Record<string, unknown> = {};
    if (filter.driverId) where.driverId = filter.driverId;
    if (filter.branchId) where.branchId = filter.branchId;

    return await prisma.deliveryAssignment.findMany({
      where,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            deliveryAddress: true,
            deliveryAddressSnapshot: true,
            paymentMethod: true,
            paymentStatus: true,
            netAmount: true
          }
        },
        driver: { select: { id: true, employeeCode: true, fullName: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /** Owner (driver) and branch of an assignment, or null when it does not exist - used to authorize writes. */
  public static async findAssignmentOwner(assignmentId: string) {
    return await prisma.deliveryAssignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, driverId: true, branchId: true }
    });
  }

  public static async updateDeliveryStatus(assignmentId: string, status: string, podImageUrl?: string, temp?: number) {
    if (!(DELIVERY_STATUSES as readonly string[]).includes(status)) {
      throw new AppError('Invalid delivery status', 400, 'INVALID_STATUS');
    }

    const updated = await prisma.deliveryAssignment.update({
      where: { id: assignmentId },
      data: {
        status,
        podImageUrl: podImageUrl || undefined,
        temperatureC: temp || undefined,
        deliveryTime: status === 'DELIVERED' ? new Date() : undefined
      },
      include: { order: { select: { id: true, orderNumber: true, status: true } } }
    });

    if (status === 'DELIVERED') {
      await prisma.order.update({ where: { id: updated.orderId }, data: { status: 'DELIVERED' } });
    } else if (status === 'IN_TRANSIT') {
      await prisma.order.update({ where: { id: updated.orderId }, data: { status: 'DISPATCHED' } });
    }
    return updated;
  }
}
