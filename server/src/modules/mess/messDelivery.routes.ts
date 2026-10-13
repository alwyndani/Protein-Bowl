import { NextFunction, Request, Response, Router } from 'express';
import { RoleEnum } from '@prisma/client';
import { authenticateToken, requireExactRoles, requirePermission } from '../../middleware/auth.middleware.js';
import { AppError } from '../../middleware/error.middleware.js';
import { messDeliveryActionRateLimiter, messDeliveryReadRateLimiter, messDeliveryVerifyRateLimiter } from '../../middleware/rateLimiter.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.middleware.js';
import { getRequestScope } from '../../authz/branchScope.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { AuditService } from '../audit/audit.service.js';
import { DriverCaller, MessDeliveryService } from './messDelivery.service.js';
import { deliveryQuerySchema, emptyBodySchema, handoverVerifySchema, runParams, stopFailSchema, stopParams } from './messPolicy.js';

/**
 * Kerala Mess bulk delivery (P10C), mounted at /api/v1/mess/delivery. Reuses the central staff authentication (nothing here is delivery-specific auth).
 *   driver:  exact DELIVERY role + 'mess:delivery:read' / 'mess:delivery:write', authorized branches only; one driver owns a run.
 *   monitor: SUPER_ADMIN / MD, read-only, with an EXPLICIT branch. CHEF / SUPER_ADMIN / MD can never claim, dispatch, verify, fail or retry.
 * There is no cash, payment, refund, wallet or customer datum anywhere in this API, and the handover code is never part of any response here.
 */
const router = Router();

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};

async function resolveDriver(req: Request): Promise<DriverCaller> {
  const scope = await getRequestScope(req);
  if (!scope.employeeProfileId) throw new AppError('No employee profile: this account cannot access delivery work', 403, 'NO_EMPLOYEE_PROFILE');
  if (scope.branchIds.length === 0) {
    await AuditService.recordSafe({ actor: { userId: scope.userId, roles: scope.roles }, action: 'BRANCH_ACCESS_DENIED', entity: 'MessDelivery', payload: { code: 'NO_BRANCH_ASSIGNMENT' }, context: AuditService.contextFromRequest(req) });
    throw new AppError('No branch assignment: this account is not assigned to any branch', 403, 'NO_BRANCH_ASSIGNMENT');
  }
  return { userId: scope.userId, employeeProfileId: scope.employeeProfileId, branchIds: [...scope.branchIds] };
}

const driverRead = [authenticateToken, requireExactRoles([RoleEnum.DELIVERY]), requirePermission('mess:delivery:read'), messDeliveryReadRateLimiter] as const;
const driverAction = [authenticateToken, requireExactRoles([RoleEnum.DELIVERY]), requirePermission('mess:delivery:write'), messDeliveryActionRateLimiter] as const;
const ctx = (req: Request) => AuditService.contextFromRequest(req);

router.get('/runs', ...driverRead, validateQuery(deliveryQuerySchema), wrap(async (req, res) => {
  const caller = await resolveDriver(req);
  return ApiResponse.success(res, await MessDeliveryService.listForDriver(caller, (req.query as { branchId?: string }).branchId), 'Mess delivery runs retrieved');
}));

router.get('/runs/:id', ...driverRead, validateParams(runParams), wrap(async (req, res) => {
  const run = await MessDeliveryService.getForDriver(await resolveDriver(req), req.params.id);
  if (!run) throw new AppError('Delivery run not found', 404, 'NOT_FOUND');
  return ApiResponse.success(res, { run }, 'Mess delivery run retrieved');
}));

router.post('/runs/:id/claim', ...driverAction, validateParams(runParams), validateBody(emptyBodySchema), wrap(async (req, res) => {
  const out = await MessDeliveryService.claim(await resolveDriver(req), req.params.id, ctx(req));
  return ApiResponse.success(res, out, out.changed ? 'Run claimed' : 'No change: you already own this run');
}));

router.post('/runs/:id/dispatch', ...driverAction, validateParams(runParams), validateBody(emptyBodySchema), wrap(async (req, res) => {
  const out = await MessDeliveryService.dispatch(await resolveDriver(req), req.params.id, ctx(req));
  return ApiResponse.success(res, out, out.changed ? 'Run dispatched' : 'No change: the run was already dispatched');
}));

router.post(
  '/runs/:id/stops/:stopId/verify',
  authenticateToken, requireExactRoles([RoleEnum.DELIVERY]), requirePermission('mess:delivery:write'), messDeliveryVerifyRateLimiter,
  validateParams(stopParams), validateBody(handoverVerifySchema),
  wrap(async (req, res) => {
    const receivedAt = new Date(); // taken before any lock wait: a code submitted before a concurrent regeneration committed is stale, not a guess
    const out = await MessDeliveryService.verify(await resolveDriver(req), req.params.id, req.params.stopId, (req.body as { code: string }).code, receivedAt, ctx(req));
    return ApiResponse.success(res, out, out.changed ? 'Handover confirmed' : 'No change: this stop was already handed over');
  })
);

router.post('/runs/:id/stops/:stopId/fail', ...driverAction, validateParams(stopParams), validateBody(stopFailSchema), wrap(async (req, res) => {
  const out = await MessDeliveryService.fail(await resolveDriver(req), req.params.id, req.params.stopId, req.body, ctx(req));
  return ApiResponse.success(res, out, out.changed ? 'Problem reported' : 'No change: a problem was already reported for this stop');
}));

router.post('/runs/:id/stops/:stopId/retry', ...driverAction, validateParams(stopParams), validateBody(emptyBodySchema), wrap(async (req, res) => {
  const out = await MessDeliveryService.retry(await resolveDriver(req), req.params.id, req.params.stopId, ctx(req));
  return ApiResponse.success(res, out, out.changed ? 'Stop reopened for another attempt' : 'No change: this stop is already open');
}));

// read-only monitor: SUPER_ADMIN and MD, one explicit branch
router.get('/monitor', authenticateToken, requireExactRoles([RoleEnum.SUPER_ADMIN, RoleEnum.MD]), requirePermission('mess:delivery:read'), messDeliveryReadRateLimiter, validateQuery(deliveryQuerySchema), wrap(async (req, res) => {
  const branchId = (req.query as { branchId?: string }).branchId;
  if (!branchId) throw new AppError('A branchId is required to read the Mess delivery monitor', 400, 'BRANCH_REQUIRED');
  const view = req.user?.roles.includes(RoleEnum.SUPER_ADMIN) ? 'ADMIN' : 'MD';
  return ApiResponse.success(res, await MessDeliveryService.monitor(branchId, view), 'Mess delivery monitor retrieved');
}));

export default router;
