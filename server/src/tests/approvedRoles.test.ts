import { describe, it, expect } from 'vitest';
import { RoleEnum } from '@prisma/client';
import { APPROVED_ROLES, APPROVED_STAFF_ROLES, RETIRED_ROLES, approvedRolesOf, isApprovedRole, isRetiredRole } from '../authz/approvedRoles.js';
import { ROLE_SCOPE } from '../authz/roleScopes.js';

describe('approved roles (role simplification, Stage 1)', () => {
  it('there are exactly six approved roles with the canonical identifiers', () => {
    expect([...APPROVED_ROLES]).toEqual(['CUSTOMER', 'CHEF', 'NUTRITIONIST', 'TRAINER', 'PROCUREMENT', 'SUPER_ADMIN']);
    expect(new Set(APPROVED_ROLES).size).toBe(6);
  });

  it('staff roles are the approved roles minus CUSTOMER', () => {
    expect([...APPROVED_STAFF_ROLES]).toEqual(['CHEF', 'NUTRITIONIST', 'TRAINER', 'PROCUREMENT', 'SUPER_ADMIN']);
  });

  it('approved and retired sets are disjoint', () => {
    for (const r of RETIRED_ROLES) expect(isApprovedRole(r)).toBe(false);
    for (const r of APPROVED_ROLES) expect(isRetiredRole(r)).toBe(false);
  });

  it('every Prisma RoleEnum value is either approved or retired, and every approved role exists in the enum (schema drift guard)', () => {
    const enumValues = Object.values(RoleEnum) as string[];
    for (const v of enumValues) expect(isApprovedRole(v) || isRetiredRole(v), `unclassified RoleEnum value ${v}`).toBe(true);
    for (const r of APPROVED_ROLES) expect(enumValues).toContain(r);
  });

  it('no alias of SUPER_ADMIN exists and there is no seventh role', () => {
    const enumValues = Object.values(RoleEnum) as string[];
    for (const alias of ['SUPERADMIN', 'SUPER ADMIN', 'ADMIN', 'ROOT', 'OWNER', 'MANAGER']) {
      expect(enumValues).not.toContain(alias);
      expect(isApprovedRole(alias)).toBe(false);
    }
    expect(enumValues.filter((v) => isApprovedRole(v))).toHaveLength(6);
  });

  it('the guards reject non-strings, wrong case and padded values', () => {
    for (const bad of [undefined, null, 5, {}, 'customer', 'Super_Admin', ' CHEF', 'CHEF ', 'super admin', '']) expect(isApprovedRole(bad)).toBe(false);
  });

  it('every approved role has an entry in the role scope catalogue', () => {
    for (const r of APPROVED_ROLES) expect(ROLE_SCOPE[r as RoleEnum]).toBeDefined();
  });

  it('approvedRolesOf keeps only approved roles (order and duplicates kept) and drops retired and unknown values: this is what token claims are built from', () => {
    expect(approvedRolesOf([RoleEnum.MD, RoleEnum.CHEF, RoleEnum.POS, RoleEnum.SUPER_ADMIN, RoleEnum.DELIVERY, RoleEnum.CHEF])).toEqual([RoleEnum.CHEF, RoleEnum.SUPER_ADMIN, RoleEnum.CHEF]);
    expect(approvedRolesOf([RoleEnum.MESS_CUSTOMER, RoleEnum.BAKERY_FMCG, RoleEnum.TEPACHE_ERP, RoleEnum.SWIGGY_ZOMATO])).toEqual([]);
    expect(approvedRolesOf([])).toEqual([]);
    expect(approvedRolesOf(['CUSTOMER', 'customer', 'ADMIN', ''] as string[])).toEqual(['CUSTOMER']);
    for (const r of APPROVED_ROLES) expect(approvedRolesOf([r])).toEqual([r]);
    for (const r of RETIRED_ROLES) expect(approvedRolesOf([r])).toEqual([]);
  });
});
