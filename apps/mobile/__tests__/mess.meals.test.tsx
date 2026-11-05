import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { FakeMessBackend, mountMess } from '../src/test/fakeMessBackend';

jest.mock('../src/payments/razorpayBridge', () => ({
  isRazorpayNativeAvailable: () => true,
  isNativeCheckoutOpen: () => false,
  onNativeCheckoutSettled: () => () => undefined,
  onNativeCheckoutStateChange: () => () => undefined,
  openCheckout: jest.fn()
}));

const EMAIL = 'cust@b.test';
const CODE_1 = '482915';
const CODE_2 = '731846';

async function launch() {
  const b = new FakeMessBackend();
  b.addUser({ email: EMAIL, fullName: 'Asha Rao' });
  const uid = b.users.get(EMAIL)!.id;
  b.seedAccount(uid, 'APPROVED');
  const sub = b.seedSubscription(uid, 'ACTIVE');
  b.seedMeals(sub.id, [
    { id: 'm1', date: '2026-12-01', slot: 'LUNCH', canPause: true },
    { id: 'm2', date: '2026-12-02', slot: 'LUNCH', status: 'PAUSED', canPause: false, canResume: true },
    { id: 'm3', date: '2026-12-03', slot: 'LUNCH', canPause: false, reason: 'PAUSE_CUTOFF_PASSED' },
    { id: 'm4', date: '2026-12-04', slot: 'LUNCH', kitchenState: 'OUT_FOR_DELIVERY', canPause: false, reason: 'MEAL_FROZEN' }
  ]);
  const view = await mountMess(b);
  await screen.findByText('Hostel details');
  return { b, uid, sub, ...view };
}
const open = async (navigate: (n: any, p?: object) => void, subscriptionId: string) => {
  await act(async () => {
    navigate('MessCalendar', { subscriptionId });
  });
};
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));
const pressAsync = async (name: string | RegExp) => fireEvent.press(await screen.findByRole('button', { name }));
const posts = (b: FakeMessBackend, re: RegExp) => b.log.filter((r) => r.method === 'POST' && re.test(r.path));

