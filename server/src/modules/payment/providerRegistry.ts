import { getPaymentConfig } from '../../config/paymentConfig.js';
import type { PaymentProvider } from './provider.types.js';
import { RazorpayPaymentProvider } from './razorpay.provider.js';
import { MockPaymentProvider } from './mock.provider.js';

let override: PaymentProvider | null = null;
let cached: { key: string; provider: PaymentProvider } | null = null;

/** The configured payment provider. `mock` can only be selected outside production (config validation + constructor guard). */
export function getPaymentProvider(): PaymentProvider {
  if (override) return override;
  const config = getPaymentConfig();
  const key = `${config.provider}:${config.razorpay?.keyId ?? ''}`;
  if (cached && cached.key === key) return cached.provider;
  const provider: PaymentProvider =
    config.provider === 'razorpay' && config.razorpay ? new RazorpayPaymentProvider(config.razorpay, config.providerTimeoutMs) : new MockPaymentProvider();
  cached = { key, provider };
  return provider;
}

/** Test seam (refused in production). */
export function setPaymentProviderForTests(provider: PaymentProvider | null): void {
  if (process.env.NODE_ENV === 'production') throw new Error('The payment provider cannot be replaced in production');
  override = provider;
}

export function resetPaymentProviderCache(): void {
  cached = null;
  override = null;
}
