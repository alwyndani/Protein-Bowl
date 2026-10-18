import type { CustomerOrder } from '../commerce/types';
import type { FlowState } from './paymentFlowMachine';

/**
 * The semantic presentation model a payment panel can render (P11C-2 step 4; no UI exists yet). It is DERIVED from the authoritative order
 * and the local orchestration state; it never becomes a second source of financial truth and never turns a backend `false` into `true`.
 */
export type PresentationKind =
  | 'READY_TO_PAY'
  | 'STARTING'
  | 'CHECKOUT_OPEN'
  | 'VERIFYING'
  | 'CHECKING_PAYMENT'
  | 'PAYMENT_CONFIRMED'
  | 'PAYMENT_NOT_COMPLETED'
  | 'ACTION_REQUIRED'
  | 'UNAVAILABLE';

export interface PaymentPresentation {
  kind: PresentationKind;
  /** Customer wording (mapped copy only: never provider text, codes or server messages). */
  message: string;
  /** An explicit "pay" action may be offered: the BACKEND says it is safe AND nothing is in progress or in doubt on this device. */
  canStartPayment: boolean;
  /** "Verify again" with the SAME in-memory evidence (the caller supplies whether evidence exists). */
  canRetryVerification: boolean;
  /** A manual GET-only "Check payment status" is meaningful. */
  canCheckStatus: boolean;
  /** UNAVAILABLE because THIS build / device has no secure payment window (not because of the order). */
  nativeUnavailable: boolean;
}

/** Facts about THIS device that the presentation needs and the order cannot tell. */
export interface PaymentEnvironment {
  /** The native checkout is unsettled somewhere in this process (possibly started by another screen). */
  lockOpen: boolean;
  /** The build contains the native checkout (false in Expo Go). */
  nativeAvailable: boolean;
}

export const PAYMENT_NOT_COMPLETED_MESSAGE = 'Payment not completed';

const MESSAGES: Record<PresentationKind, string> = {
  READY_TO_PAY: 'Your order is ready for online payment.',
  STARTING: 'Preparing secure payment…',
  CHECKOUT_OPEN: 'Complete payment in the secure payment window.',
  VERIFYING: 'Verifying payment…',
  CHECKING_PAYMENT: "We're checking your payment status. This can take a moment. Please don't pay again yet.",
  PAYMENT_CONFIRMED: 'Payment confirmed',
  PAYMENT_NOT_COMPLETED: PAYMENT_NOT_COMPLETED_MESSAGE,
  ACTION_REQUIRED: 'We could not complete this payment automatically. Please do not pay again. Contact Protein Bowl support.',
  UNAVAILABLE: 'Online payment is not available for this order right now.'
};

/** A payment window opened earlier is still unsettled. It is closed only by that window finishing (or the app restarting): never by waiting. */
export const CHECKOUT_PENDING_MESSAGE = 'A payment window may still be open. Please finish or close it. We will keep checking, and you cannot start another payment until it ends.';

export function derivePresentation(
  order: Pick<CustomerOrder, 'status' | 'paymentStatus' | 'payment'> | null,
  flow: FlowState,
  hasEvidence: boolean,
  env: PaymentEnvironment = { lockOpen: false, nativeAvailable: true }
): PaymentPresentation {
  const make = (kind: PresentationKind, extra: Partial<Omit<PaymentPresentation, 'kind'>> = {}): PaymentPresentation => ({
    kind,
    message: MESSAGES[kind],
    canStartPayment: false,
    canRetryVerification: false,
    canCheckStatus: false,
    nativeUnavailable: false,
    ...extra
  });

  const orderPaid = !!order && (order.payment?.state === 'PAID' || order.paymentStatus === 'PAID');
  // "Confirmed" is shown only when the order itself says so, never because a callback or a verify answer looked successful.
  if (orderPaid) return make('PAYMENT_CONFIRMED');
  if (flow.phase === 'PAID') return make('CHECKING_PAYMENT', { canCheckStatus: true }); // defensive: PAID phase without an order that says PAID

  // A native checkout that has not settled blocks everything that could start another one, wherever it was opened.
  const pendingLock = (flow.notice === 'CHECKOUT_PENDING' || (env.lockOpen && !flow.nativeOpen)) && (flow.phase === 'IDLE' || flow.phase === 'CONFIRMING' || flow.phase === 'CHECKING');
  if (pendingLock) {
    return make('CHECKING_PAYMENT', { canCheckStatus: true, canRetryVerification: hasEvidence, message: CHECKOUT_PENDING_MESSAGE });
  }

  switch (flow.phase) {
    case 'CREATING_SESSION':
    case 'OPENING_CHECKOUT':
      return make('STARTING');
    case 'CHECKOUT_ACTIVE':
      return make('CHECKOUT_OPEN');
    case 'VERIFYING':
      return make('VERIFYING');
    case 'CONFIRMING':
    case 'CHECKING':
      if (flow.notice === 'ACTION_REQUIRED') return make('ACTION_REQUIRED', { canCheckStatus: true });
      return make('CHECKING_PAYMENT', { canCheckStatus: true, canRetryVerification: hasEvidence });
    case 'BLOCKED':
      return make('UNAVAILABLE');
    case 'IDLE': {
      // Fail closed: only a CONSISTENT summary (an allowed state AND the explicit flag) on a PENDING order counts as "the backend allows it".
      const state = order?.payment?.state;
      const canStartBackend = !!order && order.payment?.canStartPayment === true && (state === 'NOT_STARTED' || state === 'AWAITING_PAYMENT') && order.status === 'PENDING';
      if (!canStartBackend) return make('UNAVAILABLE');
      if (flow.notice === 'NATIVE_UNAVAILABLE' || !env.nativeAvailable) return make('UNAVAILABLE', { nativeUnavailable: true });
      // Unverified payment evidence, an ambiguous result or an unsettled native promise mean the outcome is unresolved on this device.
      const startable = !flow.ambiguousHold && !flow.nativeOpen && !hasEvidence;
      if (!startable) return make('CHECKING_PAYMENT', { canCheckStatus: true, canRetryVerification: hasEvidence });
      if (flow.notice === 'NOT_COMPLETED') return make('PAYMENT_NOT_COMPLETED', { canStartPayment: true, canCheckStatus: true });
      return make('READY_TO_PAY', { canStartPayment: true });
    }
  }
}
