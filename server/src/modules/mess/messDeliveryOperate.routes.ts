import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware.js';
import { AppError } from '../../middleware/error.middleware.js';
import { messDeliveryActionRateLimiter, messDeliveryVerifyRateLimiter } from '../../middleware/rateLimiter.middleware.js';
import { validateBody, validateParams } from '../../middleware/validate.middleware.js';
import { sanitizeNote } from '../refund/cancellationPolicy.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { requireStepUp } from '../admin/stepUp.service.js';
import { AuditService } from '../audit/audit.service.js';
import { MessDeliveryService } from './messDelivery.service.js';
import { emptyBodySchema, handoverVerifySchema, runParams, stopFailSchema, stopParams } from './messPolicy.js';

/**
 * Role simplification: SUPER_ADMIN operates Kerala Mess bulk delivery (mounted at /api/v1/admin/mess/delivery). Needs 'mess:delivery:operate' (SUPER_ADMIN only) and
 * EVERY action here requires a fresh password step-up proof. The run's current state is read through the existing SUPER_ADMIN monitor (GET /mess/delivery/monitor),
 * which already lists runs and stops. There is no cash, payment, refund, wallet or customer datum, and the handover code is never part of any response.
 */
const router = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};
const admin = (req: Request) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  return { userId: req.user.userId, roles: req.user.roles as readonly string[] };
};
const ctx = (req: Request) => AuditService.contextFromRequest(req);
const write = (action: string) => [authenticateToken, requirePermission('mess:delivery:operate'), messDeliveryActionRateLimiter, requireStepUp(action)] as const;

const takeoverSchema = z
  .object({
    expectedEmployeeId: z.string().uuid(),
    reason: z.string().max(1000).transform((v) => sanitizeNote(v)).refine((v): v is string => typeof v === 'string' && v.length >= 3, { message: 'A reason of at least 3 characters is required' })
  })
  .strict();

router.post('/runs/:id/claim', ...write('mess.delivery.operate.claim'), validateParams(runParams), validateBody(emptyBodySchema), wrap(async (req, res) => {
  const out = await MessDeliveryService.adminClaim(admin(req), req.params.id, ctx(req));
  return ApiResponse.success(res, out, out.changed ? 'Run claimed' : 'No change: an administrator already operates this run');
}));

router.post('/runs/:id/dispatch', ...write('mess.delivery.operate.dispatch'), validateParams(runParams), validateBody(emptyBodySchema), wrap(async (req, res) => {
  const out = await MessDeliveryService.adminDispatch(admin(req), req.params.id, ctx(req));
  return ApiResponse.success(res, out, out.changed ? 'Run dispatched' : 'No change: the run was already dispatched');
}));

router.post('/runs/:id/takeover', ...write('mess.delivery.operate.takeover'), validateParams(runParams), validateBody(takeoverSchema), wrap(async (req, res) => {
  const out = await MessDeliveryService.adminTakeover(admin(req), req.params.id, req.body, ctx(req));
  return ApiResponse.success(res, out, out.changed ? 'Run taken over' : 'No change: this run was already taken over');
}));

router.post(
  '/runs/:id/stops/:stopId/verify',
  authenticateToken, requirePermission('mess:delivery:operate'), messDeliveryVerifyRateLimiter, requireStepUp('mess.delivery.operate.verify'),
  validateParams(stopParams), validateBody(handoverVerifySchema),
  wrap(async (req, res) => {
    const receivedAt = new Date(); // taken before any lock wait: a code submitted before a concurrent regeneration committed is stale, not a guess
    const out = await MessDeliveryService.verifyAsAdmin(admin(req), req.params.id, req.params.stopId, (req.body as { code: string }).code, receivedAt, ctx(req));
    return ApiResponse.success(res, out, out.changed ? 'Handover confirmed' : 'No change: this stop was already handed over');
  })
);

router.post('/runs/:id/stops/:stopId/fail', ...write('mess.delivery.operate.fail'), validateParams(stopParams), validateBody(stopFailSchema), wrap(async (req, res) => {
  const out = await MessDeliveryService.failAsAdmin(admin(req), req.params.id, req.params.stopId, req.body, ctx(req));
  return ApiResponse.success(res, out, out.changed ? 'Problem reported' : 'No change: a problem was already reported for this stop');
}));

router.post('/runs/:id/stops/:stopId/retry', ...write('mess.delivery.operate.retry'), validateParams(stopParams), validateBody(emptyBodySchema), wrap(async (req, res) => {
  const out = await MessDeliveryService.retryAsAdmin(admin(req), req.params.id, req.params.stopId, ctx(req));
  return ApiResponse.success(res, out, out.changed ? 'Stop reopened for another attempt' : 'No change: this stop is already open');
}));

export default router;
