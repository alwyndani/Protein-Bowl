import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { FakeWellnessBackend, mountWellness } from '../src/test/fakeWellnessBackend';

const EMAIL = 'cust@b.test';

async function launch(configure?: (b: FakeWellnessBackend, uid: string) => void) {
  const backend = new FakeWellnessBackend();
  backend.addUser({ email: EMAIL, fullName: 'Asha Rao' });
  configure?.(backend, backend.users.get(EMAIL)!.id);
  await mountWellness(backend, EMAIL);
  return backend;
}

const open = async (name: string) => fireEvent.press(await screen.findByRole('button', { name }));
const type = (label: string, value: string) => fireEvent.changeText(screen.getByLabelText(label), value);
const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));
const puts = (b: FakeWellnessBackend) => b.log.filter((r) => r.path === '/customers/me/profile' && r.method === 'PUT');

const FULL = {
  fullName: 'Asha Rao',
  dob: '1995-04-23',
  gender: 'female',
  heightCm: 165,
  weightKg: 62,
  goal: 'weight_loss',
  activityLevel: 'moderate',
  allergies: ['Peanuts'],
  medicalConditions: ['Thyroid'],
  currentMedications: 'Thyronorm 50'
};

async function fillCore() {
  type('Height (cm)', '170');
  type('Weight (kg)', '70');
  press('Moderate');
  press('Next'); // -> goals
  press('Muscle gain');
  press('Next'); // -> food
}

