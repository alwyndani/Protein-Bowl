import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { OrderExpiryService } from '../modules/order/orderExpiry.service.js';

/** Unpaid online orders expire after a configurable timeout, and ONLY when no sign of payment exists. */
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

describe('unpaid order expiry', () => {
  const ts = Date.now();
  let profileId = '';
  let seq = 0;
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

  async function mkOrder(over: Record<string, unknown> = {}, ageMinutes = 30) {
    const n = ++seq;
    return prisma.order.create({
      data: {
        orderNumber: `EXP-${ts}-${n}`, totalAmount: 100, netAmount: 100, customerProfileId: profileId, status: 'PENDING', paymentStatus: 'PENDING',
        paymentMethod: 'ONLINE', orderType: 'DIRECT', createdAt: minutesAgo(ageMinutes), ...over
      } as never
    });
  }
  const session = (orderId: string, over: Record<string, unknown> = {}) =>
    prisma.payment.create({ data: { orderId, amount: 100, provider: 'mock', providerOrderId: `mo_${ts}_${++seq}`, status: 'PENDING', ...over } as never });
  const statusOf = async (id: string) => (await prisma.order.findUniqueOrThrow({ where: { id } })).status;
  // Limit the pass to the orders of this file so concurrent suites' rows are never touched.
  const run = async (minutes = 15) => OrderExpiryService.runOnce({ minutes, limit: 5000 });

  beforeAll(async () => {
    const u = await prisma.user.create({
      data: { email: `exp_${ts}@test.com`, passwordHash: await bcrypt.hash('x', 4), roles: { create: [{ role: RoleEnum.CUSTOMER }] }, customerProfile: { create: { fullName: 'Exp', referralCode: `PB-EXP${ts}` } } },
      include: { customerProfile: true }
    });
    profileId = u.customerProfile!.id;
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it('cancels an old unpaid order through the transition service: event, audit, sessions expired, no refund', async () => {
    const o = await mkOrder();
    const s = await session(o.id, { createdAt: minutesAgo(30), expiresAt: minutesAgo(10) });
    const stats = await run();
    expect(stats.expired).toBeGreaterThanOrEqual(1);
    const after = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(after.status).toBe('CANCELLED');
    expect(after.cancellationReason).toBe('UNPAID_EXPIRED');
    expect(after.paymentStatus).toBe('PENDING');
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: s.id } })).status).toBe('EXPIRED');
    expect(await prisma.refund.count({ where: { orderId: o.id } })).toBe(0);
    const ev = await prisma.orderEvent.findFirstOrThrow({ where: { orderId: o.id, toStatus: 'CANCELLED' } });
    expect(ev.actorRole).toBe('SYSTEM:PAYMENT_EXPIRY');
    expect(await prisma.auditLog.count({ where: { entityId: o.id, action: 'ORDER_UNPAID_EXPIRED' } })).toBe(1);
  });

  it('leaves recent orders alone and honours the configured timeout', async () => {
    const fresh = await mkOrder({}, 5);
    await run(15);
    expect(await statusOf(fresh.id)).toBe('PENDING');
    await run(3); // a shorter configured timeout now covers it
    expect(await statusOf(fresh.id)).toBe('CANCELLED');
  });

  it('a timeout of 0 disables expiry entirely', async () => {
    const o = await mkOrder({}, 600);
    const stats = await run(0);
    expect(stats).toEqual({ considered: 0, expired: 0, skipped: 0, failed: 0 });
    expect(await statusOf(o.id)).toBe('PENDING');
  });

  it('never expires an order whose checkout session was created recently or is still inside its TTL (the customer may be paying right now)', async () => {
    const recent = await mkOrder();
    await session(recent.id, { createdAt: minutesAgo(2), expiresAt: minutesAgo(1) });
    const stillOpen = await mkOrder();
    await session(stillOpen.id, { createdAt: minutesAgo(40), expiresAt: new Date(Date.now() + 5 * 60_000) });
    await run();
    expect(await statusOf(recent.id)).toBe('PENDING');
    expect(await statusOf(stillOpen.id)).toBe('PENDING');
  });

  it('reconciliation polling (a fresh session updatedAt) does NOT keep an abandoned order alive', async () => {
    const o = await mkOrder();
    await session(o.id, { createdAt: minutesAgo(40), expiresAt: minutesAgo(20), updatedAt: new Date() });
    await run();
    expect(await statusOf(o.id)).toBe('CANCELLED');
  });

  it('never expires an order whose session carries an unverified-provider marker', async () => {
    const o = await mkOrder();
    await session(o.id, { createdAt: minutesAgo(30), expiresAt: minutesAgo(10), lastError: 'PROVIDER_STATE_UNVERIFIED' });
    await run();
    expect(await statusOf(o.id)).toBe('PENDING');
  });

  it('never expires an order that has ANY provider payment record', async () => {
    const o = await mkOrder();
    const s = await session(o.id, { createdAt: minutesAgo(30), expiresAt: minutesAgo(10) });
    await prisma.providerPayment.create({
      data: { provider: 'mock', providerPaymentId: `pay_${ts}_${++seq}`, providerOrderId: s.providerOrderId!, paymentId: s.id, orderId: o.id, amount: 100, currency: 'INR', providerStatus: 'AUTHORIZED', firstSeenVia: 'RECONCILIATION' }
    });
    await run();
    expect(await statusOf(o.id)).toBe('PENDING');
  });

  it('only unpaid ONLINE food orders: paid, confirmed, legacy COD and Mess purchases are never touched', async () => {
    const paid = await mkOrder({ status: 'CONFIRMED', paymentStatus: 'PAID' });
    const legacy = await mkOrder({ paymentMethod: 'COD' });
    const mess = await mkOrder({ orderType: 'MESS_SUBSCRIPTION' });
    await run();
    expect(await statusOf(paid.id)).toBe('CONFIRMED');
    expect(await statusOf(legacy.id)).toBe('PENDING');
    expect(await statusOf(mess.id)).toBe('PENDING');
  });

  it('is idempotent and safe to run concurrently', async () => {
    const o = await mkOrder();
    await Promise.all([run(), run(), run()]);
    expect(await statusOf(o.id)).toBe('CANCELLED');
    expect(await prisma.orderEvent.count({ where: { orderId: o.id, toStatus: 'CANCELLED' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: o.id, action: 'ORDER_UNPAID_EXPIRED' } })).toBe(1);
    await run();
    expect(await prisma.orderEvent.count({ where: { orderId: o.id, toStatus: 'CANCELLED' } })).toBe(1);
  });
});
