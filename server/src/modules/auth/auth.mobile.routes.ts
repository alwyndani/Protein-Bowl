import { Router } from 'express';
import { MobileAuthController } from './auth.mobile.controller.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import { mobileRegisterSchema, mobileLoginSchema, mobileRefreshSchema } from './auth.validator.js';
import { loginRateLimiter, registerRateLimiter, refreshRateLimiter } from '../../middleware/rateLimiter.middleware.js';
import { rejectBrowserContext, requireMobileClientContract, noStore } from '../../middleware/mobileClient.middleware.js';

/**
 * Dedicated customer-mobile auth routes (P11A), mounted at /api/v1/auth/mobile. The web routes are untouched.
 * They reuse the web's limiter INSTANCES, so mobile and web share the same per-IP budgets (no bypass). Carrier-NAT sharing of one
 * IP is a deployment risk to review (TRUST_PROXY / limits), not something worked around here.
 */
const router = Router();
router.use(noStore, rejectBrowserContext, requireMobileClientContract);

router.post('/register', registerRateLimiter, validateBody(mobileRegisterSchema), MobileAuthController.register);
router.post('/login', loginRateLimiter, validateBody(mobileLoginSchema), MobileAuthController.login);
router.post('/refresh', refreshRateLimiter, validateBody(mobileRefreshSchema), MobileAuthController.refresh);
router.post('/logout', refreshRateLimiter, validateBody(mobileRefreshSchema), MobileAuthController.logout);

export default router;
