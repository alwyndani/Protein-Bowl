import { Router } from 'express';
import { CustomerController } from './customer.controller.js';
import { authenticateToken, requireCustomerRole } from '../../middleware/auth.middleware.js';

const router = Router();
const customerController = new CustomerController();

// Protected Customer Profile & Biometrics routes (strictly for authenticated user identity)
router.get('/me/profile', authenticateToken, requireCustomerRole, (req, res, next) => customerController.getMyProfile(req, res, next));
router.put('/me/profile', authenticateToken, requireCustomerRole, (req, res, next) => customerController.updateMyProfile(req, res, next));

// Customer Address Management routes
router.get('/me/addresses', authenticateToken, requireCustomerRole, (req, res, next) => customerController.getAddresses(req, res, next));
router.post('/me/addresses', authenticateToken, requireCustomerRole, (req, res, next) => customerController.createAddress(req, res, next));
router.put('/me/addresses/:addressId', authenticateToken, requireCustomerRole, (req, res, next) => customerController.updateAddress(req, res, next));
router.delete('/me/addresses/:addressId', authenticateToken, requireCustomerRole, (req, res, next) => customerController.deleteAddress(req, res, next));

export default router;

