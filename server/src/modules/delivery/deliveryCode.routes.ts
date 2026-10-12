import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { authenticateToken, requireCustomerRole } from '../../middleware/auth.middleware.js';
import { AppError } from '../../middleware/error.middleware.js';
import {
  deliveryCodeIssueRateLimiter,
  deliveryCodeReadRateLimiter,
  deliveryCodeRegenerateRateLimiter
} from '../../middleware/rateLimiter.middleware.js';
import { validateBody, validateParams } from '../../middleware/validate.middleware.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { AuditService } from '../audit/audit.service.js';
import { DeliveryProofService, emptyProofBodySchema } from './deliveryProof.service.js';

/**
 * P9B customer Delivery Code API (mounted at /api/v1/orders). CUSTOMER owner only (literal CUSTOMER role; a foreign or unknown order is the
 * same 404). The plaintext code is returned ONLY by issue / regenerate, with Cache-Control: no-store; it is never retrievable again.
 */
const router = Router();
const orderParams = z.object({ orderId: z.string().min(1).max(64) });

async function customerOf(req: Request): Promise<{ userId: string; customerProfileId: string }> {
  if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  const profile = await prisma.customerProfile.findUnique({ where: { userId: req.user.userId }, select: { id: true } });
  if (!profile) throw new AppError('Customer profile not found', 404, 'NOT_FOUND');
  return { userId: req.user.userId, customerProfileId: profile.id };
}

const guard = [authenticateToken, requireCustomerRole] as const;

router.get('/:orderId/delivery-code', ...guard, deliveryCodeReadRateLimiter, validateParams(orderParams), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const c = await customerOf(req);
    res.set('Cache-Control', 'no-store');
    return ApiResponse.success(res, await DeliveryProofService.getCustomerState(req.params.orderId, c.customerProfileId), 'Delivery code state retrieved');
  } catch (err) {
    next(err);
  }
});

router.post('/:orderId/delivery-code', ...guard, deliveryCodeIssueRateLimiter, validateParams(orderParams), validateBody(emptyProofBodySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const c = await customerOf(req);
    const data = await DeliveryProofService.issue(req.params.orderId, c, AuditService.contextFromRequest(req));
    res.set('Cache-Control', 'no-store');
    return ApiResponse.success(res, data, 'Delivery code generated', 201);
  } catch (err) {
    next(err);
  }
});

router.post('/:orderId/delivery-code/regenerate', ...guard, deliveryCodeRegenerateRateLimiter, validateParams(orderParams), validateBody(emptyProofBodySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const c = await customerOf(req);
    const data = await DeliveryProofService.regenerate(req.params.orderId, c, AuditService.contextFromRequest(req));
    res.set('Cache-Control', 'no-store');
    return ApiResponse.success(res, data, 'New delivery code generated', 200);
  } catch (err) {
    next(err);
  }
});

export default router;
