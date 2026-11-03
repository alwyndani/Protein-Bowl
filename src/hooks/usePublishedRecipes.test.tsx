import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('../services/recipeService', () => ({ RecipeService: { getPublicRecipes: vi.fn() } }));

import { RecipeService } from '../services/recipeService';
import { usePublishedRecipes } from './usePublishedRecipes';
import { dishCount } from '../components/customer/CustomerHome';

const get = vi.mocked(RecipeService.getPublicRecipes);
const rec = (id: string, category = 'Choice of Quinoa') => ({ id, name: `Dish ${id}`, category }) as never;
const page = (items: unknown[], pageNo: number, totalPages: number) => ({ items, recipes: items, total: 0, page: pageNo, limit: 100, totalPages }) as never;

beforeEach(() => vi.clearAllMocks());

describe('usePublishedRecipes: the customer menu is the published catalogue from the server', () => {
  it('loads every page and reports ready', async () => {
    get.mockResolvedValueOnce(page([rec('a')], 1, 2)).mockResolvedValueOnce(page([rec('b')], 2, 2));
    const { result } = renderHook(() => usePublishedRecipes());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.recipes.map((r) => r.id)).toEqual(['a', 'b']);
    expect(get).toHaveBeenNthCalledWith(1, { page: 1, limit: 100 });
    expect(get).toHaveBeenNthCalledWith(2, { page: 2, limit: 100 });
  });

  it('a failure is an error state (no static fallback list) and retry loads again', async () => {
    get.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(page([rec('a')], 1, 1));
    const { result } = renderHook(() => usePublishedRecipes());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.recipes).toEqual([]);
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.recipes).toHaveLength(1);
  });

  it('two components mounting at once share ONE request set; a later mount or reload still fetches fresh data', async () => {
    get.mockResolvedValueOnce(page([rec('a')], 1, 1));
    const one = renderHook(() => usePublishedRecipes());
    const two = renderHook(() => usePublishedRecipes());
    await waitFor(() => expect(one.result.current.status).toBe('ready'));
    await waitFor(() => expect(two.result.current.status).toBe('ready'));
    expect(get).toHaveBeenCalledTimes(1);
    expect(two.result.current.recipes.map((r) => r.id)).toEqual(['a']);
    // a newly published recipe: reload fetches again (nothing is cached after the request settles)
    get.mockResolvedValueOnce(page([rec('a'), rec('b')], 1, 1));
    act(() => one.result.current.reload());
    await waitFor(() => expect(one.result.current.recipes).toHaveLength(2));
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('category counts come from the loaded recipes, not fixed numbers', () => {
    const list = [rec('1'), rec('2'), rec('3', 'Yogurt Bowls')];
    expect(dishCount(list, 'Choice of Quinoa')).toBe('2 Dishes');
    expect(dishCount(list, 'Yogurt Bowls')).toBe('1 Dish');
    expect(dishCount([], 'Yogurt Bowls')).toBe('0 Dishes');
  });
});
