/**
 * P9B proof-state derivation (pure functions, no secrets). Only the columns needed to derive a state are ever read: the code hash is
 * deliberately never selected for display (issuedAt is set exactly when a code exists).
 */
export type CustomerProofState = 'NOT_AVAILABLE' | 'NOT_ISSUED' | 'ISSUED' | 'LOCKED' | 'CODE_BLOCKED' | 'VERIFIED';
export type DriverProofState = 'CODE_NOT_ISSUED' | 'READY_FOR_VERIFICATION' | 'LOCKED' | 'CODE_BLOCKED' | 'VERIFIED';
export type MonitorProofState = 'NOT_ISSUED' | 'ISSUED' | 'LOCKED' | 'CODE_BLOCKED' | 'VERIFIED' | 'OVERRIDDEN';

export const PROOF_STATE_SELECT = { issuedAt: true, lockedUntil: true, blockedAt: true, verifiedAt: true, method: true } as const;
export interface ProofStateRow {
  issuedAt: Date | null;
  lockedUntil: Date | null;
  blockedAt: Date | null;
  verifiedAt: Date | null;
  method: string | null;
}

export const isLocked = (p: ProofStateRow, now: Date) => !!p.lockedUntil && p.lockedUntil.getTime() > now.getTime();

export function driverProofState(p: ProofStateRow | null, now: Date): { state: DriverProofState; lockedUntil: string | null } {
  if (!p || (!p.issuedAt && !p.verifiedAt)) return { state: 'CODE_NOT_ISSUED', lockedUntil: null };
  if (p.verifiedAt) return { state: 'VERIFIED', lockedUntil: null };
  if (p.blockedAt) return { state: 'CODE_BLOCKED', lockedUntil: null };
  if (isLocked(p, now)) return { state: 'LOCKED', lockedUntil: p.lockedUntil!.toISOString() };
  return { state: 'READY_FOR_VERIFICATION', lockedUntil: null };
}

export function monitorProofState(p: ProofStateRow | null, now: Date): MonitorProofState {
  if (p?.verifiedAt) return p.method === 'ADMIN_OVERRIDE' ? 'OVERRIDDEN' : 'VERIFIED';
  if (!p || !p.issuedAt) return 'NOT_ISSUED';
  if (p.blockedAt) return 'CODE_BLOCKED';
  if (isLocked(p, now)) return 'LOCKED';
  return 'ISSUED';
}

export interface CustomerProofDto {
  state: CustomerProofState;
  issuedAt: string | null;
  lockedUntil: string | null;
}
export interface IssuedCodeDto extends CustomerProofDto {
  /** Returned ONCE, in this response only. */
  code: string;
}

