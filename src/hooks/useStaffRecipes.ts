import { useCallback, useEffect, useState } from 'react';
import { RecipeService } from '../services/recipeService';
import type { RecipeItem } from '../types';

export interface UseStaffRecipesResult {
  recipes: RecipeItem[];
  status: 'loading' | 'ready' | 'error';
  reload: () => void;
}

const PAGE = 100; // the server caps a page at 100

async function fetchAllPublishedForStaff(): Promise<RecipeItem[]> {
  const all: RecipeItem[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const res = await RecipeService.getStaffRecipes({ page, limit: PAGE, isPublished: true });
    all.push(...res.items);
    totalPages = res.totalPages;
    page += 1;
  } while (page <= totalPages && page <= 20);
  // A draft never reaches a client's plan, even if the server returned one.
  return all.filter((r) => r.isPublished !== false);
}

/**
 * The recipes a nutritionist may put into a plan: the published recipes from the staff catalogue
 * (GET /recipes/staff/all, CHEF / NUTRITIONIST / SUPER_ADMIN). No static fallback; a failure is reported so the caller can show it and retry.
 */
export function useStaffRecipes(): UseStaffRecipesResult {
  const [recipes, setRecipes] = useState<RecipeItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    fetchAllPublishedForStaff()
      .then((all) => {
        if (cancelled) return;
        setRecipes(all);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { recipes, status, reload };
}
