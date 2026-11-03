/**
 * The ONLY roles Protein Bowl supports (role simplification, final source of truth). Plain string identifiers on purpose: this module
 * imports nothing, so it stays valid while the Prisma `RoleEnum` still lists the retired values (the enum shrinks in a later, separately
 * approved migration). SUPER_ADMIN is the canonical administrator identifier; no alias exists.
 */
export const APPROVED_ROLES = ['CUSTOMER', 'CHEF', 'NUTRITIONIST', 'TRAINER', 'PROCUREMENT', 'SUPER_ADMIN'] as const;
export type ApprovedRole = (typeof APPROVED_ROLES)[number];

/** Approved roles that belong to staff identities (everything except CUSTOMER). */
export const APPROVED_STAFF_ROLES: readonly ApprovedRole[] = APPROVED_ROLES.filter((r) => r !== 'CUSTOMER');

/**
 * (B2a) The transitional DELIVERY exception is gone: only an APPROVED role reaches any guard, so a DELIVERY-only account is refused with NO_APPROVED_ROLE.
 *
 * Roles being retired. They must never be assigned, accepted from a client or used to authorize anything. Listed here only so the
 * schema-drift test, the retirement script and the enum migration guard can name them in one place; delete this list once the enum
 * no longer contains them.
 */
export const RETIRED_ROLES = ['MESS_CUSTOMER', 'MD', 'DELIVERY', 'POS', 'BAKERY_FMCG', 'TEPACHE_ERP', 'SWIGGY_ZOMATO'] as const;
export type RetiredRole = (typeof RETIRED_ROLES)[number];

export function isApprovedRole(value: unknown): value is ApprovedRole {
  return typeof value === 'string' && (APPROVED_ROLES as readonly string[]).includes(value);
}

export function isRetiredRole(value: unknown): value is RetiredRole {
  return typeof value === 'string' && (RETIRED_ROLES as readonly string[]).includes(value);
}

/** The approved roles among `roles` (order and duplicates kept). Retired and unknown values are dropped; used for everything a client can read (tokens, responses). */
export function approvedRolesOf<T>(roles: readonly T[]): Array<T & ApprovedRole> {
  return roles.filter((r) => isApprovedRole(r)) as Array<T & ApprovedRole>;
}
