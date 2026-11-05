import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import { calculateBiometrics } from '../utils/biometricsCalculator.js';
import { presentBiometrics } from '../modules/health/biometricsPresentation.js';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const token = (userId: string, email: string, roles: RoleEnum[]) => jwt.sign({ userId, email, roles }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '1h' });

/**
 * Both Nutritionist reads (claimed queue, audited health-profile read) present derived figures only through the shared function:
 * recalculated from the customer's CURRENT saved inputs, never the stored (possibly stale) columns, never assuming age or sex.
 */
describe('nutritionist reads: no stale or assumed calorie figures', () => {
  const ts = Date.now();
  const pwd = bcrypt.hashSync('Password123!', 4);
  let nutA = '';
  let nutB = '';
  let nutAId = '';
  let customer = '';
  let customerUserId = '';
  let profileId = '';
  let requestId = '';

  // A row exactly like one written BEFORE the "no assumed age" change: derived columns filled, but no date of birth and no gender saved.
  const STALE = { bmi: 99.9, bmiCategory: 'Obese', bmr: 1400, tdee: 2170, maintenanceCalories: 2170, targetCalories: 1670, macroTargets: { proteinGrams: 126, carbsGrams: 200, fatGrams: 46, fiberGrams: 23 }, waterRequirementL: 9.9, idealBodyWeightKg: 11.1, calorieDeficitSurplus: -500 };
  const INPUTS = { heightCm: 170, weightKg: 70, goal: 'weight_loss', activityLevel: 'moderate' };

  const claimed = async () => {
    const res = await request(app).get('/api/v1/diets/nutritionist/my-claimed-queue').set('Authorization', `Bearer ${nutA}`);
    expect(res.status).toBe(200);
    return (res.body.data as Array<{ id: string; customerProfile: Record<string, any> }>).find((r) => r.id === requestId)!;
  };
  const healthProfile = async () => {
    const res = await request(app).get(`/api/v1/diets/requests/${requestId}/health-profile`).set('Authorization', `Bearer ${nutA}`);
    expect(res.status).toBe(200);
    return res.body.data as Record<string, any>;
  };
  const setProfile = (data: { dob?: Date | null; gender?: string | null }) => prisma.customerProfile.update({ where: { id: profileId }, data });

  beforeAll(async () => {
    const mkNut = async (tag: string) => {
      const u = await prisma.user.create({ data: { email: `nb_${tag}_${ts}@test.com`, passwordHash: pwd, roles: { create: { role: RoleEnum.NUTRITIONIST } } } });
      return { id: u.id, token: token(u.id, u.email, [RoleEnum.NUTRITIONIST]) };
    };
    const a = await mkNut('a');
    const b = await mkNut('b');
    nutA = a.token; nutAId = a.id; nutB = b.token;
    const u = await prisma.user.create({
      data: {
        email: `nb_cust_${ts}@test.com`, passwordHash: pwd, roles: { create: { role: RoleEnum.CUSTOMER } },
        customerProfile: { create: { fullName: 'Stale Row Customer', referralCode: `PB-NB${ts}` } }
      },
      include: { customerProfile: true }
    });
    customerUserId = u.id;
    profileId = u.customerProfile!.id;
    customer = token(u.id, u.email, [RoleEnum.CUSTOMER]);
    await prisma.healthBiometrics.create({ data: { customerProfileId: profileId, ...INPUTS, ...STALE } });
    const created = await request(app).post('/api/v1/diets/requests').set('Authorization', `Bearer ${customer}`).send({ goal: 'Weight Loss', planType: 'complete', durationDays: 7, dietaryPreference: 'veg' });
    expect(created.status).toBe(201);
    requestId = created.body.data.id;
    expect((await request(app).post(`/api/v1/diets/requests/${requestId}/claim`).set('Authorization', `Bearer ${nutA}`)).status).toBe(200);
  });

  it('1. stored legacy values with NO saved date of birth/gender are never exposed by either read; only height/weight figures are real', async () => {
    const q = (await claimed()).customerProfile.healthBiometrics;
    const p = (await healthProfile()).healthBiometrics;
    for (const bio of [q, p]) {
      for (const k of ['bmr', 'tdee', 'maintenanceCalories', 'targetCalories', 'macroTargets', 'calorieDeficitSurplus']) expect(bio, k).not.toHaveProperty(k);
      expect(bio.calculation).toEqual({ available: false, missing: ['dateOfBirth', 'gender'] });
      expect(bio.heightCm).toBe(170); // the saved inputs are still shown
      expect(bio.bmi).not.toBe(STALE.bmi); // recalculated, not the stored 99.9
      expect(bio.waterRequirementL).not.toBe(STALE.waterRequirementL);
      expect(bio.idealBodyWeightKg).not.toBe(STALE.idealBodyWeightKg);
      expect(JSON.stringify(bio)).not.toMatch(/1670|2170|\b1400\b/); // none of the stored calorie values
    }
    expect((await claimed()).customerProfile).not.toHaveProperty('dob'); // the queue sends no date of birth
    // the database row itself was NOT modified by reading
    expect((await prisma.healthBiometrics.findUniqueOrThrow({ where: { customerProfileId: profileId } })).tdee).toBe(2170);
  });

  it('2. with a saved date of birth and an explicit male/female the figures equal the calculator on the saved inputs (not the stored row)', async () => {
    await setProfile({ dob: new Date('1988-03-02T00:00:00Z'), gender: 'female' });
    const expected = calculateBiometrics({ ...INPUTS, dob: '1988-03-02', gender: 'female' });
    for (const bio of [(await claimed()).customerProfile.healthBiometrics, (await healthProfile()).healthBiometrics]) {
      expect(bio.calculation).toEqual({ available: true, missing: [] });
      expect({ bmr: bio.bmr, tdee: bio.tdee, targetCalories: bio.targetCalories }).toEqual({ bmr: expected.bmr, tdee: expected.tdee, targetCalories: expected.targetCalories });
      expect(bio.targetCalories).not.toBe(STALE.targetCalories);
    }
    expect((await claimed()).customerProfile.age).toBeGreaterThan(30);
  });

  it('3. gender "other" is UNAVAILABLE (no automatic female formula) until a calculation policy is approved', async () => {
    await setProfile({ dob: new Date('1988-03-02T00:00:00Z'), gender: 'other' });
    for (const bio of [(await claimed()).customerProfile.healthBiometrics, (await healthProfile()).healthBiometrics]) {
      expect(bio.calculation).toEqual({ available: false, missing: ['calculationPolicy'] });
      for (const k of ['bmr', 'tdee', 'targetCalories', 'macroTargets']) expect(bio, k).not.toHaveProperty(k);
    }
    expect(calculateBiometrics({ ...INPUTS, dob: '1988-03-02', gender: 'other' }).available).toBe(false);
    expect(calculateBiometrics({ ...INPUTS, dob: '1988-03-02', gender: 'female' }).bmr).not.toBe(calculateBiometrics({ ...INPUTS, dob: '1988-03-02', gender: 'other' }).bmr);
  });

  it('4. the shared function is pure: it never keeps a stored derived column and handles a missing row', () => {
    expect(presentBiometrics(null, {})).toBeNull();
    const out = presentBiometrics({ ...INPUTS, ...STALE, allergies: ['Peanuts'] }, { dob: null, gender: null })!;
    expect(out.allergies).toEqual(['Peanuts']); // non-derived data passes through
    for (const k of ['bmr', 'tdee', 'targetCalories', 'macroTargets', 'calorieDeficitSurplus']) expect(out[k], k).toBeUndefined(); // (undefined is omitted from JSON)
    expect(out.calculation).toEqual({ available: false, missing: ['dateOfBirth', 'gender'] });
  });

  it('5. ACCESS CONTROL: an unassigned nutritionist gets 403 (and a denial audit row), the customer 403, anonymous 401; the assigned one is audited', async () => {
    const url = `/api/v1/diets/requests/${requestId}/health-profile`;
    expect((await request(app).get(url).set('Authorization', `Bearer ${nutB}`)).status).toBe(403);
    expect((await request(app).get(url).set('Authorization', `Bearer ${customer}`)).status).toBe(403);
    expect((await request(app).get(url)).status).toBe(401);
    const denied = await prisma.auditLog.count({ where: { action: 'HEALTH_PROFILE_ACCESS_DENIED', entityId: requestId } });
    expect(denied).toBeGreaterThanOrEqual(1);
    const accessedBefore = await prisma.auditLog.count({ where: { action: 'HEALTH_PROFILE_ACCESSED', entityId: requestId } });
    expect((await request(app).get(url).set('Authorization', `Bearer ${nutA}`)).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'HEALTH_PROFILE_ACCESSED', entityId: requestId } })).toBe(accessedBefore + 1);
    // the other nutritionist's queue does not contain this request
    const other = await request(app).get('/api/v1/diets/nutritionist/my-claimed-queue').set('Authorization', `Bearer ${nutB}`);
    expect((other.body.data as Array<{ id: string }>).some((r) => r.id === requestId)).toBe(false);
  });

  it('6. a plan can never be created with a defaulted calorie target: the API requires an explicit target of at least 500 kcal', async () => {
    const day = [{ dayNumber: 1, dayName: 'Monday', meals: [{ mealType: 'breakfast', recipeName: 'Oats', portionGrams: 200, calories: 300, protein: 12, carbs: 40, fat: 6 }] }];
    const base = { requestId, name: 'Plan', proteinGrams: 100, carbsGrams: 100, fatGrams: 40, days: day };
    const missing = await request(app).post('/api/v1/diets/plans').set('Authorization', `Bearer ${nutA}`).send(base);
    expect(missing.status).toBe(422);
    const zero = await request(app).post('/api/v1/diets/plans').set('Authorization', `Bearer ${nutA}`).send({ ...base, targetCalories: 0 });
    expect(zero.status).toBe(422);
    expect(await prisma.dietPlan.count({ where: { requestId } })).toBe(0);
    const ok = await request(app).post('/api/v1/diets/plans').set('Authorization', `Bearer ${nutA}`).send({ ...base, targetCalories: 1800 });
    expect(ok.status).toBe(201);
    expect(ok.body.data.targetCalories).toBe(1800);
    void nutAId; void customerUserId;
  });
});
