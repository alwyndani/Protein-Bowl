import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';

/**
 * Partial updates never erase stored health information: a field that is omitted stays as it was; only an explicit value
 * (including an explicit empty list) changes it. Also: login/logout/login keeps the profile, and customers are isolated.
 */
describe('health profile: partial updates preserve stored data', () => {
  const ts = Date.now();
  const email = `preserve_${ts}@example.com`;
  const password = 'Password123!';
  let token = '';
  let other = '';

  const put = (body: Record<string, unknown>, t = token) => request(app).put('/api/v1/customers/me/profile').set('Authorization', `Bearer ${t}`).send(body);
  const get = (t = token) => request(app).get('/api/v1/customers/me/profile').set('Authorization', `Bearer ${t}`);

  const FULL = {
    heightCm: 172, weightKg: 70, goal: 'maintenance', activityLevel: 'moderate', gender: 'female', dob: '1992-05-10',
    occupation: 'Teacher', sleepDuration: 7, muscleMassKg: 24, circumferences: { waistCm: 80, hipCm: 96 },
    hasExercise: true, workoutTypes: ['Yoga', 'Walking'], workoutFrequency: '3–4 Days', workoutDuration: 40, dailyStepCount: 8000,
    medicalConditions: ['Asthma'], currentMedications: 'Salbutamol', supplements: ['Vitamin D'],
    allergies: ['Peanuts'], foodDislikes: ['Mushroom'], primaryGoals: ['Maintain weight'], digestiveHealth: ['Good'], addonSlots: ['11:00 AM Snack/Salad'],
    foodPreference: 'Vegetarian', smoking: 'Never', alcohol: 'Never', stressLevel: 4, mealsPerDay: 4, waterIntakeL: 2.5
  };

  beforeAll(async () => {
    const reg = await request(app).post('/api/v1/auth/register').send({ email, password, phone: `+9193${String(ts).slice(-8)}`, fullName: 'Preserve Me' });
    token = reg.body.data.accessToken;
    const reg2 = await request(app).post('/api/v1/auth/register').send({ email: `preserve_other_${ts}@example.com`, password, phone: `+9194${String(ts).slice(-8)}`, fullName: 'Other Person' });
    other = reg2.body.data.accessToken;
    expect((await put(FULL)).status).toBe(200);
    expect((await put({ heightCm: 150, weightKg: 50, goal: 'maintenance', activityLevel: 'light', allergies: ['Shellfish'] }, other)).status).toBe(200);
  });

  it('a full save is stored and returned exactly', async () => {
    const d = (await get()).body.data;
    expect(d).toMatchObject({ heightCm: 172, weightKg: 70, occupation: 'Teacher', medicalConditions: ['Asthma'], supplements: ['Vitamin D'], allergies: ['Peanuts'], foodDislikes: ['Mushroom'], hasExercise: true, workoutTypes: ['Yoga', 'Walking'], currentMedications: 'Salbutamol' });
    expect(d.circumferences).toEqual({ waistCm: 80, hipCm: 96 });
  });

  it('a partial update with ONLY the required fields keeps every list, flag and optional value', async () => {
    const res = await put({ heightCm: 173, weightKg: 69, goal: 'maintenance', activityLevel: 'moderate' });
    expect(res.status).toBe(200);
    const d = (await get()).body.data;
    expect(d).toMatchObject({ heightCm: 173, weightKg: 69 }); // the sent fields changed
    expect(d.medicalConditions).toEqual(['Asthma']);
    expect(d.supplements).toEqual(['Vitamin D']);
    expect(d.allergies).toEqual(['Peanuts']);
    expect(d.foodDislikes).toEqual(['Mushroom']);
    expect(d.workoutTypes).toEqual(['Yoga', 'Walking']);
    expect(d.primaryGoals).toEqual(['Maintain weight']);
    expect(d.digestiveHealth).toEqual(['Good']);
    expect(d.addonSlots).toEqual(['11:00 AM Snack/Salad']);
    expect(d.hasExercise).toBe(true);
    expect(d).toMatchObject({ occupation: 'Teacher', sleepDuration: 7, muscleMassKg: 24, currentMedications: 'Salbutamol', workoutDuration: 40, dailyStepCount: 8000, foodPreference: 'Vegetarian', stressLevel: 4, mealsPerDay: 4, waterIntakeL: 2.5, gender: 'female', dob: '1992-05-10' });
    expect(d.circumferences).toEqual({ waistCm: 80, hipCm: 96 });
  });

  it('an explicit change changes only that field; an explicit empty list clears only that list', async () => {
    expect((await put({ heightCm: 173, weightKg: 69, goal: 'maintenance', activityLevel: 'moderate', allergies: ['Peanuts', 'Soy'], foodDislikes: [] })).status).toBe(200);
    const d = (await get()).body.data;
    expect(d.allergies).toEqual(['Peanuts', 'Soy']);
    expect(d.foodDislikes).toEqual([]);
    expect(d.medicalConditions).toEqual(['Asthma']); // untouched
    expect(d.supplements).toEqual(['Vitamin D']);
  });

  it('the derived figures follow the stored inputs (hasExercise kept when omitted)', async () => {
    const before = (await get()).body.data;
    expect((await put({ heightCm: 173, weightKg: 69, goal: 'maintenance', activityLevel: 'moderate' })).status).toBe(200);
    const after = (await get()).body.data;
    expect(after.waterRequirementL).toBe(before.waterRequirementL);
    expect(after.hasExercise).toBe(true);
  });

  it("another customer's save never touches this profile, and theirs is intact", async () => {
    const mine = (await get()).body.data;
    const theirs = (await get(other)).body.data;
    expect(mine.allergies).not.toContain('Shellfish');
    expect(theirs.allergies).toEqual(['Shellfish']);
    expect(theirs.medicalConditions ?? []).toEqual([]);
  });

  it('login, logout and a second login return the same stored profile (nothing is overwritten by authentication)', async () => {
    const snapshot = (await get()).body.data;
    const login1 = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(login1.status).toBe(200);
    const t1 = login1.body.data.accessToken as string;
    const cookie = login1.headers['set-cookie'];
    const out = await request(app).post('/api/v1/auth/logout').set('Authorization', `Bearer ${t1}`).set('Cookie', cookie ?? []);
    expect(out.status).toBe(200);
    const login2 = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(login2.status).toBe(200);
    const again = (await get(login2.body.data.accessToken)).body.data;
    expect(again).toEqual(snapshot);
  });
});
