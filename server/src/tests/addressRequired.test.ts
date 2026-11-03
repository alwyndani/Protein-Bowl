import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { prisma } from '../config/database.js';

/**
 * The address API never invents a label or a state: both must be provided by the customer. A request that omits (or blanks) either is rejected
 * with 422 and NOTHING is stored, so an address the customer did not confirm can never reach an order.
 */
describe('customer address API: label and state are required (no silent Home / Kerala defaults)', () => {
  const ts = Date.now();
  let token = '';
  let profileId = '';
  const base = { addressLine1: '12 Beach Road', city: 'Kochi', postalCode: '682001' };
  const post = (body: Record<string, unknown>) => request(app).post('/api/v1/customers/me/addresses').set('Authorization', `Bearer ${token}`).send(body);
  const put = (id: string, body: Record<string, unknown>) => request(app).put(`/api/v1/customers/me/addresses/${id}`).set('Authorization', `Bearer ${token}`).send(body);
  const count = () => prisma.customerAddress.count({ where: { customerProfileId: profileId } });

  beforeAll(async () => {
    const reg = await request(app).post('/api/v1/auth/register').send({ email: `addr_req_${ts}@example.com`, password: 'Password123!', phone: `+9195${String(ts).slice(-8)}`, fullName: 'Address Required' });
    expect(reg.status).toBe(201);
    token = reg.body.data.accessToken;
    // an address write creates the profile on first use; make sure it exists
    expect((await request(app).get('/api/v1/customers/me/addresses').set('Authorization', `Bearer ${token}`)).status).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: `addr_req_${ts}@example.com` }, include: { customerProfile: true } });
    profileId = user.customerProfile!.id;
  });

  it('omitting the label is 422 VALIDATION_ERROR and nothing is stored', async () => {
    const before = await count();
    const res = await post({ ...base, state: 'Kerala' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(await count()).toBe(before);
  });

  it('omitting the state is 422 VALIDATION_ERROR and nothing is stored (no Kerala default)', async () => {
    const before = await count();
    const res = await post({ ...base, title: 'Office' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(await count()).toBe(before);
  });

  it('a blank or whitespace-only label or state is rejected too', async () => {
    const before = await count();
    for (const body of [{ title: '', state: 'Kerala' }, { title: '   ', state: 'Kerala' }, { title: 'Office', state: '' }, { title: 'Office', state: '   ' }, {}]) {
      const res = await post({ ...base, ...body });
      expect(res.status, JSON.stringify(body)).toBe(422);
    }
    expect(await count()).toBe(before);
  });

  it('a complete address is stored exactly as entered (trimmed), never replaced by a default', async () => {
    const res = await post({ ...base, title: '  Mum’s place  ', state: ' Tamil Nadu ' });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Mum’s place');
    expect(res.body.data.state).toBe('Tamil Nadu');
  });

  it('an update cannot blank the label or state; the stored address is unchanged; an omitted field keeps its value', async () => {
    const created = await post({ ...base, title: 'Flat', state: 'Karnataka' });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    for (const body of [{ title: '' }, { title: '  ' }, { state: '' }, { state: '   ' }]) expect((await put(id, body)).status, JSON.stringify(body)).toBe(422);
    const row = await prisma.customerAddress.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ title: 'Flat', state: 'Karnataka' });
    expect((await put(id, { city: 'Mysuru' })).status).toBe(200);
    expect(await prisma.customerAddress.findUniqueOrThrow({ where: { id } })).toMatchObject({ title: 'Flat', state: 'Karnataka', city: 'Mysuru' });
  });
});
