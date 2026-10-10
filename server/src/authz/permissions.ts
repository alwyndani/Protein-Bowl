import { RoleEnum } from '@prisma/client';

/**
 * Typed static permission catalogue for the operational modules hardened in P6A.
 * SUPER_ADMIN is listed explicitly (there is no implicit bypass). MD holds READ permissions only (decision D2).
 */
export type Permission =
  | 'kds:read'
  | 'kds:write'
  | 'procurement:read'
  | 'procurement:write'
  | 'pos:read'
  | 'pos:write'
  | 'delivery:read'
  | 'delivery:write'
  | 'staff:admin'
  | 'audit:read'
  | 'branch:read'
  | 'branch:write'
  | 'payments:read';

export const ROLE_PERMISSIONS: Readonly<Partial<Record<RoleEnum, readonly Permission[]>>> = {
  [RoleEnum.SUPER_ADMIN]: [
    'kds:read', 'kds:write', 'procurement:read', 'procurement:write', 'pos:read', 'pos:write', 'delivery:read', 'delivery:write',
    // Platform administration (decision D10: audit history is SUPER_ADMIN-only; MD gets branch READ only)
    'staff:admin', 'audit:read', 'branch:read', 'branch:write',
    // Payments (P7B): READ-ONLY operational visibility; nobody can mark an order paid through the API
    'payments:read'
  ],
  [RoleEnum.MD]: ['kds:read', 'procurement:read', 'pos:read', 'delivery:read', 'branch:read', 'payments:read'],
  [RoleEnum.CHEF]: ['kds:read', 'kds:write'],
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
