import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('../../services/customerService', () => ({ CustomerService: { updateMyProfile: vi.fn() } }));

import { CustomerService } from '../../services/customerService';
import { BLANK_CUSTOMER_PROFILE } from '../../data/blankProfile';
import { HealthProfileTab } from './HealthProfileTab';

const update = vi.mocked(CustomerService.updateMyProfile);
const complete = { ...BLANK_CUSTOMER_PROFILE, weightKg: 70, heightCm: 170, age: 30, gender: 'female' as const };

beforeEach(() => vi.clearAllMocks());

describe('HealthProfileTab saves honestly', () => {
  it('shows no invented history row before anything was saved', () => {
    render(<HealthProfileTab profile={complete} onUpdateProfile={vi.fn()} />);
    expect(screen.getByText('No changes saved in this visit yet.')).toBeInTheDocument();
    expect(screen.queryByText(/\(Initial\)/)).not.toBeInTheDocument();
  });

  it('a customer with NO stored profile sees "Not provided", never "0 cm / 0 kg", "(0 yrs)" or the placeholder activity level (found in the browser)', () => {
    render(<HealthProfileTab profile={{ ...BLANK_CUSTOMER_PROFILE, name: 'Skipper', email: 's@example.com' }} onUpdateProfile={vi.fn()} />);
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/0 cm|0 kg|\(0 yrs\)|Sedentary/i);
    expect(text).toContain('Not provided');
  });

  it('a failed save shows an error, keeps editing and reports nothing as saved', async () => {
    update.mockRejectedValue(new Error('offline'));
    const onUpdate = vi.fn();
    render(<HealthProfileTab profile={complete} onUpdateProfile={onUpdate} />);
    fireEvent.click(screen.getByRole('button', { name: /Edit Health Data/ }));
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }));
    expect(await screen.findByText('Your changes could not be saved. Please try again.')).toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText('No changes saved in this visit yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Changes/ })).toBeInTheDocument();
  });

  it('a successful save uses the server copy and records the change', async () => {
    const stored = { ...complete, weightKg: 70 };
    update.mockResolvedValue({ success: true, data: stored } as never);
    const onUpdate = vi.fn();
    render(<HealthProfileTab profile={complete} onUpdateProfile={onUpdate} />);
    fireEvent.click(screen.getByRole('button', { name: /Edit Health Data/ }));
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(stored));
    expect(screen.queryByText('No changes saved in this visit yet.')).not.toBeInTheDocument();
  });

  const phoneInput = () => screen.getByDisplayValue('+919000011122') as HTMLInputElement;
  const withPhone = { ...complete, phone: '+919000011122' };

  it('the mobile number is sent only when the customer changed it, and the saved number comes back from the server (persists after reload)', async () => {
    const stored = { ...withPhone, phone: '+919000099999' };
    update.mockResolvedValue({ success: true, data: stored } as never);
    const onUpdate = vi.fn();
    render(<HealthProfileTab profile={withPhone} onUpdateProfile={onUpdate} />);
    fireEvent.click(screen.getByRole('button', { name: /Edit Health Data/ }));
    fireEvent.change(phoneInput(), { target: { value: '+919000099999' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(stored));
    expect(update.mock.calls[0][1]).toEqual({ phone: true });
    expect(update.mock.calls[0][0]).toMatchObject({ phone: '+919000099999' });
  });

  it('an unchanged number is not sent along with a health save', async () => {
    update.mockResolvedValue({ success: true, data: withPhone } as never);
    render(<HealthProfileTab profile={withPhone} onUpdateProfile={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Edit Health Data/ }));
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][1]).toEqual({ phone: false });
  });

  it('a number already used by another account is reported (not silently dropped) and nothing is shown as saved', async () => {
    update.mockResolvedValue({ success: false, error: 'PHONE_IN_USE', httpStatus: 409, message: 'x' } as never);
    const onUpdate = vi.fn();
    render(<HealthProfileTab profile={withPhone} onUpdateProfile={onUpdate} />);
    fireEvent.click(screen.getByRole('button', { name: /Edit Health Data/ }));
    fireEvent.change(phoneInput(), { target: { value: '+919000055555' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }));
    expect(await screen.findByText(/already registered to another account/i)).toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Save Changes/ })).toBeInTheDocument(); // still editing
  });

  it('an invalid number is explained', async () => {
    update.mockResolvedValue({ success: false, error: 'VALIDATION_ERROR', httpStatus: 422, message: 'Validation failed: phone: Enter a valid mobile number' } as never);
    render(<HealthProfileTab profile={withPhone} onUpdateProfile={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Edit Health Data/ }));
    fireEvent.change(phoneInput(), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }));
    expect(await screen.findByText(/valid mobile number/i)).toBeInTheDocument();
  });

  it('refuses to save (and sends nothing) while a required measurement is missing', async () => {
    render(<HealthProfileTab profile={{ ...complete, weightKg: 0 }} onUpdateProfile={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Edit Health Data/ }));
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }));
    expect(await screen.findByText('Enter your weight, height, age and gender before saving.')).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });
});

