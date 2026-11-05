import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('../../services/dietService', () => ({ DietService: { publishDietPlan: vi.fn() } }));
vi.mock('../../services/recipeService', () => ({ RecipeService: { getStaffRecipes: vi.fn() } }));

import { DietService } from '../../services/dietService';
import { RecipeService } from '../../services/recipeService';
import { NutritionistDashboard } from './NutritionistDashboard';

const getRecipes = vi.mocked(RecipeService.getStaffRecipes);
const publish = vi.mocked(DietService.publishDietPlan);
const page = (items: unknown[]) => ({ items, recipes: items, total: items.length, page: 1, limit: 100, totalPages: 1 }) as never;
const recipe = (id: string, name: string, over: Record<string, unknown> = {}) =>
  ({ id, name, category: 'Salads', cuisine: 'Indian', calories: 300, protein: 20, carbs: 30, fat: 8, servingGrams: 250, image: '', isPublished: true, ...over });

const KEYS = ['breakfast', 'morning_snack', 'lunch', 'evening_snack', 'dinner'] as const;
const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
type Slot = Record<string, unknown>;
const week = (dayOne: Record<string, Slot>, others: Slot | null = null) =>
  NAMES.map((dayName, i) => ({
    dayNumber: i + 1,
    dayName,
    // 999 is a STALE stored total: the dashboard must recompute from the values that exist
    totalCalories: 999, totalProtein: 999, totalCarbs: 999, totalFat: 999,
    meals: KEYS.map((k) => ({ mealType: k, timingLabel: k, ...((i === 0 ? dayOne[k] : k === 'breakfast' ? others : null) ?? { items: [] }) }))
  }));

const baseRequest = {
  id: 'r1', customerId: 'c1', customerName: 'Asha', customerEmail: 'a@test.com', customerPhone: '', bmi: 0, goal: 'weight_loss', targetCalories: 1800,
  planType: 'standard', durationDays: 7, preferredCategories: [], dietaryPreference: 'veg', cuisinePreference: '', grainPreference: '', spiceLevel: 'Mild',
  allergiesExclusions: '', status: 'under_review', createdAt: '2026-10-01'
};
// Monday: a saved single-dish breakfast that recorded NO nutrition and NO portion, and a lunch that really is 0 kcal / 0 g
const INCOMPLETE_MONDAY = {
  breakfast: { recipeId: 'a', recipeName: 'Quinoa Salad' },
  lunch: { recipeId: 'z', recipeName: 'Plain Water', customPortionGrams: 100, calories: 0, protein: 0, carbs: 0, fat: 0 }
};

const mount = (dayWisePlan: unknown, onUpdatePlan = vi.fn()) => {
  const user = userEvent.setup();
  render(<NutritionistDashboard requests={[{ ...baseRequest, dayWisePlan } as never]} onUpdatePlan={onUpdatePlan} onOpenMenuModal={() => {}} />);
  return { user, onUpdatePlan };
};
const sendButton = () => screen.getByRole('button', { name: /finalize & send plan/i });
const catalogueLoaded = async () => {
  await waitFor(() => expect(getRecipes).toHaveBeenCalled());
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  getRecipes.mockResolvedValue(page([recipe('a', 'Quinoa Salad')]));
});

