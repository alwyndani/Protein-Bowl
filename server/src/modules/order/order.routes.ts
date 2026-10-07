import { Router } from 'express';
import { OrderController } from './order.controller.js';
import { authenticateToken, requireCustomerRole } from '../../middleware/auth.middleware.js';

const router = Router();

router.post('/', authenticateToken, requireCustomerRole, OrderController.createOrder);
router.get('/my-orders', authenticateToken, requireCustomerRole, OrderController.getCustomerOrders);
router.get('/:orderId', authenticateToken, requireCustomerRole, OrderController.getOrderById);

export default router;
