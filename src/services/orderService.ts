import { ApiClient } from './apiClient';

export interface CreateOrderPayload {
  items: Array<{ productId?: string; variantId?: string; title: string; price: number; quantity: number }>;
  deliveryAddress: string;
  paymentMethod: string;
  isGuest?: boolean;
  guestEmail?: string;
  guestPhone?: string;
  branchId?: string;
}

export class OrderService {
  public static async createOrder(payload: CreateOrderPayload) {
    return await ApiClient.request('/orders', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  public static async getMyOrders() {
    const response = await ApiClient.request('/orders/my-orders');
    return response.data || [];
  }

  public static async trackOrder(orderNumber: string) {
    const response = await ApiClient.request(`/orders/track/${orderNumber}`);
    return response.data;
  }

  public static async updateOrderStatus(orderId: string, status: string) {
    return await ApiClient.request(`/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  }
}
