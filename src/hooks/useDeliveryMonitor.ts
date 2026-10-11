import { DeliveryService } from '../services/deliveryService';
import type { DeliveryMonitor } from '../services/deliveryTypes';
import { describeDeliveryError } from '../utils/deliveryErrors';
import { usePolledResource } from './usePolledResource';

/** SUPER_ADMIN / MD read-only delivery monitor of ONE explicit branch, polled with the shared (GET-only) pattern. */
export function useDeliveryMonitor({ branchId, onSessionExpired }: { branchId: string; onSessionExpired?: () => void }) {
  return usePolledResource<DeliveryMonitor, ReturnType<typeof describeDeliveryError>>({
    fetcher: () => DeliveryService.getMonitor(branchId),
    resetKey: branchId,
    describeError: describeDeliveryError,
    enabled: !!branchId,
    onSessionExpired,
    serverTimeOf: (m) => m.serverTime
  });
}
