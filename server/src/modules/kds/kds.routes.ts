import { Router } from 'express';
import { RoleEnum } from '@prisma/client';
import { z } from 'zod';
import { KDSController } from './kds.controller.js';
import { authenticateToken, requireExactRoles, requirePermission } from '../../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.middleware.js';
import { kitchenActionRateLimiter } from '../../middleware/rateLimiter.middleware.js';

/**
 * P8 kitchen API (mounted at /api/v1/kds). The kitchen queue is DERIVED from Order + OrderItem + OrderEvent: there are no KOT rows and
 * no second kitchen state machine. The old /kds/tickets endpoints are retired (404).
 *   reads:   CHEF (own branches) and MD / SUPER_ADMIN (read-only, explicit branchId)  -> 'kds:read'
 *   actions: CHEF ONLY (exact role) with 'kds:write'; SUPER_ADMIN and MD cannot perform them.
 */
const router = Router();

const idParams = z.object({ id: z.string().min(1).max(64) });
const readQuery = z.object({ branchId: z.string().min(1).max(64).optional() }).strict();
const emptyBody = z.object({}).strict();

router.get('/orders', authenticateToken, requirePermission('kds:read'), validateQuery(readQuery), KDSController.getQueue);
router.get('/orders/:id', authenticateToken, requirePermission('kds:read'), validateParams(idParams), validateQuery(readQuery), KDSController.getOrder);

const chefAction = [authenticateToken, requireExactRoles([RoleEnum.CHEF]), requirePermission('kds:write'), kitchenActionRateLimiter] as const;
router.post('/orders/:id/accept', ...chefAction, validateParams(idParams), validateBody(emptyBody), KDSController.action('accept'));
router.post('/orders/:id/start-preparing', ...chefAction, validateParams(idParams), validateBody(emptyBody), KDSController.action('start-preparing'));
router.post('/orders/:id/mark-ready', ...chefAction, validateParams(idParams), validateBody(emptyBody), KDSController.action('mark-ready'));

export default router;
