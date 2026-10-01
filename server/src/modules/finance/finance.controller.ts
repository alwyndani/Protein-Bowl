import { Request, Response, NextFunction } from 'express';
import { FinanceService } from './finance.service.js';
import { ApiResponse } from '../../utils/apiResponse.js';

export class FinanceController {
  public static async getTransactions(_req: Request, res: Response, next: NextFunction) {
    try {
      const list = await FinanceService.getTransactions();
      return ApiResponse.success(res, list, 'Financial transactions retrieved');
    } catch (err) { next(err); }
  }

  public static async createVoucher(req: Request, res: Response, next: NextFunction) {
    try {
      const voucher = await FinanceService.createVoucher(req.body);
      return ApiResponse.success(res, voucher, 'Financial voucher recorded', 201);
    } catch (err) { next(err); }
  }
}
