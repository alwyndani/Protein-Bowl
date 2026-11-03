/** Mirrors the backend rule (server/src/utils/phone.ts): 8-15 digits, optional leading +, separators ignored. The server stays authoritative. */
export function isValidPhone(raw: string): boolean {
  return /^\+?[0-9]{8,15}$/.test(raw.trim().replace(/[\s\-().]/g, ''));
}
