import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';

/**
 * The customer profile API returns only what the customer stored. A new customer without biometrics must NOT receive a stand-in person
 * (165 cm, 68 kg, a condition, a date of birth, a cycle, ...), and optional fields they never entered stay absent after a partial save.
 */
describe('customer profile: nothing is invented', () => {
  const ts = Date.now();
  let token = '';

  beforeAll(async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: `nodefaults_${ts}@example.com`, password: 'Password123!', phone: `+9191${String(ts).slice(-8)}`, fullName: 'No Defaults'
    });
    token = res.body.data.accessToken;
  });

  const get = () => request(app).get('/api/v1/customers/me/profile').set('Authorization', `Bearer ${token}`);

  it('a customer with no stored biometrics gets no measurements, goals, conditions, lifestyle, dob, gender or derived figures', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.name).toBe('No Defaults');
    expect(d.dob).toBe('');
    for (const key of [
      'age', 'gender', 'heightCm', 'weightKg', 'targetWeightKg', 'occupation', 'workSchedule', 'sleepDuration', 'wakeUpTime', 'bedTime', 'muscleMassKg',
      'circumferences', 'limbCircumferences', 'goal', 'primaryGoals', 'activityLevel', 'hasExercise', 'workoutTypes', 'workoutFrequency', 'workoutDuration',
      'dailyStepCount', 'cardioSessions', 'strengthSessions', 'medicalConditions', 'currentMedications', 'supplements', 'bloodTestResults', 'foodPreference',
      'allergies', 'foodDislikes', 'mealsPerDay', 'mealTimings', 'waterIntakeL', 'digestiveHealth', 'smoking', 'alcohol', 'tobacco', 'stressLevel',
      'sleepQuality', 'isPregnant', 'isBreastfeeding', 'menstrualCycle', 'isMenopause', 'bmi', 'bmiCategory', 'bmr', 'tdee', 'targetCalories', 'macroTargets'
    ]) {
      expect(d, key).not.toHaveProperty(key);
    }
  });

  it('a save with only the required fields stores only those: the optional ones stay absent, nothing is calculated from assumptions beyond the stored inputs', async () => {
    const put = await request(app).put('/api/v1/customers/me/profile').set('Authorization', `Bearer ${token}`)
      .send({ heightCm: 170, weightKg: 70, goal: 'maintenance', activityLevel: 'moderate' });
    expect(put.status).toBe(200);
    const d = (await get()).body.data;
    expect(d).toMatchObject({ heightCm: 170, weightKg: 70, goal: 'maintenance', activityLevel: 'moderate' });
    for (const key of ['targetWeightKg', 'occupation', 'sleepDuration', 'wakeUpTime', 'muscleMassKg', 'circumferences', 'currentMedications', 'waterIntakeL', 'stressLevel', 'menstrualCycle', 'gender', 'dob']) {
      if (key === 'dob') expect(d.dob).toBe('');
      else expect(d, key).not.toHaveProperty(key);
    }
    expect(d.medicalConditions ?? []).toEqual([]);
    expect(d.allergies ?? []).toEqual([]);
    expect(d.supplements ?? []).toEqual([]);
  });
});
