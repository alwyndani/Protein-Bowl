import { Router } from 'express';
import { HRMController } from './hrm.controller.js';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware.js';
import { RoleEnum } from '@prisma/client';

const router = Router();

router.get('/employees', authenticateToken, requireRole([RoleEnum.SUPER_ADMIN, RoleEnum.MD]), HRMController.getEmployees);
router.post('/attendance', authenticateToken, requireRole([RoleEnum.SUPER_ADMIN, RoleEnum.MD]), HRMController.markAttendance);

export default router;
