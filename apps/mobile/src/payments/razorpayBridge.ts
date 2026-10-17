import { NativeModules, TurboModuleRegistry } from 'react-native';

/**
 * P11C-1 native bridge: a THIN, typed wrapper around the official `react-native-razorpay` module and nothing else. It holds no payment
 * state, makes no backend request, stores nothing and logs nothing. The Razorpay payload it returns is UNTRUSTED client evidence: only the
 * backend verify endpoint (P11C-2) can turn it into a paid order.
 *
 * Expo Go cannot load the native module. Availability is detected BEFORE the package is required, so the app never crashes there and
 * never fakes a result: it reports UNAVAILABLE.
 */

export type RazorpayOpenOptions = {
  /** PUBLIC key id returned by the backend payment session. Never a secret. */
  key: string;
  /** Provider order id from the backend session (P11C-2). Optional only so the dev-only native harness can open an order-less test checkout. */
  order_id?: string;
  /** Minor units (paise), exactly as the backend session reports. */
  amount: number;
  currency: string;
  name: string;
  description?: string;
};

export type RazorpaySuccessEvidence = {
  razorpayPaymentId: string;
  razorpayOrderId: string;
  razorpaySignature: string;
};

export type RazorpayOutcome =
  | { kind: 'UNAVAILABLE' }
  | { kind: 'IN_PROGRESS' }
  /** The module resolved with a complete, well-formed payload. Still only CLIENT evidence, never proof of payment. */
  | { kind: 'SUCCESS'; evidence: RazorpaySuccessEvidence }
  /** The module rejected (failure or dismissal; the exact dismissal shape is established by the real-device test). Raw provider text is never shown. */
  | { kind: 'ERROR'; code: number | null; description: string | null }
  /** The module resolved but the payload is incomplete or malformed. Money may have moved: treat as AMBIGUOUS, never as success or failure. */
  | { kind: 'MALFORMED_RESULT' };

/** Which expected callback fields were present. Booleans only: never the values. */
export type PayloadPresence = { paymentIdPresent: boolean; orderIdPresent: boolean; signaturePresent: boolean };

type RazorpayModule = { open: (options: RazorpayOpenOptions) => Promise<unknown> };

const PROVIDER_ID = /^[A-Za-z0-9_]{1,64}$/; // the same shape the backend verify endpoint accepts
const SIGNATURE = /^[A-Fa-f0-9]{64}$/;
const MAX_DESCRIPTION = 200;

let inFlight = false;

/** True only in a build that actually contains the native module (a development / production build, never Expo Go). */
export function isRazorpayNativeAvailable(): boolean {
  try {
    if (NativeModules.RNRazorpayCheckout != null) return true; // legacy architecture (Expo SDK 52 default)
    return TurboModuleRegistry.get('RNRazorpayCheckout') != null; // New Architecture
  } catch {
    return false;
  }
}

function loadModule(): RazorpayModule | null {
  if (!isRazorpayNativeAvailable()) return null;
  try {
    const loaded = require('react-native-razorpay') as { default?: RazorpayModule } & Partial<RazorpayModule>;
    const mod = loaded.default ?? loaded;
    return typeof mod.open === 'function' ? (mod as RazorpayModule) : null;
  } catch {
    return null;
  }
}

function normalizeSuccess(raw: unknown): RazorpayOutcome {
  const r = raw as Record<string, unknown> | null;
  const id = r?.razorpay_payment_id;
  const order = r?.razorpay_order_id;
  const sig = r?.razorpay_signature;
  if (typeof id === 'string' && PROVIDER_ID.test(id) && typeof order === 'string' && PROVIDER_ID.test(order) && typeof sig === 'string' && SIGNATURE.test(sig)) {
    return { kind: 'SUCCESS', evidence: { razorpayPaymentId: id, razorpayOrderId: order, razorpaySignature: sig } };
  }
  return { kind: 'MALFORMED_RESULT' };
}

function normalizeError(raw: unknown): RazorpayOutcome {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const code = typeof r?.code === 'number' && Number.isFinite(r.code) ? r.code : null;
  const description = typeof r?.description === 'string' ? r.description.slice(0, MAX_DESCRIPTION) : null;
  return { kind: 'ERROR', code, description };
}

/**
 * DIAGNOSTIC ONLY (P11C-2 step 2): the SAFE SHAPE of a native error payload, used by the development-only harness to learn which structured
 * fields really reach JavaScript. It carries key NAMES and a few allow-listed, enum-like values (code / source / step / reason), never
 * payment ids, order ids, signatures, metadata values or free text that could hold them. It must never drive financial decisions.
 */
export type ErrorShape = {
  topLevelKeys: string[];
  code: { type: 'number' | 'string' | 'other' | 'absent'; value: number | string | null };
  descriptionKind: 'absent' | 'text' | 'json';
  /** Redacted, bounded; only for a plain-text description. */
  descriptionText: string | null;
  /** iOS layout: the key names of the nested details object. */
  detailsKeys: string[] | null;
  /** Razorpay-style nested error object (found in the description JSON, in an 'error' field, or in the details object). */
  nested: null | {
    keys: string[];
    code: string | null;
    source: string | null;
    step: string | null;
    reason: string | null;
    metadataKeys: string[] | null;
    descriptionText: string | null;
  };
};

