import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../../services/kitchenService', () => ({
  KitchenService: { getQueue: vi.fn(), act: vi.fn(), listRouting: vi.fn(), assignBranch: vi.fn() }
}));
vi.mock('../../services/recipeService', () => ({
  RecipeService: { getStaffRecipes: vi.fn(), createRecipe: vi.fn(), updateRecipe: vi.fn(), publishRecipe: vi.fn() }
}));

import { KitchenService } from '../../services/kitchenService';
import { RecipeService } from '../../services/recipeService';
import { ChefDashboard } from './ChefDashboard';
import { kitchenQueue } from '../../test/kitchenFixtures';

const getStaffRecipes = vi.mocked(RecipeService.getStaffRecipes);
const createRecipe = vi.mocked(RecipeService.createRecipe);

const numberInputs = () => Array.from(document.querySelectorAll('form input[type="number"]')) as HTMLInputElement[];
const selects = () => Array.from(document.querySelectorAll('form select')) as HTMLSelectElement[];
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

async function openForm() {
  render(<ChefDashboard />);
  await screen.findByTestId('kitchen-queue');
  fireEvent.click(screen.getByRole('button', { name: /Recipe Database/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Add New Menu Item/ }));
  return screen.findByText('Create New Menu Item & Recipe');
}

function fillAll() {
  type(screen.getByPlaceholderText(/Air-Fried Garlic/), 'Test Bowl');
  type(selects()[0], 'Kerala Breakfast');
  type(screen.getByPlaceholderText(/1 Portion/), '1 Portion (250g)');
  type(screen.getByPlaceholderText(/Kerala Traditional/), 'Kerala');
  type(selects()[1], 'veg');
  const [grams, cal, protein, carbs, fat, fiber] = numberInputs();
  type(grams, '250'); type(cal, '420'); type(protein, '30'); type(carbs, '40'); type(fat, '12'); type(fiber, '6');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(KitchenService.getQueue).mockResolvedValue(kitchenQueue({}));
  getStaffRecipes.mockResolvedValue({ items: [], recipes: [], total: 0, page: 1, limit: 20, totalPages: 1 });
});

describe('Chef recipe form (real persistence, no invented values)', () => {
  it('a new recipe starts completely empty: no sample nutrition, ingredient or step', async () => {
    await openForm();
    for (const input of numberInputs()) expect(input.value).toBe('');
    for (const select of selects()) expect(select.value).toBe('');
    expect(screen.queryByPlaceholderText(/Ingredient Name/)).not.toBeInTheDocument();
  }, 30000);

  it('incomplete data is refused locally and nothing is sent', async () => {
    await openForm();
    type(screen.getByPlaceholderText(/Air-Fried Garlic/), 'Test Bowl');
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(createRecipe).not.toHaveBeenCalled();
  }, 30000);

  it('a complete form sends the server contract payload and reloads the list from the server', async () => {
    createRecipe.mockResolvedValue({} as never);
    await openForm();
    fillAll();
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    await waitFor(() => expect(createRecipe).toHaveBeenCalledTimes(1));
    expect(createRecipe).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Test Bowl', category: 'Kerala Breakfast', servingGrams: 250, calories: 420,
      proteinGrams: 30, carbsGrams: 40, fatGrams: 12, fiberGrams: 6, dietaryTag: 'veg', cuisine: 'Kerala'
    }));
    await waitFor(() => expect(getStaffRecipes).toHaveBeenCalledTimes(2)); // initial load + reload after the save
    await waitFor(() => expect(screen.queryByText('Create New Menu Item & Recipe')).not.toBeInTheDocument());
  }, 30000);

  it('a failed save keeps the form open with an error and never shows as saved', async () => {
    createRecipe.mockRejectedValue(new Error('network'));
    await openForm();
    fillAll();
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    expect(await screen.findByText('The recipe could not be saved. Please try again.')).toBeInTheDocument();
    expect(screen.getByText('Create New Menu Item & Recipe')).toBeInTheDocument();
    expect(getStaffRecipes).toHaveBeenCalledTimes(1);
  }, 30000);

  it('a failed recipe list load is shown, not hidden behind an empty catalogue', async () => {
    getStaffRecipes.mockRejectedValue(new Error('down'));
    render(<ChefDashboard />);
    await screen.findByTestId('kitchen-queue');
    fireEvent.click(screen.getByRole('button', { name: /Recipe Database/ }));
    expect(await screen.findByRole('button', { name: /Retry/ })).toBeInTheDocument();
  }, 30000);
});
