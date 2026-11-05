import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/ApiError';
import type { CustomerOrder } from '../src/commerce/types';

const mockApi = {
  cancel: jest.fn(),
  requestCancellation: jest.fn(),
  deliveryCode: jest.fn(),
  issueDeliveryCode: jest.fn(),
  regenerateDeliveryCode: jest.fn()
};
const api = mockApi;
jest.mock('../src/orders/useOrderActions', () => ({
  ...jest.requireActual('../src/orders/useOrderActions'),
  useOrderActionsApi: () => mockApi
}));

import { CancelOrderPanel, CancellationRequestPanel, DeliveryCodePanel, cancelResultCopy } from '../src/screens/commerce/OrderActionPanels';
import { orderActionMessage } from '../src/orders/useOrderActions';

const wrap = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};
const order = (over: Record<string, unknown> = {}) => ({ id: 'ord-1', orderNumber: 'PB-1', status: 'CONFIRMED', ...over }) as unknown as CustomerOrder;
const labels = () => screen.queryAllByRole('button').map((b) => String(b.props.accessibilityLabel));

beforeEach(() => Object.values(api).forEach((f) => f.mockReset()));

describe('CancelOrderPanel', () => {
  it('renders nothing unless the server says cancellation is allowed', () => {
    wrap(<CancelOrderPanel order={order({ cancellation: { state: 'CANCELLATION_NOT_ALLOWED', allowed: false } })} />);
    expect(labels()).toEqual([]);
    wrap(<CancelOrderPanel order={order()} />);
    expect(labels()).toEqual([]);
  });

  it('requires a reason, sends only the order id and a typed reason code, and reports the refund truthfully', async () => {
    api.cancel.mockResolvedValue({ refund: { state: 'REFUND_PENDING' }, alreadyCancelled: false });
    wrap(<CancelOrderPanel order={order({ cancellation: { state: 'CANCELLATION_AVAILABLE', allowed: true } })} />);
    fireEvent.press(screen.getByRole('button', { name: 'Cancel order' }));
    expect(screen.getByRole('button', { name: 'Yes, cancel my order' }).props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: 'I changed my mind' }));
    fireEvent.press(screen.getByRole('button', { name: 'Yes, cancel my order' }));
    await waitFor(() => expect(api.cancel).toHaveBeenCalledTimes(1));
    expect(api.cancel).toHaveBeenCalledWith('ord-1', 'CHANGED_MIND');
    expect(await screen.findByText(/full refund has been started/i)).toBeTruthy();
  });

  it('an unpaid cancellation says no payment was taken', () => {
    expect(cancelResultCopy({ refund: { state: 'NO_REFUND' } })).toMatch(/No payment was taken/);
  });

  it('a double tap sends one request; a refusal shows fixed copy, never server text', async () => {
    let reject!: (e: unknown) => void;
    api.cancel.mockReturnValue(new Promise((_, r) => { reject = r; }));
    wrap(<CancelOrderPanel order={order({ cancellation: { state: 'CANCELLATION_AVAILABLE', allowed: true } })} />);
    fireEvent.press(screen.getByRole('button', { name: 'Cancel order' }));
    fireEvent.press(screen.getByRole('button', { name: 'Another reason' }));
    fireEvent.press(screen.getByRole('button', { name: 'Yes, cancel my order' }));
    fireEvent.press(screen.getByRole('button', { name: 'Yes, cancel my order' }));
    expect(api.cancel).toHaveBeenCalledTimes(1);
    reject(new ApiError('http', 409, 'CANCELLATION_NOT_ALLOWED'));
    expect(await screen.findByText('This order can no longer be cancelled.')).toBeTruthy();
  });
});

