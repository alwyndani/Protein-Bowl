import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import { registerSchema, loginSchema } from './auth.validator.js';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requireRoles } from '../../middleware/rbac.middleware.js';
import { loginRateLimiter, registerRateLimiter, refreshRateLimiter } from '../../middleware/rateLimiter.middleware.js';
import { RoleEnum } from '@prisma/client';

const router = Router();

router.post('/register', registerRateLimiter, validateBody(registerSchema), AuthController.register);
router.post('/login', loginRateLimiter, validateBody(loginSchema), AuthController.login);
router.post('/refresh', refreshRateLimiter, AuthController.refresh);
router.post('/logout', AuthController.logout);

// Protected Routes
router.get('/me', authenticateToken, AuthController.me);

// RBAC Protected Test Route (Demonstrates authorization checking for privileged roles)
router.get(
  '/rbac-test',
  authenticateToken,
  requireRoles([RoleEnum.MD, RoleEnum.CHEF, RoleEnum.NUTRITIONIST, RoleEnum.SUPER_ADMIN]),
  AuthController.testRbac
);

export default router;
