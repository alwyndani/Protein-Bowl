import { Request, Response, NextFunction } from 'express';
import { TepacheService } from './tepache.service.js';
import { ApiResponse } from '../../utils/apiResponse.js';

export class TepacheController {
  public static async getTanks(_req: Request, res: Response, next: NextFunction) {
    try {
      const tanks = await TepacheService.getTanks();
      return ApiResponse.success(res, tanks, 'Tepache fermentation tanks retrieved');
    } catch (err) { next(err); }
  }

  public static async updateTelemetry(req: Request, res: Response, next: NextFunction) {
    try {
      const { tankId } = req.params;
      const updated = await TepacheService.updateTankTelemetry(tankId, req.body);
      return ApiResponse.success(res, updated, 'Tank telemetry updated');
    } catch (err) { next(err); }
  }

  public static async recordBottleReturn(req: Request, res: Response, next: NextFunction) {
    try {
      const { customerProfileId, partnerName, bottlesReturned } = req.body;
      const record = await TepacheService.recordBottleReturn(customerProfileId, partnerName, Number(bottlesReturned));
      return ApiResponse.success(res, record, 'Bottle return deposit refund recorded', 201);
    } catch (err) { next(err); }
  }
}
