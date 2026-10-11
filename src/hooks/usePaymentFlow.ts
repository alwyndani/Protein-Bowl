import { useCallback, useEffect, useReducer, useRef } from 'react';
import { PaymentService } from '../services/paymentService';
import type { ApiOrder, CheckoutSession } from '../services/commerceTypes';
import { describeError } from '../utils/paymentErrors';
import { loadRazorpay, RazorpayConstructor, RazorpayFailureResponse, RazorpaySuccessResponse } from '../utils/razorpayLoader';

/**
 * Client-only payment UX state machine. It is NEVER financial truth: every transition that matters is decided by a response from
 * the trusted backend (order DTO `payment.state` / `payment.canStartPayment`, or the verification endpoint's own answer).
 *
 *   IDLE            nothing in flight, the server says payment may be started
 *   PREPARING       loading checkout.js / creating (or re-using) the server payment session
 *   CHECKOUT_OPEN   the provider modal is open (exactly one instance)
 *   VERIFYING       the handler fired (or the modal closed) and we are asking the server
 *   CONFIRMING      payment truth is unresolved on the server: "do not pay again"; bounded GET polling
 *   CONFIRMED       the server says the order is paid
 *   RETRYABLE       the server says no payment is in flight and a new attempt may be started (canStartPayment === true)
 *   BLOCKED         the server says this order cannot be paid (cancelled, not payable online, ...)
 *   ERROR           an unexpected local failure with no server decision (manual refresh offered)
 *
 * Rules enforced here: the client can only ever DISABLE more than the server allows (never false -> true); the handler result is sent
 * to the verify endpoint and nowhere else; a dismissal / payment.failed / network error is never a reason to offer "Pay again" by
 * itself: the server is asked first. Polling is GET-only and bounded; it never creates sessions, re-posts verification or orders.
 */
export type PaymentPhase = 'IDLE' | 'PREPARING' | 'CHECKOUT_OPEN' | 'VERIFYING' | 'CONFIRMING' | 'CONFIRMED' | 'RETRYABLE' | 'BLOCKED' | 'ERROR';

export interface FlowMessage {
  kind: 'info' | 'error' | 'success';
  text: string;
}

interface FlowState {
  phase: PaymentPhase;
  message: FlowMessage | null;
  /** The bounded automatic polling window ended while still unresolved. */
  pollingStopped: boolean;
}

type Action = { type: 'PHASE'; phase: PaymentPhase; message?: FlowMessage | null; pollingStopped?: boolean } | { type: 'POLLING_STOPPED' } | { type: 'RESTART_POLLING' };

function reducer(state: FlowState, action: Action): FlowState {
  switch (action.type) {
    case 'PHASE':
      return { phase: action.phase, message: action.message === undefined ? null : action.message, pollingStopped: action.pollingStopped ?? false };
    case 'POLLING_STOPPED':
      return { ...state, pollingStopped: true };
    case 'RESTART_POLLING':
      return { ...state, pollingStopped: false };
    default:
      return state;
  }
}

/** UX values (not financial policy). Delays between GET refreshes while CONFIRMING: ~2 s, then ~4 s for a minute, then ~10 s up to ~3 minutes. */
export const POLL_SCHEDULE_MS: number[] = [2000, ...Array.from({ length: 15 }, () => 4000), ...Array.from({ length: 12 }, () => 10000)];

const CONFIRMING_COPY = 'Payment is being confirmed. Please do not pay again yet.';

function derivePhase(order: ApiOrder): PaymentPhase {
  const p = order.payment;
  if (p?.state === 'PAID' || order.paymentStatus === 'PAID') return 'CONFIRMED';
  if (order.status === 'CANCELLED') return 'BLOCKED';
  if (!p || p.canStartPayment !== true) return p?.state === 'CONFIRMING' ? 'CONFIRMING' : 'BLOCKED'; // no summary = conservative
  return 'IDLE';
}

interface Options {
  orderId: string;
  /** The latest trusted order (owned by the parent). Its `payment` summary is the ONLY authority for starting a payment. */
  order: ApiOrder;
  /** GET the order from the backend (a safe read). */
  fetchOrder: () => Promise<ApiOrder>;
  /** Publish a refreshed, trusted order to the parent. */
  onOrder: (order: ApiOrder) => void;
  onSessionExpired?: () => void;
}

