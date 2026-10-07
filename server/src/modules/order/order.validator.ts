import { z } from 'zod';

export const checkoutPreviewSchema = z.object({
  addressId: z.string().optional(),
  deliveryInstructions: z.string().optional(),
});

export const createOrderSchema = z.object({
  addressId: z.string().min(1, 'Delivery address is required'),
  paymentMethod: z.string().optional().default('ONLINE'),
  deliveryInstructions: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

export type CheckoutPreviewDto = z.infer<typeof checkoutPreviewSchema>;
export type CreateOrderDto = z.infer<typeof createOrderSchema>;
