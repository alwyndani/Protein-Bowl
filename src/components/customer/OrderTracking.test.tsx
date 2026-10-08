import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../services/orderService', () => ({
  OrderService: { checkoutPreview: vi.fn(), createOrder: vi.fn(), getMyOrders: vi.fn(), getOrder: vi.fn() }
}));

import { OrderService } from '../../services/orderService';
import { DirectOrderTrackingModal } from './DirectOrderTrackingModal';
import { order } from '../../test/fixtures';

const getMyOrders = vi.mocked(OrderService.getMyOrders);
const getOrder = vi.mocked(OrderService.getOrder);

const SIMULATED_PROGRESS_WORDS = [/preparing/i, /ready for/i, /dispatched/i, /out for delivery/i, /delivered/i, /on the way/i];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('order history and tracking (persisted orders only)', () => {
  it('lists the customer’s real orders from the server', async () => {
    getMyOrders.mockResolvedValueOnce([
      order(),
      order({ id: 'order-uuid-2', orderNumber: 'PB-222222-222', netAmount: '99.00', status: 'PENDING' })
    ]);
    render(<DirectOrderTrackingModal isOpen onClose={vi.fn()} />);

    expect(await screen.findByTestId('history-order-PB-123456-789')).toBeInTheDocument();
    expect(screen.getByTestId('history-order-PB-222222-222')).toBeInTheDocument();
    expect(getMyOrders).toHaveBeenCalledTimes(1);
  });

  it('shows loading, empty and error states (no fabricated orders)', async () => {
    let resolve!: (v: ReturnType<typeof order>[]) => void;
    getMyOrders.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const { unmount } = render(<DirectOrderTrackingModal isOpen onClose={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading your orders');
    resolve([]);
    expect(await screen.findByText(/have not placed any orders/i)).toBeInTheDocument();
    unmount();

    getMyOrders.mockRejectedValueOnce(new Error('Orders unavailable'));
    render(<DirectOrderTrackingModal isOpen onClose={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Orders unavailable');
    expect(screen.queryByTestId('order-detail')).not.toBeInTheDocument();

    getMyOrders.mockResolvedValueOnce([order()]);
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByTestId('history-order-PB-123456-789')).toBeInTheDocument();
  });

  it('displays the persisted status and payment status exactly as stored (PENDING / PENDING)', async () => {
    getMyOrders.mockResolvedValueOnce([order({ status: 'PENDING', paymentStatus: 'PENDING' })]);
    render(<DirectOrderTrackingModal isOpen onClose={vi.fn()} />);

    expect(await screen.findByTestId('detail-status')).toHaveTextContent('PENDING');
    expect(screen.getByTestId('detail-payment-status')).toHaveTextContent('PENDING');
    expect(screen.getByTestId('detail-order-number')).toHaveTextContent('PB-123456-789');
  });

  it('does not simulate delivery progression: time passing does not change a PENDING order', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    getMyOrders.mockResolvedValueOnce([order({ status: 'PENDING' })]);
    render(<DirectOrderTrackingModal isOpen onClose={vi.fn()} />);
    await screen.findByTestId('detail-status');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    });

    expect(screen.getByTestId('detail-status')).toHaveTextContent('PENDING');
    const dialog = screen.getByRole('dialog');
    for (const word of SIMULATED_PROGRESS_WORDS) {
      expect(dialog).not.toHaveTextContent(word);
    }
    expect(getMyOrders).toHaveBeenCalledTimes(1); // no polling-driven fake updates either
  });

  it('only shows later statuses when the server actually reports them', async () => {
    getMyOrders.mockResolvedValueOnce([order({ status: 'PREPARING' })]);
    render(<DirectOrderTrackingModal isOpen onClose={vi.fn()} />);
    expect(await screen.findByTestId('detail-status')).toHaveTextContent('PREPARING');
  });

  it('opens the order referenced by the order number after checkout (fetching it if the list lacks it)', async () => {
    getMyOrders.mockResolvedValueOnce([order()]);
    getOrder.mockResolvedValueOnce(order({ id: 'order-uuid-9', orderNumber: 'PB-999999-999' }));
    render(<DirectOrderTrackingModal isOpen onClose={vi.fn()} initialOrderNumber="PB-999999-999" />);

    expect(await screen.findByTestId('detail-order-number')).toHaveTextContent('PB-999999-999');
    expect(getOrder).toHaveBeenCalledWith('PB-999999-999');
  });

  it('selects a listed order by number without an extra lookup', async () => {
    getMyOrders.mockResolvedValueOnce([order(), order({ id: 'order-uuid-2', orderNumber: 'PB-222222-222' })]);
    render(<DirectOrderTrackingModal isOpen onClose={vi.fn()} initialOrderNumber="PB-222222-222" />);

    await waitFor(() => expect(screen.getByTestId('detail-order-number')).toHaveTextContent('PB-222222-222'));
    expect(getOrder).not.toHaveBeenCalled();
  });
});
