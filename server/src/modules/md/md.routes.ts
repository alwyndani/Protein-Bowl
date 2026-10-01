import { Router } from 'express';
import { MDController } from './md.controller.js';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware.js';
import { RoleEnum } from '@prisma/client';

const router = Router();

router.get('/metrics', authenticateToken, requireRole([RoleEnum.MD, RoleEnum.SUPER_ADMIN]), MDController.getMetrics);

export default router;
