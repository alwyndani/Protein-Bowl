export interface CustomerUser {
  id: string;
  email: string;
  roles: string[];
  fullName: string | null;
}

export interface MobileSession {
  user?: CustomerUser;
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export type SignedOutReason = 'none' | 'session_expired' | 'session_revoked' | 'account_inactive' | 'customer_only' | 'update_required' | 'storage_unavailable' | 'server_unconfirmed';

export type AuthState =
  | { status: 'restoring' }
  | { status: 'signedOut'; reason: SignedOutReason }
  /** A refresh was sent but its outcome is unknown (timeout / lost connection). No authenticated UI; the user decides how to continue. */
  | { status: 'recovery' }
  | { status: 'signedIn'; user: CustomerUser };

const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** Validates the untrusted user object (from login/register/me). Returns null when it is not a well-formed customer user. */
export function parseUser(raw: unknown): CustomerUser | null {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw as Record<string, unknown>;
  if (!str(u.id) || !str(u.email) || !Array.isArray(u.roles) || !u.roles.every((r) => typeof r === 'string')) return null;
  const profile = u.customerProfile && typeof u.customerProfile === 'object' ? (u.customerProfile as Record<string, unknown>) : null;
  return { id: u.id, email: u.email, roles: u.roles as string[], fullName: profile && str(profile.fullName) ? profile.fullName : null };
}

/** Defence in depth only: the BACKEND refuses non-customers (CUSTOMER_APP_ONLY); the app additionally requires exactly CUSTOMER. */
export const isCustomerOnly = (user: CustomerUser): boolean => user.roles.length > 0 && user.roles.every((r) => r === 'CUSTOMER');

export function parseSession(raw: unknown): MobileSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (!str(s.accessToken) || !str(s.refreshToken) || !str(s.refreshTokenExpiresAt)) return null;
  if (Number.isNaN(Date.parse(s.refreshTokenExpiresAt))) return null;
  const session: MobileSession = { accessToken: s.accessToken, refreshToken: s.refreshToken, refreshTokenExpiresAt: s.refreshTokenExpiresAt };
  if (s.user !== undefined) {
    const user = parseUser(s.user);
    if (!user) return null;
    session.user = user;
  }
  return session;
}
