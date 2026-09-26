import crypto from 'crypto';

export function generateServerReferralCode(prefix = 'PB'): string {
  const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${randomHex}`;
}
