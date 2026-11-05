import { describe, expect, it } from 'vitest';
import { isValidPhone } from './phone';

describe('isValidPhone mirrors the backend rule', () => {
  it('accepts 8-15 digits with an optional + and ordinary separators', () => {
    for (const ok of ['+91 98765 43210', '9876543210', '+91-98765-43210', '(080) 1234 5678']) expect(isValidPhone(ok), ok).toBe(true);
  });
  it('refuses anything else, including empty', () => {
    for (const bad of ['', '123', 'abc', '+91 98', '1234567890123456', '98765x43210', '++919876543210']) expect(isValidPhone(bad), bad).toBe(false);
  });
});