describe('Meal calendar', () => {
  it('renders the server calendar: statuses, pause counters, and only the actions the server allows', async () => {
    const { sub, navigate } = await launch();
    await open(navigate, sub.id);
    expect(await screen.findByText('Pauses used: 0 of 3')).toBeTruthy();
    expect(screen.getByText('Pause or resume at least 12 hours before the meal.')).toBeTruthy();
    expect(screen.getByText('Paused')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pause Lunch, 1 Dec 2026' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Resume Lunch, 2 Dec 2026' })).toBeTruthy();
    // meal 3 / 4: no action, the server's reason is shown
    expect(screen.queryByRole('button', { name: 'Pause Lunch, 3 Dec 2026' })).toBeNull();
    expect(screen.getByText('The cut-off has passed.')).toBeTruthy();
    expect(screen.getByText('The kitchen has started this meal.')).toBeTruthy();
    expect(screen.getByText('A paused meal is not refunded, replaced or added to the end of your plan.')).toBeTruthy();
  });

  it('pausing needs a confirmation that warns the meal is forfeited, sends an empty body, and re-reads the calendar', async () => {
    const { b, sub, navigate } = await launch();
    await open(navigate, sub.id);
    await pressAsync('Pause Lunch, 1 Dec 2026');
    expect(screen.getAllByText('A paused meal is not refunded, replaced or added to the end of your plan.').length).toBe(2); // page note + confirmation
    expect(posts(b, /pause$/).length).toBe(0); // nothing sent before the confirmation
    const reads = b.log.filter((r) => r.path === `/mess/subscriptions/${sub.id}/meals`).length;
    press('Confirm pause Lunch, 1 Dec 2026');
    expect(await screen.findByText('Meal paused.')).toBeTruthy();
    const sent = posts(b, /pause$/);
    expect(sent.length).toBe(1);
    expect(sent[0].path).toBe(`/mess/subscriptions/${sub.id}/meals/m1/pause`);
    expect(sent[0].body).toEqual({});
    await waitFor(() => expect(b.log.filter((r) => r.path === `/mess/subscriptions/${sub.id}/meals`).length).toBeGreaterThan(reads));
    expect(await screen.findByText('Pauses used: 1 of 3')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Resume Lunch, 1 Dec 2026' })).toBeTruthy();
  });

  it('declining the confirmation sends nothing', async () => {
    const { b, sub, navigate } = await launch();
    await open(navigate, sub.id);
    await pressAsync('Pause Lunch, 1 Dec 2026');
    press('Keep this meal');
    expect(posts(b, /pause$/).length).toBe(0);
    expect(screen.getByRole('button', { name: 'Pause Lunch, 1 Dec 2026' })).toBeTruthy();
  });

  it('resume sends an empty body and the meal returns to scheduled', async () => {
    const { b, sub, navigate } = await launch();
    await open(navigate, sub.id);
    await pressAsync('Resume Lunch, 2 Dec 2026');
    expect(await screen.findByText('Meal resumed.')).toBeTruthy();
    expect(posts(b, /resume$/)[0].body).toEqual({});
    expect(await screen.findByRole('button', { name: 'Pause Lunch, 2 Dec 2026' })).toBeTruthy();
  });

  it('a refused pause (cut-off passed, 409) shows mapped copy and the calendar is re-read', async () => {
    const { b, sub, navigate } = await launch();
    await open(navigate, sub.id);
    await pressAsync('Pause Lunch, 1 Dec 2026');
    const meal = b.meals.get(sub.id)![0];
    meal.canPause = false; // the cut-off passed while the screen was open
    meal.reason = 'PAUSE_CUTOFF_PASSED';
    press('Confirm pause Lunch, 1 Dec 2026');
    expect(await screen.findByText('The cut-off for this meal has passed.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Pause Lunch, 1 Dec 2026' })).toBeNull());
    expect(screen.queryByText(/PAUSE_CUTOFF_PASSED/)).toBeNull();
  });

  it('a 422 / network failure on pause is mapped, nothing is claimed as paused', async () => {
    const { b, sub, navigate } = await launch();
    await open(navigate, sub.id);
    await pressAsync('Pause Lunch, 1 Dec 2026');
    b.failNext(`/mess/subscriptions/${sub.id}/meals/m1/pause`, 'network');
    press('Confirm pause Lunch, 1 Dec 2026');
    expect(await screen.findByText('You appear to be offline. Please check your connection and try again.')).toBeTruthy();
    expect(screen.queryByText('Meal paused.')).toBeNull();
    await pressAsync('Pause Lunch, 1 Dec 2026');
    b.failNext(`/mess/subscriptions/${sub.id}/meals/m1/pause`, { status: 422, code: 'VALIDATION_ERROR' });
    press('Confirm pause Lunch, 1 Dec 2026');
    expect(await screen.findByText('Please check what you entered and try again.')).toBeTruthy();
  });

  it('meals not generated yet shows the waiting notice; an unknown subscription is not found; 401 session end is explained', async () => {
    const { b, sub, navigate } = await launch();
    b.mealsReady = false;
    b.meals.set(sub.id, []);
    await open(navigate, sub.id);
    expect(await screen.findByText('Your meals are being scheduled. They will appear here shortly.')).toBeTruthy();
    await open(navigate, 'does-not-exist');
    expect(await screen.findByText('We could not find this subscription.')).toBeTruthy();
  });

  it('a 401 that cannot be refreshed shows the session-ended copy with no retry loop', async () => {
    const { b, sub, navigate } = await launch();
    b.failNext(`/mess/subscriptions/${sub.id}/meals`, 401);
    b.refreshTokens.forEach((v) => (v.revoked = true));
    await open(navigate, sub.id);
    expect(await screen.findByText('Your session has ended. Please sign in again.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(b.count('/auth/mobile/refresh')).toBeGreaterThan(0);
  });
});

