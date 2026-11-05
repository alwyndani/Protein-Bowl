import { useCallback, useEffect, useState } from 'react';
import { RecipeService } from '../services/recipeService';
import type { RecipeItem } from '../types';

export interface UsePublishedRecipesResult {
  recipes: RecipeItem[];
  status: 'loading' | 'ready' | 'error';
  reload: () => void;
}

const PAGE = 100; // the server caps a page at 100

async function fetchAllPublished(): Promise<RecipeItem[]> {
  const all: RecipeItem[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const res = await RecipeService.getPublicRecipes({ page, limit: PAGE });
    all.push(...res.items);
    totalPages = res.totalPages;
    page += 1;
  } while (page <= totalPages && page <= 20);
  return all;
}

// Several components (App and CustomerHome) mount this hook at the same time; they share ONE request that is already in flight. Nothing is
// cached: once it settles, the next mount, Retry or reload fetches fresh data, so a newly published recipe is never hidden.
let inflight: Promise<RecipeItem[]> | null = null;
function fetchShared(): Promise<RecipeItem[]> {
  if (!inflight) {
    const p = fetchAllPublished();
    inflight = p;
    const clear = () => { if (inflight === p) inflight = null; };
    p.then(clear, clear);
  }
  return inflight;
}

/**
 * The customer menu: the recipes a Super Admin has PUBLISHED, straight from the server (all pages). No static fallback: a failure is reported
 * to the caller, which shows an error with retry; a Chef's draft never appears here.
 */
export function usePublishedRecipes(): UsePublishedRecipesResult {
  const [recipes, setRecipes] = useState<RecipeItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    fetchShared()
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
