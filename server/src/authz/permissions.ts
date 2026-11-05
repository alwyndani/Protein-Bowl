import { RoleEnum } from '@prisma/client';

/**
 * Typed static permission catalogue for the operational modules hardened in P6A.
 * SUPER_ADMIN is listed explicitly (there is no implicit bypass) and holds every READ permission the retired MD role had (monitoring views).
 */
export type Permission =
  | 'kds:read'
  | 'kds:write'
  | 'kitchen:assign'
  | 'procurement:read'
  | 'procurement:write'
  | 'trainer:write'
  | 'trainer:assign'
  | 'delivery:read'
  | 'delivery:override'
  | 'delivery:resolve'
  | 'delivery:operate'
  | 'staff:admin'
  | 'audit:read'
  | 'branch:read'
  | 'branch:write'
  | 'payments:read'
  | 'refunds:read'
  | 'refunds:write'
  | 'mess:read'
  | 'mess:admin'
  | 'mess:kitchen:read'
  | 'mess:kitchen:write'
  | 'mess:delivery:read'
  | 'mess:delivery:override'
  | 'mess:delivery:operate';

export const ROLE_PERMISSIONS: Readonly<Partial<Record<RoleEnum, readonly Permission[]>>> = {
  [RoleEnum.SUPER_ADMIN]: [
    // P8: SUPER_ADMIN is READ-ONLY for kitchen operations (no 'kds:write' = no Chef actions); it owns kitchen ROUTING ('kitchen:assign').
    'kds:read', 'kitchen:assign', 'procurement:read', 'procurement:write', 'delivery:read', 'delivery:override', 'delivery:resolve',
    // Role simplification: SUPER_ADMIN operates delivery itself (dispatch, verify the customer's code, report, resume, retry, take over) - every action needs a fresh step-up proof
    'delivery:operate',
    // Platform administration (decision D10: audit history is SUPER_ADMIN-only)
    'staff:admin', 'audit:read', 'branch:read', 'branch:write',
    // Trainer coaching assignments (which customers a trainer may coach)
    'trainer:assign',
    // Payments (P7B): READ-ONLY operational visibility; nobody can mark an order paid through the API
    'payments:read',
    // Refunds / financial cancellation (P7C): SUPER_ADMIN only
    'refunds:read', 'refunds:write',
    // Kerala Mess (P10A): SUPER_ADMIN administers service points, plans, account approvals and exceptional cancellation
    'mess:read', 'mess:admin',
    // P10B: read-only visibility of the Mess kitchen (explicit branch); preparation transitions belong to CHEF only
    'mess:kitchen:read', 'mess:delivery:read', 'mess:delivery:override', 'mess:delivery:operate'
  ],
  [RoleEnum.CHEF]: ['kds:read', 'kds:write', 'mess:kitchen:read', 'mess:kitchen:write'],
  [RoleEnum.PROCUREMENT]: ['procurement:read', 'procurement:write'],
  [RoleEnum.TRAINER]: ['trainer:write']
};

export function roleHasPermission(role: RoleEnum, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission);
}

export function rolesHavePermission(roles: readonly RoleEnum[], permission: Permission): boolean {
  return roles.some((r) => roleHasPermission(r, permission));
}
