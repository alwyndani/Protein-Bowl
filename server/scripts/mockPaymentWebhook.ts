/**
 * DEVELOPMENT ONLY. Sends a correctly mock-SIGNED webhook through the REAL webhook route of a running dev server that uses
 * PAYMENT_PROVIDER=mock. It is not an API on the server (there is no simulate/mark-paid endpoint): it is a client that signs
 * with the public mock secret, exactly as the provider would sign with the real one. It cannot work against production:
 * the mock provider does not exist there and the signature would not verify.
 *
 *   npm run payments:mock-webhook -- --provider-order <order_mock_...> --amount-minor 29145 [--status captured|authorized|failed]
 *        [--payment-id pay_mock_x] [--currency INR] [--event payment.captured] [--event-id evt_x] [--url http://localhost:5000]
 *        [--bad-signature]
 */
import { MockPaymentProvider } from '../src/modules/payment/mock.provider.js';
import type { ProviderPaymentStatus } from '../src/modules/payment/paymentStatus.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run in production');
  const providerOrderId = arg('provider-order');
  const amountMinor = Number(arg('amount-minor'));
  if (!providerOrderId || !Number.isInteger(amountMinor)) throw new Error('--provider-order and --amount-minor are required');
  const status = (arg('status') ?? 'captured').toUpperCase() as ProviderPaymentStatus;
  const mock = new MockPaymentProvider();
  const payment = {
    providerPaymentId: arg('payment-id') ?? `pay_mock_${Date.now().toString(36)}`,
    providerOrderId,
    amountMinor,
    currency: arg('currency') ?? 'INR',
    status,
    method: 'upi',
    errorCode: null,
    errorReason: null
  };
  const eventType = arg('event') ?? (status === 'CAPTURED' ? 'payment.captured' : status === 'FAILED' ? 'payment.failed' : 'payment.authorized');
  const { raw, headers } = mock.buildWebhook(eventType, payment, { eventId: arg('event-id') });
  if (process.argv.includes('--bad-signature')) headers['x-razorpay-signature'] = '0'.repeat(64);
  const base = (arg('url') ?? 'http://localhost:5000').replace(/\/$/, '');
  const res = await fetch(`${base}/api/v1/payments/webhook`, { method: 'POST', headers, body: raw });
  console.log(JSON.stringify({ status: res.status, providerPaymentId: payment.providerPaymentId, eventType }));
  return res.ok ? 0 : 1;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error((e as Error).message);
    process.exit(1);
  });
