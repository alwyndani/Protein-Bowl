import { z } from 'zod';

/**
 * Staff password policy (decision D7). Customer password rules are NOT changed.
 *  - 12..128 characters
 *  - at least 3 of 4 character classes (lower, upper, digit, symbol) unless it is a long passphrase (>= 20 chars)
 *  - must not contain the account's email local part or the user's name tokens
 *  - must not be a well-known / default password (including the dev seed password)
 */
export const STAFF_PASSWORD_MIN_LENGTH = 12;
export const STAFF_PASSWORD_MAX_LENGTH = 128;
const PASSPHRASE_LENGTH = 20;

const COMMON_PASSWORDS = new Set(
  [
    'password123!', 'password1234', 'password12345', 'password123456', 'passw0rd1234', 'p@ssword1234', 'p@ssw0rd1234',
    'welcome12345', 'welcome123456', 'qwerty123456', 'qwertyuiop12', 'letmein12345', 'administrator', 'admin1234567',
    '123456789012', '1234567890123', 'iloveyou1234', 'changeme1234', 'proteinbowl1', 'proteinbowl123', 'proteinbowl@123'
  ].map((p) => p.toLowerCase())
);

export interface PasswordContext {
  email?: string | null;
  fullName?: string | null;
}

/** Returns a human-readable problem, or null when the password satisfies the staff policy. */
export function validateStaffPassword(password: string, context: PasswordContext = {}): string | null {
  if (typeof password !== 'string') return 'Password is required';
  if (password.length < STAFF_PASSWORD_MIN_LENGTH) return `Password must be at least ${STAFF_PASSWORD_MIN_LENGTH} characters`;
  if (password.length > STAFF_PASSWORD_MAX_LENGTH) return `Password must be at most ${STAFF_PASSWORD_MAX_LENGTH} characters`;

  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return 'This password is too common. Choose a different one';

  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (classes < 3 && password.length < PASSPHRASE_LENGTH) {
    return 'Use at least 3 of: lowercase, uppercase, digits, symbols - or a passphrase of 20+ characters';
  }

  const localPart = context.email?.split('@')[0]?.toLowerCase();
  if (localPart && localPart.length >= 4 && lower.includes(localPart)) return 'Password must not contain your email name';

  for (const token of (context.fullName ?? '').toLowerCase().split(/\s+/)) {
    if (token.length >= 4 && lower.includes(token)) return 'Password must not contain your name';
  }
  return null;
}

/** Zod base rule (length bounds); contextual rules run in the service once the account is known. */
export const staffPasswordSchema = z
  .string({ required_error: 'Password is required' })
  .min(STAFF_PASSWORD_MIN_LENGTH, `Password must be at least ${STAFF_PASSWORD_MIN_LENGTH} characters`)
  .max(STAFF_PASSWORD_MAX_LENGTH, `Password must be at most ${STAFF_PASSWORD_MAX_LENGTH} characters`);
