import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { prisma } from '../config/database.js';

/**
 * A customer who skips the health step keeps the date of birth and gender entered at registration, and NOTHING else is invented:
 * a basics-only save stores no health profile. Women-only questions stay unanswered (NULL) until explicitly answered, and unanswered is not "No".
 */
describe('health profile: basics-only save (skipped health step) and women-only unanswered state', () => {
  const ts = Date.now();
  const password = 'Password123!';
  const register = async (tag: string, n: number) => {
    const email = `basics_${tag}_${ts}@example.com`;
    const reg = await request(app).post('/api/v1/auth/register').send({ email, password, phone: `+91${n}${String(ts).slice(-8)}`, fullName: `Basics ${tag}` });
    expect(reg.status).toBe(201);
    return { email, token: reg.body.data.accessToken as string };
  };
  const put = (token: string, body: Record<string, unknown>) => request(app).put('/api/v1/customers/me/profile').set('Authorization', `Bearer ${token}`).send(body);
  const get = (token: string) => request(app).get('/api/v1/customers/me/profile').set('Authorization', `Bearer ${token}`);
  const bioRow = async (email: string) => prisma.healthBiometrics.findFirst({ where: { customerProfile: { user: { email } } } });

  let a: { email: string; token: string };
  let b: { email: string; token: string };

  beforeAll(async () => {
    a = await register('a', 71);
    b = await register('b', 72);
  });

  it('dob + gender alone are stored; no health profile row is created and no measurement is invented', async () => {
    const res = await put(a.token, { dob: '1990-04-02', gender: 'female' });
    expect(res.status).toBe(200);
    expect(await bioRow(a.email)).toBeNull();
    const d = (await get(a.token)).body.data;
    expect(d).toMatchObject({ dob: '1990-04-02', gender: 'female' });
    expect(d.heightCm || 0).toBe(0);
    expect(d.weightKg || 0).toBe(0);
    expect(d.bmi || 0).toBe(0);
    expect(d.targetCalories || 0).toBe(0);
  });

  it('health details without the four required measurements are refused (422) and nothing is created', async () => {
    const res = await put(a.token, { allergies: ['Peanuts'] });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('HEALTH_PROFILE_INCOMPLETE');
    expect(await bioRow(a.email)).toBeNull();
  });

  it('the health step can still be completed later; the earlier dob/gender feed the calculation', async () => {
    const res = await put(a.token, { heightCm: 165, weightKg: 60, goal: 'maintenance', activityLevel: 'moderate' });
    expect(res.status).toBe(200);
    const d = (await get(a.token)).body.data;
    expect(d).toMatchObject({ dob: '1990-04-02', gender: 'female', heightCm: 165, weightKg: 60 });
    expect(d.targetCalories).toBeGreaterThan(0);
  });

  it('women-only questions stay unanswered (absent, not false) when not sent', async () => {
    const res = await put(b.token, { heightCm: 160, weightKg: 55, goal: 'maintenance', activityLevel: 'light', gender: 'female', dob: '1993-01-15' });
    expect(res.status).toBe(200);
    const row = await bioRow(b.email);
    expect(row?.isPregnant).toBeNull();
    expect(row?.isBreastfeeding).toBeNull();
    expect(row?.isMenopause).toBeNull();
    const d = (await get(b.token)).body.data;
    expect(d.isPregnant).toBeUndefined();
    expect(d.isBreastfeeding).toBeUndefined();
    expect(d.isMenopause).toBeUndefined();
  });

  it('explicit answers are stored (true and false are different from unanswered) and an omitted answer is preserved by later saves', async () => {
    expect((await put(b.token, { heightCm: 160, weightKg: 55, goal: 'maintenance', activityLevel: 'light', isPregnant: false, isBreastfeeding: true })).status).toBe(200);
    let row = await bioRow(b.email);
    expect(row?.isPregnant).toBe(false);
    expect(row?.isBreastfeeding).toBe(true);
    expect(row?.isMenopause).toBeNull();
    expect((await put(b.token, { heightCm: 161, weightKg: 55, goal: 'maintenance', activityLevel: 'light' })).status).toBe(200);
    row = await bioRow(b.email);
    expect(row?.isPregnant).toBe(false);
    expect(row?.isBreastfeeding).toBe(true);
    expect(row?.isMenopause).toBeNull();
  });
});
