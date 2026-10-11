import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !full.includes(`${join('src', 'test')}`)) out.push(full);
  }
  return out;
}
const files = walk(SRC);
const read = (rel: string) => strip(readFileSync(join(SRC, rel), 'utf8'));
const P7D_FILES = ['hooks/usePaymentFlow.ts', 'hooks/useCancelOrder.ts', 'hooks/useOrderDeepLink.ts', 'services/paymentService.ts', 'utils/razorpayLoader.ts', 'utils/paymentErrors.ts', 'utils/orderLabels.ts', 'components/customer/PaymentPanel.tsx', 'components/customer/CancelOrderDialog.tsx', 'components/customer/OrderStatusBadges.tsx', 'components/customer/RefundNotice.tsx', 'components/customer/DirectOrderTrackingModal.tsx', 'components/customer/DirectCartCheckoutModal.tsx'];

describe('P7D security: nothing secret or authoritative lives in the browser code', () => {
  it('no Razorpay key secret, webhook secret or Razorpay env variable exists anywhere in the web source', () => {
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      expect(text, f).not.toMatch(/RAZORPAY_KEY_SECRET|RAZORPAY_WEBHOOK_SECRET|key_secret|webhook_secret|webhookSecret|keySecret/i);
      expect(text, f).not.toMatch(/VITE_RAZORPAY/);
    }
  });

  it('the public key id is never hard-coded: it only comes from the backend payment session', () => {
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/rzp_(live|test)_[A-Za-z0-9]{6,}/);
    expect(read('hooks/usePaymentFlow.ts')).toContain('session.keyId');
  });

  it('the browser never marks anything paid or refunded: no code assigns a PAID/REFUNDED status, and success text only follows server answers', () => {
    for (const rel of P7D_FILES) {
      const text = read(rel);
      expect(text, rel).not.toMatch(/paymentStatus\s*[:=]\s*['"](PAID|REFUNDED)['"]/);
      expect(text, rel).not.toMatch(/setOrder\(\{[^}]*PAID/);
      expect(text, rel).not.toMatch(/state:\s*'PAID'\s*,\s*canStartPayment:\s*true/);
    }
    const hook = read('hooks/usePaymentFlow.ts');
    // "CONFIRMED" is only ever set from: the verification answer result === 'PAID', or an order read from the server (derivePhase)
    expect(hook).toContain("result.result === 'PAID'");
    expect(hook).toContain('derivePhase(');
    expect(hook).not.toMatch(/handler:\s*\([^)]*\)\s*=>\s*\{[^}]*set\('CONFIRMED'/);
  });

  it('the client never converts the server\'s canStartPayment=false into true (it only ever reads it)', () => {
    for (const rel of P7D_FILES) {
      const text = read(rel);
      expect(text, rel).not.toMatch(/canStartPayment\s*[:=]\s*true/);
    }
  });

  it('the payment/cancel services send no authoritative fields and the signature has exactly one destination (the verify call)', () => {
    const pay = read('services/paymentService.ts');
    expect(pay).not.toMatch(/amount|currency|customerId|customer_id|status\s*:/i);
    expect(pay.match(/signature/g)?.length).toBe(2); // the evidence field read and the field sent
    const order = read('services/orderService.ts');
    expect(order).not.toMatch(/cancelOrder[\s\S]*(amount|currency|paymentId|customerId)[\s\S]*getOrderRefunds/);
  });

  it('the signature is never logged, persisted or rendered', () => {
    for (const rel of P7D_FILES) {
      const text = read(rel);
      expect(text, rel).not.toMatch(/console\.(log|info|warn|error|debug)/);
      expect(text, rel).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
    }
    for (const rel of ['components/customer/PaymentPanel.tsx', 'components/customer/DirectOrderTrackingModal.tsx', 'components/customer/DirectCartCheckoutModal.tsx']) {
      expect(read(rel), rel).not.toMatch(/razorpay_signature|\.signature/);
    }
  });

  it('no generic retry machinery around financial calls: services and hooks have no retry loops; ApiClient\'s only retry is the 401 token refresh', () => {
    for (const rel of ['services/paymentService.ts', 'services/orderService.ts', 'hooks/useCancelOrder.ts']) {
      const text = read(rel);
      expect(text, rel).not.toMatch(/\bretry\b|setTimeout|setInterval|while\s*\(|for\s*\(\s*let/i);
    }
    const raw = readFileSync(join(SRC, 'hooks/usePaymentFlow.ts'), 'utf8');
    // polling: GET-only helpers (refreshOrder -> fetchOrder) are all the timers ever call
    const poll = strip(raw.slice(raw.indexOf('bounded GET-only polling'), raw.indexOf('refresh trusted state when the customer comes back')));
    expect(poll.length).toBeGreaterThan(200);
    expect(poll).toContain('refreshOrder()');
    expect(poll).not.toMatch(/createSession|PaymentService|verify|cancelOrder|createOrder/);
    const client = read('services/apiClient.ts');
    expect(client.match(/isRetry/g)?.length).toBeGreaterThan(0);
    expect(client).toContain("response.status === 401");
  });

  it('raw server / provider error text is not rendered by the P7D components (always mapped copy)', () => {
    for (const rel of ['components/customer/PaymentPanel.tsx', 'components/customer/CancelOrderDialog.tsx', 'components/customer/DirectOrderTrackingModal.tsx', 'hooks/usePaymentFlow.ts', 'hooks/useCancelOrder.ts']) {
      const text = read(rel);
      expect(text, rel).not.toMatch(/err\.message|error\.message(?!\b\s*\})|\.response\.message|err instanceof Error \? err\.message/);
    }
    expect(read('utils/paymentErrors.ts')).toContain('PASSTHROUGH_CODES'); // the single, documented allow-list
  });

  it('the fake diet-plan "payment" is gone and is not part of the P7D commerce path', () => {
    const legacy = readFileSync(join(SRC, 'components/customer/CheckoutModal.tsx'), 'utf8');
    expect(legacy).not.toMatch(/anjali@okaxis|setUpiId|upiId|setPaymentMethod|paymentStatus:\s*'paid'|confetti|Processing Payment Gateway/);
    expect(legacy).toContain('diet-plan-payment-unavailable');
    for (const rel of P7D_FILES) expect(readFileSync(join(SRC, rel), 'utf8'), rel).not.toMatch(/from\s+['"][^'"]*\/CheckoutModal['"]|DirectGuestOrderModal/);
  });

  it('customer prefill is not used: no email, phone or profile data is passed to Razorpay', () => {
    const hook = read('hooks/usePaymentFlow.ts');
    expect(hook).not.toMatch(/prefill|email|contact|phone|customerProfile|walletBalance|health|diet/i);
  });
});
