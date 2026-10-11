import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Permanent rule: Protein Bowl supports ONLINE payment only. No customer-facing surface may offer Cash on Delivery. */
const SRC = join(__dirname, '..');
const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
};
const COD = /\bcod\b|cash[\s_-]*on[\s_-]*delivery|pay[\s_-]*on[\s_-]*delivery|cash_at_gate|pending_cod|pay\s+(directly\s+)?upon\s+(meal\s+)?arrival|cash\s*\/\s*upi\s+at/i;

// Customer-facing web code: storefront/checkout/orders/mess portal/customer dashboard + shared services, hooks and utils.
const customerFiles = [...walk(join(SRC, 'components', 'customer')), ...walk(join(SRC, 'components', 'mess')), ...walk(join(SRC, 'services')), ...walk(join(SRC, 'hooks')), ...walk(join(SRC, 'utils')), ...walk(join(SRC, 'context'))].filter(
  (f) => !f.endsWith('DirectGuestOrderModal.tsx') // dead code: not imported anywhere (asserted below)
);

describe('COD is not offered anywhere to customers', () => {
  it('A/F. no customer-facing component, hook, service or util mentions COD / Cash on Delivery / Pay on Delivery / cash at the gate', () => {
    expect(customerFiles.length).toBeGreaterThan(20);
    for (const f of customerFiles) expect(readFileSync(f, 'utf8'), f).not.toMatch(COD);
  });

  it('B. the P7D client never sends a payment method at all (the backend default, ONLINE, is authoritative)', () => {
    const svc = readFileSync(join(SRC, 'services', 'orderService.ts'), 'utf8');
    const create = svc.slice(svc.indexOf('createOrder'), svc.indexOf('cancelOrder'));
    expect(create).not.toMatch(/paymentMethod\s*:\s*['"]/);
    for (const rel of ['components/customer/DirectCartCheckoutModal.tsx', 'hooks/usePaymentFlow.ts', 'hooks/useCancelOrder.ts', 'components/customer/PaymentPanel.tsx']) {
      expect(readFileSync(join(SRC, rel), 'utf8'), rel).not.toMatch(/paymentMethod\s*[:=]\s*['"]/);
    }
  });

  it('the legacy guest-order modal containing a COD choice is not imported anywhere (unreachable dead code)', () => {
    for (const f of walk(SRC)) {
      if (f.endsWith('DirectGuestOrderModal.tsx')) continue;
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/DirectGuestOrderModal/);
    }
  });

  it('the customer payment UI only knows the ONLINE method: the pay panel renders only for ONLINE orders', () => {
    const tracking = readFileSync(join(SRC, 'components', 'customer', 'DirectOrderTrackingModal.tsx'), 'utf8');
    expect(tracking).toMatch(/paymentMethod === 'ONLINE'/);
    const checkout = readFileSync(join(SRC, 'components', 'customer', 'DirectCartCheckoutModal.tsx'), 'utf8');
    expect(checkout).toMatch(/paymentMethod === 'ONLINE'/);
  });
});
