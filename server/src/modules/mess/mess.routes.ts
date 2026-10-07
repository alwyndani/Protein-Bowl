import { Router } from 'express';
import { MessController } from './mess.controller.js';
import { authenticateToken, requireRole, requireExactRoles } from '../../middleware/auth.middleware.js';
import { RoleEnum } from '@prisma/client';

const router = Router();

// Customer Mess endpoints: CUSTOMER is the canonical identity (Mess entitlement = MessAccount relationship).
// MESS_CUSTOMER is LEGACY / DEPRECATED FOR FUTURE RECONCILIATION; accepted only for backward compatibility.
// No SUPER_ADMIN/staff bypass: staff roles must not use customer Mess endpoints.
const requireMessCustomer = requireExactRoles([RoleEnum.CUSTOMER, RoleEnum.MESS_CUSTOMER]);

router.get('/plans', MessController.getPlans);
router.get('/account', authenticateToken, requireMessCustomer, MessController.getAccount);
router.post('/register', authenticateToken, requireMessCustomer, MessController.registerAccount);
router.post('/pause-meal', authenticateToken, requireMessCustomer, MessController.pauseMeal);
router.post('/verify-gatepass', authenticateToken, requireRole([RoleEnum.POS, RoleEnum.CHEF, RoleEnum.SUPER_ADMIN, RoleEnum.MD]), MessController.verifyGatePass);

export default router;
