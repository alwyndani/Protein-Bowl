import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../services/paymentService', () => ({ PaymentService: { createSession: vi.fn(), verify: vi.fn() } }));

import { PaymentService } from '../../services/paymentService';
import { ApiRequestError } from '../../services/apiClient';
import { PaymentPanel } from './PaymentPanel';
import { FakeRazorpay, installFakeRazorpay, SESSION, uninstallFakeRazorpay } from '../../test/razorpayFake';
import { resetRazorpayLoaderForTests } from '../../utils/razorpayLoader';
import { order } from '../../test/fixtures';
import type { ApiOrder, PaymentSummary } from '../../services/commerceTypes';

const createSession = vi.mocked(PaymentService.createSession);
const verify = vi.mocked(PaymentService.verify);

const PAYABLE: PaymentSummary = { state: 'NOT_STARTED', canStartPayment: true };
const CONFIRMING: PaymentSummary = { state: 'CONFIRMING', canStartPayment: false };
const PAID: PaymentSummary = { state: 'PAID', canStartPayment: false };
const withPayment = (payment: PaymentSummary, over: Partial<ApiOrder> = {}) => order({ payment, ...over });

const onSessionExpired = vi.fn();

function Harness({ initial, fetchOrder }: { initial: ApiOrder; fetchOrder: () => Promise<ApiOrder> }) {
  const [current, setCurrent] = useState(initial);
  return <PaymentPanel order={current} fetchOrder={fetchOrder} onOrder={setCurrent} onSessionExpired={onSessionExpired} />;
}

function setup(initial: ApiOrder, fetchOrder: () => Promise<ApiOrder> = async () => initial) {
  const fetch = vi.fn(fetchOrder);
  const utils = render(<Harness initial={initial} fetchOrder={fetch} />);
  return { ...utils, fetch };
}

const payButton = () => screen.getByTestId('pay-button');
const instance = () => FakeRazorpay.instances[0];
let hidden = false;

beforeEach(() => {
  vi.clearAllMocks();
  installFakeRazorpay();
  resetRazorpayLoaderForTests();
  hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  createSession.mockResolvedValue(SESSION);
});

afterEach(() => {
  uninstallFakeRazorpay();
  vi.useRealTimers();
});

