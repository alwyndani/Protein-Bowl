import { Router } from 'express';
import { TepacheController } from './tepache.controller.js';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware.js';
import { RoleEnum } from '@prisma/client';

const router = Router();

router.get('/tanks', authenticateToken, requireRole([RoleEnum.TEPACHE_ERP, RoleEnum.SUPER_ADMIN, RoleEnum.MD]), TepacheController.getTanks);
router.patch('/tanks/:tankId/telemetry', authenticateToken, requireRole([RoleEnum.TEPACHE_ERP, RoleEnum.SUPER_ADMIN, RoleEnum.MD]), TepacheController.updateTelemetry);
router.post('/bottle-returns', authenticateToken, requireRole([RoleEnum.TEPACHE_ERP, RoleEnum.SUPER_ADMIN, RoleEnum.MD]), TepacheController.recordBottleReturn);

export default router;
