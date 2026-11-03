import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app.js';
import { calculateBiometrics } from '../utils/biometricsCalculator.js';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

/** Mobile number and date of birth: editable, validated, duplicates refused (never silently ignored), persisted, audited without the number. */
describe('customer profile: phone and date of birth updates', () => {
  const ts = Date.now();
  const tail = String(ts).slice(-8);
  const password = 'Password123!';
  const A = { email: `phoneA_${ts}@example.com`, phone: `+9181${tail}`, token: '', id: '' };
  const B = { email: `phoneB_${ts}@example.com`, phone: `+9182${tail}`, token: '', id: '' };
  const REQUIRED = { heightCm: 170, weightKg: 70, goal: 'maintenance', activityLevel: 'moderate' };

  const put = (token: string, body: Record<string, unknown>) => request(app).put('/api/v1/customers/me/profile').set('Authorization', `Bearer ${token}`).send({ ...REQUIRED, ...body });
  const get = (token: string) => request(app).get('/api/v1/customers/me/profile').set('Authorization', `Bearer ${token}`);
  const loginFresh = async (email: string) => (await request(app).post('/api/v1/auth/login').send({ email, password })).body.data.accessToken as string;

  beforeAll(async () => {
    for (const u of [A, B]) {
      const reg = await request(app).post('/api/v1/auth/register').send({ email: u.email, password, phone: u.phone, fullName: 'Phone Test' });
      u.token = reg.body.data.accessToken;
      u.id = reg.body.data.user.id;
    }
  });

  it('1. a valid new number is saved, normalised, and still there after a fresh login ("reload")', async () => {
    const res = await put(A.token, { phone: `+91 83 ${tail.slice(0, 4)}-${tail.slice(4)}` });
    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBe(`+9183${tail}`);
    A.phone = `+9183${tail}`;
    const reloaded = await get(await loginFresh(A.email));
    expect(reloaded.body.data.phone).toBe(A.phone);
    const row = await prisma.user.findUnique({ where: { id: A.id }, select: { phone: true } });
    expect(row?.phone).toBe(A.phone);
  });

  it('2. an omitted phone leaves the stored number alone; re-sending the same number (any formatting) is a no-op', async () => {
    expect((await put(A.token, {})).status).toBe(200);
    expect((await get(A.token)).body.data.phone).toBe(A.phone);
    const same = await put(A.token, { phone: `+91 83${tail.slice(0, 3)} ${tail.slice(3)}` });
    expect(same.status).toBe(200);
    const audits = await prisma.auditLog.findMany({ where: { action: 'CUSTOMER_PHONE_CHANGED', entityId: A.id } });
    expect(audits).toHaveLength(1); // only the real change of step 1
    expect(JSON.stringify(audits[0].payload)).not.toContain(tail); // the number itself is never written to the audit log
  });

  it("3. another account's number is refused with 409 PHONE_IN_USE (any formatting); nothing else in that request is applied", async () => {
    const res = await put(B.token, { phone: `+91 83${tail.slice(0, 2)}-${tail.slice(2)}`, fullName: 'Should Not Apply', weightKg: 99 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('PHONE_IN_USE');
    const b = (await get(B.token)).body.data;
    expect(b.phone).toBe(B.phone);
    expect(b.name).toBe('Phone Test');
    expect(b.weightKg).not.toBe(99);
    expect((await get(A.token)).body.data.phone).toBe(A.phone); // the owner is untouched
  });

  it('4. an invalid number is a 422 and changes nothing', async () => {
    for (const bad of ['123', 'abcdefghij', '+91 98', '1'.repeat(20)]) {
      const res = await put(A.token, { phone: bad });
      expect(res.status, bad).toBe(422);
    }
    expect((await get(A.token)).body.data.phone).toBe(A.phone);
  });

  it('5. date of birth: a real past date is saved and drives the age; invalid or future dates are 422', async () => {
    expect((await put(A.token, { dob: '1988-03-02' })).status).toBe(200);
    const d = (await get(A.token)).body.data;
    expect(d.dob).toBe('1988-03-02');
    expect(d.age).toBeGreaterThan(30);
    for (const bad of ['1995-13-45', '2999-01-01', '1899-12-31', 'yesterday', '02/03/1988']) expect((await put(A.token, { dob: bad })).status, bad).toBe(422);
    expect((await get(A.token)).body.data.dob).toBe('1988-03-02');
  });

  it("6. health figures are calculated from the customer's SAVED date of birth, gender and measurements, never from demo values", async () => {
    const saved = { heightCm: 181, weightKg: 88, gender: 'male', dob: '1980-01-15', goal: 'weight_loss', activityLevel: 'active', hasExercise: true };
    expect((await put(A.token, saved)).status).toBe(200);
    const d = (await get(A.token)).body.data;
    const expected = calculateBiometrics({ heightCm: 181, weightKg: 88, dob: '1980-01-15', gender: 'male', activityLevel: 'active', goal: 'weight_loss', hasExercise: true });
    expect({ bmi: d.bmi, bmr: d.bmr, tdee: d.tdee, targetCalories: d.targetCalories }).toEqual({ bmi: expected.bmi, bmr: expected.bmr, tdee: expected.tdee, targetCalories: expected.targetCalories });
    // The old demo person (1995-04-18, female, same body) would have produced different numbers:
    const demo = calculateBiometrics({ heightCm: 181, weightKg: 88, dob: '1995-04-18', gender: 'female', activityLevel: 'active', goal: 'weight_loss', hasExercise: true });
    expect(demo.bmr).not.toBe(d.bmr);
    // Changing only the saved date of birth changes the result: the stored value is what is used.
    expect((await put(A.token, { ...saved, dob: '1960-01-15' })).status).toBe(200);
    const older = (await get(A.token)).body.data;
    expect(older.bmr).toBeLessThan(d.bmr);
  });
});
