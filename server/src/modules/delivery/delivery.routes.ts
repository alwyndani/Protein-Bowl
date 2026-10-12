import { Router } from 'express';
import { RoleEnum } from '@prisma/client';
import { z } from 'zod';
import { DeliveryController } from './delivery.controller.js';
import { emptyBodySchema, monitorQuerySchema, reportFailureBodySchema } from './delivery.service.js';
import { authenticateToken, requireExactRoles, requirePermission } from '../../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.middleware.js';
import { deliveryActionRateLimiter, deliveryReadRateLimiter, deliveryVerifyRateLimiter } from '../../middleware/rateLimiter.middleware.js';
import { verifyBodySchema } from './deliveryProof.service.js';

/**
 * P9A delivery API (mounted at /api/v1/delivery).
 *   driver reads:   exact DELIVERY role + delivery:read   -> queue (area-only until claimed) and the caller's OWN order detail
 *   driver actions: exact DELIVERY role + delivery:write   -> claim, dispatch (READY -> DISPATCHED), report-failure. Strict bodies.
 *   monitor:        SUPER_ADMIN / MD (read-only) with an EXPLICIT branchId
 * P9B adds POST /orders/:id/verify-delivery (the Delivery Code): the ONLY driver path to DELIVERED. There is deliberately no deliver /
 * mark-delivered / status route, and the legacy
 * GET /assignments and PATCH /assignments/:id/status routes are retired (404).
 */
const router = Router();
const idParams = z.object({ id: z.string().min(1).max(64) });
const queueQuery = z.object({ branchId: z.string().min(1).max(64).optional() }).strict();

const driverRead = [authenticateToken, requireExactRoles([RoleEnum.DELIVERY]), requirePermission('delivery:read'), deliveryReadRateLimiter] as const;
const driverAction = [authenticateToken, requireExactRoles([RoleEnum.DELIVERY]), requirePermission('delivery:write'), deliveryActionRateLimiter] as const;

router.get('/orders', ...driverRead, validateQuery(queueQuery), DeliveryController.getQueue);
router.get('/orders/:id', ...driverRead, validateParams(idParams), DeliveryController.getOrder);
router.post('/orders/:id/claim', ...driverAction, validateParams(idParams), validateBody(emptyBodySchema), DeliveryController.claim);
router.post('/orders/:id/dispatch', ...driverAction, validateParams(idParams), validateBody(emptyBodySchema), DeliveryController.dispatch);
router.post('/orders/:id/report-failure', ...driverAction, validateParams(idParams), validateBody(reportFailureBodySchema), DeliveryController.reportFailure);
// P9C: the assigned driver acknowledges a retry (ASSIGNED -> IN_TRANSIT). Empty strict body; no financial effect.
router.post('/orders/:id/resume', ...driverAction, validateParams(idParams), validateBody(emptyBodySchema), DeliveryController.resume);
router.post('/orders/:id/verify-delivery', authenticateToken, requireExactRoles([RoleEnum.DELIVERY]), requirePermission('delivery:write'), deliveryVerifyRateLimiter, validateParams(idParams), validateBody(verifyBodySchema), DeliveryController.verifyDelivery);

router.get(
  '/monitor',
  authenticateToken,
  requireExactRoles([RoleEnum.SUPER_ADMIN, RoleEnum.MD]),
  requirePermission('delivery:read'),
  deliveryReadRateLimiter,
  validateQuery(monitorQuerySchema),
  DeliveryController.getMonitor
);

export default router;
