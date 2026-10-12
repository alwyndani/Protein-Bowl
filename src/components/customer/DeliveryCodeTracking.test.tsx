import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../services/orderService', () => ({
  OrderService: { checkoutPreview: vi.fn(), createOrder: vi.fn(), getMyOrders: vi.fn(), getOrder: vi.fn() }
}));
vi.mock('../../services/deliveryCodeService', () => ({
  DeliveryCodeService: { getState: vi.fn(), issue: vi.fn(), regenerate: vi.fn() }
}));

import { OrderService } from '../../services/orderService';
import { DeliveryCodeService } from '../../services/deliveryCodeService';
import { DirectOrderTrackingModal } from './DirectOrderTrackingModal';
import { order } from '../../test/fixtures';

const getMyOrders = vi.mocked(OrderService.getMyOrders);
const getOrder = vi.mocked(OrderService.getOrder);
const getState = vi.mocked(DeliveryCodeService.getState);
const issue = vi.mocked(DeliveryCodeService.issue);

const paid = { status: 'DISPATCHED', paymentStatus: 'PAID', paymentMethod: 'ONLINE' } as const;

beforeEach(() => {
  vi.clearAllMocks();
  getState.mockResolvedValue({ state: 'NOT_ISSUED', issuedAt: null, lockedUntil: null });
});

describe('customer order tracking: Out for delivery -> Delivery Code -> Delivered', () => {
  it('an out-for-delivery ONLINE order shows "Out for delivery" and the Delivery Code panel; nothing is generated until the customer asks', async () => {
    getMyOrders.mockResolvedValue([order(paid)]);
    getOrder.mockResolvedValue(order(paid));
    render(<DirectOrderTrackingModal isOpen onClose={vi.fn()} />);
    expect(await screen.findByTestId('badge-order')).toHaveTextContent('Out for delivery');
    expect(await screen.findByTestId('delivery-code-panel')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Get my delivery code' })).toBeInTheDocument();
    expect(issue).not.toHaveBeenCalled();
  });

  it('other states have no panel and make no delivery-code request (READY shows "Ready"; PENDING / CANCELLED have nothing)', async () => {
    for (const status of ['PENDING', 'CONFIRMED', 'READY', 'CANCELLED'] as const) {
      getMyOrders.mockResolvedValue([order({ status, paymentStatus: status === 'READY' ? 'PAID' : 'PENDING' })]);
      getOrder.mockResolvedValue(order({ status, paymentStatus: status === 'READY' ? 'PAID' : 'PENDING' }));
      const { unmount } = render(<DirectOrderTrackingModal isOpen onClose={vi.fn()} />);
      await screen.findByTestId('badge-order');
      expect(screen.queryByTestId('delivery-code-panel'), status).not.toBeInTheDocument();
      unmount();
    }
    expect(getState).not.toHaveBeenCalled();
  });

  it('when the server reports the delivery verified, the order is re-read and the customer sees Delivered (no code actions remain)', async () => {
    getMyOrders.mockResolvedValue([order(paid)]);
    getOrder.mockResolvedValue(order({ ...paid, status: 'DELIVERED' })); // what the re-read returns once the server verified the delivery
    getState.mockResolvedValue({ state: 'VERIFIED', issuedAt: '2026-10-11T10:00:00.000Z', lockedUntil: null });
    render(<DirectOrderTrackingModal isOpen onClose={vi.fn()} />);
    await screen.findByTestId('delivery-code-verified');
    await waitFor(() => expect(screen.getByTestId('badge-order')).toHaveTextContent('Delivered'));
    // the delivered order offers no code actions any more
    expect(screen.queryByTestId('delivery-code-get')).not.toBeInTheDocument();
    expect(screen.queryByTestId('delivery-code-regenerate')).not.toBeInTheDocument();
    expect(screen.queryByTestId('delivery-code-value')).not.toBeInTheDocument();
  });

  it('a legacy order that is not ONLINE never offers a delivery code', async () => {
    getMyOrders.mockResolvedValue([order({ status: 'DISPATCHED', paymentMethod: 'COD', paymentStatus: 'PENDING' })]);
    getOrder.mockResolvedValue(order({ status: 'DISPATCHED', paymentMethod: 'COD', paymentStatus: 'PENDING' }));
    render(<DirectOrderTrackingModal isOpen onClose={vi.fn()} />);
    await screen.findByTestId('badge-order');
    expect(screen.queryByTestId('delivery-code-panel')).not.toBeInTheDocument();
    expect(getState).not.toHaveBeenCalled();
  });

  it('the customer can issue a code from the order view and sees it exactly once', async () => {
    getMyOrders.mockResolvedValue([order(paid)]);
    getOrder.mockResolvedValue(order(paid));
    issue.mockResolvedValue({ state: 'ISSUED', issuedAt: '2026-10-11T10:00:00.000Z', lockedUntil: null, code: '246810' });
    render(<DirectOrderTrackingModal isOpen onClose={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Get my delivery code' }));
    expect(await screen.findByTestId('delivery-code-value')).toHaveTextContent('246 810');
  });
});
