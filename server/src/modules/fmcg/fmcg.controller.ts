import { Request, Response, NextFunction } from 'express';
import { FMCGService } from './fmcg.service.js';
import { ApiResponse } from '../../utils/apiResponse.js';

export class FMCGController {
  public static async getBatches(_req: Request, res: Response, next: NextFunction) {
    try {
      const batches = await FMCGService.getBatches();
      return ApiResponse.success(res, batches, 'FMCG production batches retrieved');
    } catch (err) { next(err); }
  }

  public static async createBatch(req: Request, res: Response, next: NextFunction) {
    try {
      const batch = await FMCGService.createBatch(req.body);
      return ApiResponse.success(res, batch, 'FMCG production batch created', 201);
    } catch (err) { next(err); }
  }

  public static async getChallans(_req: Request, res: Response, next: NextFunction) {
    try {
      const challans = await FMCGService.getChallans();
      return ApiResponse.success(res, challans, 'Dispatch challans retrieved');
    } catch (err) { next(err); }
  }
}
