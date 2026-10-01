import { Router } from 'express';
import { FinanceController } from './finance.controller.js';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware.js';
import { RoleEnum } from '@prisma/client';

const router = Router();

router.get('/transactions', authenticateToken, requireRole([RoleEnum.MD, RoleEnum.SUPER_ADMIN]), FinanceController.getTransactions);
router.post('/voucher', authenticateToken, requireRole([RoleEnum.MD, RoleEnum.SUPER_ADMIN]), FinanceController.createVoucher);

export default router;
