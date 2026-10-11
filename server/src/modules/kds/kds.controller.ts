import { Request, Response, NextFunction } from 'express';
import { RoleEnum } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { AppError } from '../../middleware/error.middleware.js';
import { BranchScope, getRequestScope } from '../../authz/branchScope.js';
import { AuditService } from '../audit/audit.service.js';
import { KDSService, KitchenAction } from './kds.service.js';

/**
 * Which branches a kitchen read may cover.
 *  - CHEF: the caller's own assigned branches (database truth); an explicit branchId must be one of them. Never "all branches".
 *  - MD / SUPER_ADMIN (read-only): an EXPLICIT branchId is required (no unbounded cross-branch reads).
 */
async function resolveReadBranches(req: Request, scope: BranchScope, requested: string | undefined): Promise<string[]> {
  if (scope.roles.includes(RoleEnum.CHEF)) {
    if (scope.branchIds.length === 0) {
      await AuditService.recordSafe({ actor: { userId: scope.userId, roles: scope.roles }, action: 'BRANCH_ACCESS_DENIED', entity: 'KitchenQueue', payload: { mode: 'read', code: 'NO_BRANCH_ASSIGNMENT' }, context: AuditService.contextFromRequest(req) });
      throw new AppError('No branch assignment: this account is not assigned to any branch', 403, 'NO_BRANCH_ASSIGNMENT');
    }
    if (requested && !scope.branchIds.includes(requested)) {
      await AuditService.recordSafe({ actor: { userId: scope.userId, roles: scope.roles }, action: 'BRANCH_ACCESS_DENIED', entity: 'KitchenQueue', payload: { mode: 'read', requestedBranchId: requested, code: 'BRANCH_FORBIDDEN' }, context: AuditService.contextFromRequest(req) });
      throw new AppError('You do not have access to the requested branch', 403, 'BRANCH_FORBIDDEN');
    }
    return requested ? [requested] : [...scope.branchIds];
  }
  if (!requested) throw new AppError('A branchId is required to read the kitchen queue', 400, 'BRANCH_REQUIRED');
  return [requested];
}

export class KDSController {
  public static async getQueue(req: Request, res: Response, next: NextFunction) {
    try {
      const scope = await getRequestScope(req);
      const requested = typeof req.query.branchId === 'string' && req.query.branchId ? req.query.branchId : undefined;
      const branchIds = await resolveReadBranches(req, scope, requested);
      const [queue, branches] = await Promise.all([
        KDSService.getQueue(branchIds),
        prisma.kitchenBranch.findMany({
          where: { id: { in: scope.roles.includes(RoleEnum.CHEF) ? scope.branchIds : branchIds }, isActive: true },
          select: { id: true, code: true, name: true },
          orderBy: { code: 'asc' }
        })
      ]);
      return ApiResponse.success(res, { ...queue, branches, selectedBranchIds: branchIds }, 'Kitchen queue retrieved');
    } catch (err) {
      next(err);
    }
  }

  public static async getOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const scope = await getRequestScope(req);
      const requested = typeof req.query.branchId === 'string' && req.query.branchId ? req.query.branchId : undefined;
      const branchIds = await resolveReadBranches(req, scope, requested);
      const dto = await KDSService.getOrder(req.params.id, branchIds);
      if (!dto) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
      return ApiResponse.success(res, dto, 'Kitchen order retrieved');
    } catch (err) {
      next(err);
    }
  }

  public static action(action: KitchenAction) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const scope = await getRequestScope(req);
        if (scope.branchIds.length === 0) {
          throw new AppError('No branch assignment: this account is not assigned to any branch', 403, 'NO_BRANCH_ASSIGNMENT');
        }
        const result = await KDSService.act(req.params.id, action, { userId: scope.userId, branchIds: scope.branchIds }, AuditService.contextFromRequest(req));
        return ApiResponse.success(res, result, result.changed ? 'Kitchen order updated' : 'No change: the order was already in that state');
      } catch (err) {
        next(err);
      }
    };
  }
}
