/**
 * Pure, side-effect-free production configuration checks (no dotenv, no process.env reads) so they can be unit-tested without a database.
 * Every function throws an Error with a message that names the variable and says what to do. They are only enforced when NODE_ENV=production.
 */

/** Development / test / end-to-end / placeholder markers. Such values sit in the repository or in documentation and must never run in production. */
export const PLACEHOLDER_MARKERS = /e2e-isolated|valid-only-for-this-local-run|h1-test-|test[_-](access|refresh)[_-]secret|dev(elopment)?[_-](access|refresh)|changeme|change[_-]me|your[_-]|placeholder|replace[_-]me|super_secret|0123456789|1234567890|xxxx|<[^>]*>/i;

export function looksLikePlaceholder(value: string): boolean {
  return PLACEHOLDER_MARKERS.test(value);
}

const LOCAL_HOST = /^(localhost|.*\.localhost|.*\.local|.*\.test|.*\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|\[?::1\]?|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/i;

/** A production browser-facing origin/URL must be https and must not point at the local machine or a private network. */
export function assertPublicHttpsUrl(name: string, value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL (got "${value}")`);
  }
  if (url.protocol !== 'https:') throw new Error(`In production ${name} must use https:// (got "${value}")`);
  if (LOCAL_HOST.test(url.hostname)) throw new Error(`In production ${name} must be the public web address, not a local or private host (got "${value}")`);
}

/**
 * TRUST_PROXY (Express "trust proxy"): a hop count, false, a comma list of loopback|linklocal|uniquelocal keywords, IPs or CIDRs.
 * "true" trusts every X-Forwarded-For hop, so a client could pick its own IP and defeat every rate limit: refused in production.
 * Unset stays allowed (no proxy trusted), as before.
 */
export function assertTrustProxy(raw: string | undefined, production: boolean): void {
  const value = raw?.trim();
  if (!value) return;
  const lower = value.toLowerCase();
  if (lower === 'true') {
    if (production) throw new Error('TRUST_PROXY=true trusts every forwarded address and lets clients spoof their IP; use a hop count (e.g. 1), "loopback" or the proxy address/CIDR');
    return;
  }
  if (lower === 'false') return;
  if (/^\d+$/.test(value)) {
    if (Number(value) > 10) throw new Error(`TRUST_PROXY hop count looks wrong (got ${value}); expected the number of reverse proxies in front of the API`);
    return;
  }
  const entries = value.split(',').map((e) => e.trim());
  const ok = entries.every((e) => /^(loopback|linklocal|uniquelocal)$/i.test(e) || /^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(e) || (e.includes(':') && /^[0-9a-f:.]+(\/\d{1,3})?$/i.test(e)));
  if (!ok) throw new Error(`TRUST_PROXY is not a valid value (got "${value}"); use a hop count, loopback/linklocal/uniquelocal, or IP/CIDR entries`);
}

export interface ProductionOriginInput {
  allowedOrigins: string[];
  webBaseUrl?: string;
  staffInviteBaseUrl?: string;
  emailProvider: 'none' | 'log' | 'resend';
  inviteDelivery: 'manual' | 'email';
}

/** Production: WEB_BASE_URL and STAFF_INVITE_BASE_URL must be public https; emailed links need an explicit WEB_BASE_URL. */
export function assertProductionOrigins(input: ProductionOriginInput): void {
  if (input.allowedOrigins.length === 0) throw new Error('CORS_ALLOWED_ORIGINS must list at least one origin in production');
  // CORS origins keep their existing rules (explicit list, no wildcard, parsed in parseAllowedOrigins); they are deliberately not forced to https here.
  if (input.webBaseUrl) assertPublicHttpsUrl('WEB_BASE_URL', input.webBaseUrl);
  if (input.staffInviteBaseUrl) assertPublicHttpsUrl('STAFF_INVITE_BASE_URL', input.staffInviteBaseUrl);
  if (input.emailProvider === 'resend' && !input.webBaseUrl) {
    throw new Error('WEB_BASE_URL must be set explicitly in production when EMAIL_PROVIDER=resend (password-reset links are built from it)');
  }
  if (input.inviteDelivery === 'email' && !input.webBaseUrl && !input.staffInviteBaseUrl) {
    throw new Error('STAFF_INVITE_BASE_URL (or WEB_BASE_URL) must be set explicitly in production when INVITE_DELIVERY=email');
  }
}

/** Production email: Resend needs a real-looking key and a sender address; placeholders are refused. */
export function assertProductionEmail(input: { emailProvider: 'none' | 'log' | 'resend'; apiKey?: string; from?: string }): void {
  if (input.emailProvider !== 'resend') return;
  if (input.apiKey && looksLikePlaceholder(input.apiKey)) throw new Error('RESEND_API_KEY looks like a placeholder; set the real Resend API key');
  if (!input.from || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$|^[^<>]+<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>$/.test(input.from.trim())) {
    throw new Error('EMAIL_FROM must be an email address (or "Name <address>") in production when EMAIL_PROVIDER=resend');
  }
}

export interface RazorpayProductionInput {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  previousWebhookSecret: string | null;
}

/** Production Razorpay credentials: no placeholders, a webhook secret that is long enough and distinct from the API key secret. */
export function assertProductionRazorpay(input: RazorpayProductionInput): void {
  for (const [name, v] of [['RAZORPAY_KEY_ID', input.keyId], ['RAZORPAY_KEY_SECRET', input.keySecret], ['RAZORPAY_WEBHOOK_SECRET', input.webhookSecret], ['RAZORPAY_WEBHOOK_SECRET_PREVIOUS', input.previousWebhookSecret]] as const) {
    if (v && looksLikePlaceholder(v)) throw new Error(`${name} looks like a placeholder or development value; set the real credential`);
  }
  if (!/^rzp_(live|test)_[A-Za-z0-9]+$/.test(input.keyId)) throw new Error('RAZORPAY_KEY_ID must look like rzp_live_xxxxxxxx');
  if (input.webhookSecret.length < 16) throw new Error('RAZORPAY_WEBHOOK_SECRET must be at least 16 characters in production');
  if (input.webhookSecret === input.keySecret) throw new Error('RAZORPAY_WEBHOOK_SECRET must differ from RAZORPAY_KEY_SECRET');
  if (input.previousWebhookSecret && input.previousWebhookSecret === input.webhookSecret) {
    throw new Error('RAZORPAY_WEBHOOK_SECRET_PREVIOUS must differ from RAZORPAY_WEBHOOK_SECRET (remove it once the rotation is finished)');
  }
}
