import { z } from 'zod';
import { RoleEnum } from '@prisma/client';

export const registerSchema = z.object({
  email: z.string().email('Invalid email address format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  phone: z.string().optional(),
  referredByCode: z.string().optional(),
  // Public registration allows ONLY CUSTOMER or MESS_CUSTOMER
  requestedRole: z.enum([RoleEnum.CUSTOMER, RoleEnum.MESS_CUSTOMER]).default(RoleEnum.CUSTOMER)
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address format'),
  password: z.string().min(1, 'Password is required')
});

export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
