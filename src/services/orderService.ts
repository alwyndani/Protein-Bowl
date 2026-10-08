import { ApiClient } from './apiClient';
import type { ApiOrder, CheckoutPreview } from './commerceTypes';

export interface CheckoutPreviewPayload {
  addressId?: string;
  deliveryInstructions?: string;
}

export interface CreateOrderPayload {
  addressId: string;
  /** Optional: payment methods are a pending product decision; omit to use the server default. */
  paymentMethod?: string;
  deliveryInstructions?: string;
  /** Required by the server; the same key MUST be reused when retrying the same order submission. */
  idempotencyKey: string;
}

/** All methods throw ApiRequestError on failure, so a failed call can never be mistaken for a created order. */
export class OrderService {
  public static async checkoutPreview(payload: CheckoutPreviewPayload = {}): Promise<CheckoutPreview> {
    return await ApiClient.requestData<CheckoutPreview>('/checkout/preview', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  public static async createOrder(payload: CreateOrderPayload): Promise<ApiOrder> {
    const { idempotencyKey, ...body } = payload;
    return await ApiClient.requestData<ApiOrder>('/orders', {
      method: 'POST',
      headers: { 'x-idempotency-key': idempotencyKey },
      body: JSON.stringify(body)
    });
  }

  public static async getMyOrders(): Promise<ApiOrder[]> {
    return (await ApiClient.requestData<ApiOrder[]>('/orders/my-orders')) || [];
  }

  /** Accepts either the order id or the human-readable order number. */
  public static async getOrder(orderIdOrNumber: string): Promise<ApiOrder> {
    return await ApiClient.requestData<ApiOrder>(`/orders/${encodeURIComponent(orderIdOrNumber)}`);
  }
}
