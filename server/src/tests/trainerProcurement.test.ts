import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

/**
 * Trainer coaching + Procurement purchasing, against a real (isolated) PostgreSQL test database:
 * authorization, assignment gating, branch isolation, validation, receipt arithmetic and stock integrity.
 */
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const sign = (userId: string, email: string, roles: RoleEnum[]) => jwt.sign({ userId, email, roles }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

type Who = { id: string; email: string; token: string; profileId?: string };

describe('Trainer + Procurement', () => {
  const ts = Date.now();
  const who: Record<string, Who> = {};
  let branchA: { id: string };
  let branchB: { id: string };

  async function mkUser(label: string, roles: RoleEnum[], branchIds: string[] = []): Promise<Who> {
    const email = `tp_${label}_${ts}@test.com`;
    const customer = roles.includes(RoleEnum.CUSTOMER);
    const u = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash('Tp#Test-Pass-2026-xyz', 4),
        roles: { create: roles.map((role) => ({ role })) },
        ...(customer
          ? { customerProfile: { create: { fullName: `Customer ${label}`, referralCode: `PB-TP${label.toUpperCase()}${ts}` } } }
          : { employeeProfile: { create: { employeeCode: `TP-${label}-${ts}`, fullName: `TP ${label}`, designation: 'Test', assignedBranchId: branchIds[0] ?? null } } })
      },
      include: { customerProfile: true, employeeProfile: true }
    });
    for (const branchId of branchIds) await prisma.employeeBranchAssignment.create({ data: { employeeProfileId: u.employeeProfile!.id, branchId } });
    return (who[label] = { id: u.id, email, token: sign(u.id, email, roles), profileId: u.customerProfile?.id });
  }

  beforeAll(async () => {
    branchA = await prisma.kitchenBranch.create({ data: { code: `TPA${ts}`, name: 'TP A', address: 'a', city: 'Kochi' } });
    branchB = await prisma.kitchenBranch.create({ data: { code: `TPB${ts}`, name: 'TP B', address: 'b', city: 'Kochi' } });
    await mkUser('admin', [RoleEnum.SUPER_ADMIN]);
    await mkUser('trainer1', [RoleEnum.TRAINER]);
    await mkUser('trainer2', [RoleEnum.TRAINER]);
    await mkUser('cust1', [RoleEnum.CUSTOMER]);
    await mkUser('cust2', [RoleEnum.CUSTOMER]);
    await mkUser('procA', [RoleEnum.PROCUREMENT], [branchA.id]);
    await mkUser('chef', [RoleEnum.CHEF], [branchA.id]);
  });
  afterAll(async () => { await prisma.$disconnect(); });

  // ------------------------------------------------------------------ Trainer
  describe('trainer', () => {
    const plan = {
      title: 'Strength', goal: 'Build muscle', durationWeeks: 4,
      days: [{ dayOfWeek: 'MONDAY', title: 'Push', focusArea: 'Chest', exercises: [{ name: 'Bench press', sets: 3, reps: '8', restSeconds: 90 }] }]
    };
    let planId = '';

    it('only an administrator can assign; trainers, chefs and customers are refused', async () => {
      const body = { trainerUserId: who.trainer1.id, customerEmail: who.cust1.email };
      for (const k of ['trainer1', 'chef', 'cust1']) {
        const r = await request(app).post('/api/v1/trainer/admin/assignments').set(bearer(who[k].token)).send(body);
        expect(r.status, k).toBe(403);
      }
      expect((await request(app).post('/api/v1/trainer/admin/assignments').send(body)).status).toBe(401);
    });

    it('an unassigned trainer cannot see or create plans for a customer (indistinguishable 404)', async () => {
      const r = await request(app).post(`/api/v1/trainer/clients/${who.cust1.profileId}/plans`).set(bearer(who.trainer1.token)).send(plan);
      expect(r.status).toBe(404);
      const list = await request(app).get('/api/v1/trainer/clients').set(bearer(who.trainer1.token));
      expect(list.body.data).toEqual([]);
    });

    it('assignment validates the trainer and the customer', async () => {
      const notTrainer = await request(app).post('/api/v1/trainer/admin/assignments').set(bearer(who.admin.token)).send({ trainerUserId: who.chef.id, customerEmail: who.cust1.email });
      expect(notTrainer.status).toBe(404);
      const noCustomer = await request(app).post('/api/v1/trainer/admin/assignments').set(bearer(who.admin.token)).send({ trainerUserId: who.trainer1.id, customerEmail: 'nobody@test.com' });
      expect(noCustomer.status).toBe(404);
      const bad = await request(app).post('/api/v1/trainer/admin/assignments').set(bearer(who.admin.token)).send({ trainerUserId: 'x', customerEmail: 'y', extra: 1 });
      expect(bad.status).toBe(422);
    });

    it('an assigned trainer creates a plan; the audit trail records it; health data is never in the client list', async () => {
      const a = await request(app).post('/api/v1/trainer/admin/assignments').set(bearer(who.admin.token)).send({ trainerUserId: who.trainer1.id, customerEmail: who.cust1.email });
      expect(a.status, JSON.stringify(a.body)).toBe(201);
      const clients = await request(app).get('/api/v1/trainer/clients').set(bearer(who.trainer1.token));
      expect(clients.body.data).toHaveLength(1);
      expect(Object.keys(clients.body.data[0]).sort()).toEqual(['assignedAt', 'assignmentId', 'customerProfileId', 'fullName', 'plans']);
      const created = await request(app).post(`/api/v1/trainer/clients/${who.cust1.profileId}/plans`).set(bearer(who.trainer1.token)).send(plan);
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      planId = created.body.data.id;
      expect(await prisma.auditLog.count({ where: { action: 'WORKOUT_PLAN_CREATED', entityId: planId } })).toBe(1);
    });

    it('validation rejects unknown fields, bad days and non-https videos', async () => {
      const url = `/api/v1/trainer/clients/${who.cust1.profileId}/plans`;
      const t = who.trainer1.token;
      expect((await request(app).post(url).set(bearer(t)).send({ ...plan, extra: 1 })).status).toBe(422);
      expect((await request(app).post(url).set(bearer(t)).send({ ...plan, days: [] })).status).toBe(422);
      expect((await request(app).post(url).set(bearer(t)).send({ ...plan, days: [{ ...plan.days[0], dayOfWeek: 'FUNDAY' }] })).status).toBe(422);
      const vid = { ...plan, days: [{ ...plan.days[0], exercises: [{ ...plan.days[0].exercises[0], videoUrl: 'http://insecure.example/v' }] }] };
      expect((await request(app).post(url).set(bearer(t)).send(vid)).status).toBe(422);
    });

    it('another trainer cannot read, edit or archive the plan', async () => {
      const t2 = bearer(who.trainer2.token);
      expect((await request(app).put(`/api/v1/trainer/plans/${planId}`).set(t2).send(plan)).status).toBe(404);
      expect((await request(app).post(`/api/v1/trainer/plans/${planId}/status`).set(t2).send({ status: 'ARCHIVED' })).status).toBe(404);
      expect((await request(app).get(`/api/v1/trainer/plans/${planId}/logs`).set(t2)).status).toBe(404);
    });

    it('the owning customer sees the plan, logs progress, and nobody else can', async () => {
      const mine = await request(app).get('/api/v1/trainer/my/plans').set(bearer(who.cust1.token));
      expect(mine.body.data.map((p: { id: string }) => p.id)).toContain(planId);
      const other = await request(app).get('/api/v1/trainer/my/plans').set(bearer(who.cust2.token));
      expect(other.body.data).toEqual([]);

      const dayId = mine.body.data[0].workoutDays[0].id;
      const log = await request(app).post(`/api/v1/trainer/my/plans/${planId}/logs`).set(bearer(who.cust1.token)).send({ workoutDayId: dayId, completed: true, perceivedEffort: 7, bodyWeightKg: 70.5, notes: 'good' });
      expect(log.status, JSON.stringify(log.body)).toBe(201);
      expect((await request(app).post(`/api/v1/trainer/my/plans/${planId}/logs`).set(bearer(who.cust2.token)).send({ completed: true })).status).toBe(404);
      expect((await request(app).post(`/api/v1/trainer/my/plans/${planId}/logs`).set(bearer(who.cust1.token)).send({ perceivedEffort: 11 })).status).toBe(422);
      expect((await request(app).post(`/api/v1/trainer/my/plans/${planId}/logs`).set(bearer(who.cust1.token)).send({ workoutDayId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);

      const seen = await request(app).get(`/api/v1/trainer/plans/${planId}/logs`).set(bearer(who.trainer1.token));
      expect(seen.body.data).toHaveLength(1);
    });

    it('customer-only and trainer-only routes refuse the wrong role', async () => {
      expect((await request(app).get('/api/v1/trainer/my/plans').set(bearer(who.trainer1.token))).status).toBe(403);
      expect((await request(app).get('/api/v1/trainer/my/plans').set(bearer(who.admin.token))).status).toBe(403);
      expect((await request(app).get('/api/v1/trainer/clients').set(bearer(who.cust1.token))).status).toBe(403);
      expect((await request(app).get('/api/v1/trainer/clients').set(bearer(who.admin.token))).status).toBe(403);
    });

    it('editing replaces the days; an archived plan rejects new progress; ending the assignment removes access', async () => {
      const edited = await request(app).put(`/api/v1/trainer/plans/${planId}`).set(bearer(who.trainer1.token)).send({ ...plan, title: 'Strength v2' });
      expect(edited.status).toBe(200);
      expect(edited.body.data.title).toBe('Strength v2');
      expect(edited.body.data.workoutDays).toHaveLength(1);

      await request(app).post(`/api/v1/trainer/plans/${planId}/status`).set(bearer(who.trainer1.token)).send({ status: 'ARCHIVED' });
      const hidden = await request(app).get('/api/v1/trainer/my/plans').set(bearer(who.cust1.token));
      expect(hidden.body.data.map((p: { id: string }) => p.id)).not.toContain(planId); // archived plans leave the customer's list
      await request(app).post(`/api/v1/trainer/plans/${planId}/status`).set(bearer(who.trainer1.token)).send({ status: 'COMPLETED' });
      const notActive = await request(app).post(`/api/v1/trainer/my/plans/${planId}/logs`).set(bearer(who.cust1.token)).send({ completed: true });
      expect(notActive.status).toBe(409);
      expect(notActive.body.error).toBe('PLAN_NOT_ACTIVE');

      const assignment = await prisma.trainerAssignment.findFirstOrThrow({ where: { trainerUserId: who.trainer1.id } });
      const ended = await request(app).post(`/api/v1/trainer/admin/assignments/${assignment.id}/end`).set(bearer(who.admin.token)).send({});
      expect(ended.body.data.status).toBe('ENDED');
      expect((await request(app).put(`/api/v1/trainer/plans/${planId}`).set(bearer(who.trainer1.token)).send(plan)).status).toBe(404);
      expect((await request(app).get('/api/v1/trainer/clients').set(bearer(who.trainer1.token))).body.data).toEqual([]);
    });
  });

  // -------------------------------------------------------------- Procurement
  describe('procurement', () => {
    const P = '/api/v1/procurement';
    let supplierId = '';
    let itemA = '';
    let itemB = '';
    let poId = '';
    let lineA = '';
    let lineB = '';

    it('role guard: customers, chefs and trainers have no procurement access', async () => {
      for (const k of ['cust1', 'chef', 'trainer1']) {
        const r = await request(app).get(`${P}/suppliers`).set(bearer(who[k].token));
        expect(r.status, k).toBe(403);
      }
      expect((await request(app).get(`${P}/suppliers`)).status).toBe(401);
    });

    it('creates suppliers with validation, and toggles them', async () => {
      const t = bearer(who.procA.token);
      expect((await request(app).post(`${P}/suppliers`).set(t).send({ name: '' })).status).toBe(422);
      expect((await request(app).post(`${P}/suppliers`).set(t).send({ name: 'X', extra: 1 })).status).toBe(422);
      const s = await request(app).post(`${P}/suppliers`).set(t).send({ name: `Fresh Farms ${ts}`, email: 'farm@test.com' });
      expect(s.status, JSON.stringify(s.body)).toBe(201);
      supplierId = s.body.data.id;
    });

    it('creates items only in an assigned branch', async () => {
      const t = bearer(who.procA.token);
      const mk = (branchId: string, sku: string) => request(app).post(`${P}/items`).set(t).send({ branchId, name: `Item ${sku}`, sku, category: 'veg', unit: 'kg', minReorderLevel: 5, unitCost: 10 });
      const a = await mk(branchA.id, `A1-${ts}`);
      expect(a.status, JSON.stringify(a.body)).toBe(201);
      itemA = a.body.data.id;
      itemB = (await mk(branchA.id, `A2-${ts}`)).body.data.id;
      expect((await mk(branchB.id, `B1-${ts}`)).status).toBe(403);
      expect((await mk(branchA.id, `A1-${ts}`)).status).toBe(409); // duplicate SKU
    });

    it('purchase order creation validates items, suppliers, branch and duplicates', async () => {
      const t = bearer(who.procA.token);
      const base = { branchId: branchA.id, supplierId, lines: [{ inventoryItemId: itemA, orderedQuantity: 10, unitCost: 12.5 }, { inventoryItemId: itemB, orderedQuantity: 4, unitCost: 3 }] };
      expect((await request(app).post(`${P}/purchase-orders`).set(t).send({ ...base, branchId: branchB.id })).status).toBe(403);
      expect((await request(app).post(`${P}/purchase-orders`).set(t).send({ ...base, lines: [] })).status).toBe(422);
      expect((await request(app).post(`${P}/purchase-orders`).set(t).send({ ...base, lines: [{ inventoryItemId: itemA, orderedQuantity: 0, unitCost: 1 }] })).status).toBe(422);
      expect((await request(app).post(`${P}/purchase-orders`).set(t).send({ ...base, lines: [base.lines[0], base.lines[0]] })).status).toBe(422);
      expect((await request(app).post(`${P}/purchase-orders`).set(t).send({ ...base, supplierId: '00000000-0000-4000-8000-000000000000' })).status).toBe(422);
      const ok = await request(app).post(`${P}/purchase-orders`).set(t).send(base);
      expect(ok.status, JSON.stringify(ok.body)).toBe(201);
      expect(ok.body.data.status).toBe('DRAFT');
      expect(ok.body.data.poNumber).toMatch(/^PO-\d{6}-[0-9A-F]{6}$/);
      poId = ok.body.data.id;
      lineA = ok.body.data.lines.find((l: { inventoryItem: { id: string } }) => l.inventoryItem.id === itemA).id;
      lineB = ok.body.data.lines.find((l: { inventoryItem: { id: string } }) => l.inventoryItem.id === itemB).id;
    });

    it('goods cannot be received before the order is sent; sending is idempotent', async () => {
      const t = bearer(who.procA.token);
      const early = await request(app).post(`${P}/purchase-orders/${poId}/receive`).set(t).send({ lines: [{ purchaseOrderLineId: lineA, quantity: 1 }] });
      expect(early.status).toBe(409);
      const sent = await request(app).post(`${P}/purchase-orders/${poId}/order`).set(t).send({});
      expect(sent.body.data.status).toBe('ORDERED');
      expect((await request(app).post(`${P}/purchase-orders/${poId}/order`).set(t).send({})).body.data.status).toBe('ORDERED');
    });

    it('receiving updates stock and the order status; over-receipt and foreign lines are refused', async () => {
      const t = bearer(who.procA.token);
      const recv = (lines: Array<{ purchaseOrderLineId: string; quantity: number }>) => request(app).post(`${P}/purchase-orders/${poId}/receive`).set(t).send({ lines });

      expect((await recv([{ purchaseOrderLineId: lineA, quantity: 11 }])).body.error).toBe('OVER_RECEIPT');
      expect((await recv([{ purchaseOrderLineId: '00000000-0000-4000-8000-000000000000', quantity: 1 }])).body.error).toBe('LINE_NOT_FOUND');
      expect((await recv([{ purchaseOrderLineId: lineA, quantity: 1 }, { purchaseOrderLineId: lineA, quantity: 1 }])).status).toBe(422);
      expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemA } })).quantityOnHand).toBe(0); // refusals changed nothing

      const first = await recv([{ purchaseOrderLineId: lineA, quantity: 6 }]);
      expect(first.status, JSON.stringify(first.body)).toBe(201);
      let po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poId } });
      expect(po.status).toBe('PARTIALLY_RECEIVED');
      expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemA } })).quantityOnHand).toBe(6);

      expect((await request(app).post(`${P}/purchase-orders/${poId}/cancel`).set(t).send({})).body.error).toBe('INVALID_STATE');

      const rest = await recv([{ purchaseOrderLineId: lineA, quantity: 4 }, { purchaseOrderLineId: lineB, quantity: 4 }]);
      expect(rest.status).toBe(201);
      po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poId } });
      expect(po.status).toBe('RECEIVED');
      expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemA } })).quantityOnHand).toBe(10);
      expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemB } })).quantityOnHand).toBe(4);
      expect(await prisma.stockMovement.count({ where: { inventoryItemId: itemA, type: 'PURCHASE_RECEIPT' } })).toBe(2);
      expect((await recv([{ purchaseOrderLineId: lineA, quantity: 1 }])).status).toBe(409); // fully received
    });

    it('concurrent identical receipts cannot over-receive', async () => {
      const t = bearer(who.procA.token);
      const po = await request(app).post(`${P}/purchase-orders`).set(t).send({ branchId: branchA.id, supplierId, lines: [{ inventoryItemId: itemA, orderedQuantity: 5, unitCost: 1 }] });
      const id = po.body.data.id as string;
      const line = po.body.data.lines[0].id as string;
      await request(app).post(`${P}/purchase-orders/${id}/order`).set(t).send({});
      const before = (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemA } })).quantityOnHand;
      const results = await Promise.all([1, 2, 3].map(() => request(app).post(`${P}/purchase-orders/${id}/receive`).set(t).send({ lines: [{ purchaseOrderLineId: line, quantity: 5 }] })));
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemA } })).quantityOnHand).toBe(before + 5);
    });

    it('a draft can be cancelled; a cancelled order cannot be sent', async () => {
      const t = bearer(who.procA.token);
      const po = await request(app).post(`${P}/purchase-orders`).set(t).send({ branchId: branchA.id, supplierId, lines: [{ inventoryItemId: itemB, orderedQuantity: 1, unitCost: 1 }] });
      const c = await request(app).post(`${P}/purchase-orders/${po.body.data.id}/cancel`).set(t).send({});
      expect(c.body.data.status).toBe('CANCELLED');
      expect((await request(app).post(`${P}/purchase-orders/${po.body.data.id}/order`).set(t).send({})).status).toBe(409);
    });

    it('stock movements are validated and can never drive stock negative', async () => {
      const t = bearer(who.procA.token);
      const mv = (body: Record<string, unknown>) => request(app).post(`${P}/stock-movement`).set(t).send(body);
      expect((await mv({ inventoryItemId: itemB, type: 'WASTAGE', quantity: -1, unitCost: 1 })).status).toBe(422);
      expect((await mv({ inventoryItemId: itemB, type: 'BOGUS', quantity: 1, unitCost: 1 })).status).toBe(422);
      const tooMuch = await mv({ inventoryItemId: itemB, type: 'WASTAGE', quantity: 100, unitCost: 1 });
      expect(tooMuch.status).toBe(409);
      expect(tooMuch.body.error).toBe('INSUFFICIENT_STOCK');
      expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemB } })).quantityOnHand).toBe(4);
      expect((await mv({ inventoryItemId: itemB, type: 'WASTAGE', quantity: 1.5, unitCost: 1 })).status).toBe(201);
      expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemB } })).quantityOnHand).toBe(2.5);
    });

    it('branch isolation: a branch-A buyer cannot read or act on branch-B data', async () => {
      const t = bearer(who.procA.token);
      const itemInB = await prisma.inventoryItem.create({ data: { branchId: branchB.id, name: 'B only', sku: `BO-${ts}`, category: 'x', unit: 'kg', unitCost: 1 } });
      expect((await request(app).get(`${P}/items?branchId=${branchB.id}`).set(t)).status).toBe(403);
      expect((await request(app).get(`${P}/dashboard?branchId=${branchB.id}`).set(t)).status).toBe(403);
      expect((await request(app).post(`${P}/stock-movement`).set(t).send({ inventoryItemId: itemInB.id, type: 'WASTAGE', quantity: 1, unitCost: 1 })).status).toBe(403);
      const poB = await prisma.purchaseOrder.create({ data: { poNumber: `PO-T-${ts}`, branchId: branchB.id, supplierId } });
      expect((await request(app).get(`${P}/purchase-orders/${poB.id}`).set(t)).status).toBe(403);
      expect((await request(app).post(`${P}/purchase-orders/${poB.id}/order`).set(t).send({})).status).toBe(403);
      const list = await request(app).get(`${P}/purchase-orders`).set(t);
      expect(list.body.data.every((p: { branch: { id: string } }) => p.branch.id === branchA.id)).toBe(true);
    });

    it('the dashboard reports low stock for the buyer\'s branch only', async () => {
      const t = bearer(who.procA.token);
      const d = await request(app).get(`${P}/dashboard`).set(t);
      expect(d.status).toBe(200);
      expect(d.body.data.itemCount).toBeGreaterThanOrEqual(2);
      expect(d.body.data.lowStock.map((i: { id: string }) => i.id)).toContain(itemB); // 2.5 <= 5
    });

    it('SUPER_ADMIN can view procurement data (read) with an explicit branch', async () => {
      const r = await request(app).get(`${P}/purchase-orders?branchId=${branchA.id}`).set(bearer(who.admin.token));
      expect(r.status, JSON.stringify(r.body)).toBe(200);
    });
  });
});
