import { Request, Response, NextFunction } from 'express';
import { POSService } from './pos.service.js';
import { ApiResponse } from '../../utils/apiResponse.js';

export class POSController {
  public static async recordTransaction(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await POSService.recordTransaction({
        branchId: req.body.branchId,
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
      const { branchId } = req.query;
      const transactions = await POSService.getBranchTransactions(branchId as string);
      return ApiResponse.success(res, transactions, 'POS transactions retrieved');
    } catch (err) { next(err); }
  }
}
