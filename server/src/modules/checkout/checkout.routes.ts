import { Router } from 'express';
import { OrderController } from '../order/order.controller.js';
import { authenticateToken, requireCustomerRole } from '../../middleware/auth.middleware.js';

const router = Router();

router.post('/preview', authenticateToken, requireCustomerRole, OrderController.checkoutPreview);

export default router;
