import { Router } from 'express';
import { RoleEnum } from '@prisma/client';
import { DeliveryController } from './delivery.controller.js';
import { monitorQuerySchema } from './delivery.service.js';
import { authenticateToken, requireExactRoles, requirePermission } from '../../middleware/auth.middleware.js';
import { validateQuery } from '../../middleware/validate.middleware.js';
import { deliveryReadRateLimiter } from '../../middleware/rateLimiter.middleware.js';

/**
 * Delivery API (mounted at /api/v1/delivery).
 *   monitor: SUPER_ADMIN (read-only) with an EXPLICIT branchId.
 *
 * Role simplification (B2a): the DELIVERY driver surface (queue, order detail, claim, dispatch, report-failure, resume, verify-delivery) was REMOVED. The same
 * operations are performed by a SUPER_ADMIN through the administrator routes (/api/v1/admin/delivery/orders/:orderId/...), each protected by a fresh password
 * step-up. The removed paths now answer 404. There is deliberately no deliver / mark-delivered / status route, and the legacy
 * GET /assignments and PATCH /assignments/:id/status routes stay retired (404).
 */
const router = Router();

router.get(
  '/monitor',
  authenticateToken,
  requireExactRoles([RoleEnum.SUPER_ADMIN]),
  requirePermission('delivery:read'),
  deliveryReadRateLimiter,
  validateQuery(monitorQuerySchema),
  DeliveryController.getMonitor
);

export default router;
