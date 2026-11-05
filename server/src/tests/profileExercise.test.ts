import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { prisma } from '../config/database.js';

/**
 * "Do you exercise regularly?" is never invented. An answer the customer gave (Yes or No) is stored and kept; an omitted answer never turns into "Yes".
 *
 * Whether "never answered" is stored as NULL (and therefore shown as unanswered) depends on migration 20261101120000_health_exercise_unanswered, which is
 * prepared but NOT applied to the test database by this suite. The always-on tests hold with or without it; the NULL round-trip runs as soon as the
 * migration has been applied to the test database (it reports "skipped" until then, never "passed").
 */
// read at collection time (skipIf is evaluated before any hook runs)
const col = await prisma.$queryRaw<Array<{ is_nullable: string }>>`
  SELECT is_nullable FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'health_biometrics' AND column_name = 'hasExercise'`;
const nullable = col[0]?.is_nullable === 'YES';
const ts = Date.now();
const FULL = { heightCm: 168, weightKg: 62, goal: 'maintenance', activityLevel: 'moderate', gender: 'female', dob: '1992-05-10' };
const put = (token: string, body: Record<string, unknown>) => request(app).put('/api/v1/customers/me/profile').set('Authorization', `Bearer ${token}`).send(body);
const get = (token: string) => request(app).get('/api/v1/customers/me/profile').set('Authorization', `Bearer ${token}`);
const register = async (tag: string, n: number) => {
  const reg = await request(app).post('/api/v1/auth/register').send({ email: `ex_${tag}_${ts}@example.com`, password: 'Password123!', phone: `+91${n}${String(ts).slice(-8)}`, fullName: `Exercise ${tag}` });
  expect(reg.status).toBe(201);
  return { token: reg.body.data.accessToken as string, email: `ex_${tag}_${ts}@example.com` };
};
const bio = (email: string) => prisma.healthBiometrics.findFirst({ where: { customerProfile: { user: { email } } } });

afterAll(async () => {
  await prisma.$disconnect();
});

describe('hasExercise: never invented, answers preserved', () => {
  it('omitting the answer never produces "Yes" (response and stored row)', async () => {
    const a = await register('omit', 61);
    expect((await put(a.token, FULL)).status).toBe(200);
    expect((await get(a.token)).body.data.hasExercise).not.toBe(true);
    expect((await bio(a.email))?.hasExercise).not.toBe(true);
  });

  it('an explicit No and an explicit Yes are stored and returned exactly; a later save that omits the answer keeps it', async () => {
    const a = await register('no', 62);
    expect((await put(a.token, { ...FULL, hasExercise: false })).status).toBe(200);
    expect((await get(a.token)).body.data.hasExercise).toBe(false);
    expect((await put(a.token, { ...FULL, weightKg: 63 })).status).toBe(200); // omitted: unchanged
    expect((await get(a.token)).body.data.hasExercise).toBe(false);
    expect((await put(a.token, { ...FULL, hasExercise: true })).status).toBe(200);
    expect((await get(a.token)).body.data.hasExercise).toBe(true);
    expect((await put(a.token, { ...FULL, weightKg: 64 })).status).toBe(200);
    expect((await get(a.token)).body.data.hasExercise).toBe(true);
    expect((await bio(a.email))?.hasExercise).toBe(true);
  });

  it('editing ONE answer (a request carrying only that answer) overwrites nothing else: every other answer, list and measurement is unchanged', async () => {
    const a = await register('one', 65);
    const rich = { ...FULL, hasExercise: false, isPregnant: false, isBreastfeeding: true, allergies: ['Peanuts'], medicalConditions: ['Asthma'], foodPreference: 'Vegetarian', occupation: 'Teacher', circumferences: { waistCm: 80 } };
    expect((await put(a.token, rich)).status).toBe(200);
    const before = (await get(a.token)).body.data;
    expect((await put(a.token, { isMenopause: true })).status).toBe(200); // only this answer is sent
    const after = (await get(a.token)).body.data;
    expect(after.isMenopause).toBe(true);
    const { isMenopause: _m, ...restAfter } = after;
    const { isMenopause: _b, ...restBefore } = before;
    expect(restAfter).toEqual(restBefore); // everything else (answers, lists, measurements, derived figures) is exactly as before
    expect(after).toMatchObject({ hasExercise: false, isPregnant: false, isBreastfeeding: true, allergies: ['Peanuts'], medicalConditions: ['Asthma'], heightCm: 168, weightKg: 62 });
    // and a second single-answer edit does not touch the first
    expect((await put(a.token, { hasExercise: true })).status).toBe(200);
    expect((await get(a.token)).body.data).toMatchObject({ hasExercise: true, isMenopause: true, isPregnant: false, isBreastfeeding: true });
  });

  it('a non-boolean answer is rejected (422) and nothing changes', async () => {
    const a = await register('bad', 63);
    expect((await put(a.token, { ...FULL, hasExercise: false })).status).toBe(200);
    for (const bad of ['yes', 1, 'true', 0]) expect((await put(a.token, { ...FULL, hasExercise: bad })).status, String(bad)).toBe(422);
    expect((await get(a.token)).body.data.hasExercise).toBe(false);
  });

  it.skipIf(!nullable)('(needs migration 20261101120000) a customer who never answered is stored as NULL and comes back UNANSWERED, not No; answering later works', async () => {
    const a = await register('null', 64);
    expect((await put(a.token, FULL)).status).toBe(200);
    expect((await bio(a.email))?.hasExercise).toBeNull();
    expect((await get(a.token)).body.data.hasExercise).toBeUndefined(); // absent = unanswered
    expect((await put(a.token, { ...FULL, hasExercise: true })).status).toBe(200);
    expect((await get(a.token)).body.data.hasExercise).toBe(true);
  });

  it.skipIf(!nullable)('(needs migration 20261101120000) an explicit null clears a stored answer back to UNANSWERED; omitting it afterwards leaves it unanswered', async () => {
    const a = await register('clear', 66);
    expect((await put(a.token, { ...FULL, hasExercise: true })).status).toBe(200);
    expect((await put(a.token, { ...FULL, hasExercise: null })).status).toBe(200);
    expect((await bio(a.email))?.hasExercise).toBeNull();
    expect((await get(a.token)).body.data.hasExercise).toBeUndefined();
    expect((await put(a.token, FULL)).status).toBe(200); // omitted = unchanged
    expect((await bio(a.email))?.hasExercise).toBeNull();
  });
});
