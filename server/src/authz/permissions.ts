import { RoleEnum } from '@prisma/client';

/**
 * Typed static permission catalogue for the operational modules hardened in P6A.
 * SUPER_ADMIN is listed explicitly (there is no implicit bypass). MD holds READ permissions only (decision D2).
 */
export type Permission =
  | 'kds:read'
  | 'kds:write'
  | 'kitchen:assign'
  | 'procurement:read'
  | 'procurement:write'
  | 'pos:read'
  | 'pos:write'
  | 'delivery:read'
  | 'delivery:write'
  | 'delivery:assign'
  | 'delivery:override'
  | 'delivery:resolve'
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
  | 'mess:kitchen:write';

export const ROLE_PERMISSIONS: Readonly<Partial<Record<RoleEnum, readonly Permission[]>>> = {
  [RoleEnum.SUPER_ADMIN]: [
    // P8: SUPER_ADMIN is READ-ONLY for kitchen operations (no 'kds:write' = no Chef actions); it owns kitchen ROUTING ('kitchen:assign').
    'kds:read', 'kitchen:assign', 'procurement:read', 'procurement:write', 'pos:read', 'pos:write', 'delivery:read', 'delivery:assign', 'delivery:override', 'delivery:resolve',
    // P9A: SUPER_ADMIN reads and ASSIGNS delivery work but never claims, dispatches or reports as a driver ('delivery:write' is DELIVERY only).
    // Platform administration (decision D10: audit history is SUPER_ADMIN-only; MD gets branch READ only)
    'staff:admin', 'audit:read', 'branch:read', 'branch:write',
    // Payments (P7B): READ-ONLY operational visibility; nobody can mark an order paid through the API
    'payments:read',
    // Refunds / financial cancellation (P7C): SUPER_ADMIN only for mutation; MD read-only
    'refunds:read', 'refunds:write',
    // Kerala Mess (P10A): SUPER_ADMIN administers service points, plans, account approvals and exceptional cancellation; MD reads only
    'mess:read', 'mess:admin',
    // P10B: read-only visibility of the Mess kitchen (explicit branch); preparation transitions belong to CHEF only
    'mess:kitchen:read'
  ],
  [RoleEnum.MD]: ['kds:read', 'procurement:read', 'pos:read', 'delivery:read', 'branch:read', 'payments:read', 'refunds:read', 'mess:read', 'mess:kitchen:read'],
  [RoleEnum.CHEF]: ['kds:read', 'kds:write', 'mess:kitchen:read', 'mess:kitchen:write'],
  [RoleEnum.PROCUREMENT]: ['procurement:read', 'procurement:write'],
  [RoleEnum.POS]: ['pos:read', 'pos:write'],
  [RoleEnum.DELIVERY]: ['delivery:read', 'delivery:write']
};

export function roleHasPermission(role: RoleEnum, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission);
}

export function rolesHavePermission(roles: readonly RoleEnum[], permission: Permission): boolean {
  return roles.some((r) => roleHasPermission(r, permission));
}
