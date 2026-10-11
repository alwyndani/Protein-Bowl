import { useCallback, useRef, useState } from 'react';
import { DeliveryService } from '../services/deliveryService';
import type { DriverAction, DriverQueue, FailureReportInput } from '../services/deliveryTypes';
import { describeDeliveryError } from '../utils/deliveryErrors';
import { POLL_BACKOFF_MS, POLL_MS, usePolledResource } from './usePolledResource';

export const DELIVERY_POLL_MS = POLL_MS;
export const DELIVERY_BACKOFF_MS = POLL_BACKOFF_MS;

interface Options {
  /** Only a branch the server authorized for this account (the selector is built from the server's own `branches`). */
  branchId?: string;
  enabled?: boolean;
  onSessionExpired?: () => void;
  intervalMs?: number;
  backoffMs?: number;
}

export interface OrderActionState {
  pending: boolean;
  error: string | null;
}

/**
 * The delivery driver's queue with polling (see usePolledResource) plus the three driver actions. A synchronous per-order guard stops double
 * clicks / double taps; after a successful action the queue is refreshed. A stale card gets a clean server answer (409 / 404) mapped to safe copy.
 * The database decides every outcome: a disabled button is a convenience, never the protection.
 */
export function useDeliveryQueue({ branchId, enabled = true, onSessionExpired, intervalMs = DELIVERY_POLL_MS, backoffMs = DELIVERY_BACKOFF_MS }: Options = {}) {
  const polled = usePolledResource<DriverQueue, ReturnType<typeof describeDeliveryError>>({
    fetcher: () => DeliveryService.getQueue(branchId),
    resetKey: branchId ?? '',
    describeError: describeDeliveryError,
    enabled,
    onSessionExpired,
    serverTimeOf: (q) => q.serverTime,
    intervalMs,
    backoffMs
  });
  const { refresh, halt, isMounted } = polled;

  const [actions, setActions] = useState<Record<string, OrderActionState>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const actionBusy = useRef(new Set<string>());

  const run = useCallback(
    async (orderId: string, call: () => Promise<{ changed: boolean }>, noopNotice: string): Promise<boolean> => {
      if (actionBusy.current.has(orderId)) return false; // synchronous guard against double clicks / double taps
      actionBusy.current.add(orderId);
      setNotice(null);
      setActions((prev) => ({ ...prev, [orderId]: { pending: true, error: null } }));
      try {
        const result = await call();
        if (!isMounted.current) return false;
        setActions((prev) => ({ ...prev, [orderId]: { pending: false, error: null } }));
        if (!result.changed) setNotice(noopNotice);
        void refresh();
        return true;
      } catch (err) {
        const info = describeDeliveryError(err);
        if (info.action === 'SIGN_IN') halt();
        if (isMounted.current) {
          setActions((prev) => ({ ...prev, [orderId]: { pending: false, error: info.message } }));
          if (info.action === 'REFRESH') void refresh();
        }
        return false;
      } finally {
        actionBusy.current.delete(orderId);
      }
    },
    [refresh, halt, isMounted]
  );

  const act = useCallback((orderId: string, action: DriverAction) => run(orderId, () => DeliveryService.act(orderId, action), 'That order was already in that step. The list has been refreshed.'), [run]);
  const reportFailure = useCallback(
    (orderId: string, input: FailureReportInput) => run(orderId, () => DeliveryService.reportFailure(orderId, input), 'An issue was already reported for that order. The list has been refreshed.'),
    [run]
  );
  const dismissActionError = useCallback((orderId: string) => {
    setActions((prev) => ({ ...prev, [orderId]: { pending: false, error: null } }));
  }, []);

  return { queue: polled.data, loadState: polled.loadState, loadError: polled.loadError, stale: polled.stale, lastUpdatedMs: polled.lastUpdatedMs, clockOffsetMs: polled.clockOffsetMs, actions, notice, refresh, act, reportFailure, dismissActionError };
}
