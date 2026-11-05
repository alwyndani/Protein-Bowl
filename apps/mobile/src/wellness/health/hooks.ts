import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthProvider';
import { HealthApi } from './api';
import { healthKeys } from './queryKeys';
import type { HealthProfileInput } from './types';

export function useHealthApi(): HealthApi {
  const { manager } = useAuth();
  return useMemo(() => new HealthApi(manager.api), [manager]);
}

export function useHealthProfile() {
  const api = useHealthApi();
  return useQuery({ queryKey: healthKeys.profile, queryFn: api.profile, staleTime: 0 });
}

/**
 * Saves the profile. The server answers with the full, freshly derived profile which replaces the cached one. A failure is thrown to
 * the caller (nothing is retried, nothing is treated as saved).
 */
export function useSaveHealthProfile() {
  const api = useHealthApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: HealthProfileInput) => api.saveProfile(input),
    onSuccess: (profile) => {
      qc.setQueryData(healthKeys.profile, profile);
    }
  });
}
