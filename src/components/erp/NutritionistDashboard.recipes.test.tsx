import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('../../services/dietService', () => ({ DietService: {} }));
vi.mock('../../services/recipeService', () => ({ RecipeService: { getStaffRecipes: vi.fn() } }));

import { RecipeService } from '../../services/recipeService';
import { NutritionistDashboard } from './NutritionistDashboard';

const get = vi.mocked(RecipeService.getStaffRecipes);
const page = (items: unknown[]) => ({ items, recipes: items, total: items.length, page: 1, limit: 100, totalPages: 1 }) as never;
const recipe = (id: string, name: string, over: Record<string, unknown> = {}) =>
  ({ id, name, category: 'Salads', cuisine: 'Indian', calories: 300, protein: 20, carbs: 30, fat: 8, servingGrams: 250, image: '', isPublished: true, ...over });

const request = {
  id: 'r1', customerId: 'c1', customerName: 'Asha', customerEmail: 'a@test.com', customerPhone: '', bmi: 0, goal: 'weight_loss', targetCalories: 0,
  planType: 'standard', durationDays: 7, preferredCategories: [], dietaryPreference: 'veg', cuisinePreference: '', grainPreference: '', spiceLevel: 'Mild',
  allergiesExclusions: '', status: 'under_review', createdAt: '2026-10-01'
} as never;

const openPicker = async () => {
  const user = userEvent.setup();
  render(<NutritionistDashboard requests={[request]} onUpdatePlan={() => {}} onOpenMenuModal={() => {}} />);
  await user.click((await screen.findAllByRole('button', { name: /add menu dish/i }))[0]);
  return user;
};

beforeEach(() => vi.clearAllMocks());

describe('NutritionistDashboard dish picker reads the server catalogue', () => {
  it('lists published recipes from the staff API and adds the chosen one', async () => {
    get.mockResolvedValue(page([recipe('a', 'Quinoa Salad'), recipe('b', 'Draft Soup', { isPublished: false })]));
    const user = await openPicker();
    expect(await screen.findByText('Quinoa Salad')).toBeInTheDocument();
    expect(screen.queryByText('Draft Soup')).not.toBeInTheDocument();
    expect(get).toHaveBeenCalledWith({ page: 1, limit: 100, isPublished: true });
    await user.click(screen.getByText('Quinoa Salad'));
    expect(screen.queryByText(/select dish for day/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('Quinoa Salad').length).toBeGreaterThan(0);
  });

  it('shows a visible error with Retry when the recipes cannot be loaded', async () => {
    get.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(page([recipe('a', 'Quinoa Salad')]));
    const user = await openPicker();
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load the recipes/i);
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText('Quinoa Salad')).toBeInTheDocument();
  });

  it('shows an empty state when no recipe is published', async () => {
    get.mockResolvedValue(page([]));
    await openPicker();
    expect(await screen.findByText(/no published recipes exist yet/i)).toBeInTheDocument();
  });
});
