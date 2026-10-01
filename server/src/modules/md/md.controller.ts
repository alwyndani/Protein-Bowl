import { Request, Response, NextFunction } from 'express';
import { MDService } from './md.service.js';
import { ApiResponse } from '../../utils/apiResponse.js';

export class MDController {
  public static async getMetrics(_req: Request, res: Response, next: NextFunction) {
    try {
      const metrics = await MDService.getEnterpriseMetrics();
      return ApiResponse.success(res, metrics, 'MD Enterprise Command Center telemetry retrieved');
    } catch (err) { next(err); }
  }
}
