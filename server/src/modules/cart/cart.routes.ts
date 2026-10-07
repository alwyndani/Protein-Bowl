import { Router } from 'express';
import { CartController } from './cart.controller.js';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import { addCartItemSchema, updateCartItemSchema } from './cart.validator.js';
import { RoleEnum } from '@prisma/client';

const router = Router();

// All cart routes require authenticated CUSTOMER role
router.use(authenticateToken);
router.use(requireRole([RoleEnum.CUSTOMER]));

router.get('/', CartController.getCart);
router.post('/items', validateBody(addCartItemSchema), CartController.addItem);
router.patch('/items/:itemId', validateBody(updateCartItemSchema), CartController.updateQuantity);
router.delete('/items/:itemId', CartController.removeItem);
router.delete('/', CartController.clearCart);

export default router;
