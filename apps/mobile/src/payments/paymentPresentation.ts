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
}

export const PAYMENT_NOT_COMPLETED_MESSAGE = 'Payment not completed';

const MESSAGES: Record<PresentationKind, string> = {
  READY_TO_PAY: 'Your order is ready for online payment.',
  STARTING: 'Preparing your payment…',
  CHECKOUT_OPEN: 'Complete your payment in the payment window.',
  VERIFYING: 'Confirming your payment with the bank…',
  CHECKING_PAYMENT: 'We are checking your payment. Please do not pay again yet.',
  PAYMENT_CONFIRMED: 'Payment confirmed.',
  PAYMENT_NOT_COMPLETED: PAYMENT_NOT_COMPLETED_MESSAGE,
  ACTION_REQUIRED: 'We could not complete this payment automatically. Please do not pay again. Contact Protein Bowl support.',
  UNAVAILABLE: 'Online payment is not available for this order right now.'
};

/** A payment window opened earlier is still unsettled. It is closed only by that window finishing (or the app restarting): never by waiting. */
export const CHECKOUT_PENDING_MESSAGE = 'A payment window may still be open. Please finish or close it. We will keep checking, and you cannot start another payment until it ends.';

export function derivePresentation(order: Pick<CustomerOrder, 'status' | 'paymentStatus' | 'payment'> | null, flow: FlowState, hasEvidence: boolean): PaymentPresentation {
  const make = (kind: PresentationKind, extra: Partial<Omit<PaymentPresentation, 'kind'>> = {}): PaymentPresentation => ({
    kind,
    message: MESSAGES[kind],
    canStartPayment: false,
    canRetryVerification: false,
    canCheckStatus: false,
    ...extra
  });

  const orderPaid = !!order && (order.payment?.state === 'PAID' || order.paymentStatus === 'PAID');
  // "Confirmed" is shown only when the order itself says so, never because a callback or a verify answer looked successful.
  if (orderPaid) return make('PAYMENT_CONFIRMED');
  if (flow.phase === 'PAID') return make('CHECKING_PAYMENT', { canCheckStatus: true }); // defensive: PAID phase without an order that says PAID

  if (flow.notice === 'CHECKOUT_PENDING' && (flow.phase === 'IDLE' || flow.phase === 'CONFIRMING' || flow.phase === 'CHECKING')) {
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
      const canStartBackend = !!order && order.payment?.canStartPayment === true && order.status === 'PENDING';
      if (flow.notice === 'NATIVE_UNAVAILABLE') return make('UNAVAILABLE');
      if (!canStartBackend) return make('UNAVAILABLE');
      const startable = !flow.ambiguousHold && !flow.nativeOpen;
      if (!startable) return make('CHECKING_PAYMENT', { canCheckStatus: true });
      if (flow.notice === 'NOT_COMPLETED') return make('PAYMENT_NOT_COMPLETED', { canStartPayment: true, canCheckStatus: true });
      return make('READY_TO_PAY', { canStartPayment: true, canRetryVerification: hasEvidence });
    }
  }
}
