import { z } from 'zod';

// Quantity is validated by the pricing policy (PricingService.validateQuantities) so every rejection carries a stable
// business code (INVALID_QUANTITY / MAX_LINE_QUANTITY_EXCEEDED / MAX_CART_QUANTITY_EXCEEDED) - never silently coerced.
export const addCartItemSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  variantId: z.string().optional().nullable(),
  quantity: z.unknown().optional(),
});

export const updateCartItemSchema = z.object({
  quantity: z.unknown(),
});
