/**
 * Release gate for the production reconciliation entry point (scripts/reconcilePaymentsProd.ts).
 *
 * `--apply` is REFUSED in production until this constant is set to true, which happens only after paymentReconcile.test.ts (delayed, duplicate, failed,
 * mismatched, repeated and concurrent runs, dry-run purity) has passed on the isolated database and the result has been reviewed.
 * Dry run is always allowed (it writes nothing). Outside production an apply is allowed (development / tests with the mock provider).
 */
export const PRODUCTION_APPLY_VERIFIED = false;

export type ApplyDecision = { allowed: true } | { allowed: false; reason: string };

export function applyDecision(nodeEnv: string | undefined, verified: boolean = PRODUCTION_APPLY_VERIFIED): ApplyDecision {
  if (nodeEnv !== 'production') return { allowed: true };
  return verified ? { allowed: true } : { allowed: false, reason: 'production --apply is disabled until the reconciliation tests have passed (see reconcileApplyGate.ts)' };
}
