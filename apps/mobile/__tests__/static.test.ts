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
    expect(offenders(/SUPER_ADMIN|NUTRITIONIST|\bCHEF\b|PROCUREMENT|\bDELIVERY\b|BAKERY_FMCG|TEPACHE|SWIGGY|MESS_CUSTOMER|role\s*switch/i)).toEqual([]);
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

  it('later-subphase features are NOT present: payments, commerce, Mess, diet / health, screen capture', () => {
    expect(offenders(/razorpay|RazorpayCheckout|payment-attempts|checkout\/preview/i)).toEqual([]);
    expect(offenders(/\/cart\b|\/orders\b|\/products\b|\/mess\b|\/diets\b|handover-code|delivery-code/i)).toEqual([]);
    expect(offenders(/biometrics|health[-_ ]?profile|labReport|dietPlan/i)).toEqual([]);
    expect(offenders(/expo-screen-capture/)).toEqual([]);
  });

  it('package.json: no payment SDK, no dev-client, no screen-capture, no weak storage dependency; test tooling is dev-only', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const banned of ['react-native-razorpay', 'razorpay', 'expo-dev-client', 'expo-screen-capture', '@react-native-async-storage/async-storage', 'redux', '@reduxjs/toolkit', 'react-native-webview']) {
      expect(deps).not.toContain(banned);
    }
    for (const dev of ['jest', 'jest-expo', '@testing-library/react-native', 'react-test-renderer']) {
      expect(Object.keys(pkg.dependencies)).not.toContain(dev);
      expect(Object.keys(pkg.devDependencies)).toContain(dev);
    }
    expect(Object.keys(pkg.dependencies)).toEqual(expect.arrayContaining(['@tanstack/react-query', '@react-navigation/native', 'expo-secure-store']));
    expect(pkg.scripts.web).toBeUndefined();
  });

  it('remains Expo-Go compatible: no prebuild output, no EAS config, no missing-asset references, no web target', () => {
    for (const forbidden of ['android', 'ios', 'eas.json', 'app.json']) expect(fs.existsSync(path.join(ROOT, forbidden))).toBe(false);
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
