import { Router } from 'express';
import { MessController } from './mess.controller.js';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware.js';
import { RoleEnum } from '@prisma/client';

const router = Router();

router.get('/plans', MessController.getPlans);
router.get('/account', authenticateToken, MessController.getAccount);
router.post('/register', authenticateToken, MessController.registerAccount);
router.post('/pause-meal', authenticateToken, MessController.pauseMeal);
router.post('/verify-gatepass', authenticateToken, requireRole([RoleEnum.POS, RoleEnum.CHEF, RoleEnum.SUPER_ADMIN, RoleEnum.MD]), MessController.verifyGatePass);

export default router;
