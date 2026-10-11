import React, { StrictMode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../services/paymentService', () => ({ PaymentService: { createSession: vi.fn(), verify: vi.fn() } }));

import { PaymentService } from '../../services/paymentService';
import { PaymentPanel } from './PaymentPanel';
import { FakeRazorpay, installFakeRazorpay, SESSION, uninstallFakeRazorpay } from '../../test/razorpayFake';
import { resetRazorpayLoaderForTests } from '../../utils/razorpayLoader';
import { order } from '../../test/fixtures';
import type { ApiOrder } from '../../services/commerceTypes';

const createSession = vi.mocked(PaymentService.createSession);
const verify = vi.mocked(PaymentService.verify);

function Harness({ initial, fetchOrder }: { initial: ApiOrder; fetchOrder: () => Promise<ApiOrder> }) {
  const [current, setCurrent] = useState(initial);
  return <PaymentPanel order={current} fetchOrder={fetchOrder} onOrder={setCurrent} />;
}

beforeEach(() => {
  vi.clearAllMocks();
  installFakeRazorpay();
  resetRazorpayLoaderForTests();
  createSession.mockResolvedValue(SESSION);
});
afterEach(() => uninstallFakeRazorpay());

// The real app renders under <StrictMode> (setup -> cleanup -> setup). A "mounted" flag that is never set back to true silently drops every
// state update: found in the browser E2E (the panel stayed on "Pay" after a pending verification). Testing Library does not use StrictMode by default.
describe('PaymentPanel under React StrictMode (as in the real app)', () => {
  it('still shows progress and the server-driven confirming state after the provider handler fires', async () => {
    verify.mockResolvedValueOnce({ result: 'PENDING', orderStatus: 'PENDING', orderPaymentStatus: 'PENDING' });
    const confirming = order({ payment: { state: 'CONFIRMING', canStartPayment: false } });
    render(
      <StrictMode>
        <Harness initial={order({ payment: { state: 'NOT_STARTED', canStartPayment: true } })} fetchOrder={async () => confirming} />
      </StrictMode>
    );
    await userEvent.click(screen.getByTestId('pay-button'));
    await waitFor(() => expect(FakeRazorpay.instances[0]?.opened).toBe(1));
    expect(screen.getByTestId('payment-status-text')).toHaveTextContent(/complete your payment in the payment window/i);

    act(() => FakeRazorpay.instances[0].succeed());
    await waitFor(() => expect(screen.getByTestId('payment-status-text')).toHaveTextContent(/do not pay again yet/i));
    expect(screen.getByTestId('payment-panel')).toHaveAttribute('data-phase', 'CONFIRMING');
    expect(screen.getByTestId('refresh-payment-status')).toBeInTheDocument();
    expect(screen.queryByTestId('pay-button')).not.toBeInTheDocument(); // no way to pay again while the server says canStartPayment=false
    expect(verify).toHaveBeenCalledTimes(1);
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it('shows the confirmed state when the backend answers PAID', async () => {
    verify.mockResolvedValueOnce({ result: 'PAID', orderStatus: 'CONFIRMED', orderPaymentStatus: 'PAID' });
    const paid = order({ status: 'CONFIRMED', paymentStatus: 'PAID', payment: { state: 'PAID', canStartPayment: false } });
    render(
      <StrictMode>
        <Harness initial={order({ payment: { state: 'NOT_STARTED', canStartPayment: true } })} fetchOrder={async () => paid} />
      </StrictMode>
    );
    await userEvent.click(screen.getByTestId('pay-button'));
    await waitFor(() => expect(FakeRazorpay.instances[0]?.opened).toBe(1));
    act(() => FakeRazorpay.instances[0].succeed());
    await waitFor(() => expect(screen.getByTestId('payment-panel')).toHaveAttribute('data-phase', 'CONFIRMED'));
  });
});
