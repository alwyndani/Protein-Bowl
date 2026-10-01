import { Request, Response, NextFunction } from 'express';
import { KDSService } from './kds.service.js';
import { ApiResponse } from '../../utils/apiResponse.js';

export class KDSController {
  public static async getTickets(req: Request, res: Response, next: NextFunction) {
    try {
      const { branchId } = req.query;
      const tickets = await KDSService.getBranchTickets(branchId as string);
      return ApiResponse.success(res, tickets, 'KOT tickets retrieved');
    } catch (err) {
      next(err);
    }
  }

  public static async updateKOTStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { kotId } = req.params;
      const { status } = req.body;
      const updated = await KDSService.updateKOTStatus(kotId, status);
      return ApiResponse.success(res, updated, 'KOT status updated');
    } catch (err) {
      next(err);
    }
  }
}
