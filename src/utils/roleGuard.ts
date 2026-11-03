import type { UserRole } from '../types';

/**
 * UI role (dashboard presentation) -> backend roles that legitimately allow it.
 * This is PRESENTATION hygiene only: the backend authorizes every API call independently of anything the UI shows.
 * SUPER_ADMIN has its own workspace and is NOT allowed the MD dashboard (and vice versa).
 */
const BACKEND_ROLES_FOR_UI_ROLE: Record<UserRole, readonly string[]> = {
  // Exactly the six approved roles. A retired role (for example MESS_CUSTOMER) never authorizes anything: the API refuses such an account
  // (403 NO_APPROVED_ROLE) before any UI is shown.
  customer: ['CUSTOMER'],
  super_admin: ['SUPER_ADMIN'],
  nutritionist: ['NUTRITIONIST'],
  trainer: ['TRAINER'],
  chef: ['CHEF'],
  procurement: ['PROCUREMENT']
};

/** Customer-facing views have their own login guards in the app shell. */
const PUBLIC_UI_ROLES: readonly UserRole[] = ['customer'];

/**
 * May the UI present `uiRole`?
 * - Development builds: always (the developer role sandbox is DEV-only).
 * - Production builds: customer views always; staff dashboards only for a session that actually holds a matching backend role.
 */
export function isUiRoleAllowed(uiRole: UserRole, backendRoles: readonly string[] | undefined, isDev: boolean): boolean {
  if (isDev) return true;
  if (PUBLIC_UI_ROLES.includes(uiRole)) return true;
  const sessionRoles = backendRoles ?? [];
  // An unknown / retired UI role string (for example from stale state) is never presented.
  return (BACKEND_ROLES_FOR_UI_ROLE[uiRole] ?? []).some((r) => sessionRoles.includes(r));
}
