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
      'src/payments/paymentFlowController.ts',
      'src/payments/paymentFlowMachine.ts',
      'src/payments/paymentPresentation.ts',
      'src/payments/razorpayNative.ts'
    ].sort());
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

  it('payment UI exists in ONE panel: the hook has one consumer, the explicit controls live only in the panel, nothing else offers payment', () => {
    expect(offenders(/PaymentPanel/).sort()).toEqual(['src/screens/commerce/OrderScreens.tsx', 'src/screens/commerce/PaymentPanel.tsx']);
    expect(offenders(/Pay now|Pay with|Pay securely|Retry payment|Check payment status/i)).toEqual(['src/screens/commerce/PaymentPanel.tsx']);
    expect(offenders(/usePaymentFlow/).sort()).toEqual(['src/commerce/usePaymentFlow.ts', 'src/screens/commerce/PaymentPanel.tsx']);
    expect(offenders(/paymentFlowController|paymentPresentation|paymentFlowMachine/).filter((p) => p.startsWith('src/screens/') || p.startsWith('src/navigation/'))).toEqual([]);
    for (const f of payments) expect(f.s).not.toMatch(/setInterval|refetchInterval/);
  });

  it('step 4: payment never starts by itself, and no timer or lifecycle event can start, verify or re-open anything', () => {
    const ctl = named('src/payments/paymentFlowController.ts');
    // each financial call has exactly ONE call site, and startPayment() is never called inside the controller
    expect(ctl.match(/\.createAttempt\(/g)).toHaveLength(1);
    expect(ctl.match(/\.verifyPayment\(/g)).toHaveLength(1);
    expect(ctl.match(/\.openCheckout\(/g)).toHaveLength(1);
    expect(ctl).not.toMatch(/this\.startPayment\(|void startPayment|\.retryVerification\(\)/);
    // every timer callback only reconciles (GET-only) or fires the watchdog event
    const timerBodies = [...ctl.matchAll(/setTimeout\(\(\) => \{([\s\S]*?)\}, (?:delay|ms)\)/g)].map((m) => m[1]);
    expect(timerBodies).toHaveLength(2);
    for (const body of timerBodies) expect(body).not.toMatch(/createAttempt|verifyPayment|openCheckout|startPayment|IDLE|OBSERVED|setEvidence/);
    // the app-state handler only reconciles or arms/clears timers
    const handler = ctl.slice(ctl.indexOf('private onAppState'));
    expect(handler).not.toMatch(/createAttempt|verifyPayment|openCheckout|startPayment/);
    // the hook never calls an action on mount/effects
    const hook = named('src/commerce/usePaymentFlow.ts');
    expect(hook).not.toMatch(/startPayment\(|retryVerification\(|checkPaymentStatus\(/);
  });

  it('step 4: the flow states and machine have no failed / retry-safe / not-started conclusion, and nothing is derived from elapsed time', () => {
    const machine = named('src/payments/paymentFlowMachine.ts');
    expect(machine).not.toMatch(/\bFAILED\b|RETRY_SAFE|SAFE_TO_RETRY|NOT_STARTED/);
    for (const f of payments) expect(f.s).not.toMatch(/Date\.now|new Date\(|performance\.now/);
  });

  it('step 4: evidence handling stays in the store: the controller never logs, persists or caches it, and uses no Query cache', () => {
    const ctl = named('src/payments/paymentFlowController.ts');
    expect(ctl).not.toMatch(/console\.|JSON\.stringify|setQueryData|queryClient|AsyncStorage|SecureStore/);
    expect(offenders(/setEvidence\(/)).toEqual(['src/payments/paymentEvidenceStore.tsx', 'src/payments/paymentFlowController.ts']);
  });

  it('step 4 hardening: the native lock has no timer-based release and evidence recovery never creates or opens anything', () => {
    expect(named('src/payments/razorpayNative.ts')).not.toMatch(/setTimeout|setInterval|Promise\.race/);
    const ctl = named('src/payments/paymentFlowController.ts');
    const adopt = ctl.slice(ctl.indexOf('private adoptStoredEvidence'), ctl.indexOf('private markCheckoutPending'));
    expect(adopt).not.toMatch(/createAttempt|openCheckout|verifyPayment|fetchOrder|setEvidence/);
    // the evidence store is the only place that knows the lookup; no persistence API
    expect(named('src/payments/paymentEvidenceStore.tsx')).not.toMatch(/AsyncStorage|SecureStore|setItem|JSON\.parse|localStorage/);
  });

  it('step 4: the hook uses the shared order query cache only (no second order cache) and AppState from react-native', () => {
    const hook = named('src/commerce/usePaymentFlow.ts');
    expect(hook).toMatch(/qk\.order\(orderId\)/);
    expect(hook).not.toMatch(/useState|createContext|AsyncStorage|SecureStore|persist/);
  });
});

describe('P11C-2 step 5 static guards (payment UI boundaries)', () => {
  const screens = files.filter((f) => f.p.startsWith('src/screens/') && !f.p.startsWith('src/screens/dev/'));
  const panel = () => named('src/screens/commerce/PaymentPanel.tsx');

  it('dependency direction: UI -> usePaymentFlow only. Screens never touch the native layer, the bridge, the payment API, the mapping, the controller or the evidence store', () => {
    for (const f of [...screens, ...files.filter((x) => x.p.startsWith('src/navigation/'))]) {
      expect(f.s).not.toMatch(/razorpayNative|razorpayBridge|react-native-razorpay|paymentApi|PaymentApi|checkoutMapping|buildCheckoutOptions|paymentFlowController|PaymentFlowController|paymentEvidenceStore|PaymentEvidenceStore|razorpayDiagnostic/);
      expect(f.s).not.toMatch(/createAttempt|verifyPayment|getAttempt|openCheckout|openNativeCheckout/);
    }
    expect(panel()).toMatch(/from '\.\.\/\.\.\/commerce\/usePaymentFlow'/);
  });

  it('the panel constructs no checkout options and passes nothing into the actions (no amount, currency, provider order, method, evidence)', () => {
    expect(panel()).not.toMatch(/order_id|key:|currency|amountMinor|providerOrderId|providerPaymentId|signature|paymentMethod|razorpay/i);
    expect(panel()).toMatch(/onPress=\{\(\) => void startPayment\(\)\}/);
    expect(panel()).toMatch(/onPress=\{\(\) => void retryVerification\(\)\}/);
    expect(panel()).toMatch(/onPress=\{\(\) => void checkPaymentStatus\(\)\}/);
    expect(panel().match(/startPayment\(/g)).toHaveLength(1);
  });

  it('nothing starts automatically: no effect, timer or navigation listener in the panel or the order screens triggers a payment action', () => {
    expect(panel()).not.toMatch(/useEffect|useLayoutEffect|useFocusEffect|setTimeout|setInterval|AppState/);
    for (const f of screens.filter((x) => x.p !== 'src/screens/commerce/PaymentPanel.tsx')) expect(f.s).not.toMatch(/startPayment|retryVerification|checkPaymentStatus/);
    expect(offenders(/startPayment\(/).sort()).toEqual(['src/payments/paymentFlowController.ts', 'src/screens/commerce/PaymentPanel.tsx']);
  });

  it('no payment evidence, session or provider data in navigation params or navigation calls', () => {
    expect(offenders(/navigate\([^)]*(evidence|signature|providerPaymentId|providerOrderId|attemptId|keyId|session)/i)).toEqual([]);
    const nav = named('src/navigation/types.ts');
    expect(nav).not.toMatch(/evidence|signature|provider|attempt|session|payment/i);
  });

  it('no custom payment-method UI, no card / bank / wallet / QR input, and no fallback (cash, COD, wallet, browser, transfer)', () => {
    for (const f of screens) {
      expect(f.s).not.toMatch(/\bupi\b|netbanking|net banking|card number|cvv|expiry|\bqr\b|bank transfer|open_?url|Linking\.|WebView/i);
    }
    expect(panel()).not.toMatch(/\bcod\b|cash|wallet|browser|transfer|fallback/i);
  });

  it('the panel is not part of cancellation / refund / delivery-code work and logs nothing', () => {
    expect(panel()).not.toMatch(/cancel|refund|delivery[- ]?code|handover|console\./i);
  });
});
