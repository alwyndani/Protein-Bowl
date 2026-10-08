import { ApiClient } from './apiClient';
import type { ServerCart } from './commerceTypes';

export type { ServerCart, ServerCartItem } from './commerceTypes';

/** Client for the SERVER cart (the single authoritative authenticated cart). All methods throw ApiRequestError on failure. */
export class CartService {
  public static async getCart(): Promise<ServerCart> {
    return await ApiClient.requestData<ServerCart>('/cart');
  }

  public static async addItem(productId: string, variantId?: string | null, quantity: number = 1): Promise<ServerCart> {
    return await ApiClient.requestData<ServerCart>('/cart/items', {
      method: 'POST',
      body: JSON.stringify({ productId, variantId: variantId || undefined, quantity })
    });
  }

  public static async updateItemQuantity(itemId: string, quantity: number): Promise<ServerCart> {
    return await ApiClient.requestData<ServerCart>(`/cart/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity })
    });
  }

  public static async removeItem(itemId: string): Promise<ServerCart> {
    return await ApiClient.requestData<ServerCart>(`/cart/items/${itemId}`, {
      method: 'DELETE'
    });
  }

  public static async clearCart(): Promise<void> {
    await ApiClient.requestData<unknown>('/cart', { method: 'DELETE' });
  }
}
