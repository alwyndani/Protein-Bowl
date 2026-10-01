import { Router } from 'express';
import { ProcurementController } from './procurement.controller.js';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware.js';
import { RoleEnum } from '@prisma/client';

const router = Router();

router.get('/items', authenticateToken, requireRole([RoleEnum.PROCUREMENT, RoleEnum.SUPER_ADMIN, RoleEnum.MD]), ProcurementController.getInventoryItems);
router.post('/stock-movement', authenticateToken, requireRole([RoleEnum.PROCUREMENT, RoleEnum.SUPER_ADMIN, RoleEnum.MD]), ProcurementController.recordStockMovement);

export default router;