describe('CancellationRequestPanel (staff-reviewed)', () => {
  const requestable = order({ status: 'PREPARING', cancellationRequest: { state: 'REQUESTABLE' } });

  it('renders nothing unless the server offers a request', () => {
    wrap(<CancellationRequestPanel order={order({ status: 'PREPARING' })} />);
    expect(labels()).toEqual([]);
  });

  it('never promises approval, requires a reason, and sends only the order id and a typed reason', async () => {
    api.requestCancellation.mockResolvedValue({ requestId: 'r1', alreadyRequested: false });
    wrap(<CancellationRequestPanel order={requestable} />);
    fireEvent.press(screen.getByRole('button', { name: 'Ask to cancel this order' }));
    expect(screen.getByText(/cannot promise it will be approved/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send request' }).props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: 'Wrong items in my order' }));
    fireEvent.press(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(api.requestCancellation).toHaveBeenCalledTimes(1));
    expect(api.requestCancellation).toHaveBeenCalledWith('ord-1', 'WRONG_ORDER');
  });

  it('shows REQUESTED and DECLINED honestly, with the staff explanation', () => {
    wrap(<CancellationRequestPanel order={order({ status: 'PREPARING', cancellationRequest: { state: 'REQUESTED' } })} />);
    expect(screen.getByText(/Our team is reviewing it/)).toBeTruthy();
    wrap(<CancellationRequestPanel order={order({ status: 'PREPARING', cancellationRequest: { state: 'DECLINED', declinedReason: 'Already cooked.' } })} />);
    expect(screen.getByText(/Already cooked\./)).toBeTruthy();
  });

  it('a refusal shows fixed copy, never server text', async () => {
    api.requestCancellation.mockRejectedValue(new ApiError('http', 409, 'CANCELLATION_REQUEST_NOT_ALLOWED'));
    wrap(<CancellationRequestPanel order={requestable} />);
    fireEvent.press(screen.getByRole('button', { name: 'Ask to cancel this order' }));
    fireEvent.press(screen.getByRole('button', { name: 'Another reason' }));
    fireEvent.press(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('This order can no longer be cancelled.')).toBeTruthy();
  });
});

describe('DeliveryCodePanel', () => {
  const onTheWay = order({ delivery: { state: 'ON_THE_WAY', attemptNumber: 1, maxAttempts: 3 } });

  it('is absent unless the order is out for delivery, and makes no request then', () => {
    wrap(<DeliveryCodePanel order={order()} />);
    expect(screen.queryByText('Delivery code')).toBeNull();
    expect(api.deliveryCode).not.toHaveBeenCalled();
  });

  it('issues a code on request, shows grouped digits in memory only, and can hide them', async () => {
    api.deliveryCode.mockResolvedValue({ state: 'NOT_ISSUED', issuedAt: null, lockedUntil: null });
    api.issueDeliveryCode.mockResolvedValue({ state: 'ISSUED', issuedAt: 'x', lockedUntil: null, code: '123456' });
    wrap(<DeliveryCodePanel order={onTheWay} />);
    fireEvent.press(await screen.findByRole('button', { name: 'Get my delivery code' }));
    expect(await screen.findByText('123 456')).toBeTruthy();
    expect(api.issueDeliveryCode).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByRole('button', { name: 'Hide code' }));
    expect(screen.queryByText('123 456')).toBeNull();
    expect(screen.getByText('••• •••')).toBeTruthy();
  });

  it('after a reload the digits are not shown again; a new code needs an explicit confirmation', async () => {
    api.deliveryCode.mockResolvedValue({ state: 'ISSUED', issuedAt: 'x', lockedUntil: null });
    api.regenerateDeliveryCode.mockResolvedValue({ state: 'ISSUED', issuedAt: 'y', lockedUntil: null, code: '654321' });
    wrap(<DeliveryCodePanel order={onTheWay} />);
    expect(await screen.findByText(/not shown again/i)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Create a new code' }));
    expect(api.regenerateDeliveryCode).not.toHaveBeenCalled(); // first press only asks for confirmation
    expect(screen.getByText(/current code will stop working/i)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Create a new code' }));
    expect(await screen.findByText('654 321')).toBeTruthy();
  });

  it('locked and blocked states are explained; no code is ever rendered for them', async () => {
    api.deliveryCode.mockResolvedValue({ state: 'LOCKED', issuedAt: 'x', lockedUntil: '2026-10-31T10:00:00.000Z' });
    wrap(<DeliveryCodePanel order={onTheWay} />);
    expect(await screen.findByText(/verification is paused/i)).toBeTruthy();
    expect(labels()).toEqual([]);
  });

  it('maps errors to fixed copy', () => {
    expect(orderActionMessage(new ApiError('http', 409, 'DELIVERY_CODE_REGENERATION_LIMIT'), 'code')).toMatch(/limit/);
    expect(orderActionMessage(new ApiError('http', 429, 'X'), 'code')).toMatch(/Too many/);
    expect(orderActionMessage(new Error('boom: stack'), 'cancel')).not.toMatch(/boom|stack/);
  });
});
