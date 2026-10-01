import { Router } from 'express';
import { DeliveryController } from './delivery.controller.js';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware.js';
import { RoleEnum } from '@prisma/client';

const router = Router();

router.get('/assignments', authenticateToken, requireRole([RoleEnum.DELIVERY, RoleEnum.SUPER_ADMIN, RoleEnum.MD]), DeliveryController.getAssignments);
router.patch('/assignments/:assignmentId/status', authenticateToken, requireRole([RoleEnum.DELIVERY, RoleEnum.SUPER_ADMIN, RoleEnum.MD]), DeliveryController.updateStatus);

export default router;
