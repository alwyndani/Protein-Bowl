import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { authenticateToken, requireCustomerRole } from '../../middleware/auth.middleware.js';
import { validateBody, validateParams } from '../../middleware/validate.middleware.js';
import { paymentAttemptRateLimiter, paymentVerifyRateLimiter } from '../../middleware/rateLimiter.middleware.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { AuditService } from '../audit/audit.service.js';
import { PaymentSessionService } from './paymentSession.service.js';
import { PaymentWebhookService } from './paymentWebhook.service.js';

const idSchema = z.string().min(1).max(64);
const orderParams = z.object({ orderId: idSchema });
const attemptParams = z.object({ orderId: idSchema, attemptId: idSchema });
const providerId = z.string().regex(/^[A-Za-z0-9_]{1,64}$/, 'Invalid provider identifier');

/** Only what the provider's checkout returns; NEVER an amount, currency or status. */
const verifyBody = z.object({
  providerOrderId: providerId,
  providerPaymentId: providerId,
  signature: z.string().regex(/^[A-Fa-f0-9]{64}$/, 'Invalid signature format')
});

const router = Router();

/** POST /api/v1/orders/:orderId/payment-attempts - create (or reuse/renew) the payment session for the caller's own order. */
router.post(
  '/:orderId/payment-attempts',
  authenticateToken,
  requireCustomerRole,
  paymentAttemptRateLimiter,
  validateParams(orderParams),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // The request body is deliberately ignored: amount and currency come from the persisted Order.
      const dto = await PaymentSessionService.createOrReuse(req.user!.userId, req.params.orderId, AuditService.contextFromRequest(req));
      return ApiResponse.success(res, dto, 'Payment session ready', 200);
    } catch (err) {
      next(err);
    }
  }
);

router.get('/:orderId/payment-attempts/:attemptId', authenticateToken, requireCustomerRole, validateParams(attemptParams), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dto = await PaymentSessionService.getOwned(req.user!.userId, req.params.orderId, req.params.attemptId);
    return ApiResponse.success(res, dto, 'Payment session retrieved');
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:orderId/payment-attempts/:attemptId/verify',
  authenticateToken,
  requireCustomerRole,
  paymentVerifyRateLimiter,
  validateParams(attemptParams),
  validateBody(verifyBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const out = await PaymentSessionService.verifyCheckout(req.user!.userId, req.params.orderId, req.params.attemptId, req.body, AuditService.contextFromRequest(req));
      const { httpStatus, ...data } = out;
      return ApiResponse.success(res, data, out.result === 'PAID' ? 'Payment verified' : 'Payment is being confirmed', httpStatus);
    } catch (err) {
      next(err);
    }
  }
);

export default router;

/**
 * Provider webhook handler (mounted in app.ts BEFORE express.json so the raw bytes survive). Authenticated ONLY by the
 * provider's signature over the raw body - never by a customer session.
 */
export async function paymentWebhookHandler(req: Request, res: Response): Promise<Response> {
  try {
    const result = await PaymentWebhookService.ingest(req.body, req.headers);
    if (result.httpStatus === 200) return res.status(200).json({ success: true });
    return res.status(result.httpStatus).json({ success: false, error: result.error });
  } catch {
    return res.status(500).json({ success: false, error: 'INGEST_FAILED' });
  }
}
