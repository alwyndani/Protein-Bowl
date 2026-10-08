import { Router } from 'express';
import { ProcurementController } from './procurement.controller.js';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware.js';

const router = Router();

router.get('/items', authenticateToken, requirePermission('procurement:read'), ProcurementController.getInventoryItems);
router.post('/stock-movement', authenticateToken, requirePermission('procurement:write'), ProcurementController.recordStockMovement);

export default router;
