import type { ApiClient } from '../api/apiClient';
import type { CheckoutSession, PaymentAttemptStatus, PaymentEvidence, VerifyOutcome } from './paymentTypes';

/**
 * The ONLY module that talks to the backend payment-attempt endpoints, over the one typed ApiClient (Bearer + single-flight refresh +
 * timeout / network classification come from there). Rules:
 *  - financial POSTs are NEVER retried here (ApiClient's single post-refresh 401 retry is its own, existing behaviour);
 *  - create sends NO body: amount, currency, provider order and payment method are decided by the server from the persisted order;
 *  - verify sends ONLY the three fields the provider checkout returned; it never sends an amount, currency or status.
 * A failure is an ApiError; nothing here concludes whether money moved.
 */
export class PaymentApi {
  constructor(private readonly client: ApiClient) {}

  /** Creates, reuses or renews the payment session for the caller's own order (server decides; provider state is checked). */
  createAttempt = (orderId: string): Promise<CheckoutSession> =>
    this.client.request(`/orders/${encodeURIComponent(orderId)}/payment-attempts`, { method: 'POST' });

  getAttempt = (orderId: string, attemptId: string): Promise<PaymentAttemptStatus> =>
    this.client.request(`/orders/${encodeURIComponent(orderId)}/payment-attempts/${encodeURIComponent(attemptId)}`);

  verifyPayment = (orderId: string, attemptId: string, evidence: PaymentEvidence): Promise<VerifyOutcome> =>
    this.client.request(`/orders/${encodeURIComponent(orderId)}/payment-attempts/${encodeURIComponent(attemptId)}/verify`, {
      method: 'POST',
      body: { providerOrderId: evidence.providerOrderId, providerPaymentId: evidence.providerPaymentId, signature: evidence.signature }
    });
}
