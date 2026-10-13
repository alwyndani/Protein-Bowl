import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { RoleEnum } from '@prisma/client';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { AppError } from '../../middleware/error.middleware.js';
import { messHandoverRateLimiter, messPauseRateLimiter, messPurchaseRateLimiter, messReadRateLimiter, messWriteRateLimiter } from '../../middleware/rateLimiter.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.middleware.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { AuditService } from '../audit/audit.service.js';
import { resolveIdempotencyKey } from '../order/idempotency.js';
import { MessDeliveryService } from './messDelivery.service.js';
import { MessMealService } from './messMeal.service.js';
import { MessAccountService } from './messAccount.service.js';
import { MessCancellationService } from './messCancellation.service.js';
import { MessPurchaseService } from './messPurchase.service.js';
import { accountWriteSchema, calendarQuerySchema, customerCancelSchema, emptyBodySchema, idParams, mealParams, purchaseBodySchema } from './messPolicy.js';

/**
 * Kerala Mess customer API (P10A). CUSTOMER is the canonical identity; Mess entitlement = an APPROVED MessAccount.
 * Every endpoint (except the public plan list) needs the literal CUSTOMER role: staff, SUPER_ADMIN and MD have no customer-context access, and the
 * legacy MESS_CUSTOMER role is NOT accepted by the new architecture (it gets a specific 403 so the UI can explain it).
 */
const router = Router();

function requireMessCustomer(req: Request, _res: Response, next: NextFunction) {
  const roles = req.user?.roles ?? [];
  if (!req.user) return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
  if (roles.includes(RoleEnum.CUSTOMER)) return next();
  if (roles.includes(RoleEnum.MESS_CUSTOMER)) {
    return next(new AppError('This account uses a legacy Kerala Mess role. Please contact Protein Bowl support to move it to a customer account.', 403, 'MESS_CUSTOMER_LEGACY_ROLE'));
  }
  return next(new AppError('Access denied. CUSTOMER role required.', 403, 'FORBIDDEN'));
}
const customer = [authenticateToken, requireMessCustomer] as const;

const plansQuery = z.object({ servicePointId: z.string().uuid().optional() }).strict();

// ---- public: sellable plans (computed with the same pricing service the purchase uses)
router.get('/plans', messReadRateLimiter, validateQuery(plansQuery), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query as unknown as z.infer<typeof plansQuery>;
    // `data` stays a plain ARRAY (the pre-P10A shape) so existing clients that map over it (the mobile scaffold) keep working
    return ApiResponse.success(res, await MessPurchaseService.listSellablePlans(q.servicePointId), 'Kerala Mess plans retrieved');
  } catch (err) {
    next(err);
  }
});

router.get('/service-points', ...customer, messReadRateLimiter, async (_req, res, next) => {
  try {
    return ApiResponse.success(res, { servicePoints: await MessAccountService.listServicePoints() }, 'Service points retrieved');
  } catch (err) {
    next(err);
  }
});

router.get('/account', ...customer, messReadRateLimiter, async (req, res, next) => {
  try {
    return ApiResponse.success(res, { account: await MessAccountService.getForCustomer(req.user!.userId) }, 'Kerala Mess account retrieved');
  } catch (err) {
    next(err);
  }
});

router.put('/account', ...customer, messWriteRateLimiter, validateBody(accountWriteSchema), async (req, res, next) => {
  try {
    const out = await MessAccountService.upsertForCustomer(req.user!.userId, req.body, AuditService.contextFromRequest(req));
    return ApiResponse.success(res, out, out.changed ? 'Kerala Mess account saved' : 'No change');
  } catch (err) {
    next(err);
  }
});

router.get('/subscriptions', ...customer, messReadRateLimiter, async (req, res, next) => {
  try {
    return ApiResponse.success(res, { subscriptions: await MessPurchaseService.listForCustomer(req.user!.userId) }, 'Subscriptions retrieved');
  } catch (err) {
    next(err);
  }
});

router.get('/subscriptions/:id', ...customer, messReadRateLimiter, validateParams(idParams), async (req, res, next) => {
  try {
    return ApiResponse.success(res, { subscription: await MessPurchaseService.getOwned(req.user!.userId, req.params.id) }, 'Subscription retrieved');
  } catch (err) {
    next(err);
  }
});

