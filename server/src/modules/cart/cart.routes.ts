import { Router } from 'express';
import { CartController } from './cart.controller.js';
import { authenticateToken, requireCustomerRole } from '../../middleware/auth.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import { addCartItemSchema, updateCartItemSchema } from './cart.validator.js';

const router = Router();

// All cart routes require authenticated CUSTOMER role
router.use(authenticateToken);
router.use(requireCustomerRole);

router.get('/', CartController.getCart);
router.post('/items', validateBody(addCartItemSchema), CartController.addItem);
router.patch('/items/:itemId', validateBody(updateCartItemSchema), CartController.updateQuantity);
router.delete('/items/:itemId', CartController.removeItem);
router.delete('/', CartController.clearCart);

export default router;
