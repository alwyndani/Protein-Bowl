import { RoleEnum } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS, roleHasPermission, type Permission } from '../authz/permissions.js';
import { APPROVED_ROLES, isApprovedRole } from '../authz/approvedRoles.js';

/** The permission catalogue for the final six roles, pinned. Authorization itself is enforced per request against the database. */
const ALL: Permission[] = Array.from(new Set(Object.values(ROLE_PERMISSIONS).flatMap((p) => [...(p ?? [])])));
const holds = (role: RoleEnum) => ALL.filter((p) => roleHasPermission(role, p)).sort();

describe('permission matrix (six roles)', () => {
  it('exactly six roles are approved', () => {
    expect([...APPROVED_ROLES].sort()).toEqual(['CHEF', 'CUSTOMER', 'NUTRITIONIST', 'PROCUREMENT', 'SUPER_ADMIN', 'TRAINER']);
  });

  it('retired roles hold NO permission and are not approved', () => {
    for (const role of ['MESS_CUSTOMER', 'MD', 'DELIVERY', 'POS', 'BAKERY_FMCG', 'TEPACHE_ERP', 'SWIGGY_ZOMATO'] as RoleEnum[]) {
      expect(isApprovedRole(role), role).toBe(false);
      expect(holds(role), role).toEqual([]);
    }
  });

  it('CUSTOMER and NUTRITIONIST hold no catalogue permission (their access is ownership / assignment based, enforced per request)', () => {
    expect(holds(RoleEnum.CUSTOMER)).toEqual([]);
    expect(holds(RoleEnum.NUTRITIONIST)).toEqual([]);
  });

  it('CHEF: kitchen and Mess kitchen only', () => {
    expect(holds(RoleEnum.CHEF)).toEqual(['kds:read', 'kds:write', 'mess:kitchen:read', 'mess:kitchen:write']);
  });

  it('PROCUREMENT: procurement only', () => {
    expect(holds(RoleEnum.PROCUREMENT)).toEqual(['procurement:read', 'procurement:write']);
  });

  it('TRAINER: workout plans only (no assignment right, no health data, no procurement)', () => {
    expect(holds(RoleEnum.TRAINER)).toEqual(['trainer:write']);
  });

  it('SUPER_ADMIN administers but never performs the roles it supervises', () => {
    const admin = holds(RoleEnum.SUPER_ADMIN);
    for (const forbidden of ['kds:write', 'trainer:write', 'mess:kitchen:write'] as Permission[]) expect(admin, forbidden).not.toContain(forbidden);
    for (const required of ['staff:admin', 'audit:read', 'branch:write', 'refunds:write', 'trainer:assign', 'kitchen:assign'] as Permission[]) expect(admin, required).toContain(required);
  });

  it('administration permissions belong to SUPER_ADMIN alone', () => {
    for (const p of ['staff:admin', 'audit:read', 'branch:write', 'refunds:write', 'trainer:assign', 'kitchen:assign', 'delivery:operate', 'mess:admin'] as Permission[]) {
      const holders = (Object.values(RoleEnum) as RoleEnum[]).filter((r) => roleHasPermission(r, p));
      expect(holders, p).toEqual([RoleEnum.SUPER_ADMIN]);
    }
  });
});
