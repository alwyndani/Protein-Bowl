import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { CartService } from '../services/cartService';
import type { ServerCart } from '../services/commerceTypes';

export type CartStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface CartContextValue {
  /** The SERVER cart (single source of truth for an authenticated customer). Null until hydrated / when logged out. */
  cart: ServerCart | null;
  status: CartStatus;
  /** Last cart load error (hydration). */
  error: string | null;
  /** Last mutation error (add / update / remove / clear). */
  mutationError: string | null;
  isMutating: boolean;
  /** Total quantity of units in the server cart. */
  itemCount: number;
  refresh: () => Promise<void>;
  /** Resolves true when the server accepted the change (and the UI was synced to the server response). */
  addItem: (productId: string, variantId?: string | null, quantity?: number) => Promise<boolean>;
  updateQuantity: (itemId: string, quantity: number) => Promise<boolean>;
  removeItem: (itemId: string) => Promise<boolean>;
  clear: () => Promise<boolean>;
  dismissMutationError: () => void;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * Server-backed cart state. After EVERY mutation the UI is replaced by the authoritative server response;
 * there is no local/optimistic cart. Cart access requires a CUSTOMER session - the server enforces it.
 */
export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = useAuth();
  const isCustomerSession = auth.isAuthenticated && (auth.user?.roles || []).includes('CUSTOMER');

  const [cart, setCart] = useState<ServerCart | null>(null);
  const [status, setStatus] = useState<CartStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const mutatingRef = useRef(false);
  // Bumped after every successful mutation so a slower in-flight hydration GET can never overwrite newer server state.
  const mutationVersionRef = useRef(0);

  // Concurrent refresh() calls (e.g. session hydration + opening the cart) share one request.
  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  const refresh = useCallback((): Promise<void> => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    setStatus('loading');
    setError(null);
    const versionAtStart = mutationVersionRef.current;
    const run = (async () => {
      try {
        const serverCart = await CartService.getCart();
        if (mutationVersionRef.current === versionAtStart) {
          setCart(serverCart);
        }
        setStatus('ready');
      } catch (err) {
        setError(messageOf(err, 'Could not load your cart'));
        setStatus('error');
      } finally {
        refreshInFlightRef.current = null;
      }
    })();
    refreshInFlightRef.current = run;
    return run;
  }, []);

  // Hydrate from the server when a customer session starts; reset on logout / non-customer sessions.
  useEffect(() => {
    if (auth.isLoading) return;
    if (isCustomerSession) {
      void refresh();
    } else {
      setCart(null);
      setStatus('idle');
      setError(null);
      setMutationError(null);
    }
  }, [auth.isLoading, isCustomerSession, auth.user?.id, refresh]);

  const mutate = useCallback(async (operation: () => Promise<ServerCart | void>, fallbackMessage: string) => {
    if (mutatingRef.current) return false; // one cart mutation at a time keeps the UI in step with the server
    mutatingRef.current = true;
    setIsMutating(true);
    setMutationError(null);
    try {
      const serverCart = await operation();
      mutationVersionRef.current += 1;
      if (serverCart) {
        setCart(serverCart);
        setStatus('ready');
      }
      return true;
    } catch (err) {
      setMutationError(messageOf(err, fallbackMessage));
      return false;
    } finally {
      mutatingRef.current = false;
      setIsMutating(false);
    }
  }, []);

  const addItem = useCallback(
    (productId: string, variantId?: string | null, quantity: number = 1) =>
      mutate(() => CartService.addItem(productId, variantId, quantity), 'Could not add this item to your cart'),
    [mutate]
  );

  const updateQuantity = useCallback(
    (itemId: string, quantity: number) =>
      mutate(() => CartService.updateItemQuantity(itemId, quantity), 'Could not update the quantity'),
    [mutate]
  );

  const removeItem = useCallback(
    (itemId: string) => mutate(() => CartService.removeItem(itemId), 'Could not remove this item'),
    [mutate]
  );

  const clear = useCallback(
    () =>
      mutate(async () => {
        await CartService.clearCart();
        return await CartService.getCart();
      }, 'Could not clear your cart'),
    [mutate]
  );

  const dismissMutationError = useCallback(() => setMutationError(null), []);

  const itemCount = useMemo(() => (cart ? cart.items.reduce((sum, item) => sum + item.quantity, 0) : 0), [cart]);

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      status,
      error,
      mutationError,
      isMutating,
      itemCount,
      refresh,
      addItem,
      updateQuantity,
      removeItem,
      clear,
      dismissMutationError
    }),
    [cart, status, error, mutationError, isMutating, itemCount, refresh, addItem, updateQuantity, removeItem, clear, dismissMutationError]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return ctx;
}
