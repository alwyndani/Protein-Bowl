import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../services/orderService', () => ({
  OrderService: { checkoutPreview: vi.fn(), createOrder: vi.fn(), getMyOrders: vi.fn(), getOrder: vi.fn() }
}));
vi.mock('../../services/deliveryCodeService', () => ({
  DeliveryCodeService: { getState: vi.fn(), issue: vi.fn(), regenerate: vi.fn() }
}));

import { OrderService } from '../../services/orderService';
import { DeliveryCodeService } from '../../services/deliveryCodeService';
import { DirectOrderTrackingModal } from './DirectOrderTrackingModal';
import { deliveryNotice, orderBadge } from '../../utils/orderLabels';
import { order } from '../../test/fixtures';
import type { ApiOrder } from '../../services/commerceTypes';

const getMyOrders = vi.mocked(OrderService.getMyOrders);
const getOrder = vi.mocked(OrderService.getOrder);
const getState = vi.mocked(DeliveryCodeService.getState);

const dispatched = (delivery: ApiOrder['delivery'], over: Partial<ApiOrder> = {}) => order({ status: 'DISPATCHED', paymentStatus: 'PAID', paymentMethod: 'ONLINE', delivery, cancellation: { state: 'CANCELLATION_NOT_ALLOWED', allowed: false }, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  getState.mockResolvedValue({ state: 'NOT_AVAILABLE', issuedAt: null, lockedUntil: null });
});

