import { useMemo } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { ApiError } from '../api/ApiError';
import { OrderActionsApi } from './orderActionsApi';

export function useOrderActionsApi(): OrderActionsApi {
  const { manager } = useAuth();
  return useMemo(() => new OrderActionsApi(manager.api), [manager]);
}

/** Fixed customer copy for the codes these endpoints emit; raw server text is never shown. */
export function orderActionMessage(error: unknown, what: 'cancel' | 'code'): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return 'Too many attempts. Please wait a little and try again.';
    if (error.status === 404) return 'We could not find this order.';
    if (error.status === 409) {
      if (error.code === 'DELIVERY_CODE_REGENERATION_LIMIT') return 'You have reached the limit for new codes on this order. Please contact Protein Bowl support.';
      if (error.code === 'DELIVERY_CODE_ALREADY_ISSUED') return 'A code was already created. Refresh to continue.';
      if (what === 'cancel') return 'This order can no longer be cancelled.';
      return 'A delivery code is not available for this order right now.';
    }
    if (error.status === 422) return 'That request was not valid. Please check it and try again.';
  }
  return what === 'cancel' ? 'We could not cancel this order. Please try again.' : 'We could not reach the server. Please try again.';
}
