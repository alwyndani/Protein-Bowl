import { Request, Response, NextFunction } from 'express';
import { POSService } from './pos.service.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { AppError } from '../../middleware/error.middleware.js';
import { authorizeBranch, requireSingleBranch } from '../../authz/branchScope.js';

export class POSController {
  public static async recordTransaction(req: Request, res: Response, next: NextFunction) {
    try {
      // The target branch must be one the caller may WRITE to. A branch-scoped cashier assigned to exactly one branch may omit it.
      const requested = typeof req.body.branchId === 'string' ? req.body.branchId : undefined;
      const { filter } = await authorizeBranch(req, 'write', requested, 'POSTransaction');
      const branchId = requireSingleBranch(filter);
      if (!(await POSService.branchExists(branchId))) throw new AppError('Branch not found', 404, 'NOT_FOUND');

      const result = await POSService.recordTransaction({
        branchId,
        cashierId: req.user?.userId,
        totalAmount: req.body.totalAmount,
        paymentMethod: req.body.paymentMethod || 'CASH',
        cashReceived: req.body.cashReceived,
        changeGiven: req.body.changeGiven
      });
      return ApiResponse.success(res, result, 'POS transaction recorded & receipt generated', 201);
    } catch (err) { next(err); }
  }

  public static async getTransactions(req: Request, res: Response, next: NextFunction) {
    try {
      const requested = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
      const { filter } = await authorizeBranch(req, 'read', requested, 'POSTransaction');
      const transactions = await POSService.getBranchTransactions(filter);
      return ApiResponse.success(res, transactions, 'POS transactions retrieved');
    } catch (err) { next(err); }
  }
}
