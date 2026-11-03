import { validatePhone } from '../src/auth/validation';

describe('validatePhone (optional field, mirrors the backend rule)', () => {
  it('accepts empty, and 8-15 digits with an optional + and ordinary separators', () => {
    for (const ok of ['', '   ', '+91 98765 43210', '9876543210', '+91-98765-43210', '(080) 1234 5678']) expect(validatePhone(ok)).toBeNull();
  });
  it('refuses anything else with a clear message', () => {
    for (const bad of ['123', 'abc', '12ab', '+91 98', '1234567890123456', '98765x43210', '++919876543210']) expect(validatePhone(bad)).toMatch(/valid phone number/);
  });
});
