import { RoleEnum } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { ROLE_PERMISSIONS, Permission } from '../../authz/permissions.js';
import { ROLE_SCOPE, STAFF_ROLES } from '../../authz/roleScopes.js';
import { staffUserSelect, toStaffDto } from './staff.dto.js';

/** Descriptive catalogue for UIs (e.g. the future Super Admin workspace). Informational only - the backend authorizes every call. */
export function getPermissionCatalogue() {
  return {
    note: 'Descriptive only. Authorization is always enforced by the backend, never by the client.',
    roles: STAFF_ROLES.map((role) => ({
      role,
      scope: ROLE_SCOPE[role],
      permissions: (ROLE_PERMISSIONS[role] ?? []) as readonly Permission[],
      assignableThroughAdminApi: role !== RoleEnum.SUPER_ADMIN
    }))
  };
}

export class StaffSelfService {
  /** The authenticated staff member's own safe profile: current DB roles, branches, and effective permissions. */
  public static async getMe(userId: string) {
    const row = await prisma.user.findUnique({ where: { id: userId }, select: staffUserSelect });
    if (!row) throw new AppError('Account not found', 404, 'NOT_FOUND');

    const dto = toStaffDto(row);
    const roles = dto.roles.map((r) => r.role);
    const permissions = Array.from(new Set(roles.flatMap((r) => ROLE_PERMISSIONS[r] ?? [])));

    return {
      id: dto.id,
      email: dto.email,
      phone: dto.phone,
      status: dto.status,
      lastLoginAt: dto.lastLoginAt,
      employeeProfile: dto.employeeProfile,
      roles: dto.roles,
      branches: dto.branches,
      scope: {
        isGlobal: roles.some((r) => ROLE_SCOPE[r] === 'GLOBAL'),
        isGlobalRead: roles.some((r) => ROLE_SCOPE[r] === 'GLOBAL_READ')
      },
      permissions
    };
  }
}
