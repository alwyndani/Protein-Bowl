import { ApiClient } from './apiClient';
import type { CheckoutEvidence, CheckoutSession, VerifyPaymentResult } from './commerceTypes';

/**
 * Payment API (P7B backend). All methods throw ApiRequestError on any failure, so a failed call can never be mistaken for success.
 * The client NEVER sends an amount, a currency, a customer id or a status: only the order id in the path and, for verification, the
 * three values the provider checkout returned. There is deliberately NO retry wrapper here: financial POSTs are never retried
 * automatically (session creation and verification are idempotent on the server, but the decision to repeat one is the user's).
 */
export class PaymentService {
  /** Create the payment session for the caller's own order, or re-use the live one. The request body is intentionally empty. */
  public static async createSession(orderId: string): Promise<CheckoutSession> {
    return await ApiClient.requestData<CheckoutSession>(`/orders/${encodeURIComponent(orderId)}/payment-attempts`, { method: 'POST', body: JSON.stringify({}) });
  }

  /** Send the provider checkout evidence to the server. The server verifies the signature AND the provider's own record. */
  public static async verify(orderId: string, attemptId: string, evidence: CheckoutEvidence): Promise<VerifyPaymentResult> {
    return await ApiClient.requestData<VerifyPaymentResult>(`/orders/${encodeURIComponent(orderId)}/payment-attempts/${encodeURIComponent(attemptId)}/verify`, {
      method: 'POST',
      body: JSON.stringify({ providerOrderId: evidence.providerOrderId, providerPaymentId: evidence.providerPaymentId, signature: evidence.signature })
    });
  }
}
