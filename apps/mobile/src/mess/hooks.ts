import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/ApiError';
import { useAuth } from '../auth/AuthProvider';
import { isAmbiguousOutcome } from '../commerce/commerceErrors';
import { newIdempotencyKey } from '../commerce/idempotencyKey';
import { qk } from '../commerce/queryKeys';
import { MessApi } from './api';
import { MESS_STATIC_STALE_MS, mk } from './queryKeys';
import type { AccountInput, CancelReasonCode, HandoverIssued, PurchaseResult } from './types';

export function useMessApi(): MessApi {
  const { manager } = useAuth();
  return useMemo(() => new MessApi(manager.api), [manager]);
}

// ----------------------------------------------------------------- reference data
export function useServicePoints() {
  const api = useMessApi();
  return useQuery({ queryKey: mk.servicePoints, queryFn: api.servicePoints, staleTime: MESS_STATIC_STALE_MS });
}

export function usePlans(servicePointId: string | null) {
  const api = useMessApi();
  return useQuery({ queryKey: mk.plans(servicePointId), queryFn: () => api.plans(servicePointId ?? undefined), staleTime: 0 });
}

// ----------------------------------------------------------------- account
export function useMessAccount() {
  const api = useMessApi();
  return useQuery({ queryKey: mk.account, queryFn: api.account, staleTime: 0 });
}

/** Submit / update hostel details. The server answers with the saved account (approval status is the server's, never assumed). */
export function useSaveAccount() {
  const api = useMessApi();
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['mess', 'account', 'write'],
    mutationFn: (v: AccountInput) => api.saveAccount(v),
    onSuccess: (out) => {
      qc.setQueryData(mk.account, out.account);
      void qc.invalidateQueries({ queryKey: ['mess', 'plans'] });
    }
  });
}

// ----------------------------------------------------------------- subscriptions
export function useSubscriptions() {
  const api = useMessApi();
  return useQuery({ queryKey: mk.subscriptions, queryFn: api.subscriptions, staleTime: 0 });
}

export function useSubscription(id: string) {
  const api = useMessApi();
  return useQuery({ queryKey: mk.subscription(id), queryFn: () => api.subscription(id), staleTime: 0 });
}

export interface PurchaseInput {
  planId: string;
  startDate: string;
}

/**
 * ONLINE purchase. One attempt (one idempotency key) belongs to one (plan, start date). An ambiguous failure (network / timeout / 5xx)
 * freezes the attempt: the retry re-sends the SAME key and the same body, which the server answers with the existing purchase instead
 * of creating a second one. A definitive server rejection ends the attempt. The key lives only in this hook's memory.
 */
export function usePurchase() {
  const api = useMessApi();
  const qc = useQueryClient();
  const attempt = useRef<{ key: string; planId: string; startDate: string } | null>(null);
  const [ambiguous, setAmbiguous] = useState(false);

  const mutation = useMutation({
    mutationKey: ['mess', 'purchase'],
    mutationFn: async (v: PurchaseInput): Promise<PurchaseResult> => {
      let a = attempt.current;
      if (!a || a.planId !== v.planId || a.startDate !== v.startDate) {
        a = { key: newIdempotencyKey(), planId: v.planId, startDate: v.startDate };
        attempt.current = a;
      }
      const out = await api.purchase({ planId: a.planId, startDate: a.startDate, idempotencyKey: a.key });
      attempt.current = null; // authoritative success: the key ends here
      setAmbiguous(false);
      qc.setQueryData(mk.subscription(out.subscription.id), out.subscription);
      void qc.invalidateQueries({ queryKey: mk.subscriptions });
      return out;
    },
    onError: (error) => {
      if (isAmbiguousOutcome(error) && attempt.current) {
        setAmbiguous(true);
      } else {
        // The server evaluated and rejected the request (or it never left the device): no purchase exists for this key.
        attempt.current = null;
        setAmbiguous(false);
        if (error instanceof ApiError && error.kind === 'http' && error.status === 409) void qc.invalidateQueries({ queryKey: mk.subscriptions });
      }
    }
  });
  return { ...mutation, ambiguous };
}

