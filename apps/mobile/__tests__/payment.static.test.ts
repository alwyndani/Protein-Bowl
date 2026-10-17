import fs from 'fs';
import path from 'path';

/**
 * P11C-2 step 3 static guards for the production payment FOUNDATION (comments stripped, production source only). They keep the
 * foundation honest: diagnostics stay out of production, endpoints stay in one module, evidence stays in memory, the backend stays the
 * only financial authority, and no later-phase capability appears early.
 */
const ROOT = path.resolve(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '__tests__', '.expo', 'coverage'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const norm = (p: string) => p.replace(/\\/g, '/');
const files = walk(path.join(ROOT, 'src'))
  .filter((p) => /\.(ts|tsx)$/.test(p) && !norm(p).includes('/src/test/'))
  .map((p) => ({ p: norm(path.relative(ROOT, p)), s: stripComments(fs.readFileSync(p, 'utf8')) }));

const offenders = (re: RegExp) => files.filter((f) => re.test(f.s)).map((f) => f.p).sort();
const payments = files.filter((f) => f.p.startsWith('src/payments/') && !f.p.startsWith('src/payments/dev/'));
const named = (p: string) => files.find((f) => f.p === p)!.s;

describe('P11C-2 step 3 static guards (production payment foundation)', () => {
  it('scans the real payment sources (sanity)', () => {
    expect(payments.map((f) => f.p).sort()).toEqual([
      'src/payments/checkoutMapping.ts',
      'src/payments/paymentApi.ts',
      'src/payments/paymentErrors.ts',
      'src/payments/paymentEvidenceStore.tsx',
      'src/payments/paymentTypes.ts',
      'src/payments/razorpayBridge.ts',
      'src/payments/razorpayNative.ts'
    ]);
  });

  it('diagnostic tooling cannot enter production: only the dev harness imports the dev module, and no production file names the diagnostic functions', () => {
    expect(offenders(/payments\/dev\/|from '\.\/dev\/|from '\.\.\/razorpayDiagnostic|from '\.\/razorpayDiagnostic/)).toEqual(['src/screens/dev/RazorpayTestScreen.tsx']);
    expect(offenders(/describeErrorShape|openRazorpayCheckoutDiagnostic|ErrorShape/)).toEqual(['src/payments/dev/razorpayDiagnostic.ts', 'src/screens/dev/RazorpayTestScreen.tsx']);
    for (const f of payments) expect(f.s).not.toMatch(/describeErrorShape|Diagnostic|descriptionText|metadataKeys|errorShape/);
  });

  it('the production bridge never reads provider free text, metadata, source, step or reason', () => {
    expect(named('src/payments/razorpayBridge.ts')).not.toMatch(/\.description|\.metadata|\.source|\.step|\.reason|\.details|\.error\b/);
  });

  it('payment endpoints live only in the payment API, whose verify body is exactly the three evidence fields', () => {
    expect(offenders(/payment-attempts/)).toEqual(['src/payments/paymentApi.ts']);
    const api = named('src/payments/paymentApi.ts');
    expect(api).not.toMatch(/\bamount|currency|paymentMethod/i);
    expect(api).not.toMatch(/retry|setTimeout|setInterval|while\s*\(/i);
    expect(api).toMatch(/body: \{ providerOrderId: evidence\.providerOrderId, providerPaymentId: evidence\.providerPaymentId, signature: evidence\.signature \}/);
    // one HTTP client only
    expect(api).not.toMatch(/\bfetch\(|XMLHttpRequest|axios/);
  });

  it('future-phase endpoints are absent: no cancel, refund, delivery-code, handover or Mess request anywhere', () => {
    expect(offenders(/\/cancel\b|\/refunds?\b|delivery-code|handover-code|\/mess\b/i)).toEqual([]);
  });

  it('payment evidence is memory-only: payment modules use no storage, Query cache, navigation, logging or analytics', () => {
    for (const f of payments) {
      expect(f.s).not.toMatch(/AsyncStorage|SecureStore|expo-secure-store|setItem|FileSystem|localStorage|@tanstack|useQuery|useMutation|setQueryData|navigation|console\.|analytics|Sentry|persist/i);
    }
    expect(named('src/payments/paymentEvidenceStore.tsx')).toMatch(/new Map</);
  });

  it('sign-out clears payment evidence: the composition root clears it in the session-cleared callback', () => {
    expect(named('src/AppRoot.tsx')).toMatch(/createManager\(\(\) => \{[\s\S]*evidence\.clearAllEvidence\(\);[\s\S]*\}\)/);
  });

  it('no hard-coded payment amount, provider order id, payment id or key; the checkout options come only from the session', () => {
    for (const f of payments) expect(f.s).not.toMatch(/\bamount:\s*\d|amountMinor:\s*\d|\border_[A-Za-z0-9]{6,}|\bpay_[A-Za-z0-9]{6,}/);
    const map = named('src/payments/checkoutMapping.ts');
    expect(map).toMatch(/key: session\.keyId/);
    expect(map).toMatch(/order_id: session\.providerOrderId/);
    expect(map).toMatch(/amount: session\.amountMinor/);
    expect(map).toMatch(/currency: session\.currency/);
  });

  it('the mobile client never marks an order paid: no local PAID / CONFIRMED assignment and no cache write of payment state', () => {
    expect(offenders(/paymentStatus\s*[:=]\s*['"]PAID|orderPaymentStatus\s*[:=]\s*['"]PAID|status\s*[:=]\s*['"]CONFIRMED|markPaid|setPaid|isPaid\s*=/)).toEqual([]);
    for (const f of payments) expect(f.s).not.toMatch(/setQueryData|queryClient|invalidateQueries/);
  });

  it('online-only: no payment-method choice, wallet or alternative payment concept in the payment modules', () => {
    for (const f of payments) expect(f.s).not.toMatch(/paymentMethod|payment_method|wallet|\bupi\b|\bcod\b/i);
  });

  it('no payment UI exists yet: no payment panel, flow hook, Pay button or polling in source', () => {
    expect(offenders(/PaymentPanel|usePaymentFlow|Pay now|Pay with|Pay securely|Retry payment|Check payment status/i)).toEqual([]);
    for (const f of payments) expect(f.s).not.toMatch(/setInterval|refetchInterval/);
  });
});
