import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../services/recipeService', () => ({
  RecipeService: { getStaffRecipes: vi.fn(), publishRecipe: vi.fn() }
}));

import { RecipeService } from '../../services/recipeService';
import { RecipePublishing } from './RecipePublishing';

const list = vi.mocked(RecipeService.getStaffRecipes);
const publish = vi.mocked(RecipeService.publishRecipe);
const page = (items: Array<Record<string, unknown>>) => ({ items, recipes: items, total: items.length, page: 1, limit: 100, totalPages: 1 }) as never;
const draft = { id: 'r1', name: 'Draft Bowl', category: 'Quinoa', calories: 400, isPublished: false };
const live = { id: 'r2', name: 'Live Bowl', category: 'Quinoa', calories: 380, isPublished: true };

beforeEach(() => vi.clearAllMocks());

describe('RecipePublishing (SUPER_ADMIN)', () => {
  it('separates drafts from published recipes', async () => {
    list.mockResolvedValue(page([draft, live]));
    render(<RecipePublishing />);
    expect(await screen.findByText(/Drafts awaiting publication \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Published \(1\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unpublish' })).toBeInTheDocument();
  });

  it('publishing calls the API with the id and reloads what the server stored', async () => {
    list.mockResolvedValueOnce(page([draft])).mockResolvedValueOnce(page([{ ...draft, isPublished: true }]));
    publish.mockResolvedValue({} as never);
    render(<RecipePublishing />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(publish).toHaveBeenCalledWith('r1', true));
    expect(await screen.findByText('Draft Bowl published.')).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/Drafts awaiting publication \(0\)/)).toBeInTheDocument();
  });

  it('a failed publish shows the error and does not claim success', async () => {
    list.mockResolvedValue(page([draft]));
    publish.mockRejectedValue(new Error('down'));
    render(<RecipePublishing />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Publish' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/published\./)).not.toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('a failed list load is shown, not hidden as "No drafts"', async () => {
    list.mockRejectedValue(new Error('down'));
    render(<RecipePublishing />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