describe('P7D payment flow: checkout, verification and the truth boundary', () => {
  it('Pay creates the session once and opens Razorpay with ONLY the backend-provided values (no secret, no prefill, no client amount)', async () => {
    setup(withPayment(PAYABLE));
    await userEvent.click(payButton());

    await waitFor(() => expect(instance()?.opened).toBe(1));
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(createSession).toHaveBeenCalledWith('order-uuid-1');
    const o = instance().options;
    expect(o).toMatchObject({ key: SESSION.keyId, order_id: SESSION.providerOrderId, amount: SESSION.amountMinor, currency: 'INR', name: 'Protein Bowl', description: 'Order PB-123456-789' });
    expect((o as unknown as Record<string, unknown>).prefill).toBeUndefined(); // no customer prefill in P7D
    expect(JSON.stringify(o)).not.toMatch(/secret/i);
    expect(payButton()).toBeDisabled();
    expect(payButton()).toHaveTextContent(/payment window open/i);
  });

  it('the provider HANDLER alone never shows "paid": the UI says "Verifying" until the backend answers, then follows the backend', async () => {
    let finish!: (v: { result: 'PAID'; orderStatus: string; orderPaymentStatus: string }) => void;
    verify.mockReturnValueOnce(new Promise((r) => (finish = r)));
    const paid = withPayment(PAID, { status: 'CONFIRMED', paymentStatus: 'PAID' });
    const { fetch } = setup(withPayment(PAYABLE), async () => paid);
    await userEvent.click(payButton());
    await waitFor(() => expect(instance()).toBeDefined());

    act(() => instance().succeed());
    await waitFor(() => expect(screen.getByTestId('payment-status-text')).toHaveTextContent(/verifying payment/i));
    expect(screen.queryByText(/payment confirmed/i)).not.toBeInTheDocument(); // the handler is not truth
    expect(screen.queryByText(/paid/i)).not.toBeInTheDocument();
    expect(verify).toHaveBeenCalledTimes(1);

    await act(async () => finish({ result: 'PAID', orderStatus: 'CONFIRMED', orderPaymentStatus: 'PAID' }));
    expect(await screen.findByText(/payment confirmed/i)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalled(); // the trusted order was re-read
  });

  it('sends the handler evidence (and only that) to the verification endpoint, using OUR provider order id', async () => {
    verify.mockResolvedValueOnce({ result: 'PENDING', orderStatus: 'PENDING', orderPaymentStatus: 'PENDING' });
    setup(withPayment(PAYABLE));
    await userEvent.click(payButton());
    await waitFor(() => expect(instance()).toBeDefined());

    act(() => instance().succeed({ razorpay_payment_id: 'pay_abc', razorpay_order_id: 'order_FORGED_BY_CLIENT', razorpay_signature: 'sigvalue' }));
    await waitFor(() => expect(verify).toHaveBeenCalledTimes(1));
    expect(verify).toHaveBeenCalledWith('order-uuid-1', 'attempt-1', { providerOrderId: 'order_PB_1', providerPaymentId: 'pay_abc', signature: 'sigvalue' });
  });

  it('a 202 / PENDING verification answer stays "confirming": no failure wording, no Pay button, a manual Refresh status action', async () => {
    verify.mockResolvedValueOnce({ result: 'PENDING', orderStatus: 'PENDING', orderPaymentStatus: 'PENDING' });
    setup(withPayment(PAYABLE), async () => withPayment(CONFIRMING));
    await userEvent.click(payButton());
    await waitFor(() => expect(instance()).toBeDefined());
    act(() => instance().succeed());

    expect(await screen.findByText(/payment is being confirmed\. please do not pay again yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('pay-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('refresh-payment-status')).toBeInTheDocument();
    expect(screen.queryByText(/fail/i)).not.toBeInTheDocument();
  });

  it('an order the server already reports as CONFIRMING (UNKNOWN / AUTHORIZED / unresolved) offers NO payment and keeps polling safely', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { fetch } = setup(withPayment(CONFIRMING), async () => withPayment(CONFIRMING));
    expect(screen.queryByTestId('pay-button')).not.toBeInTheDocument();
    expect(screen.getByText(/do not pay again yet/i)).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(2100));
    expect(fetch).toHaveBeenCalledTimes(1); // the first bounded GET refresh
    expect(createSession).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it('the client can NEVER turn the server\'s canStartPayment=false into true: no Pay action exists for a blocked order', async () => {
    setup(withPayment({ state: 'NOT_STARTED', canStartPayment: false }, { status: 'CONFIRMED' }));
    expect(screen.queryByTestId('pay-button')).not.toBeInTheDocument();
    expect(createSession).not.toHaveBeenCalled();
  });

  it('a missing payment summary is treated as "not payable" (conservative), never as payable', async () => {
    const legacy = order();
    delete (legacy as { payment?: PaymentSummary }).payment;
    setup(legacy);
    expect(screen.queryByTestId('pay-button')).not.toBeInTheDocument();
  });

  it('double-clicking Pay creates ONE session and opens ONE Razorpay modal', async () => {
    setup(withPayment(PAYABLE));
    await userEvent.dblClick(payButton());
    await waitFor(() => expect(instance()).toBeDefined());
    await userEvent.click(payButton());
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(FakeRazorpay.instances).toHaveLength(1);
    expect(instance().opened).toBe(1);
  });

  it('dismissing the modal refreshes the SERVER state; with canStartPayment=true "Try payment again" is offered, with false it is not', async () => {
    const first = setup(withPayment(PAYABLE), async () => withPayment(PAYABLE));
    await userEvent.click(payButton());
    await waitFor(() => expect(instance()).toBeDefined());
    act(() => instance().dismiss());
    expect(await screen.findByRole('button', { name: /try payment again/i })).toBeEnabled();
    expect(first.fetch).toHaveBeenCalledTimes(1);
    expect(createSession).toHaveBeenCalledTimes(1); // NO automatic second session
    first.unmount();

    FakeRazorpay.instances = [];
    setup(withPayment(PAYABLE), async () => withPayment(CONFIRMING));
    await userEvent.click(screen.getAllByTestId('pay-button').slice(-1)[0]);
    await waitFor(() => expect(instance()).toBeDefined());
    act(() => instance().dismiss());
    expect(await screen.findByText(/do not pay again yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('pay-button')).not.toBeInTheDocument();
  });

  it('payment.failed refreshes server state silently (no phase change while the modal is open) and is never rendered raw', async () => {
    const { fetch } = setup(withPayment(PAYABLE), async () => withPayment(PAYABLE));
    await userEvent.click(payButton());
    await waitFor(() => expect(instance()).toBeDefined());
    act(() => instance().failPayment());
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(payButton()).toHaveTextContent(/payment window open/i);
    expect(document.body).not.toHaveTextContent('PROVIDER-SECRET-DESCRIPTION');

    act(() => instance().dismiss());
    expect(await screen.findByText(/did not go through/i)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('PROVIDER-SECRET-DESCRIPTION');
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it('a network failure while verifying is AMBIGUOUS: the server is asked, and an unreadable server means "confirming", never "failed" or "pay again"', async () => {
    verify.mockRejectedValueOnce(new ApiRequestError('socket hang up', 'NETWORK_ERROR'));
    setup(withPayment(PAYABLE), async () => {
      throw new ApiRequestError('down', 'NETWORK_ERROR');
    });
    await userEvent.click(payButton());
    await waitFor(() => expect(instance()).toBeDefined());
    act(() => instance().succeed());

    expect(await screen.findByText(/do not pay again yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('pay-button')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('socket hang up');
  });

  it('the verification evidence survives the panel being closed: the handler still reaches the server after unmount', async () => {
    verify.mockResolvedValueOnce({ result: 'PENDING', orderStatus: 'PENDING', orderPaymentStatus: 'PENDING' });
    const { unmount } = setup(withPayment(PAYABLE));
    await userEvent.click(payButton());
    await waitFor(() => expect(instance()).toBeDefined());
    unmount();
    act(() => instance().succeed({ razorpay_payment_id: 'pay_late' }));
    await waitFor(() => expect(verify).toHaveBeenCalledTimes(1));
    expect(verify.mock.calls[0][2].providerPaymentId).toBe('pay_late');
  });
});

describe('P7D payment flow: errors and the checkout script', () => {
  it('a checkout.js load failure shows a safe message, creates NO session, and allows a clean retry', async () => {
    uninstallFakeRazorpay();
    setup(withPayment(PAYABLE));
    await userEvent.click(payButton());
    const tag = await waitFor(() => {
      const el = document.querySelector('script[data-razorpay-checkout]');
      expect(el).not.toBeNull();
      return el as HTMLScriptElement;
    });
    act(() => {
      tag.dispatchEvent(new Event('error'));
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not open the payment window/i);
    expect(createSession).not.toHaveBeenCalled();
    expect(document.querySelector('script[data-razorpay-checkout]')).toBeNull(); // the failed tag was removed
    expect(payButton()).toBeEnabled();
  });

  const cases: Array<[string, ApiRequestError, RegExp]> = [
    ['503 provider unavailable', new ApiRequestError('boom provider raw text', 'PAYMENT_PROVIDER_UNAVAILABLE', 503), /temporarily unavailable.*no payment was taken/i],
    ['429 rate limit', new ApiRequestError('x', 'TOO_MANY_REQUESTS', 429), /too many attempts/i],
    ['500 server error', new ApiRequestError('stack trace raw', 'INTERNAL_SERVER_ERROR', 500), /something went wrong on our side/i]
  ];
  for (const [label, err, copy] of cases) {
    it(`session creation: ${label} shows safe copy (never the raw text) and, because the server still allows it, a manual retry`, async () => {
      createSession.mockRejectedValueOnce(err);
      setup(withPayment(PAYABLE), async () => withPayment(PAYABLE));
      await userEvent.click(payButton());
      expect(await screen.findByRole('alert')).toHaveTextContent(copy);
      expect(document.body).not.toHaveTextContent(/raw text|stack trace/);
      expect(await screen.findByRole('button', { name: /try payment again/i })).toBeEnabled();
      expect(FakeRazorpay.instances).toHaveLength(0);
    });
  }

  it('session creation: 409 PAYMENT_ATTEMPT_IN_PROGRESS means "confirming" (no second payment is invited)', async () => {
    createSession.mockRejectedValueOnce(new ApiRequestError('x', 'PAYMENT_ATTEMPT_IN_PROGRESS', 409));
    setup(withPayment(PAYABLE), async () => withPayment(CONFIRMING));
    await userEvent.click(payButton());
    expect(await screen.findByText(/do not pay again yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('pay-button')).not.toBeInTheDocument();
  });

  it('session creation: 409 PAYMENT_ALREADY_COMPLETED refreshes the order and shows the CONFIRMED state', async () => {
    createSession.mockRejectedValueOnce(new ApiRequestError('x', 'PAYMENT_ALREADY_COMPLETED', 409));
    setup(withPayment(PAYABLE), async () => withPayment(PAID, { status: 'CONFIRMED', paymentStatus: 'PAID' }));
    await userEvent.click(payButton());
    expect(await screen.findByText(/payment confirmed/i)).toBeInTheDocument();
  });

  it('session creation: 401 hands over to the sign-in flow with a session-expired message', async () => {
    createSession.mockRejectedValueOnce(new ApiRequestError('Unauthorized', 'UNAUTHORIZED', 401));
    setup(withPayment(PAYABLE));
    await userEvent.click(payButton());
    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('alert')).toHaveTextContent(/session has expired/i);
  });

  it('verification: 400 PAYMENT_VERIFICATION_FAILED never says "payment failed" or invites a blind retry', async () => {
    verify.mockRejectedValueOnce(new ApiRequestError('The payment could not be verified', 'PAYMENT_VERIFICATION_FAILED', 400));
    setup(withPayment(PAYABLE), async () => withPayment(CONFIRMING));
    await userEvent.click(payButton());
    await waitFor(() => expect(instance()).toBeDefined());
    act(() => instance().succeed());
    expect(await screen.findByText(/please do not pay again/i)).toBeInTheDocument();
    expect(screen.queryByTestId('pay-button')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/payment failed/i);
  });
});

describe('P7D payment flow: bounded GET-only polling', () => {
  const advance = (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms));

  it('polls about 2s, then ~4s, then ~10s, stops at ~3 minutes with "Still confirming" and a manual refresh; only GETs, never a mutation', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { fetch } = setup(withPayment(CONFIRMING), async () => withPayment(CONFIRMING));
    await advance(1900);
    expect(fetch).toHaveBeenCalledTimes(0);
    await advance(300); // ~2.2 s
    expect(fetch).toHaveBeenCalledTimes(1);
    await advance(4100);
    expect(fetch).toHaveBeenCalledTimes(2);
    await advance(60_000);
    const afterMinute = fetch.mock.calls.length;
    expect(afterMinute).toBeGreaterThan(10);
    expect(afterMinute).toBeLessThanOrEqual(17);
    await advance(200_000); // well past the cap
    const atCap = fetch.mock.calls.length;
    expect(atCap).toBeLessThanOrEqual(28);
    await advance(120_000);
    expect(fetch.mock.calls.length).toBe(atCap); // stopped
    expect(screen.getByText(/still confirming/i)).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('refresh-payment-status')); // manual refresh is always possible
    await waitFor(() => expect(fetch.mock.calls.length).toBe(atCap + 1));
    expect(createSession).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it('pauses while the tab is hidden and refreshes immediately when it becomes visible again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { fetch } = setup(withPayment(CONFIRMING), async () => withPayment(CONFIRMING));
    hidden = true;
    await advance(30_000);
    expect(fetch).not.toHaveBeenCalled();
    hidden = false;
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });

  it('stops polling and shows the confirmed state as soon as the SERVER reports PAID', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const answers = [withPayment(CONFIRMING), withPayment(PAID, { status: 'CONFIRMED', paymentStatus: 'PAID' })];
    const { fetch } = setup(withPayment(CONFIRMING), async () => answers.shift() ?? withPayment(PAID));
    await advance(2100);
    await advance(4100);
    expect(await screen.findByText(/payment confirmed/i)).toBeInTheDocument();
    const calls = fetch.mock.calls.length;
    await advance(60_000);
    expect(fetch.mock.calls.length).toBe(calls);
  });

  it('when the server later says no payment is in flight (canStartPayment true) the panel offers a manual retry instead of polling forever', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setup(withPayment(CONFIRMING), async () => withPayment(PAYABLE));
    await advance(2100);
    expect(await screen.findByRole('button', { name: /try payment again/i })).toBeEnabled();
    expect(createSession).not.toHaveBeenCalled(); // never automatic
  });

  it('refreshes trusted state when the window regains focus after the customer left (e.g. a UPI app)', async () => {
    const { fetch } = setup(withPayment(PAYABLE), async () => withPayment(CONFIRMING));
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/do not pay again yet/i)).toBeInTheDocument();
  });
});
