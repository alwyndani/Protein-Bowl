import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware.js';
import { kitchenRoutingRateLimiter } from '../../middleware/rateLimiter.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.middleware.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { AuditService } from '../audit/audit.service.js';
import { requireStepUp } from '../admin/stepUp.service.js';
import { KitchenRoutingService, routingBodySchema, routingListQuerySchema } from './kitchenRouting.service.js';

/**
 * SUPER_ADMIN kitchen routing (mounted at /api/v1/admin). Needs 'kitchen:assign' (SUPER_ADMIN only) AND a fresh password step-up proof.
 * MD, CHEF and every other role are rejected; nothing here accepts a status, payment or refund field.
 */
const router = Router();
const orderParams = z.object({ orderId: z.string().min(1).max(64) });

router.get('/kitchen/orders', authenticateToken, requirePermission('kitchen:assign'), validateQuery(routingListQuerySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query as unknown as z.infer<typeof routingListQuerySchema>;
    return ApiResponse.success(res, await KitchenRoutingService.list(q.routing, q.limit), 'Kitchen routing list retrieved');
  } catch (err) {
    next(err);
  }
});

router.put(
  '/orders/:orderId/kitchen-branch',
  authenticateToken,
  requirePermission('kitchen:assign'),
  kitchenRoutingRateLimiter,
  requireStepUp('kitchen.branch.assign'),
  validateParams(orderParams),
  validateBody(routingBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await KitchenRoutingService.assign(req.params.orderId, req.body, { userId: req.user!.userId, roles: req.user!.roles }, AuditService.contextFromRequest(req));
      return ApiResponse.success(res, data, data.changed ? 'Kitchen branch assigned' : 'No change: the order is already routed to that branch', 200);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
