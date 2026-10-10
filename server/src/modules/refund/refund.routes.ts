import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { authenticateToken, requireCustomerRole } from '../../middleware/auth.middleware.js';
import { validateBody, validateParams } from '../../middleware/validate.middleware.js';
import { cancelRateLimiter } from '../../middleware/rateLimiter.middleware.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { AuditService } from '../audit/audit.service.js';
import { CancellationService } from './cancellation.service.js';
import { customerCancelBodySchema } from './cancellationPolicy.js';
import { RefundViewService } from './refundView.service.js';

const orderParams = z.object({ orderId: z.string().min(1).max(64) });

const router = Router();

/**
 * POST /api/v1/orders/:orderId/cancel  { reasonCode, note? }
 * Identity comes from the JWT; the body can never carry an amount, currency, payment or customer id (strict schema).
 */
router.post('/:orderId/cancel', authenticateToken, requireCustomerRole, cancelRateLimiter, validateParams(orderParams), validateBody(customerCancelBodySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await CancellationService.customerCancel(req.user!.userId, req.params.orderId, req.body, AuditService.contextFromRequest(req));
    return ApiResponse.success(res, data, data.alreadyCancelled ? 'Order was already cancelled' : 'Order cancelled', 200);
  } catch (err) {
    next(err);
  }
});

/** GET /api/v1/orders/:orderId/refunds - the owner's refund states (safe fields only). */
router.get('/:orderId/refunds', authenticateToken, requireCustomerRole, validateParams(orderParams), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await RefundViewService.listForCustomerOrder(req.user!.userId, req.params.orderId);
    return ApiResponse.success(res, data, 'Refunds retrieved');
  } catch (err) {
    next(err);
  }
});

export default router;
