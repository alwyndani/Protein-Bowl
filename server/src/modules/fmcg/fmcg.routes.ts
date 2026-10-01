import { Router } from 'express';
import { FMCGController } from './fmcg.controller.js';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware.js';
import { RoleEnum } from '@prisma/client';

const router = Router();

router.get('/batches', authenticateToken, requireRole([RoleEnum.BAKERY_FMCG, RoleEnum.SUPER_ADMIN, RoleEnum.MD]), FMCGController.getBatches);
router.post('/batches', authenticateToken, requireRole([RoleEnum.BAKERY_FMCG, RoleEnum.SUPER_ADMIN, RoleEnum.MD]), FMCGController.createBatch);
router.get('/challans', authenticateToken, requireRole([RoleEnum.BAKERY_FMCG, RoleEnum.SUPER_ADMIN, RoleEnum.MD]), FMCGController.getChallans);

export default router;
