import fs from 'fs';
import path from 'path';

/**
 * Static guards for the production mobile code. They scan SOURCE (comments stripped) so the permanent rules cannot silently regress:
 * no demo/staff/KDS/wallet remnants, no weak storage, no COD / cash concepts, no secrets, no payment SDK before its subphase.
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

const isTestSupport = (p: string) => p.includes(`${path.sep}src${path.sep}test${path.sep}`) || p.endsWith('jest.setup.ts');
const productionFiles = walk(ROOT).filter((p) => /\.(ts|tsx|js|json)$/.test(p) && !/package(-lock)?\.json$|tsconfig\.json$/.test(p) && !isTestSupport(p));
const code = productionFiles.map((p) => ({ p: path.relative(ROOT, p), s: /\.(ts|tsx)$/.test(p) ? stripComments(fs.readFileSync(p, 'utf8')) : fs.readFileSync(p, 'utf8') }));

function offenders(re: RegExp) {
  return code.filter((f) => re.test(f.s)).map((f) => f.p);
}

describe('P11A static guards (production mobile source)', () => {
  it('scans the real source (sanity)', () => {
    const names = code.map((c) => c.p.replace(/\\/g, '/'));
    for (const must of ['App.tsx', 'app.config.ts', 'src/auth/sessionManager.ts', 'src/auth/secureSession.ts', 'src/api/apiClient.ts']) expect(names).toContain(must);
  });

  it('the demo application is gone: no demo quick login, fake wallet, KDS, retired pause-meal, hard-coded subscription id', () => {
    expect(offenders(/quick\s*login|demo\s*(login|account|user)|__DEV__\s*\?\s*['"][a-z.]+@/i)).toEqual([]);
    expect(offenders(/\bkds\b|kitchen\s*ticket|\/kds\//i)).toEqual([]);
    expect(offenders(/wallet|walletBalance|atomic double-entry/i)).toEqual([]);
    expect(offenders(/pause-meal|\+\s*₹\s*85|verify-gatepass/)).toEqual([]);
    expect(offenders(/sub-test-\d+/)).toEqual([]);
    expect(offenders(/customer@proteinbowl|student@proteinbowl|kiran@proteinbowl|@proteinbowl\.in/)).toEqual([]);
  });

  it('no staff workspace, role switcher or staff role names in the customer app', () => {
    expect(offenders(/SUPER_ADMIN|NUTRITIONIST|\bCHEF\b|PROCUREMENT|\bDELIVERY\b|BAKERY_FMCG|TEPACHE|SWIGGY|MESS_CUSTOMER/)).toEqual([]);
    expect(offenders(/role\s*switch/i)).toEqual([]);
    expect(offenders(/staff\s*(login|workspace|dashboard)|admin\s*(login|panel)/i)).toEqual([]);
  });

  it('no weak storage anywhere: no AsyncStorage, localStorage, sessionStorage, filesystem, SQLite', () => {
    expect(offenders(/AsyncStorage|async-storage|localStorage|sessionStorage|expo-file-system|expo-sqlite|react-native-mmkv|FileSystem\./)).toEqual([]);
  });

  it('SecureStore is used ONLY by the session wrapper, and it persists no access token / user / password', () => {
    expect(offenders(/expo-secure-store/)).toEqual(['src\\auth\\secureSession.ts'].map((p) => p.replace(/\\/g, path.sep)));
    const wrapper = code.find((c) => c.p.replace(/\\/g, '/') === 'src/auth/secureSession.ts')!.s;
    expect(wrapper).not.toMatch(/accessToken|password|user\b|roles/i);
    // the persisted record is exactly { refreshToken, expiresAt }
    expect(wrapper).toMatch(/JSON\.stringify\(\{ refreshToken: session\.refreshToken, expiresAt: session\.expiresAt \}\)/);
  });

  it('the access token is never written anywhere: only held in memory by the session manager', () => {
    const manager = code.find((c) => c.p.replace(/\\/g, '/') === 'src/auth/sessionManager.ts')!.s;
    expect(manager).not.toMatch(/storage\.write\(\{[^}]*accessToken/);
    expect(offenders(/setItem\(|setItemAsync\(/).map((p) => p.replace(/\\/g, '/'))).toEqual(['src/auth/secureSession.ts']);
  });

  it('no COD / cash / pay-at-hostel / pay-at-gate / driver collection / cash settlement concept (permanent online-only rule)', () => {
    expect(offenders(/\bCOD\b|cash[\s_-]*on[\s_-]*delivery|\bcash\b|cash_at_gate|pay[\s_-]*at[\s_-]*(hostel|gate|door)|driver[\s_-]*collect|collect[\s_-]*cash|settlement/i)).toEqual([]);
  });

  it('no secrets or secret-like configuration; only public EXPO_PUBLIC_* variables are read', () => {
    expect(offenders(/JWT_|DELIVERY_PROOF|RAZORPAY_|WEBHOOK_SECRET|DATABASE_URL|BOOTSTRAP_ADMIN|STEP_UP|rzp_(live|test)|sk_(live|test)|-----BEGIN|AKIA[0-9A-Z]{12}/)).toEqual([]);
    const envReads = code.flatMap((c) => [...c.s.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]));
    expect(envReads.length).toBeGreaterThan(0);
    for (const name of envReads) expect(name).toMatch(/^EXPO_PUBLIC_/);
  });

  it('no hard-coded API URL, production localhost fallback or http endpoint in source', () => {
    expect(offenders(/localhost|127\.0\.0\.1|10\.0\.2\.2|https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/i)).toEqual([]);
  });

  it('no logging at all (tokens, passwords and handover codes can never reach a log)', () => {
    expect(offenders(/console\.(log|info|warn|error|debug)/)).toEqual([]);
  });

  it('tokens never travel in URLs, deep links or query strings; no deep-link scheme is configured', () => {
    expect(offenders(/[?&](refresh_?token|access_?token|token)=/i)).toEqual([]);
    expect(offenders(/Linking\.|expo-linking|scheme\s*:/)).toEqual([]);
  });

  it('P11B boundary: the commerce API is EXACTLY the approved endpoint set - no payment, verify, cancel, refund, delivery-code, Mess, diet or health request', () => {
    // P11C-2 step 3: the payment-attempt endpoints are allowed in EXACTLY one module (the payment API); everything else stays forbidden.
    expect(offenders(/payment-attempts|\/verify\b/).map((p) => p.replace(/\\/g, '/'))).toEqual(['src/payments/paymentApi.ts']);
    expect(offenders(/\/cancel\b|\/refunds?\b|delivery-code|handover-code|\/mess\b|\/diets?\b|\/kds\b|\/delivery\b|\/admin\b|\/staff\b/i)).toEqual([]);
    expect(offenders(/biometrics|health[-_ ]?profile|labReport|dietPlan/i)).toEqual([]);
    expect(offenders(/expo-screen-capture/)).toEqual([]);
    const api = code.find((c) => c.p.replace(/\\/g, '/') === 'src/commerce/api.ts')!.s;
    const paths = [...api.matchAll(/request\(\s*[`'"]([^`'"?$]*)/g)].map((m) => m[1]).sort();
    expect(paths).toEqual(
      ['/cart', '/cart', '/cart/items', '/cart/items/', '/cart/items/', '/checkout/preview', '/customers/me/addresses', '/customers/me/addresses', '/customers/me/addresses/', '/customers/me/addresses/', '/orders', '/orders/', '/orders/my-orders', '/products', '/products/', '/products/categories'].sort()
    );
  });

  it('no payment-method concept: the order request never carries paymentMethod and there is no selector (ONLINE by omission)', () => {
    expect(offenders(/paymentMethod/)).toEqual([]);
  });

  it('allow-listed product fields only: nothing renders rating, review count, stock, SKU, recipe id or tax rate; no weak randomness for the idempotency key', () => {
    expect(offenders(/stockQuantity|reviewsCount|recipeId|taxRate|isPublished|isFMCG|isTepache|\brating\b|\bsku\b/i)).toEqual([]);
    expect(offenders(/Math\.random/)).toEqual([]);
    const key = code.find((c) => c.p.replace(/\\/g, '/') === 'src/commerce/idempotencyKey.ts')!.s;
    expect(key).toMatch(/Crypto\.randomUUID\(\)/);
    expect(key).not.toMatch(/Math\.|Date\.|counter|expo-modules-core/);
    expect(key).not.toMatch(/Date\.now/);
  });

  it('the secure UUID source is the declared, Expo-supported expo-crypto (used by exactly ONE file); production code never imports expo-modules-core and never declares it', () => {
    expect(offenders(/expo-modules-core/)).toEqual([]);
    expect(offenders(/from 'expo-crypto'/).map((p) => p.replace(/\\/g, '/'))).toEqual(['src/commerce/idempotencyKey.ts']);
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.dependencies['expo-crypto']).toMatch(/^~14\.0\./); // the Expo SDK 52 catalogue version
    expect(Object.keys(pkg.dependencies)).not.toContain('expo-modules-core');
  });

  it('commerce data is never persisted: no storage API outside the session wrapper, and the order email / phone of the address snapshot is not modelled', () => {
    expect(offenders(/AsyncStorage|setItem|SecureStore/).map((p) => p.replace(/\\/g, '/'))).toEqual(['src/auth/secureSession.ts']);
    const types = code.find((c) => c.p.replace(/\\/g, '/') === 'src/commerce/types.ts')!.s;
    expect(types).not.toMatch(/email|phone/i);
  });

  it('package.json: only the approved P11C-1 native dependencies (exact Razorpay pin + dev-client), no screen-capture, no weak storage dependency; test tooling is dev-only', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const banned of ['razorpay', 'expo-build-properties', 'expo-screen-capture', '@react-native-async-storage/async-storage', 'redux', '@reduxjs/toolkit', 'react-native-webview']) {
      expect(deps).not.toContain(banned);
    }
    for (const dev of ['jest', 'jest-expo', '@testing-library/react-native', 'react-test-renderer']) {
      expect(Object.keys(pkg.dependencies)).not.toContain(dev);
      expect(Object.keys(pkg.devDependencies)).toContain(dev);
    }
    expect(Object.keys(pkg.dependencies)).toEqual(expect.arrayContaining(['@tanstack/react-query', '@react-navigation/native', 'expo-secure-store']));
    expect(pkg.scripts.web).toBeUndefined();
    // P11C-1 approved native dependencies: the Razorpay wrapper is pinned EXACTLY (native SDK behaviour must not float), dev-client is the Expo SDK 52 catalogue range.
    expect(pkg.dependencies['react-native-razorpay']).toBe('3.0.0');
    expect(pkg.dependencies['expo-dev-client']).toMatch(/^~5\.0\./);
  });

  it('native projects are generated, never committed: no android/ios directory, no app.json, only a development-only eas.json without credentials; no missing-asset references, no web target', () => {
    for (const forbidden of ['android', 'ios', 'app.json']) expect(fs.existsSync(path.join(ROOT, forbidden))).toBe(false);
    const eas = JSON.parse(fs.readFileSync(path.join(ROOT, 'eas.json'), 'utf8'));
    expect(Object.keys(eas.build)).toEqual(['development']);
    expect(eas.build.development.developmentClient).toBe(true);
    expect(JSON.stringify(eas)).not.toMatch(/secret|password|token|keystore|credentials|serviceAccount|rzp_|submit|production/i);
    const cfg = stripComments(fs.readFileSync(path.join(ROOT, 'app.config.ts'), 'utf8'));
    expect(cfg).not.toMatch(/assets\/|icon:|splash|adaptiveIcon|favicon|newArchEnabled|plugins:/);
    expect(cfg).toMatch(/platforms: \['ios', 'android'\]/);
  });

  it('mobile TypeScript is its OWN explicit gate and covers production source, config and tests (root tsconfig excludes mobile on purpose)', () => {
    const rootTs = JSON.parse(fs.readFileSync(path.join(ROOT, '..', '..', 'tsconfig.json'), 'utf8'));
    expect(rootTs.exclude).toContain('apps/mobile');
    const mobileTs = JSON.parse(fs.readFileSync(path.join(ROOT, 'tsconfig.json'), 'utf8'));
    expect(mobileTs.compilerOptions.strict).toBe(true);
    expect(mobileTs.include).toEqual(expect.arrayContaining(['**/*.ts', '**/*.tsx']));
    expect(mobileTs.exclude).toBeUndefined();
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts.typecheck).toBe('tsc --noEmit');
    const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, '..', '..', 'package.json'), 'utf8'));
    expect(rootPkg.scripts['typecheck:mobile']).toMatch(/apps\/mobile/);
    expect(rootPkg.scripts['typecheck:server']).toBeTruthy();
    expect(rootPkg.scripts['typecheck:all']).toMatch(/typecheck:mobile/);
  });

  it('the Query cache is never persisted (no persister / persist client)', () => {
    expect(offenders(/persistQueryClient|createAsyncStoragePersister|PersistQueryClientProvider|query-persist/)).toEqual([]);
  });

  it('every non-auth request path goes through the typed client: fetch( is used only inside apiClient', () => {
    expect(offenders(/\bfetch\(/).map((p) => p.replace(/\\/g, '/'))).toEqual(['src/api/apiClient.ts']);
  });
});

describe('P11C-1 static guards (native Razorpay spike: bridge only, no payment flow)', () => {
  it('the Razorpay package is referenced by exactly ONE production file (the native layer); the layering is native -> bridge / dev diagnostic', () => {
    const rel = (re: RegExp) => offenders(re).map((p) => p.replace(/\\/g, '/')).sort();
    expect(rel(/react-native-razorpay/)).toEqual(['src/payments/razorpayNative.ts']);
    expect(rel(/RazorpayCheckout/)).toEqual(['src/payments/dev/razorpayDiagnostic.ts', 'src/payments/razorpayNative.ts', 'src/screens/dev/RazorpayTestScreen.tsx']);
    // only the production bridge and the dev diagnostic read the raw native layer
    expect(rel(/razorpayNative'/)).toEqual(['src/payments/dev/razorpayDiagnostic.ts', 'src/payments/razorpayBridge.ts']);
    // the only importer of the production bridge is the checkout mapping (a TYPE import); the flow layer arrives in a later step
    expect(rel(/razorpayBridge'/)).toEqual(['src/payments/checkoutMapping.ts']);
    expect(code.find((c) => c.p.replace(/\\/g, '/') === 'src/payments/checkoutMapping.ts')!.s).toMatch(/import type \{ CheckoutOptions \} from '\.\/razorpayBridge'/);
  });

  it('the native harness is DEV-ONLY: reachable solely through a __DEV__-gated require in the Account screen, never a route or a static import', () => {
    const account = code.find((c) => c.p.replace(/\\/g, '/') === 'src/screens/AccountScreen.tsx')!.s;
    expect(account).toMatch(/=\s*__DEV__\s*\?[\s\S]{0,260}require\('\.\/dev\/RazorpayTestScreen'\)[\s\S]{0,160}:\s*null/);
    expect(account).not.toMatch(/^import\s[^;]*from\s+'\.\/dev\/RazorpayTestScreen'/m); // a static import would put the harness in every bundle
    expect(offenders(/RazorpayTestScreen/).map((p) => p.replace(/\\/g, '/')).sort()).toEqual(['src/screens/AccountScreen.tsx', 'src/screens/dev/RazorpayTestScreen.tsx']);
    expect(offenders(/RazorpayTestScreen/).some((p) => /navigation/.test(p))).toBe(false);
  });

  it('the harness is isolated from commerce, auth, storage and the backend, reads only the PUBLIC test key id, and shows no payment evidence', () => {
    const h = code.find((c) => c.p.replace(/\\/g, '/') === 'src/screens/dev/RazorpayTestScreen.tsx')!.s;
    expect(h).not.toMatch(/apiClient|\bfetch\(|useQuery|useMutation|commerce\/|auth\/|queryClient|expo-secure-store|AsyncStorage|setItem|persist|console\./);
    expect(h).not.toMatch(/SECRET|WEBHOOK|DATABASE|JWT|RAZORPAY_|verify|cancel|refund|payment-attempts|order\.id|orderId:/i);
    expect([...h.matchAll(/process\.env\.(\w+)/g)].map((m) => m[1])).toEqual(['EXPO_PUBLIC_P11C1_TEST_KEY_ID']);
    // Only booleans about field presence are rendered; the values of the payment id / order id / signature are never read here.
    expect(h).not.toMatch(/razorpayPaymentId|razorpayOrderId|razorpaySignature|evidence/);
  });

  it('no production source reads a non-public environment variable (secrets cannot be inlined into the app)', () => {
    expect(offenders(/process\.env\.(?!EXPO_PUBLIC_)/)).toEqual([]);
  });

  it('the bridge layers are thin: no network, storage, logging or backend client; no customer payment UI exists', () => {
    for (const file of ['src/payments/razorpayNative.ts', 'src/payments/razorpayBridge.ts']) {
      const src = code.find((c) => c.p.replace(/\\/g, '/') === file)!.s;
      expect(src).not.toMatch(/console\.|fetch\(|apiClient|expo-secure-store|setItem|persist|Alert\.|useQuery|useMutation|payment-attempts/);
    }
    expect(offenders(/Pay now|Pay with|Pay securely|Retry payment|Check payment status/i)).toEqual([]);
  });

  it('iOS UPI intent schemes are the documented set; New Architecture is NOT overridden (Expo SDK 52 generates false when unset)', () => {
    const cfg = stripComments(fs.readFileSync(path.join(ROOT, 'app.config.ts'), 'utf8'));
    expect(cfg).toMatch(/LSApplicationQueriesSchemes: \['tez', 'phonepe', 'paytmmp'\]/);
    expect(cfg).not.toMatch(/newArchEnabled/);
  });
});
