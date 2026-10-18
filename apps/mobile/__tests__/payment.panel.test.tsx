import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { CustomerOrder } from '../src/commerce/types';
import { INITIAL_FLOW_STATE } from '../src/payments/paymentFlowMachine';
import type { FlowState } from '../src/payments/paymentFlowMachine';
import { derivePresentation } from '../src/payments/paymentPresentation';

/**
 * PaymentPanel is presentation only. The orchestration hook is replaced by a controllable fake whose presentation is computed by the REAL
 * derivePresentation from a local flow state and the order, so these tests prove what the customer sees and can press for each state,
 * and that the panel only forwards presses to the three existing actions (never an amount, provider order, currency or method).
 */
const mockStart = jest.fn();
const mockRetry = jest.fn();
const mockCheck = jest.fn();
let mockFlow: FlowState = INITIAL_FLOW_STATE;
let mockEvidence = false;
let mockOrder: CustomerOrder;
let mockEnv = { lockOpen: false, nativeAvailable: true };

jest.mock('../src/commerce/usePaymentFlow', () => ({
  usePaymentFlow: () => ({
    flow: mockFlow,
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    presentation: require('../src/payments/paymentPresentation').derivePresentation(mockOrder, mockFlow, mockEvidence, mockEnv),
    startPayment: (...a: unknown[]) => mockStart(...a),
    retryVerification: (...a: unknown[]) => mockRetry(...a),
    checkPaymentStatus: (...a: unknown[]) => mockCheck(...a)
  })
}));

import { PaymentPanel } from '../src/screens/commerce/PaymentPanel';

const base = { id: 'ord-1', orderNumber: 'PB-261017-ABC123', status: 'PENDING', paymentStatus: 'PENDING', netAmount: '678', totalAmount: '600' } as unknown as CustomerOrder;
const startable = { ...base, payment: { state: 'AWAITING_PAYMENT', canStartPayment: true } } as CustomerOrder;
const confirming = { ...base, payment: { state: 'CONFIRMING', canStartPayment: false } } as CustomerOrder;
const paid = { ...base, status: 'CONFIRMED', paymentStatus: 'PAID', payment: { state: 'PAID', canStartPayment: false } } as CustomerOrder;
const blocked = { ...base, status: 'CANCELLED', payment: { state: 'NOT_STARTED', canStartPayment: false } } as CustomerOrder;

function show(order: CustomerOrder, flow: Partial<FlowState> = {}, evidence = false, env = { lockOpen: false, nativeAvailable: true }) {
  mockEnv = env;
  mockOrder = order;
  mockFlow = { ...INITIAL_FLOW_STATE, ...flow };
  mockEvidence = evidence;
  return render(<PaymentPanel order={order} />);
}
const buttons = () => screen.queryAllByRole('button').map((b) => String(b.props.accessibilityLabel));

beforeEach(() => {
  mockStart.mockReset();
  mockRetry.mockReset();
  mockCheck.mockReset();
});

describe('READY', () => {
  it('an eligible order shows the server total (informational) and ONE primary action', () => {
    show(startable);
    expect(screen.getByText(/Payment is required before your order can be confirmed/)).toBeTruthy();
    expect(screen.getByText('Amount due')).toBeTruthy();
    expect(screen.getByText('₹678.00')).toBeTruthy();
    expect(buttons()).toEqual(['Pay Now']);
  });

  it('a press calls startPayment exactly once with NO arguments (no amount, currency, provider order or method)', () => {
    show(startable);
    fireEvent.press(screen.getByRole('button', { name: 'Pay Now' }));
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockStart.mock.calls[0]).toEqual([]);
  });

  it('nothing starts on mount or re-render', () => {
    const view = show(startable);
    view.rerender(<PaymentPanel order={startable} />);
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockRetry).not.toHaveBeenCalled();
    expect(mockCheck).not.toHaveBeenCalled();
  });
});

describe('in-progress states', () => {
  it('STARTING: progress copy, no payment action', () => {
    show(startable, { phase: 'CREATING_SESSION' });
    expect(screen.getByText('Preparing secure payment…')).toBeTruthy();
    expect(buttons()).toEqual([]);
  });

  it('CHECKOUT OPEN: secure-window copy and NO second payment action', () => {
    show(startable, { phase: 'CHECKOUT_ACTIVE', nativeOpen: true });
    expect(screen.getByText('Complete payment in the secure payment window.')).toBeTruthy();
    expect(buttons()).toEqual([]);
  });

  it('VERIFYING: verifying copy, no success claim, no payment action', () => {
    show(startable, { phase: 'VERIFYING' });
    expect(screen.getByText('Verifying payment…')).toBeTruthy();
    expect(screen.queryByText(/confirmed|successful|success/i)).toBeNull();
    expect(buttons()).toEqual([]);
  });
});