describe('wellness landing', () => {
  it('lists Health profile and Diet plan', async () => {
    await launch();
    expect(await screen.findByRole('button', { name: 'Health profile' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Diet plan' })).toBeTruthy();
  });
});

describe('health profile view', () => {
  it('a profile with nothing provided shows "Not provided" everywhere (no defaults) and no calculated figures', async () => {
    await launch();
    await open('Health profile');
    expect(await screen.findByText('Basics')).toBeTruthy();
    expect(screen.getByLabelText('Height: Not provided')).toBeTruthy();
    expect(screen.getByLabelText('Weight: Not provided')).toBeTruthy();
    expect(screen.getByLabelText('Activity level: Not provided')).toBeTruthy();
    expect(screen.getByLabelText('Main goal: Not provided')).toBeTruthy();
    expect(screen.getByLabelText('Allergies: Not provided')).toBeTruthy();
    expect(screen.getByLabelText('Exercise regularly: Not answered')).toBeTruthy();
    expect(screen.getByLabelText('BMI: Not available')).toBeTruthy();
    expect(screen.getByLabelText('Daily calories target: Not available')).toBeTruthy();
  });

  it('shows recorded values and server-derived figures verbatim; exercise false is "No", not "Not answered"', async () => {
    await launch((b, uid) => b.seedProfile(uid, { ...FULL, hasExercise: false }));
    await open('Health profile');
    expect(await screen.findByLabelText('Height: 165 cm')).toBeTruthy();
    expect(screen.getByLabelText('Weight: 62 kg')).toBeTruthy();
    expect(screen.getByLabelText('Activity level: Moderate')).toBeTruthy();
    expect(screen.getByLabelText('Main goal: Weight loss')).toBeTruthy();
    expect(screen.getByLabelText('Allergies: Peanuts')).toBeTruthy();
    expect(screen.getByLabelText('Current medications: Thyronorm 50')).toBeTruthy();
    expect(screen.getByLabelText('Exercise regularly: No')).toBeTruthy();
    expect(screen.getByLabelText('BMI: 22.8 (Normal)')).toBeTruthy();
    expect(screen.getByLabelText('Daily calories target: 1850 kcal')).toBeTruthy();
    expect(screen.getByLabelText('Protein target: 120 g')).toBeTruthy();
    // still unrecorded: target weight and dislikes
    expect(screen.getByLabelText('Target weight: Not provided')).toBeTruthy();
    expect(screen.getByLabelText('Foods you dislike: Not provided')).toBeTruthy();
  });

  it('exercise true shows Yes', async () => {
    await launch((b, uid) => b.seedProfile(uid, { ...FULL, hasExercise: true }));
    await open('Health profile');
    expect(await screen.findByLabelText('Exercise regularly: Yes')).toBeTruthy();
  });

  it('calories are not available without a date of birth and gender, and the screen says what is missing', async () => {
    await launch((b, uid) => b.seedProfile(uid, { ...FULL, dob: undefined, gender: undefined }));
    await open('Health profile');
    expect(await screen.findByLabelText('BMI: 22.8 (Normal)')).toBeTruthy();
    expect(screen.getByLabelText('Daily calories target: Not available')).toBeTruthy();
    expect(screen.getByText(/Calories and macros need: date of birth, gender/)).toBeTruthy();
  });
});

describe('health profile load errors', () => {
  const cases: Array<[string, any[], RegExp]> = [
    ['401', [{ status: 401, code: 'UNAUTHORIZED' }, { status: 401, code: 'UNAUTHORIZED' }], /session has ended/i],
    ['403', [{ status: 403, code: 'FORBIDDEN' }], /not available for your account/i],
    ['404', [{ status: 404, code: 'NOT_FOUND' }], /could not find that/i],
    ['409', [{ status: 409, code: 'CONFLICT' }], /conflicts with the current state/i],
    ['422', [{ status: 422, code: 'VALIDATION_ERROR' }], /check what you entered/i],
    ['network', ['network'], /offline/i],
    ['500', [500], /having trouble/i]
  ];
  it.each(cases)('%s shows safe copy, never raw server text, and Try again recovers', async (_n, faults, copy) => {
    const b = await launch((be) => be.failNext('/customers/me/profile', ...faults));
    await open('Health profile');
    expect(await screen.findByText(copy)).toBeTruthy();
    expect(screen.queryByText(/server message that must never be shown|UNAUTHORIZED|FORBIDDEN|VALIDATION_ERROR/)).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('Height: Not provided')).toBeTruthy();
    expect(b.log.filter((r) => r.path === '/customers/me/profile' && r.method === 'GET').length).toBeGreaterThanOrEqual(2);
  });
});

describe('health profile edit', () => {
  it('first save: the unanswered exercise question is OMITTED from the request (never sent as false or null) and the saved profile is shown', async () => {
    const b = await launch();
    await open('Health profile');
    await open('Edit health profile');
    await screen.findByText('Step 1 of 4: Basics');
    type('Full name', 'Asha Rao');
    type('Date of birth (YYYY-MM-DD)', '1995-04-23');
    press('Female');
    press('Next');
    await fillCore(); // height 170, weight 70, Moderate, goal Muscle gain; exercise left on "Not answered"
    type('Allergies (separate with commas)', 'Peanuts, Shellfish');
    press('Save health profile');
    await waitFor(() => expect(puts(b)).toHaveLength(1));
    const body = puts(b)[0].body;
    expect(body).toMatchObject({ fullName: 'Asha Rao', dob: '1995-04-23', gender: 'female', heightCm: 170, weightKg: 70, goal: 'muscle_gain', activityLevel: 'moderate', allergies: ['Peanuts', 'Shellfish'] });
    expect('hasExercise' in body).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/null/);
    // back on the view with the server response
    expect(await screen.findByLabelText('Height: 170 cm')).toBeTruthy();
    expect(screen.getByLabelText('Exercise regularly: Not answered')).toBeTruthy();
    expect(screen.getByLabelText('Allergies: Peanuts, Shellfish')).toBeTruthy();
  });

  it('exercise Yes / No are sent as booleans', async () => {
    const b = await launch();
    await open('Health profile');
    await open('Edit health profile');
    await screen.findByText('Step 1 of 4: Basics');
    press('Next');
    type('Height (cm)', '170');
    type('Weight (kg)', '70');
    press('Moderate');
    press('No');
    press('Next');
    press('General wellness');
    press('Next');
    press('Save health profile');
    await waitFor(() => expect(puts(b)).toHaveLength(1));
    expect(puts(b)[0].body.hasExercise).toBe(false);
    expect(puts(b)[0].body.goal).toBe('wellness');
  });

  it('prefills from the server; an answered question cannot be set back to "Not answered", but Yes can become No', async () => {
    const b = await launch((be, uid) => be.seedProfile(uid, { ...FULL, hasExercise: true }));
    await open('Health profile');
    await open('Edit health profile');
    await screen.findByText('Step 1 of 4: Basics');
    expect(screen.getByLabelText('Full name').props.value).toBe('Asha Rao');
    press('Next');
    expect(screen.getByLabelText('Height (cm)').props.value).toBe('165');
    expect(screen.getByRole('button', { name: 'Not answered' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Yes' }).props.accessibilityState.selected).toBe(true);
    press('No');
    press('Next');
    press('Next');
    press('Save health profile');
    await waitFor(() => expect(puts(b)).toHaveLength(1));
    expect(puts(b)[0].body.hasExercise).toBe(false);
    expect(await screen.findByLabelText('Exercise regularly: No')).toBeTruthy();
  });

  it('an unchanged answered question that is left alone keeps its stored value (re-sent as the same boolean)', async () => {
    const b = await launch((be, uid) => be.seedProfile(uid, { ...FULL, hasExercise: true }));
    await open('Health profile');
    await open('Edit health profile');
    await screen.findByText('Step 1 of 4: Basics');
    press('Next');
    press('Next');
    press('Next');
    press('Save health profile');
    await waitFor(() => expect(puts(b)).toHaveLength(1));
    expect(puts(b)[0].body.hasExercise).toBe(true);
  });

  it('an unanswered stored question stays unanswered after saving other changes', async () => {
    const b = await launch((be, uid) => be.seedProfile(uid, { ...FULL }));
    await open('Health profile');
    await open('Edit health profile');
    await screen.findByText('Step 1 of 4: Basics');
    press('Next');
    type('Weight (kg)', '63');
    press('Next');
    press('Next');
    press('Save health profile');
    await waitFor(() => expect(puts(b)).toHaveLength(1));
    expect('hasExercise' in puts(b)[0].body).toBe(false);
    expect(await screen.findByLabelText('Weight: 63 kg')).toBeTruthy();
    expect(screen.getByLabelText('Exercise regularly: Not answered')).toBeTruthy();
  });

  it('validation: out-of-range height and an impossible date stop the step with a message and send nothing', async () => {
    const b = await launch();
    await open('Health profile');
    await open('Edit health profile');
    await screen.findByText('Step 1 of 4: Basics');
    type('Date of birth (YYYY-MM-DD)', '2999-01-01');
    press('Next');
    expect(await screen.findByText('Enter a real date of birth in the past as YYYY-MM-DD.')).toBeTruthy();
    expect(screen.getByText('Step 1 of 4: Basics')).toBeTruthy();
    type('Date of birth (YYYY-MM-DD)', '1990-02-30');
    press('Next');
    expect(await screen.findByText('Enter a real date of birth in the past as YYYY-MM-DD.')).toBeTruthy();
    type('Date of birth (YYYY-MM-DD)', '1990-02-20');
    press('Next');
    type('Height (cm)', '10');
    press('Next');
    expect(await screen.findByText('Height must be between 50 and 250 cm.')).toBeTruthy();
    expect(puts(b)).toHaveLength(0);
  });

  it('validation: health details without all four core values are refused before any request', async () => {
    const b = await launch();
    await open('Health profile');
    await open('Edit health profile');
    await screen.findByText('Step 1 of 4: Basics');
    press('Next');
    type('Height (cm)', '170'); // weight, activity and goal missing
    press('Next');
    press('Next');
    press('Save health profile');
    expect(await screen.findByText(/needed together to save health details/)).toBeTruthy();
    expect(puts(b)).toHaveLength(0);
  });

  it('basics-only save sends only the basics', async () => {
    const b = await launch();
    await open('Health profile');
    await open('Edit health profile');
    await screen.findByText('Step 1 of 4: Basics');
    type('Date of birth (YYYY-MM-DD)', '1995-04-23');
    press('Female');
    press('Next');
    press('Next');
    press('Next');
    press('Save health profile');
    await waitFor(() => expect(puts(b)).toHaveLength(1));
    expect(puts(b)[0].body).toEqual({ dob: '1995-04-23', gender: 'female' });
  });

  it('a failed save is never treated as saved: the form stays, safe copy is shown, and the profile view still has the old data', async () => {
    const b = await launch((be, uid) => {
      be.seedProfile(uid, { ...FULL });
    });
    await open('Health profile');
    await open('Edit health profile');
    await screen.findByText('Step 1 of 4: Basics');
    press('Next');
    type('Weight (kg)', '63');
    press('Next');
    press('Next');
    b.failNext('/customers/me/profile', { status: 422, code: 'HEALTH_PROFILE_INCOMPLETE' });
    press('Save health profile');
    expect(await screen.findByText(/needed together before health details can be saved/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save health profile' })).toBeTruthy();
    expect(b.profileOf(b.users.get(EMAIL)!.id).weightKg).toBe(62);
  });

  it.each([
    ['network', 'network' as const, /offline/i],
    ['403', { status: 403, code: 'FORBIDDEN' }, /not available for your account/i],
    ['409', { status: 409, code: 'PHONE_IN_USE' }, /phone number is already registered/i],
    ['500', 500, /having trouble/i]
  ])('save failure (%s) shows safe copy and stays on the form', async (_n, fault, copy) => {
    const b = await launch((be, uid) => be.seedProfile(uid, { ...FULL }));
    await open('Health profile');
    await open('Edit health profile');
    await screen.findByText('Step 1 of 4: Basics');
    press('Next');
    press('Next');
    press('Next');
    b.failNext('/customers/me/profile', fault as never);
    press('Save health profile');
    expect(await screen.findByText(copy)).toBeTruthy();
    expect(screen.queryByText(/server message that must never be shown/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Save health profile' })).toBeTruthy();
  });
});