router.post('/subscriptions', ...customer, messPurchaseRateLimiter, validateBody(purchaseBodySchema), async (req, res, next) => {
  try {
    const key = resolveIdempotencyKey(req.headers['x-idempotency-key'], undefined);
    const out = await MessPurchaseService.purchase(req.user!.userId, key, req.body, AuditService.contextFromRequest(req));
    return ApiResponse.success(res, { subscription: out.subscription, replay: out.replay }, out.replay ? 'Existing purchase returned' : 'Purchase created; complete the online payment to activate it', out.replay ? 200 : 201);
  } catch (err) {
    next(err);
  }
});

router.get('/subscriptions/:id/meals', ...customer, messReadRateLimiter, validateParams(idParams), validateQuery(calendarQuerySchema), async (req, res, next) => {
  try {
    return ApiResponse.success(res, await MessMealService.calendar(req.user!.userId, req.params.id, req.query as never), 'Meal calendar retrieved');
  } catch (err) {
    next(err);
  }
});

// P10B: pause / resume ONE meal. A paused meal is FORFEITED (not refunded, replaced or appended). Strict empty bodies: nothing can carry a status, amount or customer.
router.post('/subscriptions/:id/meals/:mealId/pause', ...customer, messPauseRateLimiter, validateParams(mealParams), validateBody(emptyBodySchema), async (req, res, next) => {
  try {
    const out = await MessMealService.pause(req.user!.userId, req.params.id, req.params.mealId, AuditService.contextFromRequest(req));
    return ApiResponse.success(res, out, out.changed ? 'Meal paused' : 'No change: this meal was already paused');
  } catch (err) {
    next(err);
  }
});

router.post('/subscriptions/:id/meals/:mealId/resume', ...customer, messPauseRateLimiter, validateParams(mealParams), validateBody(emptyBodySchema), async (req, res, next) => {
  try {
    const out = await MessMealService.resume(req.user!.userId, req.params.id, req.params.mealId, AuditService.contextFromRequest(req));
    return ApiResponse.success(res, out, out.changed ? 'Meal resumed' : 'No change: this meal was already scheduled');
  } catch (err) {
    next(err);
  }
});

// P10C: the service-point handover code. ONLY a resident CUSTOMER with a frozen meal in the stop can obtain it (the first one becomes THE recipient); DELIVERY can never read it.
router.get('/subscriptions/:id/meals/:mealId/handover-code', ...customer, messHandoverRateLimiter, validateParams(mealParams), async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    return ApiResponse.success(res, await MessDeliveryService.handoverState(req.user!.userId, req.params.id, req.params.mealId), 'Handover code state retrieved');
  } catch (err) {
    next(err);
  }
});
router.post('/subscriptions/:id/meals/:mealId/handover-code', ...customer, messHandoverRateLimiter, validateParams(mealParams), validateBody(emptyBodySchema), async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    return ApiResponse.success(res, await MessDeliveryService.issueHandoverCode(req.user!.userId, req.params.id, req.params.mealId, 'ISSUE', AuditService.contextFromRequest(req)), 'Handover code generated', 201);
  } catch (err) {
    next(err);
  }
});
router.post('/subscriptions/:id/meals/:mealId/handover-code/regenerate', ...customer, messHandoverRateLimiter, validateParams(mealParams), validateBody(emptyBodySchema), async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    return ApiResponse.success(res, await MessDeliveryService.issueHandoverCode(req.user!.userId, req.params.id, req.params.mealId, 'REGENERATE', AuditService.contextFromRequest(req)), 'New handover code generated');
  } catch (err) {
    next(err);
  }
});

router.post('/subscriptions/:id/cancel', ...customer, messWriteRateLimiter, validateParams(idParams), validateBody(customerCancelSchema), async (req, res, next) => {
  try {
    const out = await MessCancellationService.customerCancel(req.user!.userId, req.params.id, req.body, AuditService.contextFromRequest(req));
    return ApiResponse.success(res, out, out.alreadyCancelled ? 'This subscription was already cancelled' : 'Subscription cancelled');
  } catch (err) {
    next(err);
  }
});

// ---- retired legacy endpoints (P10A): they credited a hard-coded amount to a wallet / marked meals consumed without any real meal workflow.
// They answer with a clear 410 and change NOTHING. Meal pauses and gate passes are rebuilt in later, approved phases.
const retired = (replacement: string) => (_req: Request, res: Response) =>
  ApiResponse.error(res, `This endpoint has been retired. ${replacement}`, 410, 'MESS_ENDPOINT_RETIRED');
router.post('/pause-meal', retired('Meal pausing is not available yet.'));
router.post('/verify-gatepass', retired('Gate-pass verification is not available yet.'));
router.post('/register', retired('Use PUT /mess/account to submit your hostel details.'));

export default router;
