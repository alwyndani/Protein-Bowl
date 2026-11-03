/**
 * Fixed customer-facing copy for sign-in failures that need explicit wording.
 * The backend refuses an account that holds no approved role with 403 `NO_APPROVED_ROLE` (sign-in, session refresh and every request).
 * The copy is fixed text keyed on the code, so it does not depend on the server's message text.
 */
export const NO_APPROVED_ROLE_COPY = 'This account can no longer be used on Protein Bowl. Please contact Protein Bowl support.';

/** Fixed copy for a known auth error code; null means "use the server's own message or the default". */
export function fixedAuthErrorMessage(code: string | undefined | null): string | null {
  return code === 'NO_APPROVED_ROLE' ? NO_APPROVED_ROLE_COPY : null;
}
