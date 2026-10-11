import { useCallback, useEffect, useRef } from 'react';
import { orderPath, parseOrderRoute } from '../utils/orderRoute';

interface Options {
  /** AuthContext is still restoring the session (refresh cookie): do not decide anything yet. */
  authLoading: boolean;
  /** Open the order UI for this order number (the host loads the order from the backend). */
  open: (orderNumber: string) => void;
  /** Close the order UI (browser back to a non-order URL). */
  close: () => void;
  /** Run `action` now when a customer is signed in, otherwise show the sign-in flow and run it after a successful sign-in. */
  requireAuth: (action: () => void) => void;
  /**
   * A session exists. The customer sign-in flow can be dismissed after authenticating (its pending action then never runs), so an order
   * link that was waiting for authentication is opened as soon as this becomes true.
   */
  isAuthenticated?: boolean;
}

/**
 * Order deep links without a router: /orders/<orderNumber>. The URL only carries the order number: everything shown is read from the
 * backend after authentication, so a refresh, a closed browser or a later sign-in recovers the true state. Nothing about a payment is
 * stored in the URL, in localStorage or in sessionStorage.
 */
export function useOrderDeepLink({ authLoading, open, close, requireAuth, isAuthenticated = false }: Options) {
  const latest = useRef({ open, close, requireAuth });
  latest.current = { open, close, requireAuth };
  const handledInitial = useRef(false);
  /** The order number whose link is waiting for a sign-in. */
  const waitingFor = useRef<string | null>(null);

  const openWhenAllowed = useCallback((orderNumber: string) => {
    waitingFor.current = orderNumber;
    latest.current.requireAuth(() => {
      waitingFor.current = null;
      latest.current.open(orderNumber);
    });
  }, []);

  // initial load: wait for the session restoration, then follow the path once
  useEffect(() => {
    if (authLoading || handledInitial.current) return;
    handledInitial.current = true;
    const orderNumber = parseOrderRoute(window.location.pathname);
    if (orderNumber) openWhenAllowed(orderNumber);
  }, [authLoading, openWhenAllowed]);

  // the customer authenticated but dismissed the rest of the sign-in flow: still open the order the link points at
  useEffect(() => {
    const orderNumber = waitingFor.current;
    if (!isAuthenticated || !orderNumber) return;
    waitingFor.current = null;
    if (parseOrderRoute(window.location.pathname) === orderNumber) latest.current.open(orderNumber);
  }, [isAuthenticated]);

  // browser back / forward
  useEffect(() => {
    const onPop = () => {
      const orderNumber = parseOrderRoute(window.location.pathname);
      if (orderNumber) openWhenAllowed(orderNumber);
      else {
        waitingFor.current = null;
        latest.current.close();
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [openWhenAllowed]);

  /** Reflect an opened order in the address bar (so it can be bookmarked / refreshed). */
  const pushOrder = useCallback((orderNumber: string) => {
    if (parseOrderRoute(window.location.pathname) !== orderNumber) window.history.pushState({ order: orderNumber }, '', orderPath(orderNumber));
  }, []);

  /** Leave the order URL (no extra history entry). */
  const clearOrder = useCallback(() => {
    if (parseOrderRoute(window.location.pathname)) window.history.replaceState({}, '', '/');
  }, []);

  return { pushOrder, clearOrder };
}
