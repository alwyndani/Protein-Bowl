import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Deterministic order-number guarantees (replaces a statistical "2000 random numbers are all distinct" check, which failed by chance about once
 * in 370 runs: 30^6 suffixes, birthday collision). The real uniqueness guarantee in production is the UNIQUE index on Order.orderNumber plus the
 * transaction retry (p7a.test.ts 34 / 35, ORDER_NUMBER_UNAVAILABLE); this file proves the generator itself maps distinct random draws to distinct
 * numbers, uses the full alphabet and the CSPRNG, and keeps the format. Production code is not touched: only `randomInt` is replaced.
 */
const state = vi.hoisted(() => ({ queue: [] as number[], maxes: [] as number[] }));

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    randomInt: (max: number) => {
      state.maxes.push(max);
      const v = state.queue.shift();
      if (v === undefined) throw new Error('test queue exhausted');
      return v;
    }
  };
});

import { generateOrderNumber } from '../modules/order/orderNumber.js';

const BASE = 30;
const digits = (k: number): number[] => {
  const out: number[] = [];
  for (let i = 0; i < 6; i++) {
    out.unshift(k % BASE);
    k = Math.floor(k / BASE);
  }
  return out;
};
const at = new Date(Date.UTC(2026, 9, 10, 12, 0, 0));

describe('order numbers - deterministic generator guarantees', () => {
  beforeEach(() => {
    state.queue.length = 0;
    state.maxes.length = 0;
  });

  it('every draw is a CSPRNG draw over the full 30-character alphabet: six draws of randomInt(30) per number', () => {
    state.queue.push(...digits(0));
    generateOrderNumber(at);
    expect(state.maxes).toEqual([30, 30, 30, 30, 30, 30]);
  });

  it('the 30 draw values map to 30 DISTINCT look-alike-free characters (the mapping is injective)', () => {
    const chars = new Set<string>();
    for (let v = 0; v < BASE; v++) {
      state.queue.push(v, 0, 0, 0, 0, 0);
      chars.add(generateOrderNumber(at).slice(10, 11));
    }
    expect(chars.size).toBe(BASE);
    for (const c of chars) expect(c).toMatch(/^[2-9A-HJKMNP-TV-Z]$/);
  });

  it('2000 DISTINCT draw sequences give 2000 DISTINCT order numbers, each PB-YYMMDD-XXXXXX', () => {
    const seen = new Set<string>();
    for (let k = 0; k < 2000; k++) {
      state.queue.push(...digits(k));
      const n = generateOrderNumber(at);
      expect(n).toMatch(/^PB-261010-[2-9A-HJKMNP-TV-Z]{6}$/);
      seen.add(n);
    }
    expect(seen.size).toBe(2000);
    expect(state.maxes.every((m) => m === 30)).toBe(true);
  });

  it('each draw position contributes: changing any single position changes the number', () => {
    state.queue.push(...[3, 4, 5, 6, 7, 8]);
    const base = generateOrderNumber(at);
    for (let pos = 0; pos < 6; pos++) {
      const draws = [3, 4, 5, 6, 7, 8];
      draws[pos] = (draws[pos] + 1) % BASE;
      state.queue.push(...draws);
      expect(generateOrderNumber(at)).not.toBe(base);
    }
  });

  it('the date part is the UTC date of the supplied instant and carries no sequence', () => {
    state.queue.push(...digits(1));
    expect(generateOrderNumber(new Date(Date.UTC(2027, 0, 5, 23, 59, 59))).slice(0, 10)).toBe('PB-270105-');
  });
});
