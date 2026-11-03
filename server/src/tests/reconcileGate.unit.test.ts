import { describe, expect, it } from 'vitest';
import { PRODUCTION_APPLY_VERIFIED, applyDecision } from '../modules/payment/reconcileApplyGate.js';

describe('production reconciliation apply gate', () => {
  it('is CLOSED in the committed code: production --apply stays disabled until the tests have passed and the constant is flipped on purpose', () => {
    expect(PRODUCTION_APPLY_VERIFIED).toBe(false);
    const d = applyDecision('production');
    expect(d.allowed).toBe(false);
  });

  it('only production is gated; development and test may apply (mock provider)', () => {
    for (const env of ['development', 'test', undefined]) expect(applyDecision(env).allowed).toBe(true);
  });

  it('opens in production only when explicitly verified', () => {
    expect(applyDecision('production', true).allowed).toBe(true);
    expect(applyDecision('production', false).allowed).toBe(false);
  });
});
