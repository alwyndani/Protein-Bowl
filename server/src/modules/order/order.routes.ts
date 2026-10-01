import { Router } from 'express';
import { OrderController } from './order.controller.js';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware.js';
import { RoleEnum } from '@prisma/client';

const router = Router();

router.post('/', OrderController.createOrder); // Guest or authenticated checkout
router.get('/my-orders', authenticateToken, OrderController.getCustomerOrders);
router.get('/track/:orderNumber', OrderController.getOrderByNumber);
router.patch('/:orderId/status', authenticateToken, requireRole([RoleEnum.CHEF, RoleEnum.DELIVERY, RoleEnum.SUPER_ADMIN, RoleEnum.MD]), OrderController.updateOrderStatus);

export default router;
