import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditContext } from '../audit/audit.service.js';
import { OrderTransitionService, TransitionActor } from '../order/orderTransition.service.js';

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

  /**
   * Update a delivery assignment. The ORDER status changes only through OrderTransitionService in the SAME transaction
   * (IN_TRANSIT -> order DISPATCHED, DELIVERED -> order DELIVERED); if the order may not make that move the whole update
   * is rejected. A delivered assignment is final. Nothing here writes Order.status directly.
   */
  public static async updateDeliveryStatus(
    assignmentId: string,
    status: string,
    actor: TransitionActor,
    context?: AuditContext,
    podImageUrl?: string,
    temp?: number
  ) {
    if (!(DELIVERY_STATUSES as readonly string[]).includes(status)) {
      throw new AppError('Invalid delivery status', 400, 'INVALID_STATUS');
    }

    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "delivery_assignments" WHERE "id" = ${assignmentId} FOR UPDATE`;
      const current = await tx.deliveryAssignment.findUnique({ where: { id: assignmentId }, select: { id: true, orderId: true, status: true } });
      if (!current) throw new AppError('Delivery assignment not found', 404, 'NOT_FOUND');
      if (current.status === 'DELIVERED' && status !== 'DELIVERED') {
        throw new AppError('A delivered assignment can no longer be changed', 409, 'INVALID_DELIVERY_TRANSITION');
      }

      if (status === 'DELIVERED') {
        await OrderTransitionService.transition({ orderId: current.orderId, to: 'DELIVERED', actor, context }, tx);
      } else if (status === 'IN_TRANSIT') {
        await OrderTransitionService.transition({ orderId: current.orderId, to: 'DISPATCHED', actor, context }, tx);
      }

      return await tx.deliveryAssignment.update({
        where: { id: assignmentId },
        data: {
          status,
          podImageUrl: podImageUrl || undefined,
          temperatureC: temp || undefined,
          deliveryTime: status === 'DELIVERED' && current.status !== 'DELIVERED' ? new Date() : undefined
        },
        include: { order: { select: { id: true, orderNumber: true, status: true } } }
      });
    });
  }
}
