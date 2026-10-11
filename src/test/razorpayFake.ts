import type { RazorpayFailureResponse, RazorpayOptions, RazorpaySuccessResponse } from '../utils/razorpayLoader';

/** Test double for window.Razorpay (Checkout). It records the options it was given and lets a test fire the provider callbacks. */
export class FakeRazorpay {
  static instances: FakeRazorpay[] = [];
  readonly options: RazorpayOptions;
  opened = 0;
  private listeners: Record<string, (r: RazorpayFailureResponse) => void> = {};

  constructor(options: RazorpayOptions) {
    this.options = options;
    FakeRazorpay.instances.push(this);
  }

  open(): void {
    this.opened++;
  }

  on(event: 'payment.failed', handler: (r: RazorpayFailureResponse) => void): void {
    this.listeners[event] = handler;
  }

  // ---- test controls (these are the provider's callbacks)
  succeed(payload: Partial<RazorpaySuccessResponse> = {}): void {
    this.options.handler({ razorpay_payment_id: 'pay_test_1', razorpay_order_id: this.options.order_id, razorpay_signature: 'sig_test_secret_value', ...payload });
  }

  dismiss(): void {
    this.options.modal?.ondismiss?.();
  }

  failPayment(): void {
    this.listeners['payment.failed']?.({ error: { code: 'BAD_REQUEST_ERROR', description: 'PROVIDER-SECRET-DESCRIPTION', reason: 'payment_failed', metadata: { order_id: this.options.order_id, payment_id: 'pay_failed_1' } } });
  }
}

export function installFakeRazorpay(): void {
  FakeRazorpay.instances = [];
  window.Razorpay = FakeRazorpay as unknown as typeof window.Razorpay;
}

export function uninstallFakeRazorpay(): void {
  FakeRazorpay.instances = [];
  delete window.Razorpay;
}

export const SESSION = {
  attemptId: 'attempt-1',
  provider: 'razorpay',
  keyId: 'rzp_test_publickey',
  providerOrderId: 'order_PB_1',
  amountMinor: 25121,
  currency: 'INR',
  orderNumber: 'PB-123456-789',
  expiresAt: '2026-10-11T12:00:00.000Z',
  status: 'PENDING'
};
