import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import { registerSchema, loginSchema } from './auth.validator.js';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requireRoles } from '../../middleware/rbac.middleware.js';
import { loginRateLimiter, registerRateLimiter, refreshRateLimiter, acceptInviteRateLimiter } from '../../middleware/rateLimiter.middleware.js';
import { acceptInviteBodySchema } from '../admin/admin.validator.js';
import { RoleEnum } from '@prisma/client';
import { env } from '../../config/env.js';

const router = Router();

router.post('/register', registerRateLimiter, validateBody(registerSchema), AuthController.register);
router.post('/login', loginRateLimiter, validateBody(loginSchema), AuthController.login);
router.post('/refresh', refreshRateLimiter, AuthController.refresh);
router.post('/logout', AuthController.logout);

// Staff invitation acceptance (public, strongly rate-limited). Uniform errors: never reveals whether an account exists.
router.post('/staff/accept-invite', acceptInviteRateLimiter, validateBody(acceptInviteBodySchema), AuthController.acceptStaffInvite);

// Protected Routes
router.get('/me', authenticateToken, AuthController.me);

// RBAC diagnostic route: registered ONLY in development/test. It does not exist (404) in production.
if (env.NODE_ENV !== 'production') {
  router.get(
    '/rbac-test',
    authenticateToken,
    requireRoles([RoleEnum.MD, RoleEnum.CHEF, RoleEnum.NUTRITIONIST, RoleEnum.SUPER_ADMIN]),
    AuthController.testRbac
  );
}

export default router;
