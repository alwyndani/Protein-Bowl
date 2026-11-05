import React from 'react';
import { render } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../auth/AuthProvider';
import { SessionManager } from '../auth/sessionManager';
import { secureSessionStorage } from '../auth/secureSession';
import { WellnessNavigator } from '../navigation/WellnessNavigator';
import { FakeBackend } from './fakeBackend';
import { BASE, CLIENT, seedDevice } from './harness';

/**
 * Test double for the customer health-profile and diet endpoints. It mirrors the audited server contract:
 *  - PUT /customers/me/profile: strict body, hasExercise is boolean-or-omitted (null is REJECTED, omitted = unchanged), the four core
 *    measurements are required together before health details are stored (422 HEALTH_PROFILE_INCOMPLETE), ranges are validated (422).
 *  - the profile response omits every value that was never provided (no defaults); calories exist only with dob + gender.
 *  - /diets/my-requests, /diets/my-plans (latest versions only), POST /diets/requests, approve / request-revision (400 unless SUBMITTED).
 * Test support only.
 */
type Json = Record<string, any>;

export class FakeWellnessBackend extends FakeBackend {
  /** userId -> stored fields (exactly what was provided). */
  profiles = new Map<string, Json>();
  requests = new Map<string, Json[]>();
  plans = new Map<string, Json[]>();
  private seq = 0;

  profileOf(userId: string): Json {
    if (!this.profiles.has(userId)) this.profiles.set(userId, {});
    return this.profiles.get(userId)!;
  }
  requestsOf(userId: string) {
    if (!this.requests.has(userId)) this.requests.set(userId, []);
    return this.requests.get(userId)!;
  }
  plansOf(userId: string) {
    if (!this.plans.has(userId)) this.plans.set(userId, []);
    return this.plans.get(userId)!;
  }

  private profileDto(userId: string, email: string): Json {
    const s = this.profileOf(userId);
    const dto: Json = { id: `cp-${userId}`, userId, name: s.fullName ?? '', email, phone: '', dob: s.dob ?? '', gender: s.gender };
    const keys = ['heightCm', 'weightKg', 'targetWeightKg', 'goal', 'primaryGoals', 'activityLevel', 'hasExercise', 'medicalConditions', 'currentMedications', 'foodPreference', 'allergies', 'foodDislikes'];
    if (s.hasHealth) for (const k of keys) if (s[k] !== undefined && s[k] !== null) dto[k] = s[k];
    if (s.hasHealth) {
      const canCalc = !!s.dob && (s.gender === 'male' || s.gender === 'female');
      dto.calculation = { available: canCalc, missing: canCalc ? [] : [...(s.dob ? [] : ['date of birth']), ...(s.gender === 'male' || s.gender === 'female' ? [] : ['gender (male or female)'])] };
      const m = s.heightCm / 100;
      dto.bmi = Number((s.weightKg / (m * m)).toFixed(1));
      dto.bmiCategory = dto.bmi < 25 ? 'Normal' : 'Overweight';
      dto.waterRequirementL = 2.5;
      if (canCalc) {
        dto.targetCalories = 1850;
        dto.macroTargets = { proteinGrams: 120, carbsGrams: 200, fatGrams: 60, fiberGrams: 30 };
      }
    }
    return dto;
  }

  /** Test helper: store a complete health profile exactly as given. */
  seedProfile(userId: string, fields: Json) {
    Object.assign(this.profileOf(userId), { hasHealth: true }, fields);
  }

