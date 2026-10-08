import { Router } from 'express';
import { POSController } from './pos.controller.js';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware.js';

const router = Router();

router.post('/transaction', authenticateToken, requirePermission('pos:write'), POSController.recordTransaction);
router.get('/transactions', authenticateToken, requirePermission('pos:read'), POSController.getTransactions);

export default router;
