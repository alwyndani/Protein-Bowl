import type { UserRole } from '../types';

/**
 * UI role (dashboard presentation) -> backend roles that legitimately allow it.
 * This is PRESENTATION hygiene only: the backend authorizes every API call independently of anything the UI shows.
 * SUPER_ADMIN has its own workspace and is NOT allowed the MD dashboard (and vice versa).
 */
const BACKEND_ROLES_FOR_UI_ROLE: Record<UserRole, readonly string[]> = {
  customer: ['CUSTOMER', 'MESS_CUSTOMER'],
  mess_customer: ['CUSTOMER', 'MESS_CUSTOMER'],
  super_admin: ['SUPER_ADMIN'],
  md: ['MD'],
  nutritionist: ['NUTRITIONIST'],
  trainer: ['TRAINER'],
  chef: ['CHEF'],
  procurement: ['PROCUREMENT'],
  delivery: ['DELIVERY'],
  pos: ['POS'],
  bakery_fmcg: ['BAKERY_FMCG'],
  tepache_erp: ['TEPACHE_ERP'],
  swiggy_zomato: ['SWIGGY_ZOMATO']
};

/** Customer-facing views have their own login guards in the app shell. */
const PUBLIC_UI_ROLES: readonly UserRole[] = ['customer', 'mess_customer'];

/**
 * May the UI present `uiRole`?
 * - Development builds: always (the developer role sandbox is DEV-only).
 * - Production builds: customer views always; staff dashboards only for a session that actually holds a matching backend role.
 */
export function isUiRoleAllowed(uiRole: UserRole, backendRoles: readonly string[] | undefined, isDev: boolean): boolean {
  if (isDev) return true;
  if (PUBLIC_UI_ROLES.includes(uiRole)) return true;
  const sessionRoles = backendRoles ?? [];
  return BACKEND_ROLES_FOR_UI_ROLE[uiRole].some((r) => sessionRoles.includes(r));
}
