import type { Request } from 'express';
import { RoleEnum } from '@prisma/client';
import { prisma } from '../config/database.js';
import { AppError } from '../middleware/error.middleware.js';
import { AuditService } from '../modules/audit/audit.service.js';
import { ROLE_SCOPE, isBranchScopedRole } from './roleScopes.js';

export type ScopeMode = 'read' | 'write';

/** Who the caller is, resolved from database truth (never from the frontend). */
export interface BranchScope {
  userId: string;
  roles: RoleEnum[];
  /** SUPER_ADMIN: platform-wide read and write. */
  isGlobal: boolean;
  /** MD: platform-wide READ only. */
  isGlobalRead: boolean;
  /** Union of EmployeeBranchAssignment rows and the legacy primary branch (EmployeeProfile.assignedBranchId). */
  branchIds: string[];
  employeeProfileId: string | null;
}

/**
 * Concrete set of branches a query may touch.
 * `all: true` is only ever produced for explicitly global roles - a branch-scoped caller can never get it.
 */
export interface BranchFilter {
  /** True only for explicitly global roles (SUPER_ADMIN; MD for reads). When true, `branchIds` is empty and means "no restriction". */
  all: boolean;
  branchIds: string[];
}

export async function resolveBranchScope(user: { userId: string; roles: RoleEnum[] }): Promise<BranchScope> {
  const profile = await prisma.employeeProfile.findUnique({
    where: { userId: user.userId },
    select: {
      id: true,
      assignedBranchId: true,
      branchAssignments: { select: { branchId: true } }
    }
  });

  const branchIds = new Set<string>();
  if (profile?.assignedBranchId) branchIds.add(profile.assignedBranchId);
  for (const a of profile?.branchAssignments ?? []) branchIds.add(a.branchId);

  return {
    userId: user.userId,
    roles: user.roles,
    isGlobal: user.roles.some((r) => ROLE_SCOPE[r] === 'GLOBAL'),
    isGlobalRead: user.roles.some((r) => ROLE_SCOPE[r] === 'GLOBAL_READ'),
    branchIds: Array.from(branchIds),
    employeeProfileId: profile?.id ?? null
  };
}

/** Pure decision logic (unit-testable). Throws AppError(403) when access is not permitted. */
export function resolveBranchFilter(scope: BranchScope, mode: ScopeMode, requestedBranchId?: string | null): BranchFilter {
  const requested = requestedBranchId || undefined;

  if (scope.isGlobal || (mode === 'read' && scope.isGlobalRead)) {
    return requested ? { all: false, branchIds: [requested] } : { all: true, branchIds: [] };
  }

  if (scope.roles.some(isBranchScopedRole)) {
    if (scope.branchIds.length === 0) {
      throw new AppError('No branch assignment: this account is not assigned to any branch', 403, 'NO_BRANCH_ASSIGNMENT');
    }
    if (requested) {
      if (!scope.branchIds.includes(requested)) {
        throw new AppError('You do not have access to the requested branch', 403, 'BRANCH_FORBIDDEN');
      }
      return { all: false, branchIds: [requested] };
    }
    // Omitted branch means "my branches" - NEVER "every branch".
    return { all: false, branchIds: [...scope.branchIds] };
  }

  if (mode === 'write' && scope.isGlobalRead) {
    throw new AppError('Read-only role: operational changes are not permitted', 403, 'READ_ONLY_ROLE');
  }
  throw new AppError('Access denied. Insufficient branch permissions.', 403, 'FORBIDDEN');
}

/** Prisma `where` fragment for a branch column. Returns `{}` only for the explicit global-all case. */
export function branchWhere(filter: BranchFilter, field = 'branchId'): Record<string, unknown> {
  return filter.all ? {} : { [field]: { in: filter.branchIds } };
}

/** For writes that target exactly one branch: the filter must resolve to a single concrete branch. */
export function requireSingleBranch(filter: BranchFilter): string {
  if (!filter.all && filter.branchIds.length === 1) return filter.branchIds[0];
  throw new AppError('A branchId is required for this operation', 400, 'BRANCH_REQUIRED');
}

export function filterAllows(filter: BranchFilter, branchId: string | null | undefined): boolean {
  if (filter.all) return true;
  return !!branchId && filter.branchIds.includes(branchId);
}

/** Resolve (and cache on the request) the authenticated caller's scope. */
export async function getRequestScope(req: Request): Promise<BranchScope> {
  const cached = (req as Request & { _branchScope?: BranchScope })._branchScope;
  if (cached) return cached;
  if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  const scope = await resolveBranchScope({ userId: req.user.userId, roles: req.user.roles });
  (req as Request & { _branchScope?: BranchScope })._branchScope = scope;
  return scope;
}

/**
 * Request-level authorization helper: resolves scope, applies the branch rules and audits denials.
 * `resource` is only used for the audit record (e.g. "KOT", "InventoryItem").
 */
export async function authorizeBranch(
  req: Request,
  mode: ScopeMode,
  requestedBranchId: string | null | undefined,
  resource: string
): Promise<{ scope: BranchScope; filter: BranchFilter }> {
  const scope = await getRequestScope(req);
  try {
    return { scope, filter: resolveBranchFilter(scope, mode, requestedBranchId) };
  } catch (err) {
    if (err instanceof AppError) {
      await AuditService.recordSafe({
        actor: { userId: scope.userId, roles: scope.roles },
        action: 'BRANCH_ACCESS_DENIED',
        entity: resource,
        payload: { mode, requestedBranchId: requestedBranchId ?? null, code: err.errorCode, allowedBranchCount: scope.branchIds.length },
        context: AuditService.contextFromRequest(req)
      });
    }
    throw err;
  }
}

/** Verify access to a specific resource that belongs to `resourceBranchId`; audits and throws 403 when outside the caller's scope. */
export async function assertResourceBranchAccess(
  req: Request,
  mode: ScopeMode,
  resourceBranchId: string | null | undefined,
  resource: string
): Promise<BranchScope> {
  const scope = await getRequestScope(req);
  const { filter } = await authorizeBranch(req, mode, undefined, resource);
  if (!filterAllows(filter, resourceBranchId)) {
    await AuditService.recordSafe({
      actor: { userId: scope.userId, roles: scope.roles },
      action: 'BRANCH_ACCESS_DENIED',
      entity: resource,
      payload: { mode, resourceBranchId: resourceBranchId ?? null, code: 'BRANCH_FORBIDDEN' },
      context: AuditService.contextFromRequest(req)
    });
    throw new AppError('You do not have access to this branch resource', 403, 'BRANCH_FORBIDDEN');
  }
  return scope;
}
