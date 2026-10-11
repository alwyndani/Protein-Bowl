import { ApiClient } from './apiClient';
import type { ApiOrder, CancelOrderResult, CheckoutPreview, CustomerCancelReasonCode, OrderRefundsView } from './commerceTypes';

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

  /**
   * Cancel the caller's own order (P7C). The body is ONLY the typed reason code and an optional note: never an amount, currency,
   * payment id or customer id. Not retried automatically; the server is idempotent (a repeat returns the same state).
   */
  public static async cancelOrder(orderId: string, reasonCode: CustomerCancelReasonCode, note?: string): Promise<CancelOrderResult> {
    const trimmed = note?.trim();
    return await ApiClient.requestData<CancelOrderResult>('/orders/' + encodeURIComponent(orderId) + '/cancel', {
      method: 'POST',
      body: JSON.stringify(trimmed ? { reasonCode, note: trimmed } : { reasonCode })
    });
  }

  /** Safe refund states for the caller's own order (needs the order id, not the order number). */
  public static async getOrderRefunds(orderId: string): Promise<OrderRefundsView> {
    return await ApiClient.requestData<OrderRefundsView>('/orders/' + encodeURIComponent(orderId) + '/refunds');
  }
}
