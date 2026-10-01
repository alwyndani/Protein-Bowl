import { Request, Response, NextFunction } from 'express';
import { DeliveryService } from './delivery.service.js';
import { ApiResponse } from '../../utils/apiResponse.js';

export class DeliveryController {
  public static async getAssignments(req: Request, res: Response, next: NextFunction) {
    try {
      const items = await DeliveryService.getDeliveryAssignments(req.query.driverId as string);
      return ApiResponse.success(res, items, 'Delivery assignments retrieved');
    } catch (err) { next(err); }
  }

  public static async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { assignmentId } = req.params;
      const { status, podImageUrl, temperatureC } = req.body;
      const updated = await DeliveryService.updateDeliveryStatus(assignmentId, status, podImageUrl, temperatureC);
      return ApiResponse.success(res, updated, 'Delivery status updated');
    } catch (err) { next(err); }
  }
}
