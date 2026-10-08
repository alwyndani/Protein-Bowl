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
  | 'delivery:write';

export const ROLE_PERMISSIONS: Readonly<Partial<Record<RoleEnum, readonly Permission[]>>> = {
  [RoleEnum.SUPER_ADMIN]: ['kds:read', 'kds:write', 'procurement:read', 'procurement:write', 'pos:read', 'pos:write', 'delivery:read', 'delivery:write'],
  [RoleEnum.MD]: ['kds:read', 'procurement:read', 'pos:read', 'delivery:read'],
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
