import { Request, Response, NextFunction } from 'express';
import { RoleEnum } from '@prisma/client';
import { DeliveryService } from './delivery.service.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditService } from '../audit/audit.service.js';
import { BranchScope, getRequestScope } from '../../authz/branchScope.js';
import type { TransitionActor } from '../order/orderTransition.service.js';

async function denyDriverAccess(req: Request, scope: BranchScope, action: string, payload: Record<string, unknown>): Promise<never> {
  await AuditService.recordSafe({
    actor: { userId: scope.userId, roles: scope.roles },
    action,
    entity: 'DeliveryAssignment',
    payload,
    context: AuditService.contextFromRequest(req)
  });
  throw new AppError('You do not have access to this delivery work', 403, 'DRIVER_FORBIDDEN');
}

export class DeliveryController {
  public static async getAssignments(req: Request, res: Response, next: NextFunction) {
    try {
      const scope = await getRequestScope(req);
      const requestedDriver = typeof req.query.driverId === 'string' ? req.query.driverId : undefined;
      const requestedBranch = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;

      let filter: { driverId?: string; branchId?: string };
      if (scope.isGlobal || scope.isGlobalRead) {
        // Explicit global (read) roles may filter freely.
        filter = { driverId: requestedDriver, branchId: requestedBranch };
      } else {
        // Drivers see ONLY their own work. The client can never choose another driver or an unassigned branch.
        if (!scope.employeeProfileId) {
          throw new AppError('No employee profile: this account cannot access delivery work', 403, 'NO_EMPLOYEE_PROFILE');
        }
        if (requestedDriver && requestedDriver !== scope.employeeProfileId) {
          await denyDriverAccess(req, scope, 'DELIVERY_ACCESS_DENIED', { reason: 'driverId_spoof', requestedDriver });
        }
        if (requestedBranch && !scope.branchIds.includes(requestedBranch)) {
          await denyDriverAccess(req, scope, 'BRANCH_ACCESS_DENIED', { reason: 'branch_not_assigned', requestedBranch });
        }
        filter = { driverId: scope.employeeProfileId, branchId: requestedBranch };
      }

      const items = await DeliveryService.getDeliveryAssignments(filter);
      return ApiResponse.success(res, items, 'Delivery assignments retrieved');
    } catch (err) { next(err); }
  }

  public static async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { assignmentId } = req.params;
      const { status, podImageUrl, temperatureC } = req.body;

      const assignment = await DeliveryService.findAssignmentOwner(assignmentId);
      if (!assignment) throw new AppError('Delivery assignment not found', 404, 'NOT_FOUND');

      const scope = await getRequestScope(req);
      if (!scope.isGlobal) {
        // MD/other read-only roles are already rejected by the delivery:write permission; drivers may only update their own work.
        const isOwnWork = !!scope.employeeProfileId && assignment.driverId === scope.employeeProfileId && scope.roles.includes(RoleEnum.DELIVERY);
        if (!isOwnWork) {
          await denyDriverAccess(req, scope, 'DELIVERY_ACCESS_DENIED', { reason: 'not_assigned_driver', assignmentId });
        }
      }

      const actor: TransitionActor = { kind: 'USER', userId: scope.userId, roles: scope.roles, branchIds: scope.branchIds, isGlobal: scope.isGlobal };
      const updated = await DeliveryService.updateDeliveryStatus(assignmentId, status, actor, AuditService.contextFromRequest(req), podImageUrl, temperatureC);
      return ApiResponse.success(res, updated, 'Delivery status updated');
    } catch (err) { next(err); }
  }
}
