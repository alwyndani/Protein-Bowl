import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const token = (userId: string, email: string, roles: RoleEnum[]) =>
  jwt.sign({ userId, email, roles }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });

/**
 * The complete recipe lifecycle exactly as the web app drives it: the Chef's form payload (no `code`, camel-case server contract) creates a DRAFT;
 * customers/the public do not see it; the SUPER_ADMIN publishes it (Recipe publishing screen); customers see it; unpublishing hides it again.
 */
describe('recipe lifecycle: draft -> publish -> customer visibility -> unpublish', () => {
  const ts = Date.now();
  const title = `Lifecycle Bowl ${ts}`;
  let chef = '';
  let admin = '';
  let customer = '';
  let id = '';

  beforeAll(async () => {
    const pwd = await bcrypt.hash('Password123!', 4);
    const mk = async (tag: string, role: RoleEnum, staff: boolean) => {
      const u = await prisma.user.create({
        data: {
          email: `rl_${tag}_${ts}@test.com`, passwordHash: pwd, roles: { create: { role } },
          ...(staff
            ? { employeeProfile: { create: { employeeCode: `EMP-RL-${tag}-${ts}`, fullName: `RL ${tag}`, designation: tag } } }
            : { customerProfile: { create: { fullName: `RL ${tag}`, referralCode: `PB-RL${tag}${ts}` } } })
        }
      });
      return token(u.id, u.email, [role]);
    };
    chef = await mk('chef', RoleEnum.CHEF, true);
    admin = await mk('admin', RoleEnum.SUPER_ADMIN, true);
    customer = await mk('cust', RoleEnum.CUSTOMER, false);
  });

  const publicList = async () => (await request(app).get('/api/v1/recipes').query({ search: title, limit: '50' }).set('Authorization', `Bearer ${customer}`)).body.data as Array<{ id: string }>;
  const staffRow = async () => {
    const res = await request(app).get('/api/v1/recipes/staff/all').query({ search: title, limit: '50' }).set('Authorization', `Bearer ${admin}`);
    return (res.body.data as Array<{ id: string; isPublished: boolean }>).find((r) => r.id === id);
  };

  it('1. the Chef form payload creates a draft', async () => {
    const res = await request(app).post('/api/v1/recipes').set('Authorization', `Bearer ${chef}`).send({
      title, category: 'Kerala Breakfast', servingSize: '1 Portion (250g)', servingGrams: 250, calories: 420, proteinGrams: 30, carbsGrams: 40,
      fatGrams: 12, fiberGrams: 6, dietaryTag: 'veg', cuisine: 'Kerala', ingredientsList: [{ name: 'Oats', quantity: 50, unit: 'g' }], prepSteps: ['Cook.']
    });
    expect(res.status).toBe(201);
    expect(res.body.data.isPublished).toBe(false);
    id = res.body.data.id;
  });

  it('2. as a draft it is invisible to customers (list and direct lookup) but visible to staff with isPublished=false', async () => {
    expect((await publicList()).some((r) => r.id === id)).toBe(false);
    expect((await request(app).get(`/api/v1/recipes/${id}`).set('Authorization', `Bearer ${customer}`)).status).toBe(404);
    expect(await staffRow()).toMatchObject({ id, isPublished: false });
  });

  it('3. the Chef cannot publish it', async () => {
    const res = await request(app).patch(`/api/v1/recipes/${id}/publish`).set('Authorization', `Bearer ${chef}`).send({ isPublished: true });
    expect(res.status).toBe(403);
    expect(await staffRow()).toMatchObject({ isPublished: false });
  });

  it('4. the SUPER_ADMIN publishes it: customers now see it in the list and by id; the staff list reports it published', async () => {
    const res = await request(app).patch(`/api/v1/recipes/${id}/publish`).set('Authorization', `Bearer ${admin}`).send({ isPublished: true });
    expect(res.status).toBe(200);
    expect((await publicList()).some((r) => r.id === id)).toBe(true);
    const one = await request(app).get(`/api/v1/recipes/${id}`).set('Authorization', `Bearer ${customer}`);
    expect(one.status).toBe(200);
    expect(JSON.stringify(one.body)).not.toMatch(/costing|supplierCost|sop/i);
    expect(await staffRow()).toMatchObject({ isPublished: true });
  });

  it('5. unpublishing hides it from customers again', async () => {
    const res = await request(app).patch(`/api/v1/recipes/${id}/publish`).set('Authorization', `Bearer ${admin}`).send({ isPublished: false });
    expect(res.status).toBe(200);
    expect((await publicList()).some((r) => r.id === id)).toBe(false);
    expect((await request(app).get(`/api/v1/recipes/${id}`).set('Authorization', `Bearer ${customer}`)).status).toBe(404);
  });
});
