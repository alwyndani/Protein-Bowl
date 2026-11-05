import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthProvider';
import { DietApi } from './api';
import { dietKeys } from './queryKeys';
import type { DietRequestInput } from './types';

export function useDietApi(): DietApi {
  const { manager } = useAuth();
  return useMemo(() => new DietApi(manager.api), [manager]);
}

export function useDietRequests() {
  const api = useDietApi();
  return useQuery({ queryKey: dietKeys.requests, queryFn: api.requests, staleTime: 0 });
}

export function useDietPlans() {
  const api = useDietApi();
  return useQuery({ queryKey: dietKeys.plans, queryFn: api.plans, staleTime: 0 });
}

/** Diet writes. The server is the authority on state: after any write both lists are re-read, nothing is patched locally. */
export function useDietWrites() {
  const api = useDietApi();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: dietKeys.all });
  const create = useMutation({ mutationFn: (input: DietRequestInput) => api.createRequest(input), onSuccess: refresh });
  const approve = useMutation({ mutationFn: (v: { planId: string; feedback?: string }) => api.approvePlan(v.planId, v.feedback), onSuccess: refresh });
  const revise = useMutation({ mutationFn: (v: { planId: string; notes: string }) => api.requestRevision(v.planId, v.notes), onSuccess: refresh });
  return { create, approve, revise, busy: create.isPending || approve.isPending || revise.isPending };
}
