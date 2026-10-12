import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { authenticateToken, requireExactRoles, requirePermission } from '../../middleware/auth.middleware.js';
import { RoleEnum } from '@prisma/client';
import { deliveryAssignRateLimiter, deliveryOverrideRateLimiter, deliveryReadRateLimiter, deliveryResolveRateLimiter } from '../../middleware/rateLimiter.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.middleware.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditService } from '../audit/audit.service.js';
import { requireStepUp } from '../admin/stepUp.service.js';
import { DeliveryService, assignmentBodySchema } from './delivery.service.js';
import { DeliveryProofService, overrideBodySchema } from './deliveryProof.service.js';
import { DeliveryResolutionService } from './deliveryResolution.service.js';
import { retryBodySchema, undeliverableBodySchema } from './deliveryAttemptPolicy.js';

/**
 * SUPER_ADMIN delivery assignment (mounted at /api/v1/admin). Needs 'delivery:assign' (SUPER_ADMIN only) AND a fresh password step-up proof.
 * MD, DELIVERY and every other role are rejected; nothing here accepts a status, payment, refund or amount field.
 */
const router = Router();
const orderParams = z.object({ orderId: z.string().min(1).max(64) });
const driversQuery = z.object({ branchId: z.string().uuid() }).strict();

router.get('/delivery/drivers', authenticateToken, requirePermission('delivery:assign'), deliveryReadRateLimiter, validateQuery(driversQuery), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query as unknown as z.infer<typeof driversQuery>;
    return ApiResponse.success(res, { drivers: await DeliveryService.listAssignableDrivers(q.branchId) }, 'Assignable drivers retrieved');
  } catch (err) {
    next(err);
  }
});

router.put(
  '/orders/:orderId/delivery-assignment',
  authenticateToken,
  requirePermission('delivery:assign'),
  deliveryAssignRateLimiter,
  requireStepUp('delivery.assignment.change'),
  validateParams(orderParams),
  validateBody(assignmentBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const data = await DeliveryService.assign(req.params.orderId, req.body, { userId: req.user.userId, roles: req.user.roles }, AuditService.contextFromRequest(req));
      return ApiResponse.success(res, data, data.changed ? 'Delivery assignment updated' : 'No change: the delivery assignment is already as requested', 200);
    } catch (err) {
      next(err);
    }
  }
);

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

// ---------------------------------------------------------------- P9C failed-delivery resolution
// Read-only attempt history: SUPER_ADMIN and MD (MD never receives free-text notes). DELIVERY also holds 'delivery:read' but is excluded by exact roles.
router.get(
  '/orders/:orderId/delivery-attempts',
  authenticateToken,
  requireExactRoles([RoleEnum.SUPER_ADMIN, RoleEnum.MD]),
  requirePermission('delivery:read'),
  deliveryReadRateLimiter,
  validateParams(orderParams),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const viewer = req.user.roles.includes(RoleEnum.SUPER_ADMIN) ? 'SUPER_ADMIN' : 'MD';
      return ApiResponse.success(res, await DeliveryResolutionService.getAttempts(req.params.orderId, viewer), 'Delivery attempts retrieved');
    } catch (err) {
      next(err);
    }
  }
);

// Retry with the same driver / reassign (also hands a PENDING retry to another driver). SUPER_ADMIN only + password step-up.
router.post(
  '/orders/:orderId/delivery-retry',
  authenticateToken,
  requirePermission('delivery:resolve'),
  deliveryResolveRateLimiter,
  requireStepUp('delivery.retry'),
  validateParams(orderParams),
  validateBody(retryBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const data = await DeliveryResolutionService.retry(req.params.orderId, req.body, { userId: req.user.userId, roles: req.user.roles }, AuditService.contextFromRequest(req));
      return ApiResponse.success(res, data, 'Delivery retry arranged');
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
