import { Router } from 'express';
import { POSController } from './pos.controller.js';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware.js';
import { RoleEnum } from '@prisma/client';

const router = Router();

router.post('/transaction', authenticateToken, requireRole([RoleEnum.POS, RoleEnum.SUPER_ADMIN, RoleEnum.MD]), POSController.recordTransaction);
router.get('/transactions', authenticateToken, requireRole([RoleEnum.POS, RoleEnum.SUPER_ADMIN, RoleEnum.MD]), POSController.getTransactions);

export default router;
