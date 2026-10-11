import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('../../services/kitchenService', () => ({
  KitchenService: { getQueue: vi.fn(), act: vi.fn(), listRouting: vi.fn(), assignBranch: vi.fn() }
}));
vi.mock('../../services/recipeService', () => ({
  RecipeService: { getStaffRecipes: vi.fn().mockResolvedValue({ items: [], total: 0 }), createRecipe: vi.fn(), updateRecipe: vi.fn(), publishRecipe: vi.fn() }
}));

import { KitchenService } from '../../services/kitchenService';
import { ChefDashboard } from './ChefDashboard';
import { isUiRoleAllowed } from '../../utils/roleGuard';
import { kitchenOrder, kitchenQueue } from '../../test/kitchenFixtures';

const getQueue = vi.mocked(KitchenService.getQueue);
const tabs = () => within(document.querySelector('.scrollbar-none') as HTMLElement).getAllByRole('button').map((b) => b.textContent ?? '');

beforeEach(() => {
  vi.clearAllMocks();
  getQueue.mockResolvedValue(kitchenQueue({ CONFIRMED: [kitchenOrder()] }));
});
afterEach(() => vi.unstubAllEnvs());

describe('Chef workspace in PRODUCTION', () => {
  beforeEach(() => vi.stubEnv('DEV', false));

  it('opens on the real Kitchen Queue and offers only Kitchen Queue + Recipes: no mock tab, no demo figure', async () => {
    render(<ChefDashboard orders={[]} onOpenMenuModal={vi.fn()} />);
    expect(await screen.findByTestId('kitchen-queue')).toBeInTheDocument();
    expect(getQueue).toHaveBeenCalled();
    const names = tabs();
    expect(names).toHaveLength(2);
    expect(names[0]).toBe('Kitchen Queue');
    expect(names[1]).toMatch(/Recipe Database/);
    expect(screen.queryByText(/Demo/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Today's Batches/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Daily Production Sheet|Order Dispatch|Kerala Mess/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kitchen Queue' })).toHaveAttribute('aria-current', 'page');
  });

  it('the Recipes tab is the real (API-backed) recipe database and the kitchen queue stays one click away', async () => {
    render(<ChefDashboard orders={[]} onOpenMenuModal={vi.fn()} />);
    await screen.findByTestId('kitchen-queue');
    fireEvent.click(screen.getByRole('button', { name: /Recipe Database/ }));
    expect(screen.queryByTestId('kitchen-queue')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Recipe Database/ })).toHaveAttribute('aria-current', 'page');
  }, 30000);

  it('the Chef UI is only presented to a session that holds CHEF (UX guard; the backend authorizes every call)', () => {
    expect(isUiRoleAllowed('chef', ['CHEF'], false)).toBe(true);
    for (const roles of [['SUPER_ADMIN'], ['MD'], ['CUSTOMER'], ['DELIVERY'], [], undefined]) expect(isUiRoleAllowed('chef', roles as string[] | undefined, false)).toBe(false);
  });
});

describe('Chef workspace in DEVELOPMENT', () => {
  it('still opens on the Kitchen Queue; the mock tabs exist but are clearly labelled "Demo (mock data)"', async () => {
    vi.stubEnv('DEV', true);
    render(<ChefDashboard orders={[]} onOpenMenuModal={vi.fn()} />);
    expect(await screen.findByTestId('kitchen-queue')).toBeInTheDocument();
    const names = tabs();
    expect(names[0]).toBe('Kitchen Queue');
    const mock = names.filter((n) => /Daily Production Sheet|Kerala Mess|Order Dispatch/.test(n));
    expect(mock).toHaveLength(3);
    for (const n of mock) expect(n).toMatch(/^Demo \(mock data\)/);
  });
});