export function usePaymentFlow({ orderId, order, fetchOrder, onOrder, onSessionExpired }: Options) {
  const [state, dispatch] = useReducer(reducer, undefined, (): FlowState => ({ phase: derivePhase(order), message: null, pollingStopped: false }));

  // refs: synchronous guards and always-fresh callbacks (the provider handler can outlive a render, or even the component)
  const mounted = useRef(true);
  const inFlight = useRef(false); // set synchronously BEFORE any await: blocks a second Pay click before React re-renders
  const refreshing = useRef(false);
  const handlerFired = useRef(false);
  const paymentFailedSeen = useRef(false);
  const latest = useRef({ order, fetchOrder, onOrder, onSessionExpired, orderId, phase: state.phase });
  latest.current = { order, fetchOrder, onOrder, onSessionExpired, orderId, phase: state.phase };
  const tick = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = useCallback((phase: PaymentPhase, message?: FlowMessage | null, pollingStopped?: boolean) => {
    if (phase === 'CONFIRMING' && latest.current.phase !== 'CONFIRMING') tick.current = 0; // a fresh bounded polling window
    if (mounted.current) dispatch({ type: 'PHASE', phase, message, pollingStopped });
  }, []);

  /** Ask the server for the truth. Returns the trusted order, or null when it could not be read. Never mutates anything. */
  const refreshOrder = useCallback(async (): Promise<ApiOrder | null> => {
    if (refreshing.current) return null;
    refreshing.current = true;
    try {
      const fresh = await latest.current.fetchOrder();
      latest.current.onOrder(fresh);
      latest.current.order = fresh;
      return fresh;
    } catch (err) {
      if (describeError(err).action === 'SIGN_IN') latest.current.onSessionExpired?.();
      return null;
    } finally {
      refreshing.current = false;
    }
  }, []);

  /** After a dismissal / payment.failed / ambiguous error: ask the server, then follow ITS answer (never offer a blind retry). */
  const decideAfterAmbiguity = useCallback(
    async (note: FlowMessage | null) => {
      const fresh = await refreshOrder();
      if (!fresh) {
        // the server could not be read: this MUST NOT look like a failure or an invitation to pay again
        set('CONFIRMING', { kind: 'info', text: CONFIRMING_COPY });
        return;
      }
      const phase = derivePhase(fresh);
      if (phase === 'CONFIRMED') set('CONFIRMED', { kind: 'success', text: 'Payment confirmed. Thank you!' });
      else if (phase === 'CONFIRMING') set('CONFIRMING', { kind: 'info', text: CONFIRMING_COPY });
      else if (phase === 'BLOCKED') set('BLOCKED', { kind: 'info', text: 'This order cannot be paid right now.' });
      else set('RETRYABLE', note ?? { kind: 'info', text: 'The payment was not completed. You can try again.' }); // canStartPayment === true: the server says it is safe
    },
    [refreshOrder, set]
  );

  const handleFailure = useCallback(
    async (err: unknown) => {
      const info = describeError(err);
      if (info.action === 'SIGN_IN') {
        latest.current.onSessionExpired?.();
        set('RETRYABLE', { kind: 'error', text: info.message });
        return;
      }
      if (info.action === 'CONFIRMING') {
        set('CONFIRMING', { kind: 'info', text: info.message });
        return;
      }
      if (info.action === 'REFRESH_ORDER' || info.action === 'SUPPORT' || info.action === 'NONE') {
        const fresh = await refreshOrder();
        const phase = fresh ? derivePhase(fresh) : 'CONFIRMING';
        set(phase === 'IDLE' ? 'BLOCKED' : phase, { kind: phase === 'CONFIRMED' ? 'success' : 'error', text: phase === 'CONFIRMED' ? 'Payment confirmed. Thank you!' : info.message });
        return;
      }
      // RETRY / INLINE: the server may or may not have started something: it decides
      await decideAfterAmbiguity({ kind: 'error', text: info.message });
    },
    [decideAfterAmbiguity, refreshOrder, set]
  );

  const startPayment = useCallback(async () => {
    const cur = latest.current;
    if (inFlight.current) return;
    if (cur.order.payment?.canStartPayment !== true) return; // the client may NEVER turn the server's false into true
    if (cur.phase !== 'IDLE' && cur.phase !== 'RETRYABLE') return;
    inFlight.current = true;
    handlerFired.current = false;
    paymentFailedSeen.current = false;
    set('PREPARING', { kind: 'info', text: 'Opening payment…' });

    let session: CheckoutSession;
    let Razorpay: RazorpayConstructor;
    try {
      Razorpay = await loadRazorpay();
    } catch {
      inFlight.current = false;
      // nothing was created, nothing was charged
      set('RETRYABLE', { kind: 'error', text: 'We could not open the payment window. Please check your connection and try again.' });
      return;
    }
    try {
      session = await PaymentService.createSession(cur.orderId);
    } catch (err) {
      try {
        await handleFailure(err);
      } finally {
        inFlight.current = false;
      }
      return;
    }

    const instance = new Razorpay({
      key: session.keyId,
      order_id: session.providerOrderId,
      amount: session.amountMinor, // display only: the provider order already fixed the amount
      currency: session.currency,
      name: 'Protein Bowl',
      description: `Order ${session.orderNumber}`,
      theme: { color: '#f59e0b' },
      modal: {
        escape: true,
        confirm_close: true,
        ondismiss: () => {
          if (handlerFired.current) return; // the verification path owns the outcome
          void (async () => {
            set('VERIFYING', { kind: 'info', text: 'Checking your payment status…' });
            try {
              await decideAfterAmbiguity(
                paymentFailedSeen.current ? { kind: 'error', text: 'Your payment did not go through. No payment is pending, so you can try again.' } : null
              );
            } finally {
              inFlight.current = false;
            }
          })();
        }
      },
      handler: (response: RazorpaySuccessResponse) => {
        // NOT financial truth: the evidence goes to the server's verification endpoint, and the UI follows the server's answer.
        handlerFired.current = true;
        set('VERIFYING', { kind: 'info', text: 'Verifying payment…' });
        void (async () => {
          try {
            const result = await PaymentService.verify(cur.orderId, session.attemptId, {
              providerOrderId: session.providerOrderId,
              providerPaymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature
            });
            if (result.result === 'PAID') {
              set('CONFIRMED', { kind: 'success', text: 'Payment confirmed. Thank you!' });
              void refreshOrder(); // show the confirmed order; the verification answer above is already the server's word
            } else {
              set('CONFIRMING', { kind: 'info', text: CONFIRMING_COPY });
              void refreshOrder();
            }
          } catch (err) {
            await handleFailure(err);
          } finally {
            inFlight.current = false;
          }
        })();
      }
    });

    instance.on('payment.failed', (_failure: RazorpayFailureResponse) => {
      // informational only: the customer may still retry inside the provider modal. Never log or render the provider's error.
      paymentFailedSeen.current = true;
      void refreshOrder();
    });
    set('CHECKOUT_OPEN', { kind: 'info', text: 'Complete your payment in the payment window.' });
    instance.open();
  }, [decideAfterAmbiguity, handleFailure, refreshOrder, set]);

  /** Manual "Refresh status": one safe GET, and a fresh bounded polling window if payment is still unresolved. */
  const refreshStatus = useCallback(async () => {
    const fresh = await refreshOrder();
    if (!fresh) return;
    const phase = derivePhase(fresh);
    if (latest.current.phase === 'CONFIRMING' || latest.current.phase === 'ERROR') {
      if (phase === 'CONFIRMED') set('CONFIRMED', { kind: 'success', text: 'Payment confirmed. Thank you!' });
      else if (phase === 'CONFIRMING') {
        tick.current = 0;
        set('CONFIRMING', { kind: 'info', text: CONFIRMING_COPY }, false);
      } else if (phase === 'IDLE') set('RETRYABLE', { kind: 'info', text: 'No payment was received. You can try again.' });
      else set('BLOCKED', { kind: 'info', text: 'This order cannot be paid right now.' });
    }
  }, [refreshOrder, set]);

  // ---- bounded GET-only polling while CONFIRMING (paused while the tab is hidden, resumed with an immediate refresh)
  useEffect(() => {
    if (state.phase !== 'CONFIRMING' || state.pollingStopped) return;
    let cancelled = false;

    const clear = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
    const step = async () => {
      timer.current = null;
      if (cancelled) return;
      if (document.hidden) return; // paused: the visibility listener resumes it
      const fresh = await refreshOrder();
      if (cancelled) return;
      if (fresh) {
        const phase = derivePhase(fresh);
        if (phase === 'CONFIRMED') return void set('CONFIRMED', { kind: 'success', text: 'Payment confirmed. Thank you!' });
        if (phase === 'BLOCKED') return void set('BLOCKED', { kind: 'info', text: 'This order cannot be paid right now.' });
        if (phase === 'IDLE') return void set('RETRYABLE', { kind: 'info', text: 'No payment was received. You can try again.' });
      }
      schedule();
    };
    const schedule = () => {
      clear();
      if (tick.current >= POLL_SCHEDULE_MS.length) {
        if (!cancelled) dispatch({ type: 'POLLING_STOPPED' });
        return;
      }
      const delay = POLL_SCHEDULE_MS[tick.current++];
      timer.current = setTimeout(() => void step(), delay);
    };
    const onVisible = () => {
      if (document.hidden || cancelled) return;
      clear();
      void step(); // immediate refresh when the tab is visible again
    };

    document.addEventListener('visibilitychange', onVisible);
    schedule();
    return () => {
      cancelled = true;
      clear();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [state.phase, state.pollingStopped, refreshOrder, set]);

  // ---- refresh trusted state when the customer comes back (focus / tab visible), unless a request or the provider modal is active
  useEffect(() => {
    const onBack = () => {
      if (document.hidden || inFlight.current) return;
      const p = latest.current.phase;
      if (p === 'PREPARING' || p === 'CHECKOUT_OPEN' || p === 'VERIFYING' || p === 'CONFIRMING' || p === 'CONFIRMED') return; // CONFIRMING has its own polling
      void (async () => {
        const fresh = await refreshOrder();
        if (!fresh) return;
        const phase = derivePhase(fresh);
        if (phase === 'CONFIRMED') set('CONFIRMED', { kind: 'success', text: 'Payment confirmed. Thank you!' });
        else if (phase === 'CONFIRMING') set('CONFIRMING', { kind: 'info', text: CONFIRMING_COPY });
        else if (phase === 'BLOCKED') set('BLOCKED', null);
      })();
    };
    window.addEventListener('focus', onBack);
    document.addEventListener('visibilitychange', onBack);
    return () => {
      window.removeEventListener('focus', onBack);
      document.removeEventListener('visibilitychange', onBack);
    };
  }, [refreshOrder, set]);

  // ---- follow server-side changes published by the parent (e.g. an order list refresh)
  useEffect(() => {
    const phase = derivePhase(order);
    const cur = latest.current.phase;
    if (cur === 'PREPARING' || cur === 'CHECKOUT_OPEN' || cur === 'VERIFYING') return;
    if (phase === 'CONFIRMED' && cur !== 'CONFIRMED') set('CONFIRMED', { kind: 'success', text: 'Payment confirmed. Thank you!' });
    else if (phase === 'CONFIRMING' && cur !== 'CONFIRMING') set('CONFIRMING', { kind: 'info', text: CONFIRMING_COPY });
    else if (phase === 'BLOCKED' && (cur === 'IDLE' || cur === 'RETRYABLE')) set('BLOCKED', null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  useEffect(() => {
    mounted.current = true; // React StrictMode runs setup -> cleanup -> setup: the flag must come back to true
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const busy = state.phase === 'PREPARING' || state.phase === 'CHECKOUT_OPEN' || state.phase === 'VERIFYING';
  return {
    phase: state.phase,
    message: state.message,
    pollingStopped: state.pollingStopped,
    busy,
    /** Pay is offered only when the SERVER allows it AND nothing is in flight locally. */
    canPay: order.payment?.canStartPayment === true && !busy && (state.phase === 'IDLE' || state.phase === 'RETRYABLE'),
    startPayment,
    refreshStatus
  };
}
