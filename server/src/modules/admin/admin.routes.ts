import { Router } from 'express';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.middleware.js';
import { stepUpRateLimiter } from '../../middleware/rateLimiter.middleware.js';
import { requireStepUp } from './stepUp.service.js';
import { AdminController as C } from './admin.controller.js';
import {
  activateBodySchema,
  assignBranchBodySchema,
  assignRoleBodySchema,
  auditQuerySchema,
  createBranchBodySchema,
  createStaffBodySchema,
  deactivateBodySchema,
  idParamSchema,
  listBranchesQuerySchema,
  listStaffQuerySchema,
  stepUpBodySchema,
  staffBranchParamSchema,
  staffRoleParamSchema,
  updateBranchBodySchema,
  updateStaffBodySchema
} from './admin.validator.js';

/**
 * Platform administration (mounted at /api/v1/admin).
 * Authorization is explicit permissions (no SUPER_ADMIN bypass): 'staff:admin', 'audit:read', 'branch:read', 'branch:write'.
 * MD holds only 'branch:read'. Customers and every other role are rejected.
 */
const router = Router();
router.use(authenticateToken);

// ---- password step-up (SUPER_ADMIN re-verifies their password -> short-lived proof)
router.post('/step-up', requirePermission('staff:admin'), stepUpRateLimiter, validateBody(stepUpBodySchema), C.stepUp);

// ---- staff
const staffAdmin = requirePermission('staff:admin');
router.get('/staff', staffAdmin, validateQuery(listStaffQuerySchema), C.listStaff);
router.post('/staff', staffAdmin, requireStepUp('staff.create'), validateBody(createStaffBodySchema), C.createStaff);
router.get('/staff/:id', staffAdmin, validateParams(idParamSchema), C.getStaff);
router.patch('/staff/:id', staffAdmin, validateParams(idParamSchema), validateBody(updateStaffBodySchema), C.updateStaff);

router.post('/staff/:id/invitation', staffAdmin, requireStepUp('staff.invitation.reissue'), validateParams(idParamSchema), C.reissueInvitation);

router.post('/staff/:id/roles', staffAdmin, requireStepUp('staff.role.assign'), validateParams(idParamSchema), validateBody(assignRoleBodySchema), C.assignRole);
router.delete('/staff/:id/roles/:role', staffAdmin, requireStepUp('staff.role.revoke'), validateParams(staffRoleParamSchema), C.revokeRole);

router.get('/staff/:id/branches', staffAdmin, validateParams(idParamSchema), C.listStaffBranches);
router.post('/staff/:id/branches', staffAdmin, requireStepUp('staff.branch.assign'), validateParams(idParamSchema), validateBody(assignBranchBodySchema), C.assignBranch);
router.delete('/staff/:id/branches/:branchId', staffAdmin, requireStepUp('staff.branch.revoke'), validateParams(staffBranchParamSchema), C.revokeBranch);

router.post('/staff/:id/deactivate', staffAdmin, requireStepUp('staff.deactivate'), validateParams(idParamSchema), validateBody(deactivateBodySchema), C.deactivate);
router.post('/staff/:id/activate', staffAdmin, requireStepUp('staff.activate'), validateParams(idParamSchema), validateBody(activateBodySchema), C.activate);

// ---- branches (MD may read; only SUPER_ADMIN mutates)
router.get('/branches', requirePermission('branch:read'), validateQuery(listBranchesQuerySchema), C.listBranches);
router.get('/branches/:id', requirePermission('branch:read'), validateParams(idParamSchema), C.getBranch);
router.post('/branches', requirePermission('branch:write'), validateBody(createBranchBodySchema), C.createBranch);
router.patch('/branches/:id', requirePermission('branch:write'), validateParams(idParamSchema), validateBody(updateBranchBodySchema), C.updateBranch);

// ---- audit history (SUPER_ADMIN only; MD is excluded)
router.get('/audit', requirePermission('audit:read'), validateQuery(auditQuerySchema), C.listAudit);

export default router;
