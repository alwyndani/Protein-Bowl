import { Router } from 'express';
import { DeliveryController } from './delivery.controller.js';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware.js';

const router = Router();

router.get('/assignments', authenticateToken, requirePermission('delivery:read'), DeliveryController.getAssignments);
router.patch('/assignments/:assignmentId/status', authenticateToken, requirePermission('delivery:write'), DeliveryController.updateStatus);

export default router;
