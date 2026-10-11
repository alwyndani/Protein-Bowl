import { useCallback, useRef, useState } from 'react';
import { OrderService } from '../services/orderService';
import type { ApiOrder, CancelOrderResult, CustomerCancelReasonCode } from '../services/commerceTypes';
import { describeError, UserFacingError } from '../utils/paymentErrors';

export type CancelStatus = 'idle' | 'submitting' | 'done' | 'error';

interface Options {
  order: ApiOrder;
  /** Called after the server answered: the order is re-read from the backend and published (the response is not trusted blindly for display). */
  onOrder: (order: ApiOrder) => void;
  onSessionExpired?: () => void;
}

/**
 * Customer cancellation. The server decides whether it is allowed (the button is only offered when the server says
 * CANCELLATION_AVAILABLE) and answers with the cancellation + refund states; afterwards the order is re-fetched and the SERVER state
 * is rendered. The request carries only { reasonCode, note? }. It is never retried automatically and is guarded against a double click.
 */
export function useCancelOrder({ order, onOrder, onSessionExpired }: Options) {
  const [status, setStatus] = useState<CancelStatus>('idle');
  const [error, setError] = useState<UserFacingError | null>(null);
  const [result, setResult] = useState<CancelOrderResult | null>(null);
  const inFlight = useRef(false);

  const submit = useCallback(
    async (reasonCode: CustomerCancelReasonCode, note?: string) => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setStatus('submitting');
      setError(null);
      let ok = false;
      try {
        const res = await OrderService.cancelOrder(order.id, reasonCode, note);
        setResult(res);
        ok = true;
      } catch (err) {
        const info = describeError(err);
        setError(info);
        if (info.action === 'SIGN_IN') onSessionExpired?.();
      }
      // either way, trust the backend: re-read the order so the screen shows the server state (also after a rejected cancel)
      try {
        onOrder(await OrderService.getOrder(order.id));
      } catch (err) {
        if (describeError(err).action === 'SIGN_IN') onSessionExpired?.();
      }
      setStatus(ok ? 'done' : 'error');
      inFlight.current = false;
      return ok;
    },
    [order.id, onOrder, onSessionExpired]
  );

  return { status, error, result, submit, reset: () => { setStatus('idle'); setError(null); } };
}