const SAFE_KEY = /^[A-Za-z0-9_.-]{1,40}$/;
const SAFE_TOKEN = /^[A-Za-z0-9_.:-]{1,48}$/;
const ID_LIKE = /^(pay|order|rfnd|rzp|acc|cust|plink|inv|sub)_/i;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keyNames = (o: Record<string, unknown>): string[] =>
  Object.keys(o)
    .slice(0, 30)
    .map((k) => (SAFE_KEY.test(k) ? k : '<odd-key>'));
const safeToken = (v: unknown): string | null => (typeof v === 'string' && SAFE_TOKEN.test(v) && !ID_LIKE.test(v) ? v : null);
const redactText = (t: string): string =>
  t
    .replace(/\b(pay|order|rfnd|rzp|acc|cust|plink|inv|sub)_[A-Za-z0-9]+/gi, '<id>')
    .replace(/[A-Fa-f0-9]{32,}/g, '<hex>')
    .slice(0, 120);

function tryParseJson(text: string): unknown {
  const t = text.trim();
  if (t.length === 0 || t.length > 4000 || t[0] !== '{') return undefined;
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

function nestedOf(candidate: unknown): ErrorShape['nested'] {
  if (!isRecord(candidate)) return null;
  const inner = isRecord(candidate.error) ? candidate.error : candidate;
  const hasMarker = ['code', 'source', 'step', 'reason', 'metadata', 'description'].some((k) => k in inner);
  if (!hasMarker) return null;
  return {
    keys: keyNames(inner),
    code: safeToken(inner.code),
    source: safeToken(inner.source),
    step: safeToken(inner.step),
    reason: safeToken(inner.reason),
    metadataKeys: isRecord(inner.metadata) ? keyNames(inner.metadata) : 'metadata' in inner ? [] : null,
    descriptionText: typeof inner.description === 'string' ? redactText(inner.description) : null
  };
}

export function describeErrorShape(raw: unknown): ErrorShape {
  const r = isRecord(raw) ? raw : null;
  const rawCode = r?.code;
  const code: ErrorShape['code'] =
    typeof rawCode === 'number' && Number.isFinite(rawCode)
      ? { type: 'number', value: rawCode }
      : typeof rawCode === 'string'
        ? { type: 'string', value: safeToken(rawCode) }
        : rawCode === undefined
          ? { type: 'absent', value: null }
          : { type: 'other', value: null };

  const desc = r?.description;
  const parsed = typeof desc === 'string' ? tryParseJson(desc) : undefined;
  const descriptionKind: ErrorShape['descriptionKind'] = typeof desc !== 'string' ? 'absent' : parsed !== undefined ? 'json' : 'text';

  const details = r && isRecord(r.details) ? r.details : null;
  const nested = nestedOf(parsed) ?? nestedOf(r?.error) ?? nestedOf(details?.error) ?? (details ? nestedOf(details) : null);

  return {
    topLevelKeys: r ? keyNames(r) : [],
    code,
    descriptionKind,
    descriptionText: descriptionKind === 'text' && typeof desc === 'string' ? redactText(desc) : null,
    detailsKeys: details ? keyNames(details) : null,
    nested
  };
}

const present = (v: unknown) => typeof v === 'string' && v.length > 0;

function presenceOf(raw: unknown): PayloadPresence {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  return { paymentIdPresent: present(r?.razorpay_payment_id), orderIdPresent: present(r?.razorpay_order_id), signaturePresent: present(r?.razorpay_signature) };
}

type RunResult = { outcome: RazorpayOutcome; presence: PayloadPresence | null; errorShape: ErrorShape | null };

async function run(options: RazorpayOpenOptions): Promise<RunResult> {
  const mod = loadModule();
  if (!mod) return { outcome: { kind: 'UNAVAILABLE' }, presence: null, errorShape: null };
  if (inFlight) return { outcome: { kind: 'IN_PROGRESS' }, presence: null, errorShape: null };
  inFlight = true;
  try {
    const raw = await mod.open(options);
    return { outcome: normalizeSuccess(raw), presence: presenceOf(raw), errorShape: null };
  } catch (e) {
    return { outcome: normalizeError(e), presence: null, errorShape: describeErrorShape(e) };
  } finally {
    inFlight = false;
  }
}

/** Opens the native Razorpay checkout. Never throws; never reports success unless the payload is complete and well-formed. */
export async function openRazorpayCheckout(options: RazorpayOpenOptions): Promise<RazorpayOutcome> {
  return (await run(options)).outcome;
}

/** Same call, plus which callback fields were present (booleans only). Used by the development-only native harness. */
export async function openRazorpayCheckoutWithPresence(options: RazorpayOpenOptions): Promise<{ outcome: RazorpayOutcome; presence: PayloadPresence | null }> {
  const { outcome, presence } = await run(options);
  return { outcome, presence };
}

/** DEVELOPMENT HARNESS ONLY: the same call plus the safe SHAPE of a failure payload (key names and allow-listed enum values only). */
export function openRazorpayCheckoutDiagnostic(options: RazorpayOpenOptions): Promise<RunResult> {
  return run(options);
}
