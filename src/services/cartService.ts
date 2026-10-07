import { ApiClient } from './apiClient';

export interface CartItemResponse {
  id: string;
  cartId: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  product: {
    id: string;
    name: string;
    basePrice: number;
    image: string | null;
    isTepache: boolean;
    isFMCG: boolean;
  };
  variant: {
    id: string;
    name: string;
    price: number;
    sku: string;
  } | null;
  lineSubtotal: number;
  lineTax: number;
  containerDeposit: number;
  lineTotal: number;
}

export interface CartSummaryResponse {
  cartId: string;
  items: CartItemResponse[];
  itemsSubtotal: number;
  totalTax: number;
  containerDepositTotal: number;
  packagingFee: number;
  deliveryFee: number;
  discountAmount: number;
  netAmount: number;
}

export class CartService {
  public static async getCart(): Promise<CartSummaryResponse> {
    const response = await ApiClient.request('/cart');
    return response.data;
  }

  public static async addItem(productId: string, variantId?: string | null, quantity: number = 1): Promise<CartSummaryResponse> {
    const response = await ApiClient.request('/cart/items', {
      method: 'POST',
      body: JSON.stringify({ productId, variantId: variantId || undefined, quantity })
    });
    return response.data;
  }

  public static async updateItemQuantity(itemId: string, quantity: number): Promise<CartSummaryResponse> {
    const response = await ApiClient.request(`/cart/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity })
    });
    return response.data;
  }

  public static async removeItem(itemId: string): Promise<CartSummaryResponse> {
    const response = await ApiClient.request(`/cart/items/${itemId}`, {
      method: 'DELETE'
    });
    return response.data;
  }

  public static async clearCart(): Promise<{ success: boolean; message: string }> {
    const response = await ApiClient.request('/cart', {
      method: 'DELETE'
    });
    return response.data;
  }
}
