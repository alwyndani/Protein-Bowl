import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../services/dietService', () => ({ DietService: { approvePlan: vi.fn(), requestRevision: vi.fn() } }));
vi.mock('../../services/recipeService', () => ({ RecipeService: { getPublicRecipes: vi.fn() } }));

import { RecipeService } from '../../services/recipeService';
import { CustomerPlanReview } from './CustomerPlanReview';

const get = vi.mocked(RecipeService.getPublicRecipes);
const page = (items: unknown[]) => ({ items, recipes: items, total: items.length, page: 1, limit: 100, totalPages: 1 }) as never;

const profile = { targetCalories: 1800, goal: 'weight_loss', macroTargets: { proteinGrams: 100, carbsGrams: 200, fatGrams: 50 } } as never;
const request = {
  id: 'r1', status: 'plan_ready', durationDays: 7,
  dayWisePlan: [{
    dayNumber: 1, dayName: 'Monday', totalCalories: 300, totalProtein: 20, totalCarbs: 30, totalFat: 8,
    meals: [
      { mealType: 'breakfast', recipeId: 'a', recipeName: 'Oats' },
      { mealType: 'lunch', recipeId: 'gone', recipeName: 'Old Dish' }
    ]
  }]
} as never;

const renderIt = (onOpen = vi.fn()) =>
  render(<CustomerPlanReview request={request} profile={profile} onApproved={() => {}} onRequestRevision={() => {}} onRejectPlan={() => {}} onOpenMenuModal={onOpen} />);

beforeEach(() => vi.clearAllMocks());

describe('CustomerPlanReview dish details come from the server', () => {
  it('uses the published recipe for nutrition and shows "Not provided" for a dish the server no longer lists', async () => {
    get.mockResolvedValue(page([{ id: 'a', name: 'Oats Bowl', calories: 310, protein: 12, carbs: 40, fat: 6, image: 'x.jpg' }]));
    const onOpen = vi.fn();
    renderIt(onOpen);
    expect(await screen.findByText('Oats Bowl')).toBeInTheDocument();
    expect(screen.getByText('310 kcal')).toBeInTheDocument();
    expect(screen.getByText('Old Dish')).toBeInTheDocument();
    expect(screen.getAllByText('Not provided').length).toBeGreaterThan(0);
    expect(screen.queryByText('200 kcal')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByText('Oats Bowl'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('reports a recipe load failure visibly and retries', async () => {
    get.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(page([{ id: 'a', name: 'Oats Bowl', calories: 310, protein: 12, carbs: 40, fat: 6 }]));
    renderIt();
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load the dish details/i);
    await userEvent.setup().click(screen.getByRole('button', { name: /retry/i }));
    await waitFor(() => expect(screen.getByText('Oats Bowl')).toBeInTheDocument());
  });
});
