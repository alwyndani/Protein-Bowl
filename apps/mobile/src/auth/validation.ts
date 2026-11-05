const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateEmail = (v: string): string | null => (EMAIL.test(v.trim()) ? null : 'Enter a valid email address.');

export const validateSignInPassword = (v: string): string | null => (v.length > 0 ? null : 'Enter your password.');

/** Mirrors the backend customer password policy (minimum 8 characters, unchanged). The server remains authoritative. */
export const validateNewPassword = (v: string): string | null => (v.length >= 8 ? null : 'Use at least 8 characters.');

/** Optional phone number: empty is fine; otherwise 8-15 digits with an optional leading + (separators ignored). Mirrors the backend; the server stays authoritative. */
export const validatePhone = (v: string): string | null => {
  const t = v.trim();
  if (t === '') return null;
  return /^\+?[0-9]{8,15}$/.test(t.replace(/[\s\-().]/g, '')) ? null : 'Enter a valid phone number (8-15 digits) or leave it empty.';
};

export const validateFullName = (v: string): string | null => (v.trim().length >= 2 ? null : 'Enter your full name.');
