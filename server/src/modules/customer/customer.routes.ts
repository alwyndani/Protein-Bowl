import { Router } from 'express';
import { CustomerController } from './customer.controller.js';
import { authenticateToken } from '../../middleware/auth.middleware.js';

const router = Router();
const customerController = new CustomerController();

// Protected Customer Profile & Biometrics routes (strictly for authenticated user identity)
router.get('/me/profile', authenticateToken, (req, res, next) => customerController.getMyProfile(req, res, next));
router.put('/me/profile', authenticateToken, (req, res, next) => customerController.updateMyProfile(req, res, next));

export default router;