describe('missing nutrition is shown as "Not provided", never as 0 or a default portion', () => {
  it('shows Not provided for every missing value and an empty portion, with the reason', async () => {
    mount(week(INCOMPLETE_MONDAY));
    expect(await screen.findByText('Quinoa Salad')).toBeInTheDocument();
    expect(screen.getAllByText('Not provided').length).toBeGreaterThanOrEqual(4);
    expect(screen.getByRole('alert')).toHaveTextContent(/Not provided: calories, protein, carbohydrates, fat, portion size/);
    const portion = screen.getByLabelText(/portion size in grams for quinoa salad/i) as HTMLInputElement;
    expect(portion.value).toBe('');
    expect(portion.placeholder).toBe('Not provided');
  });

  it('keeps a genuine zero as 0 (it is a recorded value, not missing)', async () => {
    mount(week(INCOMPLETE_MONDAY));
    const heading = await screen.findByRole('heading', { name: 'Plain Water', level: 5 });
    const card = heading.closest('[class*="rounded-2xl"]') as HTMLElement;
    expect(within(card).getByText('0 kcal')).toBeInTheDocument();
    expect(within(card).getAllByText('0g')).toHaveLength(3);
    expect(within(card).queryByText('Not provided')).not.toBeInTheDocument();
    expect((within(card).getByLabelText(/portion size in grams/i) as HTMLInputElement).value).toBe('100');
    // only the incomplete dish raises the alert
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('does not let the stale stored total through: totals are recomputed from the values that exist and are marked incomplete', async () => {
    mount(week(INCOMPLETE_MONDAY));
    await screen.findByText('Quinoa Salad');
    expect(screen.queryByText(/999/)).not.toBeInTheDocument();
    expect(screen.getByTestId('day-totals-incomplete')).toHaveTextContent(/Totals incomplete: 1 dish has missing nutrition values or portion size/);
    expect(screen.getAllByText(/\(incomplete\)/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Incomplete').length).toBeGreaterThan(0); // the day tab
  });
});

describe('an incomplete plan cannot be published', () => {
  it('disables sending, explains why, and never calls the server', async () => {
    const { user } = mount(week(INCOMPLETE_MONDAY));
    await screen.findByText('Quinoa Salad');
    expect(sendButton()).toBeDisabled();
    expect(sendButton()).toHaveAttribute('title', expect.stringMatching(/1 dish has missing nutrition values/));
    await user.click(sendButton());
    expect(publish).not.toHaveBeenCalled();
  });

  it('a complete plan is sent with the real numbers: zeros stay zero and the recorded portion is used', async () => {
    publish.mockResolvedValue({ success: true } as never);
    const complete = { recipeId: 'z', recipeName: 'Plain Water', customPortionGrams: 100, calories: 0, protein: 0, carbs: 0, fat: 0 };
    const { user, onUpdatePlan } = mount(week({ breakfast: complete }, complete));
    await screen.findAllByText('Plain Water');
    expect(sendButton()).toBeEnabled();
    await user.click(sendButton());
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
    const payload = publish.mock.calls[0][0] as { days: Array<{ meals: Array<Record<string, unknown>> }> };
    expect(payload.days).toHaveLength(7);
    for (const m of payload.days.flatMap((d) => d.meals)) {
      expect(m).toMatchObject({ portionGrams: 100, calories: 0, protein: 0, carbs: 0, fat: 0 });
    }
    await waitFor(() => expect(onUpdatePlan).toHaveBeenCalled());
  });
});

describe('completing a dish restores what the catalogue knows', () => {
  it('selecting the dish again replaces the incomplete one with the catalogue values (no duplicate) and unlocks sending', async () => {
    const { user } = mount(week({ breakfast: INCOMPLETE_MONDAY.breakfast }));
    await screen.findByText('Quinoa Salad');
    await catalogueLoaded();
    await user.click(screen.getAllByRole('button', { name: /add menu dish/i })[0]);
    await waitFor(() => expect(screen.getAllByText('Quinoa Salad')).toHaveLength(2)); // the dish card and the picker row
    await user.click(screen.getAllByText('Quinoa Salad')[1]);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getAllByText('Quinoa Salad')).toHaveLength(1); // replaced, not duplicated
    expect(screen.getByText('Dish #1')).toBeInTheDocument();
    expect(screen.queryByText('Dish #2')).not.toBeInTheDocument();
    expect(screen.getAllByText('300 kcal').length).toBeGreaterThan(0);
    expect((screen.getByLabelText(/portion size in grams for quinoa salad/i) as HTMLInputElement).value).toBe('250');
    expect(screen.queryByTestId('day-totals-incomplete')).not.toBeInTheDocument();
  });

  it('entering a portion size restores the values from the catalogue recipe', async () => {
    mount(week({ breakfast: INCOMPLETE_MONDAY.breakfast }));
    await screen.findByText('Quinoa Salad');
    await catalogueLoaded();
    const portion = screen.getByLabelText(/portion size in grams for quinoa salad/i);
    fireEvent.change(portion, { target: { value: '125' } });
    expect((portion as HTMLInputElement).value).toBe('125');
    expect(screen.getAllByText('150 kcal').length).toBeGreaterThan(0); // 300 kcal per 250 g
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('portion changes are calculated from the original catalogue values: 125 g -> 33 g -> 250 g shows exactly 300 kcal again', async () => {
    mount(week({ breakfast: INCOMPLETE_MONDAY.breakfast }));
    await screen.findByText('Quinoa Salad');
    await catalogueLoaded();
    const portion = screen.getByLabelText(/portion size in grams for quinoa salad/i) as HTMLInputElement;
    fireEvent.change(portion, { target: { value: '125' } });
    expect(screen.getAllByText('150 kcal').length).toBeGreaterThan(0);
    fireEvent.change(portion, { target: { value: '33' } });
    expect(screen.getAllByText('40 kcal').length).toBeGreaterThan(0); // 300 x 33 / 250 = 39.6
    fireEvent.change(portion, { target: { value: '250' } });
    expect(portion.value).toBe('250');
    expect(screen.getAllByText('300 kcal').length).toBeGreaterThan(0); // not 299 / 301 from a rescaled-and-rounded value
    expect(screen.getAllByText('20g').length).toBeGreaterThan(0);
  });

  it('a small portion is used exactly as typed: no silent 10 g minimum', async () => {
    mount(week({ breakfast: INCOMPLETE_MONDAY.breakfast }));
    await screen.findByText('Quinoa Salad');
    await catalogueLoaded();
    const portion = screen.getByLabelText(/portion size in grams for quinoa salad/i) as HTMLInputElement;
    fireEvent.change(portion, { target: { value: '3' } });
    expect(portion.value).toBe('3');
    expect(screen.getAllByText('4 kcal').length).toBeGreaterThan(0); // 300 x 3 / 250 = 3.6
    fireEvent.change(portion, { target: { value: '0.5' } });
    expect(portion.value).toBe('0.5');
  });

  it.each(['-5', '0'])('an invalid portion (%s) is rejected with a message: the box keeps what was typed, the dish keeps its last valid portion, sending is blocked', async (bad) => {
    mount(week({ breakfast: INCOMPLETE_MONDAY.breakfast }));
    await screen.findByText('Quinoa Salad');
    await catalogueLoaded();
    const portion = screen.getByLabelText(/portion size in grams for quinoa salad/i) as HTMLInputElement;
    fireEvent.change(portion, { target: { value: '125' } });
    fireEvent.change(portion, { target: { value: bad } });
    expect(portion.value).toBe(bad); // not replaced by another number
    expect(portion).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Enter a portion size greater than 0 grams.')).toBeInTheDocument();
    expect(screen.getAllByText('150 kcal').length).toBeGreaterThan(0); // the last valid portion (125 g) still stands
    expect(sendButton()).toBeDisabled();
    fireEvent.change(portion, { target: { value: '250' } });
    expect(screen.queryByText('Enter a portion size greater than 0 grams.')).not.toBeInTheDocument();
    expect(portion).not.toHaveAttribute('aria-invalid');
    expect(screen.getAllByText('300 kcal').length).toBeGreaterThan(0);
  });

  it('an empty box clears the portion (Not provided) without an error message, and typing again restores the values exactly', async () => {
    mount(week({ breakfast: INCOMPLETE_MONDAY.breakfast }));
    await screen.findByText('Quinoa Salad');
    await catalogueLoaded();
    const portion = screen.getByLabelText(/portion size in grams for quinoa salad/i) as HTMLInputElement;
    fireEvent.change(portion, { target: { value: '250' } });
    fireEvent.change(portion, { target: { value: '' } });
    expect(portion.value).toBe('');
    expect(screen.queryByText('Enter a portion size greater than 0 grams.')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/portion size/);
    fireEvent.change(portion, { target: { value: '250' } });
    expect(screen.getAllByText('300 kcal').length).toBeGreaterThan(0);
  });

  it('removing a dish forgets its invalid-portion message, so it cannot block sending afterwards', async () => {
    const complete = { recipeId: 'z', recipeName: 'Plain Water', customPortionGrams: 100, calories: 0, protein: 0, carbs: 0, fat: 0 };
    const { user } = mount(week({ breakfast: complete }, complete));
    const portion = (await screen.findByLabelText(/portion size in grams for plain water/i)) as HTMLInputElement;
    fireEvent.change(portion, { target: { value: '-1' } });
    expect(sendButton()).toBeDisabled();
    await user.click(screen.getByTitle('Remove this menu dish'));
    expect(screen.queryByText('Enter a portion size greater than 0 grams.')).not.toBeInTheDocument();
    expect(sendButton()).toBeEnabled();
  });

  it('clearing the portion makes it Not provided again (no minimum or default is invented)', async () => {
    mount(week({ breakfast: INCOMPLETE_MONDAY.breakfast }));
    await screen.findByText('Quinoa Salad');
    await catalogueLoaded();
    const portion = screen.getByLabelText(/portion size in grams for quinoa salad/i) as HTMLInputElement;
    fireEvent.change(portion, { target: { value: '125' } });
    fireEvent.change(portion, { target: { value: '' } });
    expect(portion.value).toBe('');
    expect(screen.getByRole('alert')).toHaveTextContent(/portion size/);
    expect(sendButton()).toBeDisabled();
  });
});
