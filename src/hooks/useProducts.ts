import { useCallback, useEffect, useState } from 'react';
import { ProductService } from '../services/productService';
import type { ApiProduct } from '../services/commerceTypes';

export type ProductsStatus = 'loading' | 'ready' | 'error';

export interface ProductFilter {
  isFMCG?: boolean;
  isTepache?: boolean;
}

export interface UseProductsResult {
  products: ApiProduct[];
  status: ProductsStatus;
  error: string | null;
  reload: () => void;
}

/**
 * Loads the public storefront catalog from the server. There is deliberately NO mock fallback:
 * if the API fails the caller renders an error state with a retry.
 */
export function useProducts(filter: ProductFilter = {}): UseProductsResult {
  const { isFMCG, isTepache } = filter;
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [status, setStatus] = useState<ProductsStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);
    ProductService.getProducts(undefined, isFMCG, isTepache)
      .then((result) => {
        if (cancelled) return;
        setProducts(result);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setProducts([]);
        setError(err instanceof Error && err.message ? err.message : 'Could not load products');
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [isFMCG, isTepache, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { products, status, error, reload };
}
