import { ApiClient } from './apiClient';
import type { CustomerProof, IssuedDeliveryCode } from './deliveryTypes';

/**
 * Customer Delivery Code API (P9B). The plaintext code is returned ONLY by issue / regenerate and is never retrievable again: callers
 * must keep it in component memory only (never storage, logs or analytics). All bodies are empty: nothing client-chosen reaches the server.
 */
export class DeliveryCodeService {
  public static async getState(orderId: string): Promise<CustomerProof> {
    return await ApiClient.requestData<CustomerProof>(`/orders/${encodeURIComponent(orderId)}/delivery-code`);
  }

  public static async issue(orderId: string): Promise<IssuedDeliveryCode> {
    return await ApiClient.requestData<IssuedDeliveryCode>(`/orders/${encodeURIComponent(orderId)}/delivery-code`, { method: 'POST', body: JSON.stringify({}) });
  }

  public static async regenerate(orderId: string): Promise<IssuedDeliveryCode> {
    return await ApiClient.requestData<IssuedDeliveryCode>(`/orders/${encodeURIComponent(orderId)}/delivery-code/regenerate`, { method: 'POST', body: JSON.stringify({}) });
  }
}