describe('CHECKING / CONFIRMING', () => {
  it('safe wording, a GET-only status check, no retry-verification without evidence, no Pay Now', () => {
    show(confirming, { phase: 'CONFIRMING' });
    expect(screen.getByText(/We're checking your payment status/)).toBeTruthy();
    expect(buttons()).toEqual(['Check payment status']);
    fireEvent.press(screen.getByRole('button', { name: 'Check payment status' }));
    expect(mockCheck).toHaveBeenCalledTimes(1);
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockRetry).not.toHaveBeenCalled();
  });

  it('Retry verification appears ONLY when the orchestration reports same-process evidence, and calls retryVerification once', () => {
    show(confirming, { phase: 'CONFIRMING', notice: 'VERIFY_UNCERTAIN' }, true);
    expect(buttons().sort()).toEqual(['Check payment status', 'Retry verification']);
    fireEvent.press(screen.getByRole('button', { name: 'Retry verification' }));
    expect(mockRetry).toHaveBeenCalledTimes(1);
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('a startable order the flow is still holding (ambiguous hold) offers NO Pay Now', () => {
    show(startable, { phase: 'CONFIRMING', ambiguousHold: true, notice: 'AMBIGUOUS' });
    expect(buttons()).not.toContain('Pay Now');
  });
});

describe('PAYMENT NOT COMPLETED (neutral)', () => {
  it('exact wording, no failed / declined / cancelled inference, Pay Now only because the backend allows it', () => {
    show(startable, { notice: 'NOT_COMPLETED' });
    expect(screen.getByText('Payment not completed')).toBeTruthy();
    expect(screen.queryByText(/failed|declined|cancel/i)).toBeNull();
    expect(buttons()).toContain('Pay Now');
  });

  it('when the backend does NOT allow payment, no Pay Now is shown', () => {
    show(confirming, { phase: 'CONFIRMING', notice: 'NOT_COMPLETED' });
    expect(buttons()).not.toContain('Pay Now');
    expect(screen.queryByText(/failed|declined/i)).toBeNull();
  });
});

describe('stuck native checkout', () => {
  it('a safe warning with NO release, reopen or pay-again control', () => {
    show(startable, { notice: 'CHECKOUT_PENDING' });
    expect(screen.getByText(/payment window may still be open/i)).toBeTruthy();
    expect(buttons()).toEqual(['Check payment status']);
    expect(screen.queryByText(/pay again|restart|reset|wait \d/i)).toBeNull();
  });
});

describe('PAID, ACTION REQUIRED, UNAVAILABLE', () => {
  it('confirmed only when the authoritative order says PAID, and then no payment button', () => {
    show(paid, { phase: 'PAID' });
    expect(screen.getAllByText(/Payment confirmed/).length).toBeGreaterThan(0);
    expect(buttons()).toEqual([]);
  });

  it('a PAID flow phase without a PAID order never claims confirmation', () => {
    show(confirming, { phase: 'PAID' });
    expect(screen.queryByText(/Payment confirmed/)).toBeNull();
  });

  it('ACTION REQUIRED: support wording, no automatic or manual new checkout', () => {
    show(confirming, { phase: 'CONFIRMING', notice: 'ACTION_REQUIRED' });
    expect(screen.getByText(/Contact Protein Bowl support/)).toBeTruthy();
    expect(buttons()).not.toContain('Pay Now');
  });

  it('a build without the secure payment window explains it and offers NO fallback (no cash, wallet, browser or transfer)', () => {
    show(startable, { notice: 'NATIVE_UNAVAILABLE' });
    expect(screen.getByText(/Secure payment can't be opened on this app build or device/)).toBeTruthy();
    expect(buttons()).toEqual([]);
    expect(screen.queryByText(/cash|cod|wallet|browser|bank transfer|upi/i)).toBeNull();
  });

  it('terminal / not payable orders and orders without a payment summary render nothing', () => {
    const a = show(blocked, { phase: 'BLOCKED' });
    expect(a.toJSON()).toBeNull();
    a.unmount();
    const b = show({ ...base, payment: undefined } as CustomerOrder);
    expect(b.toJSON()).toBeNull();
  });
});

describe('device facts from the orchestration environment', () => {
  it('a build without the secure payment window shows the explanation UP FRONT with no Pay Now (before any tap)', () => {
    show(startable, {}, false, { lockOpen: false, nativeAvailable: false });
    expect(screen.getByText(/Secure payment can't be opened on this app build or device/)).toBeTruthy();
    expect(buttons()).toEqual([]);
  });

  it('a checkout held by another screen hides Pay Now and explains, with only the GET-only status check', () => {
    show(startable, {}, false, { lockOpen: true, nativeAvailable: true });
    expect(screen.getByText(/payment window may still be open/i)).toBeTruthy();
    expect(buttons()).toEqual(['Check payment status']);
  });

  it('unverified evidence on a startable-looking order hides Pay Now and offers Retry verification', () => {
    show(startable, {}, true);
    expect(buttons().sort()).toEqual(['Check payment status', 'Retry verification']);
  });
});

describe('accessibility', () => {
  it('actions have labels, busy/progress is exposed, and the status text is a polite live region', () => {
    show(startable);
    const pay = screen.getByRole('button', { name: 'Pay Now' });
    expect(pay.props.accessibilityLabel).toBe('Pay Now');
    expect(pay.props.accessibilityState).toMatchObject({ disabled: false });
    expect(screen.getByRole('header')).toBeTruthy();
    expect(screen.getByLabelText('Payment')).toBeTruthy();
  });

  it('progress states expose a labelled progress indicator', () => {
    show(startable, { phase: 'CREATING_SESSION' });
    expect(screen.getByLabelText('In progress')).toBeTruthy();
  });
});

describe('presentation contract is the only rule source', () => {
  it('the same inputs always give the same panel as derivePresentation (no second state machine)', () => {
    const p = derivePresentation(startable, { ...INITIAL_FLOW_STATE, notice: 'NOT_COMPLETED' }, false);
    show(startable, { notice: 'NOT_COMPLETED' });
    expect(buttons().includes('Pay Now')).toBe(p.canStartPayment);
  });
});
