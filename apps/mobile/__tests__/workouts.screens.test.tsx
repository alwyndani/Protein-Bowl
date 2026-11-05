import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { DAY_ID, FakeWorkoutsBackend, mountWorkouts, PLAN_ID, samplePlan } from '../src/test/fakeWorkoutsBackend';
import { validateLog } from '../src/workouts/logForm';

const press = async (name: string | RegExp) => fireEvent.press(await screen.findByRole('button', { name }));
const trainerCalls = (b: FakeWorkoutsBackend) => b.log.filter((r) => r.path.startsWith('/trainer'));
const field = (label: string) => screen.getByLabelText(label);

async function launch(configure?: (b: FakeWorkoutsBackend, uid: () => string) => void) {
  const backend = new FakeWorkoutsBackend();
  let id = '';
  const m = await (async () => {
    backend.addUser({ email: 'cust@b.test' });
    id = backend.users.get('cust@b.test')!.id;
    configure?.(backend, () => id);
    return mountWorkouts(backend);
  })();
  return { backend, ...m };
}

const withPlan = (over: Record<string, unknown> = {}) => (b: FakeWorkoutsBackend, uid: () => string) => b.plans.set(uid(), [samplePlan(over)]);
const openPlan = async () => press(/^Strength Block/);

describe('plans list', () => {
  it('shows the assigned plans as served', async () => {
    const { backend } = await launch(withPlan());
    expect(await screen.findByText('Strength Block')).toBeTruthy();
    expect(screen.getByText('Goal: Build strength')).toBeTruthy();
    expect(screen.getByText('8 weeks')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(trainerCalls(backend).map((r) => `${r.method} ${r.path}`)).toEqual(['GET /trainer/my/plans']);
    expect(screen.queryByText(/trainer-secret-id/)).toBeNull();
  });

  it('shows the empty state when no trainer is assigned', async () => {
    await launch();
    expect(await screen.findByText('No workout plan yet')).toBeTruthy();
  });

  it('shows Not provided for missing plan values (no default invented)', async () => {
    await launch(withPlan({ goal: null, durationWeeks: null }));
    await screen.findByText('Strength Block');
    expect(screen.getByText('Goal: Not provided')).toBeTruthy();
    expect(screen.getByText('Duration: Not provided')).toBeTruthy();
  });

  it.each([
    ['401', 401, /session has ended/i],
    ['403', 403, /not available for your account/i],
    ['404', 404, /could not find that/i],
    ['422', 422, /check what you entered/i]
  ])('%s shows fixed copy, never server text', async (_n, status, re) => {
    await launch((b, uid) => {
      withPlan()(b, uid);
      // a 401 triggers one refresh + retry, so the second 401 is the final answer
      b.failNext('/trainer/my/plans', ...(status === 401 ? [401, 401] : [status as number]));
    });
    expect(await screen.findByText(re)).toBeTruthy();
    expect(screen.queryByText(/server message that must never be shown/)).toBeNull();
  });

  it('a network failure offers a retry that recovers', async () => {
    await launch((b, uid) => {
      withPlan()(b, uid);
      b.failNext('/trainer/my/plans', 'network');
    });
    expect(await screen.findByText(/appear to be offline/i)).toBeTruthy();
    await press('Try again');
    expect(await screen.findByText('Strength Block')).toBeTruthy();
  });
});

describe('plan detail', () => {
  it('renders days, exercises, notes and status exactly as served', async () => {
    await launch(withPlan());
    await openPlan();
    expect((await screen.findAllByText('Monday - Push Day')).length).toBeGreaterThan(0);
    expect(screen.getByText('Focus: Chest')).toBeTruthy();
    expect(screen.getByText('Bench Press')).toBeTruthy();
    expect(screen.getByText('4 sets · 8-10 reps · rest 90s')).toBeTruthy();
    expect(screen.getByText('Controlled tempo')).toBeTruthy();
    expect(screen.getByText('Warm up properly.')).toBeTruthy();
    expect(await screen.findByText('No progress logged yet.')).toBeTruthy();
  });

  it('missing trainer notes read Not provided', async () => {
    await launch(withPlan({ notes: null }));
    await openPlan();
    expect(await screen.findByText('Not provided')).toBeTruthy();
  });

  it('a completed plan has no log form', async () => {
    await launch(withPlan({ status: 'COMPLETED' }));
    await openPlan();
    expect(await screen.findByText(/no longer be logged/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save progress' })).toBeNull();
  });
});

describe('progress log', () => {
  it('submits a valid log, sends only allowed fields, and refreshes history from the server', async () => {
    const { backend } = await launch(withPlan());
    await openPlan();
    await press(/^Monday - Push Day$/);
    fireEvent.changeText(field('Effort (1-10)'), '7');
    fireEvent.changeText(field('Body weight (kg)'), '72.5');
    fireEvent.changeText(field('Notes'), '  felt strong  ');
    await press('Save progress');
    expect(await screen.findByText('Progress saved.')).toBeTruthy();
    const post = trainerCalls(backend).find((r) => r.method === 'POST')!;
    expect(post.path).toBe(`/trainer/my/plans/${PLAN_ID}/logs`);
    expect(post.body).toEqual({ workoutDayId: DAY_ID, completed: true, perceivedEffort: 7, bodyWeightKg: 72.5, notes: 'felt strong' });
    expect(await screen.findByText('Effort: 7/10')).toBeTruthy();
    expect(screen.getByText('Body weight: 72.50 kg')).toBeTruthy();
    expect(screen.getByText('felt strong')).toBeTruthy();
  });

  it('an empty log (skipped, nothing else) sends only completed and shows Not provided for the rest', async () => {
    const { backend } = await launch(withPlan());
    await openPlan();
    await press('Skipped');
    await press('Save progress');
    await screen.findByText('Effort: Not provided');
    expect(trainerCalls(backend).find((r) => r.method === 'POST')!.body).toEqual({ completed: false });
    expect(screen.getByText('Body weight: Not provided')).toBeTruthy();
    expect(screen.getByText(/IST · Skipped$/)).toBeTruthy();
  });

  it('invalid values are rejected locally and nothing is sent', async () => {
    const { backend } = await launch(withPlan());
    await openPlan();
    fireEvent.changeText(await screen.findByLabelText('Effort (1-10)'), '11');
    fireEvent.changeText(field('Body weight (kg)'), '10');
    await press('Save progress');
    expect(await screen.findByText('Enter a whole number from 1 to 10.')).toBeTruthy();
    expect(screen.getByText('Enter a weight from 20 to 500 kg.')).toBeTruthy();
    expect(trainerCalls(backend).some((r) => r.method === 'POST')).toBe(false);
  });

  it('a server 422 is shown as fixed copy and is NOT reported as saved', async () => {
    const { backend } = await launch(withPlan());
    await openPlan();
    await screen.findByText('Bench Press');
    backend.failNext(`/trainer/my/plans/${PLAN_ID}/logs`, 422);
    await press('Save progress');
    expect(await screen.findByText(/check what you entered/i)).toBeTruthy();
    expect(screen.queryByText('Progress saved.')).toBeNull();
  });

  it('409 (plan no longer active) and a network failure are reported honestly, not as success', async () => {
    const { backend } = await launch(withPlan());
    await openPlan();
    await screen.findByText('Bench Press');
    backend.failNext(`/trainer/my/plans/${PLAN_ID}/logs`, 409);
    await press('Save progress');
    expect(await screen.findByText(/no longer active, so progress cannot be logged/i)).toBeTruthy();
    backend.failNext(`/trainer/my/plans/${PLAN_ID}/logs`, 'network');
    await press('Save progress');
    expect(await screen.findByText(/appear to be offline/i)).toBeTruthy();
    expect(screen.queryByText('Progress saved.')).toBeNull();
    expect(backend.logs.get(PLAN_ID) ?? []).toEqual([]);
  });

  it('a failed history load shows an error (not an empty history) and can be reloaded', async () => {
    await launch((b, uid) => {
      withPlan()(b, uid);
      b.failNext(`/trainer/my/plans/${PLAN_ID}/logs`, 403);
    });
    await openPlan();
    expect(await screen.findByText(/not available for your account/i)).toBeTruthy();
    expect(screen.queryByText('No progress logged yet.')).toBeNull();
    await press('Reload progress');
    await waitFor(() => expect(screen.getByText('No progress logged yet.')).toBeTruthy());
  });
});

describe('history', () => {
  it('lists logs newest first with the session name and as-served values', async () => {
    await launch((b, uid) => {
      b.plans.set(uid(), [samplePlan()]);
      b.logs.set(PLAN_ID, [
        { id: 'l1', workoutPlanId: PLAN_ID, workoutDayId: null, loggedOn: '2026-11-01T04:30:00.000Z', completed: true, perceivedEffort: 5, bodyWeightKg: '70.00', notes: null },
        { id: 'l2', workoutPlanId: PLAN_ID, workoutDayId: DAY_ID, loggedOn: '2026-11-02T04:30:00.000Z', completed: false, perceivedEffort: null, bodyWeightKg: null, notes: 'rest day' }
      ]);
    });
    await openPlan();
    expect(await screen.findByText('2 Nov 2026, 10:00 am IST · Skipped')).toBeTruthy();
    expect(screen.getByText('1 Nov 2026, 10:00 am IST · Completed')).toBeTruthy();
    expect(screen.getByText('Body weight: 70.00 kg')).toBeTruthy();
    expect(screen.getByText('rest day')).toBeTruthy();
  });
});

describe('ownership', () => {
  it('another customer never receives this customer plans', async () => {
    const { backend } = await launch(withPlan());
    backend.addUser({ email: 'other@b.test' });
    const res = await backend.fetch('https://api.test/api/v1/trainer/my/plans', { headers: { Authorization: 'Bearer nope' } });
    expect(res.status).toBe(401);
  });
});

describe('validateLog (mirrors the server schema)', () => {
  const base = { workoutDayId: null, completed: true, effort: '', weight: '', notes: '' };
  it('accepts bounds and rejects outside them', () => {
    expect(validateLog({ ...base, effort: '1', weight: '20' }).ok).toBe(true);
    expect(validateLog({ ...base, effort: '10', weight: '500' }).ok).toBe(true);
    for (const effort of ['0', '11', '1.5', 'abc', '-1']) expect(validateLog({ ...base, effort }).ok).toBe(false);
    for (const weight of ['19.9', '500.1', 'x', '70.123', '-5']) expect(validateLog({ ...base, weight }).ok).toBe(false);
    expect(validateLog({ ...base, notes: 'a'.repeat(501) }).ok).toBe(false);
    expect(validateLog({ ...base, notes: 'a'.repeat(500) }).ok).toBe(true);
  });
});
