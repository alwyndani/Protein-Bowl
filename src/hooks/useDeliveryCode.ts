import { useCallback, useEffect, useRef, useState } from 'react';
import { DeliveryCodeService } from '../services/deliveryCodeService';
import type { CustomerProof } from '../services/deliveryTypes';
import { describeDeliveryError } from '../utils/deliveryErrors';
import { usePolledResource } from './usePolledResource';

interface Options {
  orderId: string;
  /** Poll only while the order is out for delivery. */
  enabled: boolean;
  onSessionExpired?: () => void;
  /** Called once when the server reports the delivery as verified (the order should then be re-read). */
  onVerified?: () => void;
}

/**
 * The customer's Delivery Code. The SERVER state is polled with GET only. The plaintext code exists ONLY in this hook's memory, from the
 * moment issue / regenerate returns it until the customer leaves the screen (or the code is blocked / verified): it is never stored in
 * localStorage, sessionStorage, IndexedDB or logs, and there is no way to read it back from the server.
 */
export function useDeliveryCode({ orderId, enabled, onSessionExpired, onVerified }: Options) {
  const polled = usePolledResource<CustomerProof, ReturnType<typeof describeDeliveryError>>({
    fetcher: () => DeliveryCodeService.getState(orderId),
    resetKey: orderId,
    describeError: describeDeliveryError,
    enabled,
    onSessionExpired
  });
  const { refresh, halt, isMounted, data } = polled;

  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  // a different order never inherits another order's code
  useEffect(() => {
    setCode(null);
    setError(null);
  }, [orderId]);

  const state = data?.state ?? null;
  useEffect(() => {
    if (state === 'CODE_BLOCKED' || state === 'VERIFIED') setCode(null);
  }, [state]);
  const verifiedNotified = useRef(false);
  useEffect(() => {
    if (state === 'VERIFIED' && !verifiedNotified.current) {
      verifiedNotified.current = true;
      onVerified?.();
    }
  }, [state, onVerified]);

  const call = useCallback(
    async (fn: () => Promise<{ code: string }>) => {
      if (inFlight.current) return; // synchronous guard against double taps
      inFlight.current = true;
      setBusy(true);
      setError(null);
      try {
        const result = await fn();
        if (!isMounted.current) return;
        setCode(result.code);
        void refresh();
      } catch (err) {
        const info = describeDeliveryError(err);
        if (info.action === 'SIGN_IN') halt();
        if (isMounted.current) {
          setError(info.message);
          if (info.action === 'REFRESH') void refresh();
        }
      } finally {
        inFlight.current = false;
        if (isMounted.current) setBusy(false);
      }
    },
    [refresh, halt, isMounted]
  );

  const issue = useCallback(() => call(() => DeliveryCodeService.issue(orderId)), [call, orderId]);
  const regenerate = useCallback(() => call(() => DeliveryCodeService.regenerate(orderId)), [call, orderId]);
  const dismissError = useCallback(() => setError(null), []);

  return { proof: data, loadState: polled.loadState, loadError: polled.loadError, stale: polled.stale, code, busy, error, issue, regenerate, dismissError, refresh };
}
