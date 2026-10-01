import { Router } from 'express';
import { KDSController } from './kds.controller.js';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware.js';
import { RoleEnum } from '@prisma/client';

const router = Router();

router.get('/tickets', authenticateToken, requireRole([RoleEnum.CHEF, RoleEnum.SUPER_ADMIN, RoleEnum.MD]), KDSController.getTickets);
router.patch('/tickets/:kotId/status', authenticateToken, requireRole([RoleEnum.CHEF, RoleEnum.SUPER_ADMIN, RoleEnum.MD]), KDSController.updateKOTStatus);

export default router;
