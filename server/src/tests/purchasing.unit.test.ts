import { describe, expect, it } from 'vitest';
import { canTransition, remainingQuantity } from '../modules/procurement/purchasing.service.js';

describe('purchase order rules (pure)', () => {
  it('only a draft can be ordered', () => {
    expect(canTransition('DRAFT', 'ORDER')).toBe(true);
    for (const s of ['ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'] as const) expect(canTransition(s, 'ORDER')).toBe(false);
  });

  it('cancellation is possible only before goods arrive', () => {
    expect(canTransition('DRAFT', 'CANCEL')).toBe(true);
    expect(canTransition('ORDERED', 'CANCEL')).toBe(true);
    for (const s of ['PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'] as const) expect(canTransition(s, 'CANCEL')).toBe(false);
  });

  it('goods are received only against ordered or partially received orders', () => {
    expect(canTransition('ORDERED', 'RECEIVE')).toBe(true);
    expect(canTransition('PARTIALLY_RECEIVED', 'RECEIVE')).toBe(true);
    for (const s of ['DRAFT', 'RECEIVED', 'CANCELLED'] as const) expect(canTransition(s, 'RECEIVE')).toBe(false);
  });

  it('remaining quantity is floating-point safe and never negative', () => {
    expect(remainingQuantity(10, 0)).toBe(10);
    expect(remainingQuantity(0.3, 0.1 + 0.2)).toBe(0);
    expect(remainingQuantity(5, 7)).toBe(0);
    expect(remainingQuantity(2.5, 1.2)).toBe(1.3);
  });
});
