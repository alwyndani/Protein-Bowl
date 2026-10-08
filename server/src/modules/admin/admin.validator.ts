import { z } from 'zod';
import { RoleEnum, UserStatus } from '@prisma/client';
import { staffPasswordSchema } from '../../utils/staffPassword.js';

/** Common building blocks. Every admin body is `.strict()`: unknown fields are rejected, not silently ignored. */
const uuid = z.string().uuid('Invalid id');
const trimmed = (min: number, max: number, label: string) =>
  z.string({ required_error: `${label} is required` }).trim().min(min, `${label} is too short`).max(max, `${label} is too long`);
const phone = z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Invalid phone number');
const employeeCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{2,30}$/, 'Employee code must be 3-31 characters: A-Z, 0-9, hyphen');
const reason = trimmed(3, 500, 'Reason');
const roleEnum = z.nativeEnum(RoleEnum);

// ---- pagination
const pageQuery = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
};

// ---- params
export const idParamSchema = z.object({ id: uuid });
export const staffRoleParamSchema = z.object({ id: uuid, role: roleEnum });
export const staffBranchParamSchema = z.object({ id: uuid, branchId: uuid });

// ---- step-up
export const stepUpBodySchema = z.object({ password: z.string().min(1).max(256) }).strict();

// ---- staff
export const listStaffQuerySchema = z
  .object({
    ...pageQuery,
    q: z.string().trim().min(1).max(100).optional(),
    status: z.nativeEnum(UserStatus).optional(),
    role: roleEnum.optional(),
    branchId: uuid.optional()
  })
  .strict();

export const createStaffBodySchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Invalid email address').max(254),
    fullName: trimmed(2, 100, 'Full name'),
    phone: phone.optional(),
    designation: trimmed(2, 100, 'Designation'),
    employeeCode: employeeCode.optional(),
    shiftTiming: trimmed(1, 100, 'Shift timing').optional(),
    roles: z.array(roleEnum).min(1, 'At least one role is required').max(5, 'Too many roles'),
    branchIds: z.array(uuid).max(20, 'Too many branches').default([])
  })
  .strict();

export const updateStaffBodySchema = z
  .object({
    fullName: trimmed(2, 100, 'Full name').optional(),
    phone: phone.nullable().optional(),
    designation: trimmed(2, 100, 'Designation').optional(),
    shiftTiming: trimmed(1, 100, 'Shift timing').nullable().optional()
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

export const assignRoleBodySchema = z.object({ role: roleEnum }).strict();
export const assignBranchBodySchema = z.object({ branchId: uuid }).strict();

export const deactivateBodySchema = z
  .object({ reason, status: z.enum(['DEACTIVATED', 'SUSPENDED']).default('DEACTIVATED') })
  .strict();
export const activateBodySchema = z.object({ reason }).strict();

// ---- invitation acceptance (public)
export const acceptInviteBodySchema = z
  .object({
    token: z.string().min(32).max(256).regex(/^[A-Za-z0-9_-]+$/, 'Invalid token'),
    password: staffPasswordSchema
  })
  .strict();

// ---- branches
const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

export const listBranchesQuerySchema = z
  .object({
    ...pageQuery,
    isActive: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    q: z.string().trim().min(1).max(100).optional()
  })
  .strict();

export const createBranchBodySchema = z
  .object({
    code: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,30}$/, 'Branch code: 2-31 chars, a-z, 0-9, hyphen'),
    name: trimmed(2, 100, 'Name'),
    address: trimmed(3, 200, 'Address'),
    city: trimmed(2, 80, 'City'),
    latitude: latitude.optional(),
    longitude: longitude.optional()
  })
  .strict();

export const updateBranchBodySchema = z
  .object({
    name: trimmed(2, 100, 'Name').optional(),
    address: trimmed(3, 200, 'Address').optional(),
    city: trimmed(2, 80, 'City').optional(),
    latitude: latitude.nullable().optional(),
    longitude: longitude.nullable().optional(),
    isActive: z.boolean().optional()
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

// ---- audit
export const auditQuerySchema = z
  .object({
    ...pageQuery,
    actorUserId: uuid.optional(),
    action: z.string().trim().regex(/^[A-Z0-9_]{2,64}$/, 'Invalid action').optional(),
    entity: z.string().trim().regex(/^[A-Za-z0-9_]{1,64}$/, 'Invalid entity').optional(),
    entityId: z.string().trim().min(1).max(100).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional()
  })
  .strict()
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: '"from" must not be after "to"' });
