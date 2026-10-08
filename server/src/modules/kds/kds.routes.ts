import { Router } from 'express';
import { KDSController } from './kds.controller.js';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware.js';

const router = Router();

router.get('/tickets', authenticateToken, requirePermission('kds:read'), KDSController.getTickets);
router.patch('/tickets/:kotId/status', authenticateToken, requirePermission('kds:write'), KDSController.updateKOTStatus);

export default router;
