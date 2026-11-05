import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { FakeWellnessBackend, mountWellness, PLAN_FIXTURE } from '../src/test/fakeWellnessBackend';

const EMAIL = 'cust@b.test';
const CORE = { fullName: 'Asha Rao', heightCm: 165, weightKg: 62, goal: 'weight_loss', activityLevel: 'moderate' };

async function launch(configure?: (b: FakeWellnessBackend, uid: string) => void) {
  const backend = new FakeWellnessBackend();
  backend.addUser({ email: EMAIL, fullName: 'Asha Rao' });
  configure?.(backend, backend.users.get(EMAIL)!.id);
  await mountWellness(backend, EMAIL);
  return backend;
}

const open = async (name: string) => fireEvent.press(await screen.findByRole('button', { name }));
const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));
const posts = (b: FakeWellnessBackend, path: string) => b.log.filter((r) => r.path === path && r.method === 'POST');
const seedRequest = (b: FakeWellnessBackend, uid: string, over: Record<string, unknown> = {}) =>
  b.requestsOf(uid).push({ id: 'req-seed', goal: 'Weight loss', status: 'SUBMITTED', planType: 'complete', durationDays: 30, createdAt: '2026-11-01T10:00:00.000Z', ...over });

describe('diet request gate', () => {
  it('blocked while the health profile is incomplete: no request button, a path to the profile instead', async () => {
    await launch();
    await open('Diet plan');
    expect(await screen.findByText(/Complete your health profile/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Request a diet plan' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open health profile' })).toBeTruthy();
    expect(screen.getByText('No diet plan requests yet')).toBeTruthy();
    expect(screen.getByText('No plans published yet')).toBeTruthy();
  });

  it('blocked while a request is open (status shown), allowed again once it is completed', async () => {
    await launch((b, uid) => {
      b.seedProfile(uid, CORE);
      seedRequest(b, uid, { status: 'IN_REVIEW' });
    });
    await open('Diet plan');
    expect(await screen.findByText('Being reviewed')).toBeTruthy();
    expect(screen.getByText(/already have a request in progress/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Request a diet plan' })).toBeNull();
  });

  it('allowed with a complete profile and no open request', async () => {
    await launch((b, uid) => {
      b.seedProfile(uid, CORE);
      seedRequest(b, uid, { status: 'COMPLETED' });
    });
    await open('Diet plan');
    expect(await screen.findByRole('button', { name: 'Request a diet plan' })).toBeTruthy();
    expect(screen.getByText('Completed')).toBeTruthy();
  });

  it.each([
    ['SUBMITTED', 'Submitted - waiting for a nutritionist'],
    ['ASSIGNED', 'A nutritionist has taken your request'],
    ['PLAN_CREATED', 'Plan ready for your review'],
    ['REVISION_REQUESTED', 'Revision requested'],
    ['REJECTED', 'Not accepted'],
    ['CANCELLED', 'Cancelled']
  ])('request status %s is shown as "%s"', async (status, label) => {
    await launch((b, uid) => {
      b.seedProfile(uid, CORE);
      seedRequest(b, uid, { status });
    });
    await open('Diet plan');
    expect(await screen.findByText(label)).toBeTruthy();
  });

  it('an unknown status is not guessed', async () => {
    await launch((b, uid) => {
      b.seedProfile(uid, CORE);
      seedRequest(b, uid, { status: 'SOMETHING_NEW', durationDays: null });
    });
    await open('Diet plan');
    expect(await screen.findByText('Status unavailable')).toBeTruthy();
    expect(screen.getByLabelText('Duration: Not provided')).toBeTruthy();
  });
});

describe('diet request form', () => {
  async function toForm() {
    await open('Diet plan');
    await open('Request a diet plan');
    await screen.findByText('Your goal');
  }

  it('requires a goal and a plan type (nothing preselected) and sends nothing when invalid', async () => {
    const b = await launch((be, uid) => be.seedProfile(uid, CORE));
    await toForm();
    press('Send request');
    expect(await screen.findByText(/Tell us your goal/)).toBeTruthy();
    expect(screen.getByText('Choose a plan type.')).toBeTruthy();
    expect(posts(b, '/diets/requests')).toHaveLength(0);
    fireEvent.changeText(screen.getByLabelText('Number of days (optional)'), '400');
    press('Weight loss');
    press('Complete plan');
    press('Send request');
    expect(await screen.findByText(/whole number of days from 1 to 365/)).toBeTruthy();
    expect(posts(b, '/diets/requests')).toHaveLength(0);
  });

  it('submits the request without any price, then shows it as submitted', async () => {
    const b = await launch((be, uid) => be.seedProfile(uid, CORE));
    await toForm();
    press('Weight loss');
    press('Two meals a day');
    fireEvent.changeText(screen.getByLabelText('Number of days (optional)'), '14');
    fireEvent.changeText(screen.getByLabelText('Allergies or foods to avoid (optional)'), 'Peanuts');
    press('Send request');
    await waitFor(() => expect(posts(b, '/diets/requests')).toHaveLength(1));
    expect(posts(b, '/diets/requests')[0].body).toEqual({ goal: 'Weight loss', planType: '2meal', durationDays: 14, allergiesExclusions: 'Peanuts' });
    expect(await screen.findByText('Submitted - waiting for a nutritionist')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Request a diet plan' })).toBeNull(); // now blocked: a request is open
  });

  it.each([
    ['network', 'network' as const, /offline/i],
    ['401', [{ status: 401, code: 'UNAUTHORIZED' }, { status: 401, code: 'UNAUTHORIZED' }] as never, /session has ended/i],
    ['403', { status: 403, code: 'FORBIDDEN' }, /not available for your account/i],
    ['404', { status: 404, code: 'NOT_FOUND' }, /could not find that/i],
    ['409', { status: 409, code: 'CONFLICT' }, /conflicts with the current state/i],
    ['422', { status: 422, code: 'VALIDATION_ERROR' }, /check what you entered/i]
  ])('submit failure (%s) is shown with safe copy and is not treated as sent', async (_n, fault, copy) => {
    const b = await launch((be, uid) => be.seedProfile(uid, CORE));
    await toForm();
    press('Weight loss');
    press('Complete plan');
    if (Array.isArray(fault)) b.failNext('/diets/requests', ...(fault as unknown as never[]));
    else b.failNext('/diets/requests', fault as never);
    press('Send request');
    expect(await screen.findByText(copy)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send request' })).toBeTruthy();
    expect(b.requestsOf(b.users.get(EMAIL)!.id)).toHaveLength(0);
  });
});

describe('diet plan view', () => {
  const withPlan = (over: Record<string, unknown> = {}) => (b: FakeWellnessBackend, uid: string) => {
    b.seedProfile(uid, CORE);
    seedRequest(b, uid, { status: 'PLAN_CREATED' });
    b.plansOf(uid).push(PLAN_FIXTURE(over));
  };

  it('lists the plan with its version and status and opens the detail with targets, notes, days and macros as served', async () => {
    await launch(withPlan());
    await open('Diet plan');
    expect(await screen.findByText('Lean Kerala Plan')).toBeTruthy();
    expect(screen.getByText('Version 2')).toBeTruthy();
    expect(screen.getByText('Ready for your review')).toBeTruthy();
    await open('View Lean Kerala Plan');
    expect(await screen.findByLabelText('Calories: 1850 kcal')).toBeTruthy();
    expect(screen.getByLabelText('Protein: 120 g')).toBeTruthy();
    expect(screen.getByLabelText('Fibre: 30 g')).toBeTruthy();
    expect(screen.getByText('Drink water before meals.')).toBeTruthy();
    expect(screen.getByText('Day 1 - Monday')).toBeTruthy();
    expect(screen.getByText('Ragi dosa')).toBeTruthy();
    expect(screen.getByText('320 kcal | Protein 12 g | Carbs 50 g | Fat 6 g')).toBeTruthy();
    expect(screen.getByText('Breakfast - 8:00')).toBeTruthy();
    expect(screen.getByText('Lunch')).toBeTruthy(); // no timing label: nothing invented
    // day 2 is collapsed until opened
    expect(screen.queryByText('Veg stew')).toBeNull();
    press('Day 2 Tuesday');
    expect(screen.getByText('Veg stew')).toBeTruthy();
    // version history exactly as served
    expect(screen.getByText('This is version 2 of your plan.')).toBeTruthy();
    expect(screen.getByText(/revised from an earlier version/)).toBeTruthy();
  });

  it('missing plan values are "Not provided", never zero', async () => {
    await launch(withPlan({ targetCalories: null, fiberGrams: undefined, parentPlanId: null, customerVisibleNotes: null }));
    await open('Diet plan');
    await open('View Lean Kerala Plan');
    expect(await screen.findByLabelText('Calories: Not provided')).toBeTruthy();
    expect(screen.getByLabelText('Fibre: Not provided')).toBeTruthy();
    expect(screen.getByText('There is no earlier version.')).toBeTruthy();
  });

  it('never shows internal clinical notes', async () => {
    await launch(withPlan({ internalClinicalNotes: 'PRIVATE CLINICAL' }));
    await open('Diet plan');
    await open('View Lean Kerala Plan');
    await screen.findByText('Day 1 - Monday');
    expect(screen.queryByText(/PRIVATE CLINICAL/)).toBeNull();
  });

  it('approve asks for confirmation, calls the server once, and shows the server status', async () => {
    const b = await launch(withPlan());
    await open('Diet plan');
    await open('View Lean Kerala Plan');
    await open('Approve this plan');
    expect(posts(b, '/diets/plans/plan-1/approve')).toHaveLength(0);
    press('Yes, approve');
    await waitFor(() => expect(posts(b, '/diets/plans/plan-1/approve')).toHaveLength(1));
    expect(await screen.findByText('Approved by you')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve this plan' })).toBeNull();
  });

  it('revision needs at least 3 characters, then is sent and shown as requested', async () => {
    const b = await launch(withPlan());
    await open('Diet plan');
    await open('View Lean Kerala Plan');
    await open('Request changes');
    fireEvent.changeText(screen.getByLabelText('What should change?'), 'x');
    press('Send change request');
    expect(await screen.findByText(/at least 3 characters/)).toBeTruthy();
    expect(posts(b, '/diets/plans/plan-1/request-revision')).toHaveLength(0);
    fireEvent.changeText(screen.getByLabelText('What should change?'), 'Less rice please');
    press('Send change request');
    await waitFor(() => expect(posts(b, '/diets/plans/plan-1/request-revision')).toHaveLength(1));
    expect(posts(b, '/diets/plans/plan-1/request-revision')[0].body).toEqual({ revisionNotes: 'Less rice please' });
    expect(await screen.findByText('Revision requested')).toBeTruthy();
    expect(screen.getByText('Less rice please')).toBeTruthy();
  });

  it('an approved plan offers no decision buttons', async () => {
    await launch(withPlan({ status: 'APPROVED' }));
    await open('Diet plan');
    await open('View Lean Kerala Plan');
    await screen.findByText('Approved by you');
    expect(screen.queryByRole('button', { name: 'Approve this plan' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Request changes' })).toBeNull();
  });

  it('approve failures (stale 400, 404, network) are shown and the plan is not shown as approved', async () => {
    const b = await launch(withPlan());
    await open('Diet plan');
    await open('View Lean Kerala Plan');
    await open('Approve this plan');
    b.failNext('/diets/plans/plan-1/approve', { status: 400, code: 'BAD_REQUEST' });
    press('Yes, approve');
    expect(await screen.findByText(/no longer possible because the plan has changed/)).toBeTruthy();
    b.failNext('/diets/plans/plan-1/approve', { status: 404, code: 'NOT_FOUND' });
    press('Yes, approve');
    expect(await screen.findByText(/could not find that/i)).toBeTruthy();
    b.failNext('/diets/plans/plan-1/approve', 'network');
    press('Yes, approve');
    expect(await screen.findByText(/offline/i)).toBeTruthy();
    expect(screen.queryByText('Approved by you')).toBeNull();
    expect(b.plansOf(b.users.get(EMAIL)!.id)[0].status).toBe('SUBMITTED');
  });

  it.each([
    ['403', { status: 403, code: 'FORBIDDEN' }, /not available for your account/i],
    ['404', { status: 404, code: 'NOT_FOUND' }, /could not find that/i],
    ['409', { status: 409, code: 'CONFLICT' }, /conflicts with the current state/i],
    ['422', { status: 422, code: 'VALIDATION_ERROR' }, /check what you entered/i],
    ['network', 'network' as const, /offline/i],
    ['500', 500, /having trouble/i]
  ])('plan list load failure (%s) shows safe copy and Try again recovers', async (_n, fault, copy) => {
    const b = await launch(withPlan());
    b.failNext('/diets/my-plans', fault as never);
    await open('Diet plan');
    expect(await screen.findByText(copy)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Lean Kerala Plan')).toBeTruthy();
  });

  it('a 403 on the requests list shows the generic not-available copy, not server text', async () => {
    const b = new FakeWellnessBackend();
    b.addUser({ email: EMAIL, roles: ['CUSTOMER'] });
    await mountWellness(b, EMAIL);
    b.failNext('/diets/my-requests', { status: 403, code: 'FORBIDDEN' });
    await open('Diet plan');
    expect(await screen.findByText(/not available for your account/i)).toBeTruthy();
  });
});
