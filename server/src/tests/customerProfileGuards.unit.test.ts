import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';

/**
 * Database-free regression tests for:
 *  - staff accounts are refused (403) by the customer profile / address endpoints, and the routes really carry that guard;
 *  - a unique-constraint race on the phone number is a 409 PHONE_IN_USE (never a 500) at registration and at profile update.
 */
const db = vi.hoisted(() => {
  const prisma: Record<string, any> = {
    user: { findUnique: vi.fn(), create: vi.fn() },
    customerProfile: { findUnique: vi.fn() },
    healthBiometrics: { findUnique: vi.fn() },
    refreshToken: { create: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn()
  };
  return { prisma };
});
vi.mock('../config/database.js', () => ({ prisma: db.prisma }));

import { requireCustomerRole } from '../middleware/auth.middleware.js';
import customerRouter from '../modules/customer/customer.routes.js';
import { AuthService } from '../modules/auth/auth.service.js';
import { CustomerService } from '../modules/customer/customer.service.js';

function runGuard(roles: string[] | undefined) {
  const req = { user: roles ? { id: 'u1', roles } : undefined } as unknown as Request;
  const next = vi.fn();
  requireCustomerRole(req, {} as never, next);
  return next.mock.calls[0][0] as { statusCode?: number; errorCode?: string } | undefined;
}

describe('customer endpoints refuse staff accounts', () => {
  it.each(['CHEF', 'NUTRITIONIST', 'TRAINER', 'PROCUREMENT', 'SUPER_ADMIN'])('%s is refused with 403 FORBIDDEN', (role) => {
    expect(runGuard([role])).toMatchObject({ statusCode: 403, errorCode: 'FORBIDDEN' });
  });

  it('retired roles never authorize, an account with no roles is refused, anonymous is 401, a customer passes', () => {
    for (const role of ['MESS_CUSTOMER', 'MD', 'DELIVERY', 'POS']) expect(runGuard([role])).toMatchObject({ statusCode: 403 });
    expect(runGuard([])).toMatchObject({ statusCode: 403 });
    expect(runGuard(undefined)).toMatchObject({ statusCode: 401 });
    expect(runGuard(['CUSTOMER'])).toBeUndefined();
  });

  it('every /me route of the customer router is authenticated and customer-guarded (profile GET/PUT included), in that order', () => {
    const layers = (customerRouter as any).stack.filter((l: any) => l.route);
    const seen = layers.map((l: any) => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`);
    expect(seen).toEqual(expect.arrayContaining(['GET /me/profile', 'PUT /me/profile']));
    for (const l of layers) {
      const names = l.route.stack.map((s: any) => s.handle.name);
      expect(names.indexOf('authenticateToken'), l.route.path).toBe(0);
      expect(names.indexOf('requireCustomerRole'), l.route.path).toBe(1);
    }
  });
});

describe('duplicate phone number is a 409, never a 500', () => {
  beforeEach(() => vi.clearAllMocks());
  const p2002 = (target: string[]) => Object.assign(new Error('Unique constraint failed'), { code: 'P2002', meta: { target } });

  it('registration: the pre-check hit is 409 PHONE_IN_USE', async () => {
    db.prisma.user.findUnique.mockResolvedValue(null);
    db.prisma.$queryRaw.mockResolvedValue([{ id: 'other' }]);
    await expect(AuthService.register({ email: 'n@x.test', password: 'Password123!', fullName: 'New One', phone: '+919876543210', requestedRole: 'CUSTOMER' } as never)).rejects.toMatchObject({ statusCode: 409, errorCode: 'PHONE_IN_USE' });
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('registration: a unique-constraint race on phone is 409 PHONE_IN_USE, on email 409 EMAIL_EXISTS, anything else is rethrown', async () => {
    db.prisma.user.findUnique.mockResolvedValue(null);
    db.prisma.$queryRaw.mockResolvedValue([]);
    const dto = { email: 'n@x.test', password: 'Password123!', fullName: 'New One', phone: '+919876543210', requestedRole: 'CUSTOMER' } as never;
    db.prisma.$transaction.mockRejectedValueOnce(p2002(['phone']));
    await expect(AuthService.register(dto)).rejects.toMatchObject({ statusCode: 409, errorCode: 'PHONE_IN_USE' });
    db.prisma.$transaction.mockRejectedValueOnce(p2002(['email']));
    await expect(AuthService.register(dto)).rejects.toMatchObject({ statusCode: 409, errorCode: 'EMAIL_EXISTS' });
    const other = new Error('boom');
    db.prisma.$transaction.mockRejectedValueOnce(other);
    await expect(AuthService.register(dto)).rejects.toBe(other);
  });

  it('profile update: a unique-constraint race on the phone number is 409 PHONE_IN_USE', async () => {
    db.prisma.customerProfile.findUnique.mockResolvedValue({ id: 'cp1', fullName: 'X', dob: null, gender: null });
    db.prisma.healthBiometrics.findUnique.mockResolvedValue(null);
    db.prisma.$transaction.mockRejectedValueOnce(p2002(['phone']));
    await expect(new CustomerService().updateCustomerProfile('u1', { phone: '+919876543210' } as never)).rejects.toMatchObject({ statusCode: 409, errorCode: 'PHONE_IN_USE' });
  });
});
