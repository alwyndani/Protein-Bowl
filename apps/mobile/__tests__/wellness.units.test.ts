import { buildInput, exerciseAnswerOf, exerciseLabel, formFromProfile, splitList, validateForm, validateStep } from '../src/wellness/health/form';
import { buildRequest, dietRequestGate, validateRequest } from '../src/wellness/diet/form';
import { baseWellnessEntries, clearRegisteredWellnessEntries, getWellnessEntries, registerWellnessEntry } from '../src/wellness/entries';

const profile = { id: 'p', name: '', email: 'a@b.test', phone: '', dob: '' };

describe('health form logic', () => {
  it('tri-state exercise: absent is "not answered", false is "no" (never merged)', () => {
    expect(exerciseAnswerOf(undefined)).toBe('unanswered');
    expect(exerciseAnswerOf(null)).toBe('unanswered');
    expect(exerciseAnswerOf(false)).toBe('no');
    expect(exerciseAnswerOf(true)).toBe('yes');
    expect(exerciseLabel(undefined)).toBe('Not answered');
    expect(exerciseLabel(false)).toBe('No');
  });

  it('prefill never invents values', () => {
    const f = formFromProfile(profile);
    expect(f).toMatchObject({ heightCm: '', weightKg: '', goal: '', activityLevel: '', exercise: 'unanswered', gender: '' });
  });

  it('buildInput omits hasExercise when unanswered and sends booleans otherwise', () => {
    const base = { ...formFromProfile(profile), heightCm: '170', weightKg: '70', goal: 'wellness' as const, activityLevel: 'light' as const };
    expect('hasExercise' in buildInput(base, profile)).toBe(false);
    expect(buildInput({ ...base, exercise: 'no' }, profile).hasExercise).toBe(false);
    expect(buildInput({ ...base, exercise: 'yes' }, profile).hasExercise).toBe(true);
  });

  it('health fields are only sent together with the four core values', () => {
    const f = { ...formFromProfile(profile), heightCm: '170', fullName: 'Asha Rao' };
    expect(buildInput(f, profile)).toEqual({ fullName: 'Asha Rao' });
    expect(validateForm(f).requiredTogether).toBeTruthy();
  });

  it('range and date validation', () => {
    const f = formFromProfile(profile);
    expect(validateStep('body', { ...f, heightCm: '49' }).heightCm).toBeTruthy();
    expect(validateStep('body', { ...f, heightCm: '250' }).heightCm).toBeUndefined();
    expect(validateStep('body', { ...f, weightKg: '19.9' }).weightKg).toBeTruthy();
    expect(validateStep('body', { ...f, weightKg: 'abc' }).weightKg).toBeTruthy();
    expect(validateStep('basics', { ...f, dob: '2020-13-01' }).dob).toBeTruthy();
    expect(validateStep('basics', { ...f, dob: '1990-02-28' }).dob).toBeUndefined();
    expect(validateStep('basics', { ...f, dob: '' }).dob).toBeUndefined();
  });

  it('splitList trims and drops empties', () => {
    expect(splitList(' a, b ,, c\n d ')).toEqual(['a', 'b', 'c', 'd']);
    expect(splitList('')).toEqual([]);
  });
});

describe('diet request logic', () => {
  const complete = { ...profile, heightCm: 170, weightKg: 70, goal: 'wellness', activityLevel: 'light' };
  const req = (status: string) => ({ id: 'r', goal: 'g', status, createdAt: '2026-01-01T00:00:00Z' });

  it('gate: needs a complete profile and no open request', () => {
    expect(dietRequestGate(undefined, [])).toEqual({ allowed: false, reason: 'profile' });
    expect(dietRequestGate(profile, [])).toEqual({ allowed: false, reason: 'profile' });
    expect(dietRequestGate(complete, [req('SUBMITTED')])).toEqual({ allowed: false, reason: 'open' });
    expect(dietRequestGate(complete, [req('COMPLETED'), req('CANCELLED'), req('REJECTED')])).toEqual({ allowed: true });
    expect(dietRequestGate(complete, [req('MYSTERY')])).toEqual({ allowed: true });
  });

  it('request body carries no price and omits empty optionals', () => {
    const form = { goal: ' Lose weight ', planType: 'complete' as const, durationDays: '', allergiesExclusions: '', notes: '' };
    expect(validateRequest(form)).toEqual({});
    expect(buildRequest(form)).toEqual({ goal: 'Lose weight', planType: 'complete' });
    expect(Object.keys(buildRequest({ ...form, durationDays: '7', notes: 'n' }))).not.toContain('calculatedPrice');
  });
});

describe('wellness entries registry', () => {
  afterEach(() => clearRegisteredWellnessEntries());
  it('has Health profile and Diet plan, and accepts a registered entry (replacing by key)', () => {
    expect(getWellnessEntries().map((e) => e.title)).toEqual(baseWellnessEntries.map((e) => e.title));
    registerWellnessEntry({ key: 'w', title: 'Workouts', description: 'd', routeName: 'WorkoutsHome' });
    registerWellnessEntry({ key: 'w', title: 'Workouts', description: 'd2', routeName: 'WorkoutsHome' });
    const all = getWellnessEntries();
    expect(all).toHaveLength(3);
    expect(all[2].description).toBe('d2');
  });
});
