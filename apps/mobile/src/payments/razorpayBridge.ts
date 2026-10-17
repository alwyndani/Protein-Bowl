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

const present = (v: unknown) => typeof v === 'string' && v.length > 0;

function presenceOf(raw: unknown): PayloadPresence {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  return { paymentIdPresent: present(r?.razorpay_payment_id), orderIdPresent: present(r?.razorpay_order_id), signaturePresent: present(r?.razorpay_signature) };
}

async function run(options: RazorpayOpenOptions): Promise<{ outcome: RazorpayOutcome; presence: PayloadPresence | null }> {
  const mod = loadModule();
  if (!mod) return { outcome: { kind: 'UNAVAILABLE' }, presence: null };
  if (inFlight) return { outcome: { kind: 'IN_PROGRESS' }, presence: null };
  inFlight = true;
  try {
    const raw = await mod.open(options);
    return { outcome: normalizeSuccess(raw), presence: presenceOf(raw) };
  } catch (e) {
    return { outcome: normalizeError(e), presence: null };
  } finally {
    inFlight = false;
  }
}

/** Opens the native Razorpay checkout. Never throws; never reports success unless the payload is complete and well-formed. */
export async function openRazorpayCheckout(options: RazorpayOpenOptions): Promise<RazorpayOutcome> {
  return (await run(options)).outcome;
}

/** Same call, plus which callback fields were present (booleans only). Used by the development-only native harness. */
export function openRazorpayCheckoutWithPresence(options: RazorpayOpenOptions): Promise<{ outcome: RazorpayOutcome; presence: PayloadPresence | null }> {
  return run(options);
}