// ----------------------------------------------------------------- meals
export function useCalendar(subscriptionId: string) {
  const api = useMessApi();
  return useQuery({ queryKey: mk.calendar(subscriptionId), queryFn: () => api.calendar(subscriptionId), staleTime: 0 });
}

const MEAL_WRITE = ['mess', 'meal', 'write'] as const;

/** Pause / resume ONE meal. Only one meal write may be in flight; the calendar is always re-read from the server afterwards (success or failure). */
export function useMealActions(subscriptionId: string) {
  const api = useMessApi();
  const qc = useQueryClient();
  const busy = useIsMutating({ mutationKey: MEAL_WRITE }) > 0;
  const settle = () => {
    void qc.invalidateQueries({ queryKey: mk.calendar(subscriptionId) });
  };
  const options = { mutationKey: MEAL_WRITE, onSettled: settle };
  const pause = useMutation({ ...options, mutationFn: (mealId: string) => api.pauseMeal(subscriptionId, mealId) });
  const resume = useMutation({ ...options, mutationFn: (mealId: string) => api.resumeMeal(subscriptionId, mealId) });
  const isLocked = useCallback((): boolean => qc.isMutating({ mutationKey: MEAL_WRITE }) > 0, [qc]);
  return { pause, resume, busy, isLocked };
}

// ----------------------------------------------------------------- cancellation
export function useCancelSubscription(subscriptionId: string) {
  const api = useMessApi();
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['mess', 'cancel'],
    mutationFn: (v: { reasonCode: CancelReasonCode; note?: string }) => api.cancelSubscription(subscriptionId, v),
    // Success or failure, the subscription (status, refund, cancellation.allowed) is re-read: the server is the only authority.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: mk.subscription(subscriptionId) });
      void qc.invalidateQueries({ queryKey: mk.subscriptions });
      void qc.invalidateQueries({ queryKey: mk.calendar(subscriptionId) });
      void qc.invalidateQueries({ queryKey: qk.orders });
    }
  });
}

// ----------------------------------------------------------------- handover code
/** The handover STATE is a normal query; it never contains the code and is dropped from the cache as soon as the panel closes. */
export function useHandoverState(subscriptionId: string, mealId: string) {
  const api = useMessApi();
  return useQuery({ queryKey: mk.handover(subscriptionId, mealId), queryFn: () => api.handoverState(subscriptionId, mealId), staleTime: 0, gcTime: 0 });
}

/**
 * Generate / regenerate the code. The plaintext is held ONLY in this hook's React state: it is not written to the Query or mutation cache,
 * storage, navigation params, a URL or a log, and it disappears when the panel unmounts or `hide()` is called.
 */
export function useHandoverCode(subscriptionId: string, mealId: string) {
  const api = useMessApi();
  const state = useHandoverState(subscriptionId, mealId);
  const [code, setCode] = useState<HandoverIssued | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const alive = useRef(true);
  const inFlight = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(
    async (kind: 'issue' | 'regenerate') => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      setError(null);
      try {
        const out = kind === 'issue' ? await api.issueHandoverCode(subscriptionId, mealId) : await api.regenerateHandoverCode(subscriptionId, mealId);
        if (alive.current) setCode(out);
      } catch (e) {
        if (alive.current) {
          setCode(null);
          setError(e);
        }
      } finally {
        inFlight.current = false;
        if (alive.current) setBusy(false);
        void state.refetch();
      }
    },
    [api, subscriptionId, mealId, state]
  );

  const hide = useCallback(() => setCode(null), []);
  return { state, code, busy, error, issue: () => run('issue'), regenerate: () => run('regenerate'), hide };
}
