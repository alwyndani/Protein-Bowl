import { useCallback, useMemo, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { CommerceApi } from './api';
import { useCheckoutAttemptStore } from './checkoutAttempt';
import { ApiError } from '../api/ApiError';
import { isAmbiguousOutcome } from './commerceErrors';
import { previewSignature } from './previewSignature';
import { CATALOG_STALE_MS, qk } from './queryKeys';
import type { AddressInput, CheckoutPreview, CustomerOrder } from './types';

export function useCommerceApi(): CommerceApi {
  const { manager } = useAuth();
  return useMemo(() => new CommerceApi(manager.api), [manager]);
}

/** Re-request when a screen regains focus (cart / preview / orders are always server-authoritative). Skips the initial mount. */
export function useRefetchOnFocus(refetch: () => unknown) {
  const latest = useRef(refetch);
  latest.current = refetch;
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (!first.current) void latest.current();
      first.current = false;
    }, [])
  );
}

// ------------------------------------------------------------------ catalog
export function useCategories() {
  const api = useCommerceApi();
  return useQuery({ queryKey: qk.categories, queryFn: api.categories, staleTime: CATALOG_STALE_MS });
}

export function useProducts(categoryId: string | null) {
  const api = useCommerceApi();
  return useQuery({ queryKey: qk.products(categoryId), queryFn: () => api.products(categoryId ?? undefined), staleTime: CATALOG_STALE_MS });
}

export function useProduct(slug: string) {
  const api = useCommerceApi();
  return useQuery({ queryKey: qk.product(slug), queryFn: () => api.product(slug), staleTime: CATALOG_STALE_MS });
}

// --------------------------------------------------------------------- cart
export function useCart() {
  const api = useCommerceApi();
  return useQuery({ queryKey: qk.cart, queryFn: api.cart, staleTime: 0 });
}

const CART_WRITE = ['cart', 'write'] as const;

/**
 * Cart writes. The server answers every mutation with the FULL cart, which replaces the cached cart (the server is the only authority;
 * nothing is computed locally). Only ONE cart write may be in flight across the whole app (checked synchronously, so a fast double tap
 * cannot start two). Nothing is retried and nothing is queued offline.
 */
export function useCartWrites() {
  const api = useCommerceApi();
  const qc = useQueryClient();
  const inFlight = useIsMutating({ mutationKey: CART_WRITE }) > 0;
  const options = {
    mutationKey: CART_WRITE,
    onSuccess: (cart: unknown) => {
      qc.setQueryData(qk.cart, cart);
      void qc.invalidateQueries({ queryKey: ['checkout'] });
    }
  };
  const add = useMutation({ ...options, mutationFn: (v: { productId: string; variantId: string | null; quantity: number }) => api.addToCart(v) });
  const setQuantity = useMutation({ ...options, mutationFn: (v: { itemId: string; quantity: number }) => api.setQuantity(v.itemId, v.quantity) });
  const remove = useMutation({ ...options, mutationFn: (itemId: string) => api.removeItem(itemId) });
  const clear = useMutation({ ...options, mutationFn: () => api.clearCart() });

  const guard = useCallback((): boolean => qc.isMutating({ mutationKey: CART_WRITE }) > 0, [qc]);
  return { add, setQuantity, remove, clear, busy: inFlight, isLocked: guard };
}

// ---------------------------------------------------------------- addresses
export function useAddresses() {
  const api = useCommerceApi();
  return useQuery({ queryKey: qk.addresses, queryFn: api.addresses, staleTime: 0 });
}

const ADDRESS_WRITE = ['addresses', 'write'] as const;

