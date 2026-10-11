import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware.js';
import { deliveryAssignRateLimiter, deliveryReadRateLimiter } from '../../middleware/rateLimiter.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.middleware.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditService } from '../audit/audit.service.js';
import { requireStepUp } from '../admin/stepUp.service.js';
import { DeliveryService, assignmentBodySchema } from './delivery.service.js';

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

export default router;
