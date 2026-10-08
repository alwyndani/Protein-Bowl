import { RoleEnum } from '@prisma/client';

/**
 * Central role -> scope catalogue (static on purpose: no DB permission engine yet).
 *
 *  GLOBAL       Platform-wide (SUPER_ADMIN). Never implies access to customer /me data or customer health data.
 *  GLOBAL_READ  Platform-wide READ-ONLY visibility (MD). Never operational mutations, staff/security administration
 *               or clinical health data.
 *  ASSIGNMENT   Scoped to explicitly assigned customers, not branches (NUTRITIONIST, TRAINER).
 *  BRANCH       Scoped to the branches the employee is assigned to (EmployeeBranchAssignment).
 *  BRANCH_SELF  Branch-scoped AND limited to the employee's own work items (DELIVERY).
 *  CUSTOMER     Customer identities - not staff scopes.
 */
export type RoleScope = 'GLOBAL' | 'GLOBAL_READ' | 'ASSIGNMENT' | 'BRANCH' | 'BRANCH_SELF' | 'CUSTOMER';

export const ROLE_SCOPE: Readonly<Record<RoleEnum, RoleScope>> = {
  [RoleEnum.SUPER_ADMIN]: 'GLOBAL',
  [RoleEnum.MD]: 'GLOBAL_READ',
  [RoleEnum.NUTRITIONIST]: 'ASSIGNMENT',
  [RoleEnum.TRAINER]: 'ASSIGNMENT',
  [RoleEnum.CHEF]: 'BRANCH',
  [RoleEnum.PROCUREMENT]: 'BRANCH',
  [RoleEnum.DELIVERY]: 'BRANCH_SELF',
  [RoleEnum.POS]: 'BRANCH',
  // Facility/branch-scoped: they get NO global access; future phases associate them with their facility via branch assignment.
  [RoleEnum.BAKERY_FMCG]: 'BRANCH',
  [RoleEnum.TEPACHE_ERP]: 'BRANCH',
  [RoleEnum.SWIGGY_ZOMATO]: 'BRANCH',
  [RoleEnum.CUSTOMER]: 'CUSTOMER',
  [RoleEnum.MESS_CUSTOMER]: 'CUSTOMER'
};

/** Customer identities. CUSTOMER / MESS_CUSTOMER are never assigned via staff administration. */
export const CUSTOMER_ROLES: readonly RoleEnum[] = [RoleEnum.CUSTOMER, RoleEnum.MESS_CUSTOMER];

/** Every non-customer role. */
export const STAFF_ROLES: readonly RoleEnum[] = (Object.keys(ROLE_SCOPE) as RoleEnum[]).filter((r) => ROLE_SCOPE[r] !== 'CUSTOMER');

export function isCustomerRole(role: RoleEnum): boolean {
  return ROLE_SCOPE[role] === 'CUSTOMER';
}

export function isStaffRole(role: RoleEnum): boolean {
  return !isCustomerRole(role);
}

export function isBranchScopedRole(role: RoleEnum): boolean {
  const scope = ROLE_SCOPE[role];
  return scope === 'BRANCH' || scope === 'BRANCH_SELF';
}

/**
 * Staff and customer identities stay separate (decision D5): an account must never hold a customer role
 * together with a staff role. Used by detection now and by staff-administration APIs in P6B.
 */
export function hasMixedIdentity(roles: readonly RoleEnum[]): boolean {
  return roles.some(isCustomerRole) && roles.some(isStaffRole);
}

/** Roles that may never be granted through ordinary application APIs (initial/emergency SUPER_ADMIN uses the P6B bootstrap). */
export const NON_ASSIGNABLE_ROLES: readonly RoleEnum[] = [RoleEnum.SUPER_ADMIN, RoleEnum.CUSTOMER, RoleEnum.MESS_CUSTOMER];
