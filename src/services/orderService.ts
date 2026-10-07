import { ApiClient } from './apiClient';

export interface CheckoutPreviewPayload {
  addressId?: string;
  deliveryInstructions?: string;
}

export interface CreateOrderPayload {
  addressId: string;
  paymentMethod?: string;
  deliveryInstructions?: string;
  idempotencyKey?: string;
}

export class OrderService {
  public static async checkoutPreview(payload: CheckoutPreviewPayload = {}) {
    const response = await ApiClient.request('/checkout/preview', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    return response.data;
  }

  public static async createOrder(payload: CreateOrderPayload) {
    const headers: Record<string, string> = {};
    if (payload.idempotencyKey) {
      headers['x-idempotency-key'] = payload.idempotencyKey;
    }

    const response = await ApiClient.request('/orders', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    return response.data;
  }

  public static async getMyOrders() {
    const response = await ApiClient.request('/orders/my-orders');
    return response.data || [];
  }

  public static async getOrderById(orderId: string) {
    const response = await ApiClient.request(`/orders/${orderId}`);
    return response.data;
  }

  public static async trackOrder(orderNumber: string) {
    const response = await ApiClient.request(`/orders/${orderNumber}`);
    return response.data;
  }
}
