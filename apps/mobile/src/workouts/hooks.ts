import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { WorkoutsApi } from './api';
import { wk } from './queryKeys';
import type { LogInput } from './types';

export function useWorkoutsApi(): WorkoutsApi {
  const { manager } = useAuth();
  return useMemo(() => new WorkoutsApi(manager.api), [manager]);
}

/** Always server-authoritative: never served from a stale cache. */
export function useWorkoutPlans() {
  const api = useWorkoutsApi();
  return useQuery({ queryKey: wk.plans, queryFn: api.plans, staleTime: 0 });
}

export function useWorkoutLogs(planId: string) {
  const api = useWorkoutsApi();
  return useQuery({ queryKey: wk.logs(planId), queryFn: () => api.logs(planId), staleTime: 0 });
}

/** Single, non-retried write. History is re-fetched from the server on success (nothing is appended locally). */
export function useLogProgress(planId: string) {
  const api = useWorkoutsApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LogInput) => api.logProgress(planId, input),
    retry: false,
    onSuccess: () => qc.invalidateQueries({ queryKey: wk.logs(planId) })
  });
}
