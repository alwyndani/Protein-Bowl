const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateEmail = (v: string): string | null => (EMAIL.test(v.trim()) ? null : 'Enter a valid email address.');

export const validateSignInPassword = (v: string): string | null => (v.length > 0 ? null : 'Enter your password.');

/** Mirrors the backend customer password policy (minimum 8 characters, unchanged). The server remains authoritative. */
export const validateNewPassword = (v: string): string | null => (v.length >= 8 ? null : 'Use at least 8 characters.');

export const validateFullName = (v: string): string | null => (v.trim().length >= 2 ? null : 'Enter your full name.');
