import { z } from 'zod';

export const checkoutPreviewSchema = z.object({
  addressId: z.string().optional(),
  deliveryInstructions: z.string().max(500).optional(),
});

export const createOrderSchema = z.object({
  addressId: z.string().min(1, 'Delivery address is required'),
  // Validated against the supported-method allow-list (and the COD policy) by OrderService so the error codes are stable.
  paymentMethod: z.unknown().optional(),
  deliveryInstructions: z.string().max(500).optional(),
  // Legacy location of the idempotency key; the x-idempotency-key header is preferred. Validated by resolveIdempotencyKey.
  idempotencyKey: z.unknown().optional(),
});

export type CheckoutPreviewDto = z.infer<typeof checkoutPreviewSchema>;
export type CreateOrderDto = z.infer<typeof createOrderSchema>;
