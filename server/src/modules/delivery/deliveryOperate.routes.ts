import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware.js';
import { AppError } from '../../middleware/error.middleware.js';
import { deliveryActionRateLimiter, deliveryReadRateLimiter, deliveryVerifyRateLimiter } from '../../middleware/rateLimiter.middleware.js';
import { validateBody, validateParams } from '../../middleware/validate.middleware.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { requireStepUp } from '../admin/stepUp.service.js';
import { AuditService } from '../audit/audit.service.js';
import { reportFailureBodySchema } from './delivery.service.js';
import { DeliveryOperateService, operateEmptyBodySchema, operatorRetryBodySchema, takeoverBodySchema } from './deliveryOperate.service.js';
import { verifyBodySchema } from './deliveryProof.service.js';

/**
 * Role simplification: SUPER_ADMIN operates direct-order delivery (mounted at /api/v1/admin). Needs 'delivery:operate' (SUPER_ADMIN only).
 * EVERY state-changing action requires a fresh password step-up proof; the read does not. Nothing here accepts a status, payment, refund, amount,
 * customer or branch field, and the Delivery Code never appears in a response. DELIVERY and every other role are rejected.
 */
const router = Router();
const orderParams = z.object({ orderId: z.string().min(1).max(64) });
const admin = (req: Request) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  return { userId: req.user.userId, roles: req.user.roles };
};
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};
const ctx = (req: Request) => AuditService.contextFromRequest(req);
const write = (action: string) => [authenticateToken, requirePermission('delivery:operate'), deliveryActionRateLimiter, requireStepUp(action)] as const;

router.get('/delivery/orders/:orderId', authenticateToken, requirePermission('delivery:operate'), deliveryReadRateLimiter, validateParams(orderParams), wrap(async (req, res) => {
  return ApiResponse.success(res, { order: await DeliveryOperateService.getOperatedOrder(req.params.orderId) }, 'Delivery order retrieved');
}));

router.post('/delivery/orders/:orderId/dispatch', ...write('delivery.operate.dispatch'), validateParams(orderParams), validateBody(operateEmptyBodySchema), wrap(async (req, res) => {
  const out = await DeliveryOperateService.dispatch(req.params.orderId, admin(req), ctx(req));
  return ApiResponse.success(res, out, out.changed ? 'Delivery started' : 'No change: this delivery was already started');
}));

router.post('/delivery/orders/:orderId/takeover', ...write('delivery.operate.takeover'), validateParams(orderParams), validateBody(takeoverBodySchema), wrap(async (req, res) => {
  const out = await DeliveryOperateService.takeover(req.params.orderId, req.body, admin(req), ctx(req));
  return ApiResponse.success(res, out, out.changed ? 'Delivery taken over' : 'No change: this delivery was already taken over');
}));

router.post(
  '/delivery/orders/:orderId/verify-delivery',
  authenticateToken, requirePermission('delivery:operate'), deliveryVerifyRateLimiter, requireStepUp('delivery.operate.verify'),
  validateParams(orderParams), validateBody(verifyBodySchema),
  wrap(async (req, res) => {
    const receivedAt = new Date(); // taken before any lock wait: a code submitted before a concurrent regeneration committed is stale, not a guess
    const out = await DeliveryOperateService.verifyDelivery(req.params.orderId, (req.body as { code: string }).code, admin(req), receivedAt, ctx(req));
    return ApiResponse.success(res, out, out.changed ? 'Delivery confirmed' : 'No change: this delivery was already confirmed');
  })
);

router.post('/delivery/orders/:orderId/report-failure', ...write('delivery.operate.report'), validateParams(orderParams), validateBody(reportFailureBodySchema), wrap(async (req, res) => {
  const out = await DeliveryOperateService.reportFailure(req.params.orderId, req.body, admin(req), ctx(req));
  return ApiResponse.success(res, out, out.changed ? 'Problem reported' : 'No change: a problem was already reported');
}));

router.post('/delivery/orders/:orderId/retry', ...write('delivery.operate.retry'), validateParams(orderParams), validateBody(operatorRetryBodySchema), wrap(async (req, res) => {
  const out = await DeliveryOperateService.retry(req.params.orderId, req.body, admin(req), ctx(req));
  return ApiResponse.success(res, out, 'Delivery retry arranged');
}));

router.post('/delivery/orders/:orderId/resume', ...write('delivery.operate.resume'), validateParams(orderParams), validateBody(operateEmptyBodySchema), wrap(async (req, res) => {
  const out = await DeliveryOperateService.resume(req.params.orderId, admin(req), ctx(req));
  return ApiResponse.success(res, out, out.changed ? 'Delivery resumed' : 'No change: this delivery is already on the road');
}));

export default router;
