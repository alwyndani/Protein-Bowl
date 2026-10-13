import { z } from 'zod';
import { RoleEnum } from '@prisma/client';

export const registerSchema = z.object({
  email: z.string().email('Invalid email address format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  phone: z.string().optional(),
  referredByCode: z.string().optional(),
  // Public registration allows ONLY CUSTOMER. MESS_CUSTOMER is legacy (P10A): Kerala Mess is a CUSTOMER entitlement (an approved MessAccount).
  requestedRole: z.enum([RoleEnum.CUSTOMER]).default(RoleEnum.CUSTOMER)
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address format'),
  password: z.string().min(1, 'Password is required')
});

export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;

/** P11A mobile auth bodies: strict, the refresh token travels ONLY in the JSON body (never query, URL or cookie). */
export const mobileRegisterSchema = registerSchema.strict();
export const mobileLoginSchema = loginSchema.strict();
export const mobileRefreshSchema = z.object({ refreshToken: z.string().min(1).max(256) }).strict();
