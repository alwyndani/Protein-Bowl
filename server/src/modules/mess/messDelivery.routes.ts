import { NextFunction, Request, Response, Router } from 'express';
import { RoleEnum } from '@prisma/client';
import { authenticateToken, requireExactRoles, requirePermission } from '../../middleware/auth.middleware.js';
import { AppError } from '../../middleware/error.middleware.js';
import { messDeliveryReadRateLimiter } from '../../middleware/rateLimiter.middleware.js';
import { validateQuery } from '../../middleware/validate.middleware.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { MessDeliveryService } from './messDelivery.service.js';
import { deliveryQuerySchema } from './messPolicy.js';

/**
 * Kerala Mess bulk delivery (P10C), mounted at /api/v1/mess/delivery.
 *   monitor: SUPER_ADMIN, read-only, with an EXPLICIT branch.
 *
 * Role simplification (B2a): the DELIVERY driver surface (run list, run detail, claim, dispatch, stop verify / fail / retry) was REMOVED and now answers 404.
 * A SUPER_ADMIN claims, starts and works a run through /api/v1/admin/mess/delivery/runs/... (messDeliveryOperate.routes.ts), each write protected by a fresh
 * password step-up. There is no cash, payment, refund, wallet or customer datum anywhere in this API, and the handover code is never part of any response here.
 */
const router = Router();

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};

// read-only monitor: SUPER_ADMIN, one explicit branch
router.get('/monitor', authenticateToken, requireExactRoles([RoleEnum.SUPER_ADMIN]), requirePermission('mess:delivery:read'), messDeliveryReadRateLimiter, validateQuery(deliveryQuerySchema), wrap(async (req, res) => {
  const branchId = (req.query as { branchId?: string }).branchId;
  if (!branchId) throw new AppError('A branchId is required to read the Mess delivery monitor', 400, 'BRANCH_REQUIRED');
  const view = 'ADMIN' as const;
  return ApiResponse.success(res, await MessDeliveryService.monitor(branchId, view), 'Mess delivery monitor retrieved');
}));

export default router;
