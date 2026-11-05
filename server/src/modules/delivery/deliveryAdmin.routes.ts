import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { authenticateToken, requireExactRoles, requirePermission } from '../../middleware/auth.middleware.js';
import { RoleEnum } from '@prisma/client';
import { deliveryOverrideRateLimiter, deliveryReadRateLimiter, deliveryResolveRateLimiter } from '../../middleware/rateLimiter.middleware.js';
import { validateBody, validateParams } from '../../middleware/validate.middleware.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditService } from '../audit/audit.service.js';
import { requireStepUp } from '../admin/stepUp.service.js';
import { DeliveryProofService, overrideBodySchema } from './deliveryProof.service.js';
import { DeliveryResolutionService } from './deliveryResolution.service.js';
import { undeliverableBodySchema } from './deliveryAttemptPolicy.js';

/**
 * SUPER_ADMIN delivery administration (mounted at /api/v1/admin): the exceptional handover confirmation, the attempt history and Cancel & Full Refund.
 * Every write needs a fresh password step-up proof; nothing here accepts a status, payment, refund or amount field.
 *
 * Role simplification (B2a): driver assignment (GET /delivery/drivers, PUT /orders/:id/delivery-assignment) and the driver-based retry
 * (POST /orders/:id/delivery-retry) were REMOVED - there is no driver to assign to. Dispatch, takeover, code verification, failure reporting, retry and resume are
 * performed by a SUPER_ADMIN through /admin/delivery/orders/:orderId/... (deliveryOperate.routes.ts).
 */
const router = Router();
const orderParams = z.object({ orderId: z.string().min(1).max(64) });

// P9B exceptional handover confirmation: NOT routine delivery completion. delivery:override is SUPER_ADMIN only; step-up, reason, note and confirm are mandatory.
router.post(
  '/orders/:orderId/delivery-override',
  authenticateToken,
  requirePermission('delivery:override'),
  deliveryOverrideRateLimiter,
  requireStepUp('delivery.override'),
  validateParams(orderParams),
  validateBody(overrideBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const data = await DeliveryProofService.overrideDelivery(req.params.orderId, req.body, { userId: req.user.userId, roles: req.user.roles }, AuditService.contextFromRequest(req));
      return ApiResponse.success(res, data, data.changed ? 'Delivery completed by override' : 'No change: the delivery was already completed by override', 200);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------- failed-delivery history and resolution
// Read-only attempt history: SUPER_ADMIN only.
router.get(
  '/orders/:orderId/delivery-attempts',
  authenticateToken,
  requireExactRoles([RoleEnum.SUPER_ADMIN]),
  requirePermission('delivery:read'),
  deliveryReadRateLimiter,
  validateParams(orderParams),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const viewer = 'SUPER_ADMIN' as const;
      return ApiResponse.success(res, await DeliveryResolutionService.getAttempts(req.params.orderId, viewer), 'Delivery attempts retrieved');
    } catch (err) {
      next(err);
    }
  }
);

// Cancel & Full Refund for a permanently undeliverable (FAILED) delivery. The ONLY route that can cancel a DISPATCHED order.
router.post(
  '/orders/:orderId/delivery-undeliverable',
  authenticateToken,
  requirePermission('delivery:resolve'),
  deliveryResolveRateLimiter,
  requireStepUp('delivery.undeliverable'),
  validateParams(orderParams),
  validateBody(undeliverableBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const data = await DeliveryResolutionService.markUndeliverable(req.params.orderId, req.body, { userId: req.user.userId, roles: req.user.roles }, AuditService.contextFromRequest(req));
      return ApiResponse.success(res, data, data.changed ? 'Order cancelled and a full refund requested' : 'No change: this order was already cancelled as undeliverable');
    } catch (err) {
      next(err);
    }
  }
);

export default router;