  protected route(path: string, headers: Record<string, string>, body: any): Response {
    const clean = path.split('?')[0];
    if (!/^\/(customers\/me\/profile|diets)/.test(clean)) return super.route(path, headers, body);
    const method = (this.log[this.log.length - 1]?.method ?? 'GET').toUpperCase();
    const user = this.bearer(headers);
    if (!user) return this.err(401, 'UNAUTHORIZED');
    if (!user.roles.includes('CUSTOMER')) return this.err(403, 'FORBIDDEN');
    const uid = user.id;

    if (clean === '/customers/me/profile' && method === 'GET') return this.respond(200, { success: true, data: this.profileDto(uid, user.email) });
    if (clean === '/customers/me/profile' && method === 'PUT') return this.putProfile(uid, user.email, body ?? {});

    if (clean === '/diets/my-requests' && method === 'GET') {
      const plans = this.plansOf(uid);
      const data = this.requestsOf(uid).map((r) => ({ ...r, dietPlans: plans.filter((p) => p.requestId === r.id && p.isLatestVersion).map((p) => ({ id: p.id, name: p.name, versionNumber: p.versionNumber, status: p.status, createdAt: p.createdAt })) }));
      return this.respond(200, { success: true, data });
    }
    if (clean === '/diets/my-plans' && method === 'GET') {
      const data = this.plansOf(uid)
        .filter((p) => p.isLatestVersion && ['SUBMITTED', 'APPROVED', 'REVISED'].includes(p.status))
        .map(({ internalClinicalNotes: _hidden, ...rest }) => rest);
      return this.respond(200, { success: true, data });
    }
    if (clean === '/diets/requests' && method === 'POST') {
      if (typeof body?.goal !== 'string' || body.goal.length < 2) return this.err(422, 'VALIDATION_ERROR');
      if (!['complete', '2meal', '1meal'].includes(body.planType ?? 'complete')) return this.err(422, 'VALIDATION_ERROR');
      if (body.calculatedPrice !== undefined) return this.err(422, 'VALIDATION_ERROR'); // the app must never send a price
      const r = { id: `req-${++this.seq}`, goal: body.goal, status: 'SUBMITTED', planType: body.planType ?? 'complete', durationDays: body.durationDays ?? 30, allergiesExclusions: body.allergiesExclusions ?? '', notes: body.notes, createdAt: '2026-11-01T10:00:00.000Z' };
      this.requestsOf(uid).push(r);
      return this.respond(201, { success: true, data: r });
    }
    const act = /^\/diets\/plans\/([^/]+)\/(approve|request-revision)$/.exec(clean);
    if (act && method === 'POST') {
      const plan = this.plansOf(uid).find((p) => p.id === decodeURIComponent(act[1]));
      if (!plan) return this.err(404, 'NOT_FOUND');
      if (plan.status !== 'SUBMITTED') return this.err(400, 'BAD_REQUEST');
      if (act[2] === 'request-revision') {
        if (typeof body?.revisionNotes !== 'string' || body.revisionNotes.length < 3) return this.err(422, 'VALIDATION_ERROR');
        plan.status = 'REVISED';
        plan.customerFeedback = body.revisionNotes;
        const req = this.requestsOf(uid).find((r) => r.id === plan.requestId);
        if (req) Object.assign(req, { status: 'REVISION_REQUESTED', revisionNotes: body.revisionNotes });
      } else {
        plan.status = 'APPROVED';
        plan.customerFeedback = body?.customerFeedback || 'Approved by customer';
        const req = this.requestsOf(uid).find((r) => r.id === plan.requestId);
        if (req) req.status = 'COMPLETED';
      }
      return this.respond(200, { success: true, data: plan });
    }
    return this.err(404, 'NOT_FOUND');
  }

