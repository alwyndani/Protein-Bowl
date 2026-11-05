import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { calculateBiometrics } from '../utils/biometricsCalculator.js';
import { normalizePhone } from '../utils/phone.js';

const ts = Date.now();
const tail = String(ts).slice(-7);
const password = 'Password123!';
const register = (body: Record<string, unknown>) => request(app).post('/api/v1/auth/register').send({ password, fullName: 'Reg Test', ...body });
const mobileRegister = (body: Record<string, unknown>) =>
  request(app).post('/api/v1/auth/mobile/register').set('X-PB-Client', 'protein-bowl-mobile/1.0.0 (android)').send({ password, fullName: 'Reg Test', ...body });

describe('registration: phone validation and duplicates (web and mobile)', () => {
  it('normalizePhone: separators are ignored, 8-15 digits with an optional +, nothing else', () => {
    expect(normalizePhone('+91 98765-43210')).toBe('+919876543210');
    expect(normalizePhone(' (080) 1234 5678 ')).toBe('08012345678');
    for (const bad of ['', '123', 'abc', '+91 98', '12345678901234567', '98765x43210', '++919876543210']) expect(normalizePhone(bad), bad).toBeNull();
  });

  it('web: a valid number is stored normalised; an invalid one is a 422 and creates no account', async () => {
    const ok = await register({ email: `regA_${ts}@example.com`, phone: `+91 70 ${tail}` });
    expect(ok.status).toBe(201);
    expect(ok.body.data.user.phone).toBe(`+9170${tail}`);
    for (const bad of ['123', 'not a number', '+91 98']) {
      const res = await register({ email: `regBad_${bad.length}_${ts}@example.com`, phone: bad });
      expect(res.status, bad).toBe(422);
    }
    const none = await request(app).post('/api/v1/auth/login').send({ email: `regBad_3_${ts}@example.com`, password });
    expect(none.status).toBe(401);
  });

  it('web: a number another account already holds (any formatting) is a clear 409 PHONE_IN_USE, not a 500, and no account is created', async () => {
    const res = await register({ email: `regDup_${ts}@example.com`, phone: `+91-70-${tail}` });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('PHONE_IN_USE');
    expect((await request(app).post('/api/v1/auth/login').send({ email: `regDup_${ts}@example.com`, password })).status).toBe(401);
  });

  it('two registrations racing for one number: exactly one account, the other gets 409 (never 500)', async () => {
    const phone = `+9171${tail}`;
    const results = await Promise.all([register({ email: `race1_${ts}@example.com`, phone }), register({ email: `race2_${ts}@example.com`, phone })]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)!.body.error).toBe('PHONE_IN_USE');
  });

  it('registration without a phone still works (the number is optional) and an empty string means "none"', async () => {
    expect((await register({ email: `noPhone_${ts}@example.com` })).status).toBe(201);
    const empty = await register({ email: `emptyPhone_${ts}@example.com`, phone: '' });
    expect(empty.status).toBe(201);
    expect(empty.body.data.user.phone ?? null).toBeNull();
  });

  it('mobile registration enforces the same rules (422 invalid, 409 duplicate)', async () => {
    const ok = await mobileRegister({ email: `mob_${ts}@example.com`, phone: `+9172${tail}` });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect((await mobileRegister({ email: `mobBad_${ts}@example.com`, phone: '12' })).status).toBe(422);
    const dup = await mobileRegister({ email: `mobDup_${ts}@example.com`, phone: `+9172 ${tail}` });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('PHONE_IN_USE');
  });
});

