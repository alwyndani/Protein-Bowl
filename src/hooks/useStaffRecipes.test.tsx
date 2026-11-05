import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('../services/recipeService', () => ({ RecipeService: { getStaffRecipes: vi.fn() } }));

import { RecipeService } from '../services/recipeService';
import { useStaffRecipes } from './useStaffRecipes';

const get = vi.mocked(RecipeService.getStaffRecipes);
const rec = (id: string, isPublished = true) => ({ id, name: `Dish ${id}`, isPublished }) as never;
const page = (items: unknown[], pageNo: number, totalPages: number) => ({ items, recipes: items, total: 0, page: pageNo, limit: 100, totalPages }) as never;

beforeEach(() => vi.clearAllMocks());

describe('useStaffRecipes', () => {
  it('loads every page of published recipes and drops drafts', async () => {
    get.mockResolvedValueOnce(page([rec('a'), rec('d', false)], 1, 2)).mockResolvedValueOnce(page([rec('b')], 2, 2));
    const { result } = renderHook(() => useStaffRecipes());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.recipes.map((r) => r.id)).toEqual(['a', 'b']);
    expect(get).toHaveBeenNthCalledWith(1, { page: 1, limit: 100, isPublished: true });
  });

  it('a failure is an error state with no fallback list; reload recovers', async () => {
    get.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(page([rec('a')], 1, 1));
    const { result } = renderHook(() => useStaffRecipes());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.recipes).toEqual([]);
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.recipes).toHaveLength(1);
  });
});
