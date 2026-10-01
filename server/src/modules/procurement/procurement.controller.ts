import { Request, Response, NextFunction } from 'express';
import { ProcurementService } from './procurement.service.js';
import { ApiResponse } from '../../utils/apiResponse.js';

export class ProcurementController {
  public static async getInventoryItems(req: Request, res: Response, next: NextFunction) {
    try {
      const items = await ProcurementService.getInventoryItems(req.query.branchId as string);
      return ApiResponse.success(res, items, 'Inventory items retrieved');
    } catch (err) { next(err); }
  }

  public static async recordStockMovement(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ProcurementService.recordStockMovement({
        inventoryItemId: req.body.inventoryItemId,
        type: req.body.type,
        quantity: req.body.quantity,
        unitCost: req.body.unitCost,
        notes: req.body.notes,
        createdBy: req.user?.userId
      });
      return ApiResponse.success(res, result, 'Stock movement recorded successfully', 201);
    } catch (err) { next(err); }
  }
}
