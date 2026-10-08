import { Request, Response, NextFunction } from 'express';
import { ProcurementService } from './procurement.service.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { AppError } from '../../middleware/error.middleware.js';
import { assertResourceBranchAccess, authorizeBranch } from '../../authz/branchScope.js';

export class ProcurementController {
  public static async getInventoryItems(req: Request, res: Response, next: NextFunction) {
    try {
      const requested = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
      const { filter } = await authorizeBranch(req, 'read', requested, 'InventoryItem');
      const items = await ProcurementService.getInventoryItems(filter);
      return ApiResponse.success(res, items, 'Inventory items retrieved');
    } catch (err) { next(err); }
  }

  public static async recordStockMovement(req: Request, res: Response, next: NextFunction) {
    try {
      const itemBranchId = await ProcurementService.findItemBranch(req.body.inventoryItemId);
      if (!itemBranchId) throw new AppError('Inventory item not found', 404, 'NOT_FOUND');
      await assertResourceBranchAccess(req, 'write', itemBranchId, 'InventoryItem');

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
