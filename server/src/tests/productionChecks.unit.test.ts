import { describe, it, expect } from 'vitest';
import {
  assertProductionEmail, assertProductionOrigins, assertProductionRazorpay, assertPublicHttpsUrl, assertTrustProxy, looksLikePlaceholder
} from '../config/productionChecks.js';
import { parsePaymentConfig } from '../config/paymentConfig.js';
import { parseCommercePolicy, COMMERCE_ENV_KEYS, DEVELOPMENT_EXAMPLE_VALUES } from '../config/commercePolicy.js';

const GOOD_RZP = { keyId: 'rzp_live_AbC123xyz', keySecret: 'k9Qm2vXz7LpR4tYw8NbC5dFh', webhookSecret: 'Zt4Hn8Vb1KxQ6mWe3RyP9cLd', previousWebhookSecret: null };

describe('production checks (DB-free)', () => {
  it('placeholder detection', () => {
    for (const v of ['changeme', 'your-key-here', '<RAZORPAY_SECRET>', 'xxxxxxxxxxxx', 'replace-me-please']) expect(looksLikePlaceholder(v), v).toBe(true);
    expect(looksLikePlaceholder('k9Qm2vXz7LpR4tYw8NbC5dFh3JsGa6Ue')).toBe(false);
  });

  it('WEB/INVITE URLs must be public https', () => {
    expect(() => assertPublicHttpsUrl('WEB_BASE_URL', 'https://app.proteinbowl.in')).not.toThrow();
    expect(() => assertPublicHttpsUrl('WEB_BASE_URL', 'http://app.proteinbowl.in')).toThrow(/https/);
    for (const h of ['https://localhost:3000', 'https://127.0.0.1', 'https://192.168.1.4', 'https://x.local']) expect(() => assertPublicHttpsUrl('WEB_BASE_URL', h), h).toThrow(/local or private/);
    expect(() => assertPublicHttpsUrl('WEB_BASE_URL', 'not a url')).toThrow(/valid URL/);
  });

  it('origins: resend needs an explicit WEB_BASE_URL; email invitations need an explicit base', () => {
    const ok = { allowedOrigins: ['https://app.example.com'], emailProvider: 'none' as const, inviteDelivery: 'manual' as const };
    expect(() => assertProductionOrigins(ok)).not.toThrow();
    expect(() => assertProductionOrigins({ ...ok, emailProvider: 'resend' })).toThrow(/WEB_BASE_URL must be set explicitly/);
    expect(() => assertProductionOrigins({ ...ok, emailProvider: 'resend', webBaseUrl: 'https://app.example.com' })).not.toThrow();
    expect(() => assertProductionOrigins({ ...ok, inviteDelivery: 'email' })).toThrow(/STAFF_INVITE_BASE_URL/);
    expect(() => assertProductionOrigins({ ...ok, staffInviteBaseUrl: 'http://app.example.com' })).toThrow(/https/);
    expect(() => assertProductionOrigins({ ...ok, allowedOrigins: [] })).toThrow(/at least one origin/);
  });

  it('resend: real-looking sender and key', () => {
    expect(() => assertProductionEmail({ emailProvider: 'none' })).not.toThrow();
    expect(() => assertProductionEmail({ emailProvider: 'resend', apiKey: 're_abcdefghijk123', from: 'Protein Bowl <no-reply@example.com>' })).not.toThrow();
    expect(() => assertProductionEmail({ emailProvider: 'resend', apiKey: 'your-resend-key', from: 'a@b.co' })).toThrow(/placeholder/);
    expect(() => assertProductionEmail({ emailProvider: 'resend', apiKey: 're_abcdefghijk123', from: 'not-an-address' })).toThrow(/EMAIL_FROM/);
  });

  it('TRUST_PROXY: unset ok; hop count, loopback, CIDR ok; true refused in production; garbage refused', () => {
    for (const v of [undefined, '', '1', 'loopback', 'loopback, 10.0.0.0/8', 'false', '::1']) expect(() => assertTrustProxy(v, true), String(v)).not.toThrow();
    expect(() => assertTrustProxy('true', true)).toThrow(/spoof/);
    expect(() => assertTrustProxy('true', false)).not.toThrow();
    for (const v of ['yes', '99', '-1', 'anyone', '999.1']) expect(() => assertTrustProxy(v, false), v).toThrow(/TRUST_PROXY/);
  });

  it('Razorpay credentials in production', () => {
    expect(() => assertProductionRazorpay(GOOD_RZP)).not.toThrow();
    expect(() => assertProductionRazorpay({ ...GOOD_RZP, keySecret: 'changeme-secret-value' })).toThrow(/RAZORPAY_KEY_SECRET.*placeholder/);
    expect(() => assertProductionRazorpay({ ...GOOD_RZP, webhookSecret: 'short' })).toThrow(/at least 16/);
    expect(() => assertProductionRazorpay({ ...GOOD_RZP, webhookSecret: GOOD_RZP.keySecret })).toThrow(/differ/);
    expect(() => assertProductionRazorpay({ ...GOOD_RZP, keyId: 'bogus' })).toThrow(/RAZORPAY_KEY_ID/);
    expect(() => assertProductionRazorpay({ ...GOOD_RZP, previousWebhookSecret: GOOD_RZP.webhookSecret })).toThrow(/PREVIOUS/);
  });

  it('parsePaymentConfig applies them only in production and keeps the existing fail-closed rules', () => {
    const raw = { PAYMENT_PROVIDER: 'razorpay', RAZORPAY_KEY_ID: 'rzp_live_AbC123xyz', RAZORPAY_KEY_SECRET: GOOD_RZP.keySecret, RAZORPAY_WEBHOOK_SECRET: 'tiny', PAYMENT_REFUND_INLINE_SUBMIT: 'true' };
    expect(() => parsePaymentConfig(raw, 'production')).toThrow(/Invalid payment configuration.*at least 16/);
    expect(parsePaymentConfig(raw, 'test').razorpay?.webhookSecret).toBe('tiny');
    expect(() => parsePaymentConfig({ ...raw, RAZORPAY_WEBHOOK_SECRET: '' }, 'production')).toThrow(/RAZORPAY_WEBHOOK_SECRET must be set/);
    expect(() => parsePaymentConfig({ PAYMENT_PROVIDER: 'mock' }, 'production')).toThrow(/refused in production/);
  });

  it('COMMERCE_*: production requires every value explicitly and refuses COD', () => {
    const full = { ...DEVELOPMENT_EXAMPLE_VALUES };
    expect(() => parseCommercePolicy(full, 'production')).not.toThrow();
    for (const k of COMMERCE_ENV_KEYS) expect(() => parseCommercePolicy({ ...full, [k]: undefined }, 'production'), k).toThrow(new RegExp(`${k}|FREE_DELIVERY_THRESHOLD`));
    expect(() => parseCommercePolicy({ ...full, COMMERCE_COD_ENABLED: 'true' }, 'production')).toThrow(/online payment only/);
  });
});
