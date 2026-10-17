import { isRazorpayNativeAvailable, openNativeCheckout } from '../razorpayNative';
import type { NativeOpenOptions } from '../razorpayNative';

/**
 * DEVELOPMENT-ONLY diagnostics for the native Razorpay checkout (P11C-1 spike + P11C-2 step 2). Used solely by the `__DEV__` harness to
 * learn which structured fields really reach JavaScript (re-check after an SDK upgrade, and on iOS). Production code must never import
 * this module (a static guard enforces it), so none of this ships in the production bundle.
 *
 * It may read provider description text and shows key NAMES only; it never drives a financial decision.
 */

export { isRazorpayNativeAvailable };

export type RazorpayOpenOptions = NativeOpenOptions;

export type DiagnosticOutcome =
  | { kind: 'UNAVAILABLE' }
  | { kind: 'IN_PROGRESS' }
  | { kind: 'SUCCESS'; evidence: { razorpayPaymentId: string; razorpayOrderId: string; razorpaySignature: string } }
  | { kind: 'ERROR'; code: number | null; description: string | null }
  | { kind: 'MALFORMED_RESULT' };

/** Which expected callback fields were present. Booleans only: never the values. */
export type PayloadPresence = { paymentIdPresent: boolean; orderIdPresent: boolean; signaturePresent: boolean };

const PROVIDER_ID = /^[A-Za-z0-9_]{1,64}$/;
const SIGNATURE = /^[A-Fa-f0-9]{64}$/;
const MAX_DESCRIPTION = 200;

function normalizeSuccess(raw: unknown): DiagnosticOutcome {
  const r = raw as Record<string, unknown> | null;
  const id = r?.razorpay_payment_id;
  const order = r?.razorpay_order_id;
  const sig = r?.razorpay_signature;
  if (typeof id === 'string' && PROVIDER_ID.test(id) && typeof order === 'string' && PROVIDER_ID.test(order) && typeof sig === 'string' && SIGNATURE.test(sig)) {
    return { kind: 'SUCCESS', evidence: { razorpayPaymentId: id, razorpayOrderId: order, razorpaySignature: sig } };
  }
  return { kind: 'MALFORMED_RESULT' };
}

function normalizeError(raw: unknown): DiagnosticOutcome {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const code = typeof r?.code === 'number' && Number.isFinite(r.code) ? r.code : null;
  const description = typeof r?.description === 'string' ? r.description.slice(0, MAX_DESCRIPTION) : null;
  return { kind: 'ERROR', code, description };
}

/**
 * The SAFE SHAPE of a native error payload. It carries key NAMES and a few allow-listed, enum-like values (code / source / step / reason),
 * never payment ids, order ids, signatures, metadata values or free text that could hold them.
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

export type DiagnosticResult = { outcome: DiagnosticOutcome; presence: PayloadPresence | null; errorShape: ErrorShape | null };

/** DEVELOPMENT HARNESS ONLY: opens the checkout and returns the outcome, field presence (booleans) and the safe error shape. */
export async function openRazorpayCheckoutDiagnostic(options: RazorpayOpenOptions): Promise<DiagnosticResult> {
  const settled = await openNativeCheckout(options);
  switch (settled.kind) {
    case 'UNAVAILABLE':
    case 'IN_PROGRESS':
      return { outcome: { kind: settled.kind }, presence: null, errorShape: null };
    case 'RESOLVED':
      return { outcome: normalizeSuccess(settled.payload), presence: presenceOf(settled.payload), errorShape: null };
    case 'REJECTED':
      return { outcome: normalizeError(settled.payload), presence: null, errorShape: describeErrorShape(settled.payload) };
  }
}
