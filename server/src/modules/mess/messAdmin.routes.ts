import { NextFunction, Request, Response, Router } from 'express';
import { RoleEnum } from '@prisma/client';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware.js';
import { AppError } from '../../middleware/error.middleware.js';
import { messAdminRateLimiter, messReadRateLimiter } from '../../middleware/rateLimiter.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.middleware.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { AuditService } from '../audit/audit.service.js';
import { requireStepUp } from '../admin/stepUp.service.js';
import { MessAccountService } from './messAccount.service.js';
import { MessAdminService } from './messAdmin.service.js';
import { MessCancellationService } from './messCancellation.service.js';
import { MessPurchaseService } from './messPurchase.service.js';
import {
  accountApproveSchema,
  accountRejectSchema,
  adminCancelSchema,
  idParams,
  listQuerySchema,
  planActionSchema,
  planCreateSchema,
  planUpdateSchema,
  servicePointCreateSchema,
  servicePointUpdateSchema
} from './messPolicy.js';

/**
 * Kerala Mess administration (mounted at /api/v1/admin). Reads need 'mess:read' (SUPER_ADMIN + MD); EVERY write needs 'mess:admin' (SUPER_ADMIN only)
 * AND a fresh password step-up proof. MD can never mutate anything here. Edits carry an expected version (compare-and-set).
 */
const router = Router();
const actorOf = (req: Request) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  return { userId: req.user.userId, roles: req.user.roles };
};
const read = [authenticateToken, requirePermission('mess:read'), messReadRateLimiter] as const;
const write = (action: string) => [authenticateToken, requirePermission('mess:admin'), messAdminRateLimiter, requireStepUp(action)] as const;
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};
const ctx = (req: Request) => AuditService.contextFromRequest(req);
const viewerOf = (req: Request): 'ADMIN' | 'MD' => (req.user?.roles.includes(RoleEnum.SUPER_ADMIN) ? 'ADMIN' : 'MD');

// ---- service points
router.get('/mess/service-points', ...read, validateQuery(listQuerySchema), wrap(async (req, res) => ApiResponse.success(res, { servicePoints: await MessAdminService.listServicePoints(req.query as never) }, 'Service points retrieved')));
router.post('/mess/service-points', ...write('mess.servicepoint.write'), validateBody(servicePointCreateSchema), wrap(async (req, res) => ApiResponse.success(res, { servicePoint: await MessAdminService.createServicePoint(actorOf(req), req.body, ctx(req)) }, 'Service point created', 201)));
router.patch('/mess/service-points/:id', ...write('mess.servicepoint.write'), validateParams(idParams), validateBody(servicePointUpdateSchema), wrap(async (req, res) => ApiResponse.success(res, { servicePoint: await MessAdminService.updateServicePoint(actorOf(req), req.params.id, req.body, ctx(req)) }, 'Service point updated')));

// ---- plans
router.get('/mess/plans', ...read, validateQuery(listQuerySchema), wrap(async (req, res) => ApiResponse.success(res, { plans: await MessAdminService.listPlans(req.query as never) }, 'Plans retrieved')));
router.post('/mess/plans', ...write('mess.plan.write'), validateBody(planCreateSchema), wrap(async (req, res) => ApiResponse.success(res, { plan: await MessAdminService.createPlan(actorOf(req), req.body, ctx(req)) }, 'Plan created as a draft', 201)));
router.patch('/mess/plans/:id', ...write('mess.plan.write'), validateParams(idParams), validateBody(planUpdateSchema), wrap(async (req, res) => ApiResponse.success(res, { plan: await MessAdminService.updatePlan(actorOf(req), req.params.id, req.body, ctx(req)) }, 'Plan updated')));
router.post('/mess/plans/:id/activate', ...write('mess.plan.write'), validateParams(idParams), validateBody(planActionSchema), wrap(async (req, res) => ApiResponse.success(res, await MessAdminService.activatePlan(actorOf(req), req.params.id, req.body, ctx(req)), 'Plan activated')));
router.post('/mess/plans/:id/archive', ...write('mess.plan.write'), validateParams(idParams), validateBody(planActionSchema), wrap(async (req, res) => ApiResponse.success(res, await MessAdminService.archivePlan(actorOf(req), req.params.id, req.body, ctx(req)), 'Plan archived')));

// ---- account approvals
router.get('/mess/accounts', ...read, validateQuery(listQuerySchema), wrap(async (req, res) => ApiResponse.success(res, await MessAccountService.listForStaff(viewerOf(req), req.query as never), 'Accounts retrieved')));
router.post('/mess/accounts/:id/approve', ...write('mess.account.review'), validateParams(idParams), validateBody(accountApproveSchema), wrap(async (req, res) => ApiResponse.success(res, await MessAccountService.approve(actorOf(req), req.params.id, req.body, ctx(req)), 'Account approved')));
router.post('/mess/accounts/:id/reject', ...write('mess.account.review'), validateParams(idParams), validateBody(accountRejectSchema), wrap(async (req, res) => ApiResponse.success(res, await MessAccountService.reject(actorOf(req), req.params.id, req.body, ctx(req)), 'Account rejected')));

// ---- subscriptions
router.get('/mess/subscriptions', ...read, validateQuery(listQuerySchema), wrap(async (req, res) => ApiResponse.success(res, await MessPurchaseService.listForStaff(req.query as never), 'Subscriptions retrieved')));
router.post('/mess/subscriptions/:id/cancel', ...write('mess.subscription.cancel'), validateParams(idParams), validateBody(adminCancelSchema), wrap(async (req, res) => {
  const out = await MessCancellationService.adminCancel(actorOf(req), req.params.id, req.body, ctx(req));
  return ApiResponse.success(res, out, out.alreadyCancelled ? 'This subscription was already cancelled' : 'Subscription cancelled');
}));

export default router;
