import { Request, Response, NextFunction } from 'express';
import { KDSService } from './kds.service.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { AppError } from '../../middleware/error.middleware.js';
import { assertResourceBranchAccess, authorizeBranch, getRequestScope } from '../../authz/branchScope.js';
import { AuditService } from '../audit/audit.service.js';
import type { TransitionActor } from '../order/orderTransition.service.js';

export class KDSController {
  public static async getTickets(req: Request, res: Response, next: NextFunction) {
    try {
      const requested = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
      // Branch-scoped staff: omitted branchId = their own branches (never every branch); a foreign branchId = 403.
      const { filter } = await authorizeBranch(req, 'read', requested, 'KitchenOrderTicket');
      const tickets = await KDSService.getBranchTickets(filter);
      return ApiResponse.success(res, tickets, 'KOT tickets retrieved');
    } catch (err) {
      next(err);
    }
  }

  public static async updateKOTStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { kotId } = req.params;
      const { status } = req.body;

      const ticketBranchId = await KDSService.findTicketBranch(kotId);
      if (!ticketBranchId) throw new AppError('KOT not found', 404, 'NOT_FOUND');
      await assertResourceBranchAccess(req, 'write', ticketBranchId, 'KitchenOrderTicket');

      const scope = await getRequestScope(req);
      const actor: TransitionActor = { kind: 'USER', userId: scope.userId, roles: scope.roles, branchIds: scope.branchIds, isGlobal: scope.isGlobal };
      const updated = await KDSService.updateKOTStatus(kotId, status, actor, AuditService.contextFromRequest(req));
      return ApiResponse.success(res, updated, 'KOT status updated');
    } catch (err) {
      next(err);
    }
  }
}
