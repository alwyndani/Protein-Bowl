import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
const auth = { login: vi.fn(), register: vi.fn(), logout: vi.fn(), user: null, isAuthenticated: false, isLoading: false };
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth, mapBackendRoleToUserRole: () => 'customer' }));
const customer = { getMyProfile: vi.fn(), updateMyProfile: vi.fn() };
vi.mock('../../services/customerService', () => ({ CustomerService: customer }));

const stored = { id: 'c1', name: 'Asha Nair', email: 'asha@example.com', phone: '', dob: '1992-05-10', age: 34, heightCm: 168, weightKg: 62, goal: 'maintenance', activityLevel: 'moderate' };
const blank = { id: '', name: '', email: '', phone: '', dob: '', age: 0, heightCm: 0, weightKg: 0, goal: 'maintenance', activityLevel: 'sedentary' };

async function open(over: Record<string, unknown> = {}) {
  vi.resetModules();
  vi.stubEnv('DEV', false); // no development prefills
  const { AuthModal } = await import('./AuthModal');
  const props = { isOpen: true, onClose: vi.fn(), onSuccessLogin: vi.fn(), onProfileLoaded: vi.fn(), initialProfile: blank as never, ...over };
  render(<AuthModal {...(props as unknown as React.ComponentProps<typeof AuthModal>)} />);
  return props;
}
const signIn = async () => {
  fireEvent.change(document.querySelector('input[type="email"]') as HTMLElement, { target: { value: 'asha@example.com' } });
  fireEvent.change(document.querySelector('input[type="password"]') as HTMLElement, { target: { value: 'Password123!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
};

beforeEach(() => { vi.clearAllMocks(); auth.login.mockResolvedValue({ success: true, roles: ['CUSTOMER'] }); });
afterEach(() => vi.unstubAllEnvs());

describe('sign-in never overwrites a stored health profile', () => {
  it('a customer with a complete stored profile goes straight to the dashboard: no health step, nothing saved', async () => {
    customer.getMyProfile.mockResolvedValue({ success: true, data: stored });
    const p = await open();
    await signIn();
    await waitFor(() => expect(p.onSuccessLogin).toHaveBeenCalledWith(stored));
    expect(p.onClose).toHaveBeenCalled();
    expect(p.onProfileLoaded).not.toHaveBeenCalled();
    expect(customer.updateMyProfile).not.toHaveBeenCalled();
    expect(screen.queryByText(/Step 2 of 2/)).not.toBeInTheDocument();
  });

  it('a customer with an incomplete profile is handed the stored data for a prefilled health step; nothing is saved by signing in', async () => {
    const partial = { ...blank, id: 'c2', name: 'New Person', email: 'new@example.com' };
    customer.getMyProfile.mockResolvedValue({ success: true, data: partial });
    const p = await open();
    await signIn();
    await waitFor(() => expect(p.onProfileLoaded).toHaveBeenCalledWith(partial));
    expect(p.onSuccessLogin).not.toHaveBeenCalled();
    expect(customer.updateMyProfile).not.toHaveBeenCalled();
  });

  it('if the stored profile cannot be loaded the customer sees an error; the app does not assume an empty profile and saves nothing', async () => {
    customer.getMyProfile.mockRejectedValue(new Error('down'));
    const p = await open();
    await signIn();
    expect(await screen.findByText(/could not be loaded.*nothing was changed/i)).toBeInTheDocument();
    expect(p.onSuccessLogin).not.toHaveBeenCalled();
    expect(p.onProfileLoaded).not.toHaveBeenCalled();
    expect(customer.updateMyProfile).not.toHaveBeenCalled();
  });

  it('a wrong password shows the error and loads nothing', async () => {
    auth.login.mockResolvedValue({ success: false, message: 'Invalid email or password' });
    await open();
    await signIn();
    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
    expect(customer.getMyProfile).not.toHaveBeenCalled();
  });

  it('a staff account is signed out again and told to use the staff sign-in (it has no customer profile)', async () => {
    auth.login.mockResolvedValue({ success: true, roles: ['CHEF'] });
    const p = await open();
    await signIn();
    expect(await screen.findByText(/staff account/i)).toBeInTheDocument();
    expect(auth.logout).toHaveBeenCalled();
    expect(customer.getMyProfile).not.toHaveBeenCalled();
    expect(p.onSuccessLogin).not.toHaveBeenCalled();
  });
});

describe('the health step shows stored values and "not entered" as empty', () => {
  it('prefilled from the stored profile; unentered optional fields are empty, never 0 or a preselected option', async () => {
    await open({ initialProfile: stored as never, initialMode: 'health_capture' });
    expect(screen.getByText(/Step 2 of 2/)).toBeInTheDocument();
    const numbers = Array.from(document.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
    const values = numbers.map((i) => i.value);
    expect(values).toContain('168'); // stored height
    expect(values).toContain('62'); // stored weight
    expect(values.filter((v) => v === '0')).toHaveLength(0); // nothing shows "0"
    const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
    const occupation = selects.find((s) => Array.from(s.options).some((o) => o.value === 'Student'))!;
    expect(occupation.value).toBe(''); // "Choose…", not "Student"
    expect(occupation.options[occupation.selectedIndex].text).toBe('Choose…');
  });

  it('a NEW customer\'s health step preselects nothing: main goal, activity level and food preference start on "Choose…" and saving is blocked until goal and activity are chosen', async () => {
    customer.updateMyProfile.mockResolvedValue({ success: true, data: stored });
    await open({ initialProfile: { ...blank, name: 'New Person', email: 'new@example.com', dob: '1992-05-10', gender: 'female' } as never, initialMode: 'health_capture' });
    const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
    const byOption = (value: string) => selects.find((s) => Array.from(s.options).some((o) => o.value === value))!;
    for (const sel of [byOption('weight_loss'), byOption('sedentary'), byOption('Vegetarian')]) {
      expect(sel.value).toBe('');
      expect(sel.options[sel.selectedIndex].text).toBe('Choose…');
    }
    const [height, weight, target] = (Array.from(document.querySelectorAll('input[type="number"]')) as HTMLInputElement[]).slice(0, 3);
    fireEvent.change(height, { target: { value: '168' } });
    fireEvent.change(weight, { target: { value: '62' } });
    fireEvent.change(target, { target: { value: '58' } });
    fireEvent.click(await screen.findByRole('button', { name: /Save Health Profile/ }));
    expect(await screen.findByText(/choose your gender, main goal and activity level/i)).toBeInTheDocument();
    expect(customer.updateMyProfile).not.toHaveBeenCalled();
    fireEvent.change(byOption('weight_loss'), { target: { value: 'weight_loss' } });
    fireEvent.change(byOption('sedentary'), { target: { value: 'light' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Health Profile/ }));
    await waitFor(() => expect(customer.updateMyProfile).toHaveBeenCalled());
    expect(customer.updateMyProfile.mock.calls[0][0]).toMatchObject({ goal: 'weight_loss', activityLevel: 'light', heightCm: 168, weightKg: 62 });
    expect(customer.updateMyProfile.mock.calls[0][0].foodPreference).toBeUndefined(); // never chosen -> never sent
  });

  it('saving the health step sends the stored lists back unchanged (nothing is wiped)', async () => {
    const withLists = { ...stored, gender: 'female', allergies: ['Peanuts'], medicalConditions: ['Asthma'], supplements: ['Vitamin D'], foodDislikes: ['Mushroom'], workoutTypes: ['Yoga'], hasExercise: true, targetWeightKg: 60 };
    customer.updateMyProfile.mockResolvedValue({ success: true, data: withLists });
    const p = await open({ initialProfile: withLists as never, initialMode: 'health_capture' });
    fireEvent.click(await screen.findByRole('button', { name: /complete|save|finish|start/i }));
    await waitFor(() => expect(customer.updateMyProfile).toHaveBeenCalled());
    const sent = customer.updateMyProfile.mock.calls[0][0];
    expect(sent).toMatchObject({ allergies: ['Peanuts'], medicalConditions: ['Asthma'], supplements: ['Vitamin D'], foodDislikes: ['Mushroom'], workoutTypes: ['Yoga'], hasExercise: true });
    void p;
  });
});

describe('sign-up form starts empty in development AND production', () => {
  for (const dev of [true, false]) {
    it(`DEV=${dev}: name, email, phone, date of birth and password are all empty (no demo person)`, async () => {
      vi.resetModules();
      vi.stubEnv('DEV', dev);
      const { AuthModal } = await import('./AuthModal');
      render(<AuthModal {...({ isOpen: true, onClose: vi.fn(), onSuccessLogin: vi.fn(), onProfileLoaded: vi.fn(), initialProfile: blank, initialMode: 'signup' } as unknown as React.ComponentProps<typeof AuthModal>)} />);
      for (const name of ['name', 'email', 'phone', 'dob', 'password']) {
        const input = document.querySelector(`input[name="${name}"]`) as HTMLInputElement | null;
        expect(input, name).not.toBeNull();
        expect(input!.value, name).toBe('');
      }
      expect(document.body.textContent).not.toMatch(/Anjali|98765 43210|1995-04-18/);
    });
  }

  it('the sign-in form is empty too', async () => {
    await open();
    expect((document.querySelector('input[type="email"]') as HTMLInputElement).value).toBe('');
    expect((document.querySelector('input[type="password"]') as HTMLInputElement).value).toBe('');
  });
});

describe('sign-up validates the mobile number before anything is sent', () => {
  it('an invalid number is explained and no account is created', async () => {
    auth.register.mockResolvedValue({ success: true, roles: ['CUSTOMER'] });
    await open({ initialMode: 'signup' });
    for (const [name, value] of [['name', 'Brand New'], ['email', 'brand@example.com'], ['password', 'Password123!'], ['phone', '12ab']]) {
      fireEvent.change(document.querySelector(`input[name="${name}"]`) as HTMLElement, { target: { value } });
    }
    fireEvent.submit(screen.getByRole('button', { name: /Continue to Health Capture/ }).closest('form') as HTMLFormElement);
    expect(await screen.findByText(/valid mobile number/i)).toBeInTheDocument();
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('a number the server reports as already registered (409) is shown as that message, and the health step does not open', async () => {
    auth.register.mockResolvedValue({ success: false, message: 'This mobile number is already registered to another account' });
    await open({ initialMode: 'signup' });
    for (const [name, value] of [['name', 'Brand New'], ['email', 'brand@example.com'], ['password', 'Password123!'], ['phone', '+919000011122']]) {
      fireEvent.change(document.querySelector(`input[name="${name}"]`) as HTMLElement, { target: { value } });
    }
    fireEvent.submit(screen.getByRole('button', { name: /Continue to Health Capture/ }).closest('form') as HTMLFormElement);
    expect(await screen.findByText(/already registered to another account/i)).toBeInTheDocument();
    expect(screen.queryByText(/Step 2 of 2/)).not.toBeInTheDocument();
  });
});

describe('"Skip & Launch Dashboard" really skips (found in the browser: it used to run the save and silently fail)', () => {
  it('skipping opens the dashboard without saving anything; the profile stays empty', async () => {
    const p = await open({ initialProfile: { ...blank, name: 'Skipper', email: 'skip@example.com' } as never, initialMode: 'health_capture' });
    fireEvent.click(await screen.findByRole('button', { name: /Skip & Launch Dashboard/ }));
    expect(p.onSuccessLogin).toHaveBeenCalledTimes(1);
    expect(p.onSuccessLogin.mock.calls[0][0]).toMatchObject({ name: 'Skipper', email: 'skip@example.com', heightCm: 0, weightKg: 0 });
    expect(p.onClose).toHaveBeenCalled();
    expect(customer.updateMyProfile).not.toHaveBeenCalled();
  });

  it('skipping keeps the date of birth and gender entered at registration and sends nothing else (no invented height/weight/goal/activity)', async () => {
    const saved = { ...blank, name: 'Skipper', dob: '1990-04-02', gender: 'female' };
    customer.updateMyProfile.mockResolvedValue({ success: true, data: saved });
    const p = await open({ initialProfile: { ...blank, name: 'Skipper', email: 'skip@example.com', dob: '1990-04-02', gender: 'female' } as never, initialMode: 'health_capture' });
    fireEvent.click(await screen.findByRole('button', { name: /Skip & Launch Dashboard/ }));
    await waitFor(() => expect(p.onSuccessLogin).toHaveBeenCalledWith(saved));
    expect(customer.updateMyProfile).toHaveBeenCalledTimes(1);
    expect(customer.updateMyProfile.mock.calls[0][0]).toEqual({ dob: '1990-04-02', gender: 'female' });
    expect(p.onClose).toHaveBeenCalled();
  });

  it('if the basics cannot be saved the customer sees an error and the modal stays open (never silently discarded)', async () => {
    customer.updateMyProfile.mockRejectedValue(new Error('down'));
    const p = await open({ initialProfile: { ...blank, dob: '1990-04-02', gender: 'male' } as never, initialMode: 'health_capture' });
    fireEvent.click(await screen.findByRole('button', { name: /Skip & Launch Dashboard/ }));
    expect(await screen.findByText(/date of birth and gender could not be saved/i)).toBeInTheDocument();
    expect(p.onSuccessLogin).not.toHaveBeenCalled();
    expect(p.onClose).not.toHaveBeenCalled();
  });
});

describe('sign-up still leads new customers through health capture', () => {
  it('after registering, the health step opens (no profile existed to load)', async () => {
    auth.register.mockResolvedValue({ success: true, roles: ['CUSTOMER'] });
    await open({ initialMode: 'signup' });
    fireEvent.change(document.querySelector('input[name="name"]') as HTMLElement, { target: { value: 'Brand New' } });
    fireEvent.change(document.querySelector('input[name="email"]') as HTMLElement, { target: { value: 'brand@example.com' } });
    fireEvent.change(document.querySelector('input[name="password"]') as HTMLElement, { target: { value: 'Password123!' } });
    const phone = document.querySelector('input[name="phone"]') as HTMLElement | null;
    if (phone) fireEvent.change(phone, { target: { value: '+919000011122' } });
    fireEvent.submit(screen.getByRole('button', { name: /Continue to Health Capture/ }).closest('form') as HTMLFormElement);
    expect(await screen.findByText(/Step 2 of 2/)).toBeInTheDocument();
    expect(auth.register).toHaveBeenCalled();
    expect(customer.getMyProfile).not.toHaveBeenCalled();
    expect(customer.updateMyProfile).not.toHaveBeenCalled(); // nothing is saved until the customer completes the step
  });
});
