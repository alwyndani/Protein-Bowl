import { NextFunction, Request, Response } from 'express';
import { RoleEnum } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { AppError } from '../../middleware/error.middleware.js';
import { BranchScope, getRequestScope } from '../../authz/branchScope.js';
import { AuditService } from '../audit/audit.service.js';
import { DeliveryService, DriverCaller, ReportFailureBody } from './delivery.service.js';
import { DeliveryProofService, VerifyBody } from './deliveryProof.service.js';
import { DeliveryResolutionService } from './deliveryResolution.service.js';

/**
 * The DELIVERY employee's identity and authorized branches, from DATABASE truth (getRequestScope). A client never supplies a driver or branch
 * for these endpoints: the driver is always the authenticated employee, the branches are always the caller's own assignments.
 */
async function resolveDriver(req: Request): Promise<{ scope: BranchScope; caller: DriverCaller }> {
  const scope = await getRequestScope(req);
  if (!scope.employeeProfileId) throw new AppError('No employee profile: this account cannot access delivery work', 403, 'NO_EMPLOYEE_PROFILE');
  if (scope.branchIds.length === 0) {
    await AuditService.recordSafe({
      actor: { userId: scope.userId, roles: scope.roles },
      action: 'BRANCH_ACCESS_DENIED',
      entity: 'DeliveryQueue',
      payload: { code: 'NO_BRANCH_ASSIGNMENT' },
      context: AuditService.contextFromRequest(req)
    });
    throw new AppError('No branch assignment: this account is not assigned to any branch', 403, 'NO_BRANCH_ASSIGNMENT');
  }
  return { scope, caller: { userId: scope.userId, employeeProfileId: scope.employeeProfileId, branchIds: [...scope.branchIds] } };
}

export class DeliveryController {
  /** Driver queue: own branches (optionally narrowed to ONE of them). */
  public static async getQueue(req: Request, res: Response, next: NextFunction) {
    try {
      const { scope, caller } = await resolveDriver(req);
      const requested = typeof req.query.branchId === 'string' && req.query.branchId ? req.query.branchId : undefined;
      if (requested && !scope.branchIds.includes(requested)) {
        await AuditService.recordSafe({
          actor: { userId: scope.userId, roles: scope.roles },
          action: 'BRANCH_ACCESS_DENIED',
          entity: 'DeliveryQueue',
          payload: { mode: 'read', requestedBranchId: requested, code: 'BRANCH_FORBIDDEN' },
          context: AuditService.contextFromRequest(req)
        });
        throw new AppError('You do not have access to the requested branch', 403, 'BRANCH_FORBIDDEN');
      }
      const selected = requested ? [requested] : caller.branchIds;
      const [queue, branches] = await Promise.all([
        DeliveryService.getDriverQueue({ ...caller, branchIds: selected }),
        prisma.kitchenBranch.findMany({ where: { id: { in: scope.branchIds }, isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } })
      ]);
      return ApiResponse.success(res, { ...queue, branches, selectedBranchIds: selected }, 'Delivery queue retrieved');
    } catch (err) {
      next(err);
    }
  }

  /** Post-claim detail: only the assigned driver gets it; everything else is the same 404. */
  public static async getOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const { caller } = await resolveDriver(req);
      const dto = await DeliveryService.getOwnedOrder(req.params.id, caller);
      if (!dto) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
      return ApiResponse.success(res, dto, 'Delivery order retrieved');
    } catch (err) {
      next(err);
    }
  }

  public static async claim(req: Request, res: Response, next: NextFunction) {
    try {
      const { caller } = await resolveDriver(req);
      const result = await DeliveryService.claim(req.params.id, caller, AuditService.contextFromRequest(req));
      return ApiResponse.success(res, result, result.changed ? 'Order claimed' : 'No change: you already claimed this order');
    } catch (err) {
      next(err);
    }
  }

  public static async dispatch(req: Request, res: Response, next: NextFunction) {
    try {
      const { caller } = await resolveDriver(req);
      const result = await DeliveryService.dispatch(req.params.id, caller, AuditService.contextFromRequest(req));
      return ApiResponse.success(res, result, result.changed ? 'Order dispatched' : 'No change: the order was already dispatched');
    } catch (err) {
      next(err);
    }
  }

  public static async reportFailure(req: Request, res: Response, next: NextFunction) {
    try {
      const { caller } = await resolveDriver(req);
      const result = await DeliveryService.reportFailure(req.params.id, req.body as ReportFailureBody, caller, AuditService.contextFromRequest(req));
      return ApiResponse.success(res, result, result.changed ? 'Issue reported' : 'No change: an issue was already reported');
    } catch (err) {
      next(err);
    }
  }

  /** P9C: the driver resumes a retry assigned to them. */
  public static async resume(req: Request, res: Response, next: NextFunction) {
    try {
      const { caller } = await resolveDriver(req);
      const result = await DeliveryResolutionService.resume(req.params.id, caller, AuditService.contextFromRequest(req));
      return ApiResponse.success(res, result, result.changed ? 'Delivery resumed' : 'No change: the delivery is already under way');
    } catch (err) {
      next(err);
    }
  }

  /** Delivery Code verification (P9B). receivedAt is taken before anything can wait on a lock (see DeliveryProofService.verifyDelivery). */
  public static async verifyDelivery(req: Request, res: Response, next: NextFunction) {
    try {
      const receivedAt = new Date();
      const { caller } = await resolveDriver(req);
      const result = await DeliveryProofService.verifyDelivery(req.params.id, (req.body as VerifyBody).code, caller, receivedAt, AuditService.contextFromRequest(req));
      res.set('Cache-Control', 'no-store');
      return ApiResponse.success(res, result, result.changed ? 'Delivery completed' : 'No change: the delivery was already completed');
    } catch (err) {
      next(err);
    }
  }

  /** SUPER_ADMIN / MD read-only monitor of ONE explicit branch. */
  public static async getMonitor(req: Request, res: Response, next: NextFunction) {
    try {
      const branchId = typeof req.query.branchId === 'string' && req.query.branchId ? req.query.branchId : undefined;
      if (!branchId) throw new AppError('A branchId is required to read the delivery monitor', 400, 'BRANCH_REQUIRED');
      const branch = await prisma.kitchenBranch.findUnique({ where: { id: branchId }, select: { id: true, code: true, name: true } });
      if (!branch) throw new AppError('Branch not found', 404, 'BRANCH_NOT_FOUND');
      const monitor = await DeliveryService.getMonitor(branchId);
      return ApiResponse.success(res, { ...monitor, branch, readOnly: !req.user!.roles.includes(RoleEnum.SUPER_ADMIN) }, 'Delivery monitor retrieved');
    } catch (err) {
      next(err);
    }
  }
}