export function useAddressWrites() {
  const api = useCommerceApi();
  const qc = useQueryClient();
  const busy = useIsMutating({ mutationKey: ADDRESS_WRITE }) > 0;
  const done = () => {
    void qc.invalidateQueries({ queryKey: qk.addresses });
    void qc.invalidateQueries({ queryKey: ['checkout'] });
  };
  const create = useMutation({ mutationKey: ADDRESS_WRITE, mutationFn: (v: AddressInput) => api.createAddress(v), onSuccess: done });
  const update = useMutation({ mutationKey: ADDRESS_WRITE, mutationFn: (v: { id: string; input: Partial<AddressInput> }) => api.updateAddress(v.id, v.input), onSuccess: done });
  const remove = useMutation({ mutationKey: ADDRESS_WRITE, mutationFn: (id: string) => api.deleteAddress(id), onSuccess: done });
  const isLocked = useCallback((): boolean => qc.isMutating({ mutationKey: ADDRESS_WRITE }) > 0, [qc]);
  return { create, update, remove, busy, isLocked };
}

// ----------------------------------------------------------------- checkout
/** A preview is never cached beyond the screen that shows it (gcTime 0) and is always re-requested. */
export function useCheckoutPreview(addressId: string | null) {
  const api = useCommerceApi();
  return useQuery({
    queryKey: qk.preview(addressId),
    queryFn: () => api.previewCheckout(addressId ?? undefined),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always'
  });
}

export type PlaceOrderResult =
  | { kind: 'placed'; order: CustomerOrder }
  /** The server totals changed since the customer reviewed them: the new preview is shown and nothing was ordered. */
  | { kind: 'review_changed'; preview: CheckoutPreview };

/**
 * Place the ONLINE order. Steps: (1) unless an ambiguous attempt is being retried, re-request the preview and stop if the server
 * differs from what the customer reviewed (`previewSignature`: equality of canonical, display-safe server values, no arithmetic); (2) POST /orders with the attempt's
 * idempotency key. An ambiguous failure freezes the attempt (same key / address / instructions) and is surfaced to the screen; it
 * never triggers a new-key order.
 */
export function usePlaceOrder() {
  const api = useCommerceApi();
  const qc = useQueryClient();
  const store = useCheckoutAttemptStore();
  return useMutation({
    mutationKey: ['checkout', 'place-order'],
    mutationFn: async (v: { addressId: string; deliveryInstructions: string; reviewedSignature: string | null }): Promise<PlaceOrderResult> => {
      const existing = store.get();
      const retrying = !!existing?.ambiguous;
      if (!retrying) {
        const fresh = await api.previewCheckout(v.addressId);
        qc.setQueryData(qk.preview(v.addressId), fresh);
        if (v.reviewedSignature !== null && previewSignature(fresh) !== v.reviewedSignature) return { kind: 'review_changed', preview: fresh };
        if (fresh.minimumOrder.enabled && !fresh.minimumOrder.met) return { kind: 'review_changed', preview: fresh };
      }
      const attempt = store.prepare(v.addressId, v.deliveryInstructions.trim());
      const order = await api.createOrder({
        addressId: attempt.addressId,
        deliveryInstructions: attempt.deliveryInstructions || undefined,
        idempotencyKey: attempt.key
      });
      store.clear(); // authoritative success: the attempt (and its key) ends here
      qc.setQueryData(qk.order(order.id), order);
      void qc.invalidateQueries({ queryKey: qk.orders });
      void qc.invalidateQueries({ queryKey: qk.cart }); // the server consumed the ordered lines
      return { kind: 'placed', order };
    },
    onError: (error) => {
      if (isAmbiguousOutcome(error) && store.get()) {
        store.markAmbiguous();
      } else if (error instanceof ApiError && error.kind === 'http' && (error.status === 400 || error.status === 422) && store.get()?.ambiguous) {
        // The server evaluated the request and rejected it (the idempotency lookup runs first), so no order exists for this key: the ambiguity is resolved.
        store.clear();
      }
    }
  });
}

// ------------------------------------------------------------------- orders
export function useOrders() {
  const api = useCommerceApi();
  return useQuery({ queryKey: qk.orders, queryFn: api.orders, staleTime: 0 });
}

export function useOrder(id: string) {
  const api = useCommerceApi();
  return useQuery({ queryKey: qk.order(id), queryFn: () => api.order(id), staleTime: 0 });
}