describe('women-only answers and "Do you exercise?": visible, editable, and unanswered stays unanswered', () => {
  const sel = (id: string) => document.getElementById(id) as HTMLSelectElement;
  const open = () => fireEvent.click(screen.getByRole('button', { name: /Edit Health Data/ }));

  it('saved answers are shown exactly as saved (No / Yes) and an unanswered question reads "Not provided" (never No)', () => {
    render(<HealthProfileTab profile={{ ...complete, isPregnant: false, isBreastfeeding: true, hasExercise: false }} onUpdateProfile={vi.fn()} />);
    const women = screen.getByTestId('womens-health');
    expect(women).toHaveTextContent(/Pregnant\?\s*No/);
    expect(women).toHaveTextContent(/Breastfeeding\?\s*Yes/);
    expect(women).toHaveTextContent(/Menopause\?\s*Not provided/);
    expect(women).toHaveTextContent(/Menstrual cycle\s*Not provided/);
    expect(document.body.textContent).toMatch(/Do you exercise regularly\?\s*No/);
  });

  it('the women-only block appears only for a female profile', () => {
    const male = render(<HealthProfileTab profile={{ ...complete, gender: 'male' }} onUpdateProfile={vi.fn()} />);
    expect(screen.queryByTestId('womens-health')).not.toBeInTheDocument();
    male.unmount();
    render(<HealthProfileTab profile={complete} onUpdateProfile={vi.fn()} />);
    expect(screen.getByTestId('womens-health')).toBeInTheDocument();
  });

  it('"Do you exercise?" has NO default: a customer who never answered sees "Not provided", the select starts on "Choose…", and nothing is sent', async () => {
    update.mockResolvedValue({ success: true, data: { ...complete } } as never);
    render(<HealthProfileTab profile={complete} onUpdateProfile={vi.fn()} />);
    expect(document.body.textContent).toMatch(/Do you exercise regularly\?\s*Not provided/);
    open();
    expect(sel('hp-has-exercise').value).toBe('');
    expect(sel('hp-pregnant').value).toBe('');
    expect(sel('hp-breastfeeding').value).toBe('');
    expect(sel('hp-menopause').value).toBe('');
    expect(sel('hp-cycle').value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const sent = update.mock.calls[0][0] as Record<string, unknown>;
    for (const k of ['hasExercise', 'isPregnant', 'isBreastfeeding', 'isMenopause', 'menstrualCycle']) expect(k in sent && sent[k] !== undefined, k).toBe(false);
  });

  it('editing: a chosen answer is sent exactly as chosen (true / false), other unanswered ones stay omitted', async () => {
    update.mockResolvedValue({ success: true, data: { ...complete, isPregnant: false, isBreastfeeding: true, hasExercise: true, menstrualCycle: 'Irregular' } } as never);
    const onUpdate = vi.fn();
    render(<HealthProfileTab profile={complete} onUpdateProfile={onUpdate} />);
    open();
    fireEvent.change(sel('hp-pregnant'), { target: { value: 'no' } });
    fireEvent.change(sel('hp-breastfeeding'), { target: { value: 'yes' } });
    fireEvent.change(sel('hp-has-exercise'), { target: { value: 'yes' } });
    fireEvent.change(sel('hp-cycle'), { target: { value: 'Irregular' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const sent = update.mock.calls[0][0] as Record<string, unknown>;
    expect(sent).toMatchObject({ isPregnant: false, isBreastfeeding: true, hasExercise: true, menstrualCycle: 'Irregular' });
    expect(sent.isMenopause).toBeUndefined(); // never answered: still not sent
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    // after the save the values are shown as answered
    expect(screen.getByTestId('womens-health')).toHaveTextContent(/Pregnant\?\s*No/);
  });

  it('persistence: a saved answer comes back from the server profile and is preselected for editing; "Choose…" is no longer offered for it', () => {
    render(<HealthProfileTab profile={{ ...complete, isPregnant: false, isBreastfeeding: true, hasExercise: true }} onUpdateProfile={vi.fn()} />);
    open();
    expect(sel('hp-pregnant').value).toBe('no');
    expect(sel('hp-breastfeeding').value).toBe('yes');
    expect(sel('hp-has-exercise').value).toBe('yes');
    expect([...sel('hp-pregnant').options].map((o) => o.value)).toEqual(['no', 'yes']); // a saved answer cannot be silently reset to unanswered
    expect([...sel('hp-menopause').options].map((o) => o.value)).toEqual(['', 'no', 'yes']); // still unanswered: may stay so
  });

  it('editing ONE answer sends every other saved value unchanged and invents nothing new (no extra defaults, no zeros)', async () => {
    const saved = { ...complete, isPregnant: false, isBreastfeeding: true, hasExercise: false, allergies: ['Peanuts'], medicalConditions: ['Asthma'], occupation: 'Teacher', foodPreference: 'Vegetarian' as const };
    update.mockResolvedValue({ success: true, data: { ...saved, isMenopause: true } } as never);
    render(<HealthProfileTab profile={saved} onUpdateProfile={vi.fn()} />);
    open();
    fireEvent.change(sel('hp-menopause'), { target: { value: 'yes' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const sent = update.mock.calls[0][0] as Record<string, unknown>;
    expect(sent).toMatchObject({ isMenopause: true, isPregnant: false, isBreastfeeding: true, hasExercise: false, allergies: ['Peanuts'], medicalConditions: ['Asthma'], occupation: 'Teacher', heightCm: 170, weightKg: 70 });
    expect(sent.menstrualCycle).toBeUndefined(); // never answered: not sent, not invented
  });

  it('cancel discards the edit and restores what was saved', () => {
    render(<HealthProfileTab profile={{ ...complete, isPregnant: false }} onUpdateProfile={vi.fn()} />);
    open();
    fireEvent.change(sel('hp-pregnant'), { target: { value: 'yes' } });
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    expect(screen.getByTestId('womens-health')).toHaveTextContent(/Pregnant\?\s*No/);
  });
});