describe('customer delivery states (P9C): derived DTO labels, never order statuses', () => {
  it('maps every derived state to generic wording; an ordinary first attempt on the way needs no extra notice', () => {
    expect(deliveryNotice({ status: 'DISPATCHED', delivery: { state: 'ON_THE_WAY', attemptNumber: 1, maxAttempts: 3 } })).toBeNull();
    expect(deliveryNotice({ status: 'DELIVERED', delivery: { state: 'DELIVERED', attemptNumber: 1, maxAttempts: 3 } })).toBeNull();
    expect(deliveryNotice({ status: 'DISPATCHED', delivery: undefined })).toBeNull();
    const issue = deliveryNotice({ status: 'DISPATCHED', delivery: { state: 'DELIVERY_ISSUE', attemptNumber: 1, maxAttempts: 3 } })!;
    expect(issue.title).toMatch(/could not complete your delivery yet/i);
    expect(issue.body).toMatch(/do not need to do anything/i);
    const retry = deliveryNotice({ status: 'DISPATCHED', delivery: { state: 'RETRY_PLANNED', attemptNumber: 2, maxAttempts: 3 } })!;
    expect(retry.body).toMatch(/attempt 2 of 3/);
    const again = deliveryNotice({ status: 'DISPATCHED', delivery: { state: 'ON_THE_WAY', attemptNumber: 2, maxAttempts: 3 } })!;
    expect(again.title).toMatch(/out for delivery again/i);
    const gone = deliveryNotice({ status: 'CANCELLED', delivery: { state: 'UNDELIVERABLE_REFUND_PENDING', attemptNumber: 3, maxAttempts: 3 } })!;
    expect(gone.body).toMatch(/refunded in full/i);
    for (const n of [issue, retry, again, gone]) {
      expect(`${n.title} ${n.body}`).not.toMatch(/CUSTOMER_|reason code|note|driver|counter|hash|COD|cash/i);
    }
  });

  it('the badge says "Delivery issue" / "Delivery being rearranged" while the order is still DISPATCHED in the database', () => {
    expect(orderBadge({ status: 'DISPATCHED', delivery: { state: 'DELIVERY_ISSUE', attemptNumber: 1, maxAttempts: 3 } })).toEqual({ label: 'Delivery issue', tone: 'warn' });
    expect(orderBadge({ status: 'DISPATCHED', delivery: { state: 'RETRY_PLANNED', attemptNumber: 2, maxAttempts: 3 } })).toEqual({ label: 'Delivery being rearranged', tone: 'warn' });
    expect(orderBadge({ status: 'DISPATCHED', delivery: { state: 'ON_THE_WAY', attemptNumber: 1, maxAttempts: 3 } }).label).toBe('Out for delivery');
    expect(orderBadge({ status: 'DISPATCHED' }).label).toBe('Out for delivery'); // older responses without the field keep working
    expect(orderBadge({ status: 'CANCELLED', delivery: { state: 'UNDELIVERABLE_REFUND_PENDING', attemptNumber: 1, maxAttempts: 3 } }).label).toBe('Cancelled');
  });

  it('DELIVERY_ISSUE: the order view explains it generically, offers no delivery code, no retry and no cancel button, and shows no internal detail', async () => {
    const o = dispatched({ state: 'DELIVERY_ISSUE', attemptNumber: 1, maxAttempts: 3 });
    getMyOrders.mockResolvedValue([o]);
    getOrder.mockResolvedValue(o);
    render(<DirectOrderTrackingModal isOpen onClose={vi.fn()} />);
    expect(await screen.findByTestId('badge-order')).toHaveTextContent('Delivery issue');
    expect(await screen.findByTestId('delivery-notice')).toHaveTextContent(/could not complete your delivery yet/i);
    expect(screen.queryByTestId('delivery-code-get')).not.toBeInTheDocument(); // state NOT_AVAILABLE hides the code panel
    expect(screen.queryByTestId('delivery-code-regenerate')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cancel-order-button')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry|try again/i })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/CUSTOMER_UNAVAILABLE|failureNote|resolution|attemptNumber|codeHash/);
  });

  it('RETRY_PLANNED then ON_THE_WAY (attempt 2): the customer is told another attempt is planned, then gets a NEW code to issue', async () => {
    const planned = dispatched({ state: 'RETRY_PLANNED', attemptNumber: 2, maxAttempts: 3 });
    getMyOrders.mockResolvedValue([planned]);
    getOrder.mockResolvedValue(planned);
    const first = render(<DirectOrderTrackingModal isOpen onClose={vi.fn()} />);
    expect(await screen.findByTestId('delivery-notice')).toHaveTextContent(/another delivery attempt is being arranged.*attempt 2 of 3/i);
    expect(screen.queryByTestId('delivery-code-get')).not.toBeInTheDocument();
    first.unmount();

    const again = dispatched({ state: 'ON_THE_WAY', attemptNumber: 2, maxAttempts: 3 });
    getMyOrders.mockResolvedValue([again]);
    getOrder.mockResolvedValue(again);
    getState.mockResolvedValue({ state: 'NOT_ISSUED', issuedAt: null, lockedUntil: null });
    render(<DirectOrderTrackingModal isOpen onClose={vi.fn()} />);
    expect(await screen.findByTestId('delivery-notice')).toHaveTextContent(/out for delivery again/i);
    expect(await screen.findByRole('button', { name: 'Get my delivery code' })).toBeInTheDocument();
  });

  it('UNDELIVERABLE_REFUND_PENDING: a cancelled order says it could not be delivered and shows the existing refund state; nothing about the failure reason', async () => {
    const o = order({
      status: 'CANCELLED',
      paymentStatus: 'PAID',
      paymentMethod: 'ONLINE',
      delivery: { state: 'UNDELIVERABLE_REFUND_PENDING', attemptNumber: 3, maxAttempts: 3 },
      refund: { state: 'REFUND_PENDING' },
      cancellation: { state: 'CANCELLED', allowed: false }
    });
    getMyOrders.mockResolvedValue([o]);
    getOrder.mockResolvedValue(o);
    render(<DirectOrderTrackingModal isOpen onClose={vi.fn()} />);
    expect(await screen.findByTestId('badge-order')).toHaveTextContent('Cancelled');
    expect(await screen.findByTestId('delivery-notice')).toHaveTextContent(/refunded in full/i);
    expect(screen.queryByTestId('delivery-code-panel')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/CUSTOMER_REFUSED|DELIVERY_FAILED|\bcod\b|\bcash\b/i);
  });
});
