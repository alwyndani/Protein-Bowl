import React from 'react';
import { render } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../auth/AuthProvider';
import { SessionManager } from '../auth/sessionManager';
import { secureSessionStorage } from '../auth/secureSession';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { WorkoutPlanScreen, WorkoutPlansScreen } from '../screens/workouts/WorkoutScreens';
import { colors } from '../ui/components';
import type { WorkoutsStackParamList } from '../navigation/types';
import { FakeBackend } from './fakeBackend';

const BASE = 'https://api.test/api/v1';
const CLIENT = 'protein-bowl-mobile/1.0.0 (android)';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Test double of the customer workout endpoints under /trainer/my, mirroring the audited server contract
 * (trainer.routes.ts logSchema + trainer.service.ts myPlans / myLogs / logProgress). Plans are keyed by the customer's user id,
 * so a customer can only ever be served their own. Test support only.
 */
export class FakeWorkoutsBackend extends FakeBackend {
  plans = new Map<string, Array<Record<string, any>>>();
  logs = new Map<string, Array<Record<string, any>>>(); // by plan id
  private seq = 0;

  protected route(path: string, headers: Record<string, string>, body: any): Response {
    const cleanPath = path.split('?')[0];
    if (!cleanPath.startsWith('/trainer/my/plans')) return super.route(path, headers, body);
    const method = (this.log[this.log.length - 1]?.method ?? 'GET').toUpperCase();
    const user = this.bearer(headers);
    if (!user) return this.err(401, 'UNAUTHORIZED');
    if (!user.roles.includes('CUSTOMER')) return this.err(403, 'FORBIDDEN');
    const own = this.plans.get(user.id) ?? [];

    if (cleanPath === '/trainer/my/plans' && method === 'GET') {
      return this.respond(200, { success: true, data: own.filter((p) => p.status !== 'ARCHIVED') });
    }
    const m = cleanPath.match(/^\/trainer\/my\/plans\/([^/]+)\/logs$/);
    if (!m) return this.err(404, 'NOT_FOUND');
    const id = decodeURIComponent(m[1]);
    if (!UUID.test(id)) return this.err(422, 'VALIDATION_ERROR');
    const plan = own.find((p) => p.id === id);
    if (!plan) return this.err(404, 'NOT_FOUND');

    if (method === 'GET') return this.respond(200, { success: true, data: [...(this.logs.get(id) ?? [])].reverse() });
    if (method !== 'POST') return this.err(404, 'NOT_FOUND');

    // strict logSchema
    const allowed = ['workoutDayId', 'completed', 'perceivedEffort', 'bodyWeightKg', 'notes'];
    const b = body ?? {};
    const bad =
      Object.keys(b).some((k) => !allowed.includes(k)) ||
      (b.workoutDayId !== undefined && !UUID.test(String(b.workoutDayId))) ||
      (b.completed !== undefined && typeof b.completed !== 'boolean') ||
      (b.perceivedEffort !== undefined && !(Number.isInteger(b.perceivedEffort) && b.perceivedEffort >= 1 && b.perceivedEffort <= 10)) ||
      (b.bodyWeightKg !== undefined && !(typeof b.bodyWeightKg === 'number' && b.bodyWeightKg >= 20 && b.bodyWeightKg <= 500)) ||
      (b.notes !== undefined && (typeof b.notes !== 'string' || b.notes.length > 500));
    if (bad) return this.err(422, 'VALIDATION_ERROR');
    if (plan.status !== 'ACTIVE') return this.err(409, 'PLAN_NOT_ACTIVE');
    if (b.workoutDayId && !plan.workoutDays.some((d: any) => d.id === b.workoutDayId)) return this.err(404, 'NOT_FOUND');
    const entry = {
      id: `log-${++this.seq}`,
      workoutPlanId: id,
      workoutDayId: b.workoutDayId ?? null,
      loggedOn: new Date(Date.UTC(2026, 10, 3, 10, this.seq)).toISOString(),
      completed: b.completed ?? true,
      perceivedEffort: b.perceivedEffort ?? null,
      bodyWeightKg: b.bodyWeightKg !== undefined ? b.bodyWeightKg.toFixed(2) : null, // Prisma Decimal -> string
      notes: b.notes ?? null
    };
    this.logs.set(id, [...(this.logs.get(id) ?? []), entry]);
    return this.respond(201, { success: true, data: entry });
  }
}

export const PLAN_ID = '11111111-1111-4111-8111-111111111111';
export const DAY_ID = '22222222-2222-4222-8222-222222222222';

export const samplePlan = (over: Record<string, unknown> = {}) => ({
  id: PLAN_ID,
  trainerId: 'trainer-secret-id',
  customerProfileId: 'cp-1',
  title: 'Strength Block',
  goal: 'Build strength',
  durationWeeks: 8,
  notes: 'Warm up properly.',
  status: 'ACTIVE',
  workoutDays: [
    {
      id: DAY_ID,
      dayOfWeek: 'MONDAY',
      title: 'Push Day',
      focusArea: 'Chest',
      exercises: [
        { id: 'ex-1', name: 'Bench Press', sets: 4, reps: '8-10', restSeconds: 90, notes: 'Controlled tempo', videoUrl: null },
        { id: 'ex-2', name: 'Push-ups', sets: 3, reps: 'AMRAP', restSeconds: 60, notes: null, videoUrl: null }
      ]
    }
  ],
  ...over
});

const TestStack = createNativeStackNavigator<WorkoutsStackParamList>() as any;
function WorkoutsTestNavigator() {
  return React.createElement(
    TestStack.Navigator,
    { screenOptions: { headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text, contentStyle: { backgroundColor: colors.bg } } },
    React.createElement(TestStack.Screen, { name: 'WorkoutPlans', component: WorkoutPlansScreen, options: { title: 'My workouts' } }),
    React.createElement(TestStack.Screen, { name: 'WorkoutPlan', component: WorkoutPlanScreen, options: { title: 'Workout plan' } })
  );
}

/** Mount the REAL workout screens under the real AuthProvider with a signed-in customer on the fake backend. */
export async function mountWorkouts(backend: FakeWorkoutsBackend, email = 'cust@b.test') {
  if (!backend.users.has(email)) backend.addUser({ email });
  const manager = new SessionManager({ storage: secureSessionStorage, baseUrl: BASE, clientHeader: CLIENT, timeoutMs: 200, fetchImpl: backend.fetch as unknown as typeof fetch });
  await manager.signIn(email, 'Password-123');
  backend.log.length = 0;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, networkMode: 'always' }, mutations: { retry: false, networkMode: 'always' } } });
  const view = render(
    React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(AuthProvider, { manager, children: React.createElement(NavigationContainer, null, React.createElement(WorkoutsTestNavigator)) })
    )
  );
  return { view, manager, uid: backend.users.get(email)!.id };
}