describe('health figures are NOT CALCULATED until the date of birth and gender are saved', () => {
  const base = { heightCm: 170, weightKg: 70, activityLevel: 'moderate', goal: 'weight_loss' };

  it('calculator unit: no date of birth / no gender -> available=false, nothing assumed, only height/weight figures are real', () => {
    const noDob = calculateBiometrics({ ...base, gender: 'female' });
    expect(noDob).toMatchObject({ available: false, missing: ['dateOfBirth'], age: null, bmr: 0, tdee: 0, targetCalories: 0 });
    expect(noDob.bmi).toBeGreaterThan(0);
    expect(noDob.waterRequirementL).toBeGreaterThan(0);
    const noGender = calculateBiometrics({ ...base, dob: '1990-01-01' });
    expect(noGender).toMatchObject({ available: false, missing: ['gender'], bmr: 0 });
    expect(calculateBiometrics({ ...base }).missing).toEqual(['dateOfBirth', 'gender']);
    expect(calculateBiometrics({ ...base, dob: 'not-a-date', gender: 'male' }).available).toBe(false); // an unreadable date is "missing", not 25
    const ok = calculateBiometrics({ ...base, dob: '1990-01-01', gender: 'male' });
    expect(ok.available).toBe(true);
    expect(ok.bmr).toBeGreaterThan(1000);
  });

  let token = '';
  beforeAll(async () => {
    const reg = await register({ email: `calc_${ts}@example.com`, phone: `+9173${tail}` });
    token = reg.body.data.accessToken;
  });
  const put = (body: Record<string, unknown>) => request(app).put('/api/v1/customers/me/profile').set('Authorization', `Bearer ${token}`).send({ ...base, ...body });
  const get = () => request(app).get('/api/v1/customers/me/profile').set('Authorization', `Bearer ${token}`);

  it('API: a save without dob/gender returns BMI, water and ideal weight but NO bmr/tdee/calories/macros, and says what is missing', async () => {
    expect((await put({})).status).toBe(200);
    const d = (await get()).body.data;
    expect(d.bmi).toBeGreaterThan(0);
    expect(d.waterRequirementL).toBeGreaterThan(0);
    for (const k of ['bmr', 'tdee', 'maintenanceCalories', 'targetCalories', 'macroTargets', 'calorieDeficitSurplus']) expect(d, k).not.toHaveProperty(k);
    expect(d.calculation).toEqual({ available: false, missing: ['dateOfBirth', 'gender'] });
  });

  it('API: saving the date of birth and gender produces the figures, equal to the calculator on the saved inputs', async () => {
    expect((await put({ dob: '1991-04-12', gender: 'female' })).status).toBe(200);
    const d = (await get()).body.data;
    const expected = calculateBiometrics({ ...base, dob: '1991-04-12', gender: 'female' });
    expect(d.calculation).toEqual({ available: true, missing: [] });
    expect({ bmr: d.bmr, tdee: d.tdee, targetCalories: d.targetCalories }).toEqual({ bmr: expected.bmr, tdee: expected.tdee, targetCalories: expected.targetCalories });
  });

  it('API: figures stored earlier under an assumed age are never shown: a profile without a saved dob returns none (legacy rows are not trusted)', async () => {
    // A different customer whose row has non-zero stored derived values but no saved date of birth.
    const reg = await register({ email: `legacy_${ts}@example.com`, phone: `+9174${tail}` });
    const t = reg.body.data.accessToken as string;
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    try {
      const profile = await prisma.customerProfile.findFirstOrThrow({ where: { user: { email: `legacy_${ts}@example.com` } } });
      await prisma.healthBiometrics.create({
        data: { customerProfileId: profile.id, heightCm: 170, weightKg: 70, goal: 'weight_loss', activityLevel: 'moderate', bmi: 24.2, bmiCategory: 'Normal', bmr: 1400, tdee: 2170, maintenanceCalories: 2170, targetCalories: 1670, macroTargets: { proteinGrams: 126, carbsGrams: 200, fatGrams: 46, fiberGrams: 23 } }
      });
    } finally {
      await prisma.$disconnect();
    }
    const d = (await request(app).get('/api/v1/customers/me/profile').set('Authorization', `Bearer ${t}`)).body.data;
    expect(d.heightCm).toBe(170);
    expect(d).not.toHaveProperty('bmr');
    expect(d).not.toHaveProperty('targetCalories');
    expect(d.calculation.available).toBe(false);
  });
});
