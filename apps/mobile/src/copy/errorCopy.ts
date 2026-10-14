import { ApiError } from '../api/ApiError';
import { SignedOutReason } from '../auth/authTypes';
import { SecureStorageError } from '../auth/secureSession';

/**
 * Customer-safe copy. The UI renders ONLY these mapped strings - never raw server messages, error codes, stack traces or provider text.
 * Same principle as the web's messErrors/paymentErrors tables.
 */
export type AuthContext = 'signIn' | 'register' | 'generic';

export function messageForError(error: unknown, context: AuthContext = 'generic', extra: { phoneProvided?: boolean } = {}): string {
  if (error instanceof SecureStorageError) {
    return 'This device cannot store your sign-in securely, so you cannot sign in here. Please check your device security settings.';
  }
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';

  switch (error.kind) {
    case 'timeout':
      return 'The request took too long. Please check your connection and try again.';
    case 'network':
      return 'You appear to be offline. Please check your connection and try again.';
    case 'malformed':
      return 'We received an unexpected response. Please try again.';
  }

  switch (error.status) {
    case 400:
      return error.code === 'INVALID_CLIENT_CONTRACT' ? 'This version of the app is not supported. Please update the app.' : 'We could not process that request. Please try again.';
    case 401:
      return context === 'signIn' ? 'Incorrect email or password.' : 'Your session has ended. Please sign in again.';
    case 403:
      if (error.code === 'CUSTOMER_APP_ONLY') return 'This app is for customer accounts only.';
      if (error.code === 'ACCOUNT_INACTIVE') return 'This account is not active. Please contact Protein Bowl support.';
      return 'This is not available for your account.';
    case 404:
      return 'We could not find that. It may have changed - please refresh.';
    case 409:
      return error.code === 'EMAIL_EXISTS' ? 'An account with this email already exists. Try signing in instead.' : 'That conflicts with the current state. Please refresh and try again.';
    case 410:
      return 'This feature is no longer available.';
    case 422:
      return context === 'register' ? 'Please check the details you entered and try again.' : 'Please check what you entered and try again.';
    case 426:
      return 'This version of the app is no longer supported. Please update the app.';
    case 429:
      return 'Too many attempts. Please wait a little and try again.';
    default:
      if (error.status >= 500 && context === 'register' && extra.phoneProvided) return 'We could not create your account. If the phone number is already registered, try again without it.';
      return error.status >= 500 ? 'Our service is having trouble right now. Please try again shortly.' : 'Something went wrong. Please try again.';
  }
}

export function messageForSignedOut(reason: SignedOutReason): string | null {
  switch (reason) {
    case 'session_expired':
      return 'Your session has expired. Please sign in again.';
    case 'session_revoked':
      return 'For your security you were signed out. Please sign in again.';
    case 'account_inactive':
      return 'This account is not active. Please contact Protein Bowl support.';
    case 'customer_only':
      return 'This app is for customer accounts only.';
    case 'update_required':
      return 'This version of the app is no longer supported. Please update the app.';
    case 'storage_unavailable':
      return 'This device cannot store your sign-in securely. Please check your device security settings.';
    case 'server_unconfirmed':
      return 'You are signed out on this device. We could not confirm the sign-out with our servers; if you think someone else may have access, please change your password.';
    default:
      return null;
  }
}