describe('Handover code panel', () => {
  const leaks = (spies: jest.SpyInstance[]) => spies.flatMap((s) => s.mock.calls).some((args) => JSON.stringify(args).includes(CODE_1) || JSON.stringify(args).includes(CODE_2));

  it('only meals out for service offer the panel; NOT_AVAILABLE says so and offers no code action', async () => {
    const { b, sub, navigate } = await launch();
    b.handover.set('m4', { state: 'NOT_AVAILABLE', code: null, left: 3 });
    await open(navigate, sub.id);
    expect(screen.queryByRole('button', { name: 'Handover code for Lunch, 1 Dec 2026' })).toBeNull();
    await pressAsync('Handover code for Lunch, 4 Dec 2026');
    expect(await screen.findByText('A handover code is not available for this meal right now.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Generate handover code' })).toBeNull();
  });

  it('view / create / regenerate: the code appears only after creation, in memory only, never logged, never in a URL, never cached or stored', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined));
    const { b, sub, qc, navigate } = await launch();
    b.handover.set('m4', { state: 'NOT_ISSUED', code: null, left: 3 });
    await open(navigate, sub.id);
    await pressAsync('Handover code for Lunch, 4 Dec 2026');
    await pressAsync('Generate handover code');

    // created: the digits are visible and readable by assistive tech
    expect(await screen.findByText(CODE_1)).toBeTruthy();
    expect(screen.getByLabelText('Handover code 4 8 2 9 1 5')).toBeTruthy();
    expect(screen.getByText('New codes left: 3')).toBeTruthy();
    expect(posts(b, /handover-code$/)[0].body).toEqual({});

    // hide / show
    press('Hide code');
    expect(screen.queryByText(CODE_1)).toBeNull();
    expect(screen.getByLabelText('Handover code hidden')).toBeTruthy();
    press('Show code');
    expect(screen.getByText(CODE_1)).toBeTruthy();

    // regenerate needs a confirmation and warns the old code stops working
    press('Generate a new code');
    expect(screen.getByText('The previous code stops working as soon as a new one is generated.')).toBeTruthy();
    expect(posts(b, /regenerate$/).length).toBe(0);
    press('Confirm new code');
    expect(await screen.findByText(CODE_2)).toBeTruthy();
    expect(screen.queryByText(CODE_1)).toBeNull();
    expect(screen.getByText('New codes left: 2')).toBeTruthy();

    // closing the panel drops the plaintext; reopening shows only the state (code shown once)
    press('Done');
    expect(screen.queryByText(CODE_2)).toBeNull();
    expect(screen.getByText(/shown only once/)).toBeTruthy();
    press('Close handover code');
    await pressAsync('Handover code for Lunch, 4 Dec 2026');
    expect(await screen.findByText(/shown only once/)).toBeTruthy();
    expect(screen.queryByText(CODE_2)).toBeNull();

    // the code never appears in any request URL, the query/mutation caches, or console output
    expect(b.log.some((r) => r.path.includes(CODE_1) || r.path.includes(CODE_2))).toBe(false);
    expect(JSON.stringify(qc.getQueryCache().getAll().map((q) => q.state.data))).not.toMatch(new RegExp(`${CODE_1}|${CODE_2}`));
    expect(JSON.stringify(qc.getMutationCache().getAll().map((m) => m.state.data))).not.toMatch(new RegExp(`${CODE_1}|${CODE_2}`));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const store = (require('expo-secure-store') as { __store: Map<string, string> }).__store;
    expect([...store.values()].join('|')).not.toMatch(new RegExp(`${CODE_1}|${CODE_2}`));
    expect(leaks(spies)).toBe(false);
    spies.forEach((s) => s.mockRestore());
  });

  it('a state read that says ISSUED_TO_YOU never contains the code and the panel does not invent one', async () => {
    const { b, sub, navigate } = await launch();
    b.handover.set('m4', { state: 'ISSUED_TO_YOU', code: CODE_1, left: 1 });
    await open(navigate, sub.id);
    await pressAsync('Handover code for Lunch, 4 Dec 2026');
    expect(await screen.findByText(/shown only once/)).toBeTruthy();
    expect(screen.queryByText(CODE_1)).toBeNull();
    expect(screen.getByText('New codes left: 1')).toBeTruthy();
    const state = b.log.find((r) => r.path.endsWith('/handover-code') && r.method === 'GET')!;
    expect(state.path).not.toContain('?');
  });

  it('regeneration limit reached: no new-code action, the server limit is explained', async () => {
    const { b, sub, navigate } = await launch();
    b.handover.set('m4', { state: 'ISSUED_TO_YOU', code: CODE_1, left: 0 });
    await open(navigate, sub.id);
    await pressAsync('Handover code for Lunch, 4 Dec 2026');
    expect(await screen.findByText('The maximum number of new codes has been reached.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Generate a new code' })).toBeNull();
  });

  it('issued to another resident, locked and verified states are explained without any code action', async () => {
    const { b, sub, navigate } = await launch();
    b.handover.set('m4', { state: 'ISSUED_TO_ANOTHER', code: null, left: 3 });
    await open(navigate, sub.id);
    await pressAsync('Handover code for Lunch, 4 Dec 2026');
    expect(await screen.findByText('A handover code was already issued to another resident of your service point.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Generate handover code' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Generate a new code' })).toBeNull();
  });

  it('a 409 on create (somebody else got there first) is mapped and the state is re-read', async () => {
    const { b, sub, navigate } = await launch();
    b.handover.set('m4', { state: 'NOT_ISSUED', code: null, left: 3 });
    await open(navigate, sub.id);
    await pressAsync('Handover code for Lunch, 4 Dec 2026');
    const create = await screen.findByRole('button', { name: 'Generate handover code' });
    b.handover.get('m4')!.state = 'ISSUED_TO_ANOTHER'; // another resident generated it a second ago
    fireEvent.press(create);
    expect((await screen.findAllByText('A handover code was already issued to another resident of your service point.')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/HANDOVER_CODE/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Generate handover code' })).toBeNull(); // the state was re-read
  });

  it('a network failure on create shows safe copy and no code', async () => {
    const { b, sub, navigate } = await launch();
    b.handover.set('m4', { state: 'NOT_ISSUED', code: null, left: 3 });
    await open(navigate, sub.id);
    await pressAsync('Handover code for Lunch, 4 Dec 2026');
    const create = await screen.findByRole('button', { name: 'Generate handover code' });
    b.failNext(`/mess/subscriptions/${sub.id}/meals/m4/handover-code`, 'network');
    fireEvent.press(create);
    expect(await screen.findByText('You appear to be offline. Please check your connection and try again.')).toBeTruthy();
    expect(screen.queryByText(CODE_1)).toBeNull();
  });
});
