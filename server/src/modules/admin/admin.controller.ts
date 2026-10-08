import { Request, Response, NextFunction } from 'express';
import { RoleEnum } from '@prisma/client';
import { ApiResponse } from '../../utils/apiResponse.js';
import { AuditService } from '../audit/audit.service.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AdminContext, StaffAdminService } from './staff.service.js';
import { BranchAdminService } from './branch.service.js';
import { AuditQueryService } from './auditQuery.service.js';
import { StepUpService } from './stepUp.service.js';
import { StaffSelfService, getPermissionCatalogue } from './staffSelf.service.js';

function ctxOf(req: Request): AdminContext {
  if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  return { actor: { userId: req.user.userId, roles: req.user.roles }, audit: AuditService.contextFromRequest(req) };
}

/** Thin HTTP layer: inputs are already validated by the route-level Zod middleware. */
const handle = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res).catch(next);
};

export class AdminController {
  // -------------------------------------------------------------- step-up
  static stepUp = handle(async (req, res) => {
    const result = await StepUpService.issue(req, req.user!.userId, req.body.password);
    return ApiResponse.success(res, result, 'Password verified. Use the step-up token in the X-Step-Up-Token header for sensitive actions.');
  });

  // -------------------------------------------------------------- staff
  static listStaff = handle(async (req, res) => {
    const data = await StaffAdminService.list(req.query as never);
    return ApiResponse.success(res, data, 'Staff retrieved');
  });

  static getStaff = handle(async (req, res) => {
    return ApiResponse.success(res, await StaffAdminService.get(req.params.id), 'Staff retrieved');
  });

  static createStaff = handle(async (req, res) => {
    const data = await StaffAdminService.create(ctxOf(req), req.body);
    return ApiResponse.success(res, data, 'Staff account created in PENDING state. Hand the one-time setup link to the staff member; no email was sent.', 201);
  });

  static updateStaff = handle(async (req, res) => {
    return ApiResponse.success(res, await StaffAdminService.update(ctxOf(req), req.params.id, req.body), 'Staff updated');
  });

  static reissueInvitation = handle(async (req, res) => {
    const data = await StaffAdminService.reissueInvitation(ctxOf(req), req.params.id);
    return ApiResponse.success(res, data, 'Invitation reissued. The previous invitation is no longer valid; no email was sent.');
  });

  static assignRole = handle(async (req, res) => {
    const data = await StaffAdminService.assignRole(ctxOf(req), req.params.id, req.body.role as RoleEnum);
    return ApiResponse.success(res, data, data.changed ? 'Role assigned' : 'Role was already assigned');
  });

  static revokeRole = handle(async (req, res) => {
    const data = await StaffAdminService.revokeRole(ctxOf(req), req.params.id, req.params.role as RoleEnum);
    return ApiResponse.success(res, data, data.changed ? 'Role revoked' : 'Role was not assigned');
  });

  static listStaffBranches = handle(async (req, res) => {
    return ApiResponse.success(res, await StaffAdminService.listBranches(req.params.id), 'Staff branches retrieved');
  });

  static assignBranch = handle(async (req, res) => {
    const data = await StaffAdminService.assignBranch(ctxOf(req), req.params.id, req.body.branchId);
    return ApiResponse.success(res, data, data.changed ? 'Branch assigned' : 'Branch was already assigned');
  });

  static revokeBranch = handle(async (req, res) => {
    const data = await StaffAdminService.revokeBranch(ctxOf(req), req.params.id, req.params.branchId);
    return ApiResponse.success(res, data, data.changed ? 'Branch access revoked' : 'Branch was not assigned');
  });

  static deactivate = handle(async (req, res) => {
    const data = await StaffAdminService.deactivate(ctxOf(req), req.params.id, req.body);
    return ApiResponse.success(res, data, data.changed ? 'Account deactivated and all sessions revoked' : 'Account was already inactive');
  });

  static activate = handle(async (req, res) => {
    const data = await StaffAdminService.activate(ctxOf(req), req.params.id, req.body);
    return ApiResponse.success(res, data, data.changed ? 'Account activated' : 'Account was already active');
  });

  // -------------------------------------------------------------- branches
  static listBranches = handle(async (req, res) => {
    return ApiResponse.success(res, await BranchAdminService.list(req.query as never), 'Branches retrieved');
  });

  static getBranch = handle(async (req, res) => {
    return ApiResponse.success(res, await BranchAdminService.get(req.params.id), 'Branch retrieved');
  });

  static createBranch = handle(async (req, res) => {
    return ApiResponse.success(res, await BranchAdminService.create(ctxOf(req), req.body), 'Branch created', 201);
  });

  static updateBranch = handle(async (req, res) => {
    return ApiResponse.success(res, await BranchAdminService.update(ctxOf(req), req.params.id, req.body), 'Branch updated');
  });

  // -------------------------------------------------------------- audit
  static listAudit = handle(async (req, res) => {
    return ApiResponse.success(res, await AuditQueryService.list(req.query as never), 'Audit history retrieved');
  });

  // -------------------------------------------------------------- staff self
  static staffMe = handle(async (req, res) => {
    return ApiResponse.success(res, await StaffSelfService.getMe(req.user!.userId), 'Staff profile retrieved');
  });

  static permissionCatalogue = handle(async (_req, res) => {
    return ApiResponse.success(res, getPermissionCatalogue(), 'Permission catalogue retrieved');
  });
}