  private putProfile(uid: string, email: string, body: Json): Response {
    const allowed = new Set(['fullName', 'dob', 'gender', 'heightCm', 'weightKg', 'targetWeightKg', 'goal', 'primaryGoals', 'activityLevel', 'hasExercise', 'medicalConditions', 'currentMedications', 'foodPreference', 'allergies', 'foodDislikes']);
    for (const [k, v] of Object.entries(body)) {
      if (!allowed.has(k)) return this.err(422, 'VALIDATION_ERROR');
      if (v === null) return this.err(422, 'VALIDATION_ERROR'); // the real schema has no null for any of these (hasExercise is boolean | omitted)
    }
    if (body.hasExercise !== undefined && typeof body.hasExercise !== 'boolean') return this.err(422, 'VALIDATION_ERROR');
    if (body.heightCm !== undefined && (typeof body.heightCm !== 'number' || body.heightCm < 50 || body.heightCm > 250)) return this.err(422, 'VALIDATION_ERROR');
    if (body.weightKg !== undefined && (typeof body.weightKg !== 'number' || body.weightKg < 20 || body.weightKg > 300)) return this.err(422, 'VALIDATION_ERROR');
    if (body.dob !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(body.dob) || body.dob > '2026-11-04')) return this.err(422, 'VALIDATION_ERROR');
    if (body.fullName !== undefined && body.fullName.length < 2) return this.err(422, 'VALIDATION_ERROR');
    const s = this.profileOf(uid);
    const BASIC = new Set(['fullName', 'dob', 'gender']);
    const healthKeys = Object.keys(body).filter((k) => !BASIC.has(k));
    const merged = { heightCm: body.heightCm ?? s.heightCm, weightKg: body.weightKg ?? s.weightKg, goal: body.goal ?? s.goal, activityLevel: body.activityLevel ?? s.activityLevel };
    const hasRequired = merged.heightCm != null && merged.weightKg != null && !!merged.goal && !!merged.activityLevel;
    if (!hasRequired && healthKeys.length > 0) return this.err(422, 'HEALTH_PROFILE_INCOMPLETE');
    Object.assign(s, body); // omitted keys (including hasExercise) stay exactly as stored
    if (hasRequired) s.hasHealth = true;
    return this.respond(200, { success: true, data: this.profileDto(uid, email) });
  }
}

/** Mount the REAL WellnessNavigator for a signed-in customer (the coordinator wires it into the tabs separately). */
export async function mountWellness(backend: FakeBackend, email = 'cust@b.test') {
  await seedDevice(backend, email);
  const manager = new SessionManager({ storage: secureSessionStorage, baseUrl: BASE, clientHeader: CLIENT, timeoutMs: 200, fetchImpl: backend.fetch as unknown as typeof fetch });
  await manager.restore();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, networkMode: 'always' }, mutations: { retry: false, networkMode: 'always' } } });
  const view = render(
    React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(AuthProvider, { manager, children: React.createElement(NavigationContainer, null, React.createElement(WellnessNavigator)) })
    )
  );
  return { view, qc, manager };
}

export const PLAN_FIXTURE = (over: Json = {}): Json => ({
  id: 'plan-1',
  requestId: 'req-seed',
  name: 'Lean Kerala Plan',
  versionNumber: 2,
  parentPlanId: 'plan-0',
  isLatestVersion: true,
  targetCalories: 1850,
  proteinGrams: 120,
  carbsGrams: 200,
  fatGrams: 60,
  fiberGrams: 30,
  status: 'SUBMITTED',
  customerVisibleNotes: 'Drink water before meals.',
  createdAt: '2026-11-02T09:00:00.000Z',
  days: [
    {
      id: 'd1',
      dayNumber: 1,
      dayName: 'Monday',
      notes: null,
      meals: [
        { id: 'm1', mealType: 'BREAKFAST', timingLabel: '8:00', recipeName: 'Ragi dosa', portionGrams: 200, calories: 320, protein: 12, carbs: 50, fat: 6 },
        { id: 'm2', mealType: 'LUNCH', timingLabel: null, recipeName: 'Grilled fish bowl', portionGrams: 300, calories: 540, protein: 42, carbs: 55, fat: 14 }
      ]
    },
    { id: 'd2', dayNumber: 2, dayName: 'Tuesday', notes: null, meals: [{ id: 'm3', mealType: 'DINNER', recipeName: 'Veg stew', calories: 410, protein: 18, carbs: 40, fat: 12 }] }
  ],
  ...over
});
