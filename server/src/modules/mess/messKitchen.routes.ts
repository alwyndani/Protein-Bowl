import { NextFunction, Request, Response, Router } from 'express';
import { RoleEnum } from '@prisma/client';
import { z } from 'zod';
import { authenticateToken, requireExactRoles, requirePermission } from '../../middleware/auth.middleware.js';
import { AppError } from '../../middleware/error.middleware.js';
import { messKitchenRateLimiter } from '../../middleware/rateLimiter.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.middleware.js';
import { BranchScope, getRequestScope } from '../../authz/branchScope.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { AuditService } from '../audit/audit.service.js';
import { MessKitchenService } from './messKitchen.service.js';
import { MessDeliveryService } from './messDelivery.service.js';
import { batchStartSchema, emptyBodySchema, idParams, kitchenReadQuerySchema } from './messPolicy.js';

/**
 * Kerala Mess kitchen (P10B), mounted at /api/v1/mess/kitchen. Reuses the central staff authentication; nothing here is Chef-specific auth.
 *   reads : CHEF (own branches, never "all") and MD / SUPER_ADMIN (read-only, EXPLICIT branchId)   -> 'mess:kitchen:read'
 *   writes: CHEF ONLY (exact role) with 'mess:kitchen:write', on an authorized branch.             SUPER_ADMIN and MD can never prepare.
 */
const router = Router();

async function readBranches(req: Request, scope: BranchScope, requested: string | undefined): Promise<string[]> {
  if (scope.roles.includes(RoleEnum.CHEF)) {
    if (scope.branchIds.length === 0) throw new AppError('No branch assignment: this account is not assigned to any branch', 403, 'NO_BRANCH_ASSIGNMENT');
    if (requested && !scope.branchIds.includes(requested)) {
      await AuditService.recordSafe({ actor: { userId: scope.userId, roles: scope.roles }, action: 'BRANCH_ACCESS_DENIED', entity: 'MessKitchen', payload: { mode: 'read', requestedBranchId: requested, code: 'BRANCH_FORBIDDEN' }, context: AuditService.contextFromRequest(req) });
      throw new AppError('You do not have access to the requested branch', 403, 'BRANCH_FORBIDDEN');
    }
    return requested ? [requested] : [...scope.branchIds];
  }
  if (!requested) throw new AppError('A branchId is required to read the Mess kitchen', 400, 'BRANCH_REQUIRED');
  return [requested];
}

const read = [authenticateToken, requirePermission('mess:kitchen:read'), messKitchenRateLimiter] as const;
const chef = [authenticateToken, requireExactRoles([RoleEnum.CHEF]), requirePermission('mess:kitchen:write'), messKitchenRateLimiter] as const;
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};
const chefScope = async (req: Request) => {
  const scope = await getRequestScope(req);
  if (scope.branchIds.length === 0) throw new AppError('No branch assignment: this account is not assigned to any branch', 403, 'NO_BRANCH_ASSIGNMENT');
  return { userId: scope.userId, branchIds: scope.branchIds };
};

router.get('/demand', ...read, validateQuery(kitchenReadQuerySchema), wrap(async (req, res) => {
  const scope = await getRequestScope(req);
  const q = req.query as unknown as z.infer<typeof kitchenReadQuerySchema>;
  const branchIds = await readBranches(req, scope, q.branchId);
  return ApiResponse.success(res, { ...(await MessKitchenService.demand(branchIds, q)), branchIds }, 'Mess kitchen demand retrieved');
}));

router.get('/batches', ...read, validateQuery(kitchenReadQuerySchema), wrap(async (req, res) => {
  const scope = await getRequestScope(req);
  const q = req.query as unknown as z.infer<typeof kitchenReadQuerySchema>;
  const branchIds = await readBranches(req, scope, q.branchId);
  return ApiResponse.success(res, await MessKitchenService.batches(branchIds, q), 'Mess kitchen batches retrieved');
}));

router.post('/batches', ...chef, validateBody(batchStartSchema), wrap(async (req, res) => {
  const out = await MessKitchenService.start(await chefScope(req), req.body, AuditService.contextFromRequest(req));
  return ApiResponse.success(res, out, out.changed ? 'Preparation started' : 'No change: this batch was already started', out.changed ? 201 : 200);
}));

router.post('/batches/:id/ready', ...chef, validateParams(idParams), validateBody(emptyBodySchema), wrap(async (req, res) => {
  const out = await MessKitchenService.markReady(await chefScope(req), req.params.id, AuditService.contextFromRequest(req));
  return ApiResponse.success(res, out, out.changed ? 'Batch marked ready' : 'No change: the batch was already ready');
}));

// P10C: the CHEF explicitly releases a READY batch into ONE bulk delivery run (one stop per frozen service point). Idempotent (unique batchId).
router.post('/batches/:id/release', ...chef, validateParams(idParams), validateBody(emptyBodySchema), wrap(async (req, res) => {
  const out = await MessDeliveryService.release(await chefScope(req), req.params.id, AuditService.contextFromRequest(req));
  return ApiResponse.success(res, out, out.changed ? 'Batch released for delivery' : 'No change: this batch was already released', out.changed ? 201 : 200);
}));

export default router;
