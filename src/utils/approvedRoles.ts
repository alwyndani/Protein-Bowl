import type { UserRole } from '../types';

/**
 * The six supported roles. The UI uses lowercase presentation ids; the backend identifiers are the only authorization identifiers.
 * The mapping below is the single, explicit translation between them (transition only): there is no other alias and no seventh role.
 */
export const APPROVED_BACKEND_ROLES = ['CUSTOMER', 'CHEF', 'NUTRITIONIST', 'TRAINER', 'PROCUREMENT', 'SUPER_ADMIN'] as const;
export type ApprovedBackendRole = (typeof APPROVED_BACKEND_ROLES)[number];

export const UI_ROLE_FOR_BACKEND_ROLE: Readonly<Record<ApprovedBackendRole, UserRole>> = {
  CUSTOMER: 'customer',
  CHEF: 'chef',
  NUTRITIONIST: 'nutritionist',
  TRAINER: 'trainer',
  PROCUREMENT: 'procurement',
  SUPER_ADMIN: 'super_admin'
};

export const BACKEND_ROLE_FOR_UI_ROLE: Readonly<Partial<Record<UserRole, ApprovedBackendRole>>> = Object.freeze(
  Object.fromEntries(Object.entries(UI_ROLE_FOR_BACKEND_ROLE).map(([backend, ui]) => [ui, backend])) as Partial<Record<UserRole, ApprovedBackendRole>>
);

/** Backend role identifiers being retired (never authorize anything). */
export const RETIRED_BACKEND_ROLES = ['MESS_CUSTOMER', 'MD', 'DELIVERY', 'POS', 'BAKERY_FMCG', 'TEPACHE_ERP', 'SWIGGY_ZOMATO'] as const;

export const isApprovedBackendRole = (value: unknown): value is ApprovedBackendRole =>
  typeof value === 'string' && (APPROVED_BACKEND_ROLES as readonly string[]).includes(value);
