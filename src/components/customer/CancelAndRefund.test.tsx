import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../services/orderService', () => ({
  OrderService: { checkoutPreview: vi.fn(), createOrder: vi.fn(), getMyOrders: vi.fn(), getOrder: vi.fn(), cancelOrder: vi.fn(), getOrderRefunds: vi.fn() }
}));
vi.mock('../../services/paymentService', () => ({ PaymentService: { createSession: vi.fn(), verify: vi.fn() } }));

import { OrderService } from '../../services/orderService';
import { ApiRequestError } from '../../services/apiClient';
import { DirectOrderTrackingModal } from './DirectOrderTrackingModal';
import { RefundNotice } from './RefundNotice';
import { order } from '../../test/fixtures';
import type { ApiOrder, CancellationState, RefundState } from '../../services/commerceTypes';

const getMyOrders = vi.mocked(OrderService.getMyOrders);
const getOrder = vi.mocked(OrderService.getOrder);
const cancelOrder = vi.mocked(OrderService.cancelOrder);
const onSessionExpired = vi.fn();

const confirmedPaid = (over: Partial<ApiOrder> = {}) =>
  order({ status: 'CONFIRMED', paymentStatus: 'PAID', payment: { state: 'PAID', canStartPayment: false }, cancellation: { state: 'CANCELLATION_AVAILABLE', allowed: true }, ...over });
const cancelledUnpaid = () => order({ status: 'CANCELLED', cancellation: { state: 'CANCELLED', allowed: false }, payment: { state: 'NOT_STARTED', canStartPayment: false }, refund: { state: 'NO_REFUND' } });
const cancelledPaid = (refund: RefundState) =>
  confirmedPaid({ status: 'CANCELLED', cancellation: { state: 'CANCELLED', allowed: false }, refund: { state: refund } });
const cancelResult = (o: ApiOrder) => ({ orderId: o.id, orderNumber: o.orderNumber, status: 'CANCELLED', paymentStatus: o.paymentStatus, cancelledAt: '2026-10-11T10:00:00.000Z', alreadyCancelled: false, cancellation: { state: 'CANCELLED' as CancellationState, allowed: false }, refund: { state: 'NO_REFUND' as RefundState } });

const dialogSubmit = () => within(screen.getByTestId('cancel-dialog')).getByRole('button', { name: /^cancel order$/i });

function renderModal(extra: Partial<React.ComponentProps<typeof DirectOrderTrackingModal>> = {}) {
  return render(<DirectOrderTrackingModal isOpen onClose={vi.fn()} onSessionExpired={onSessionExpired} {...extra} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('P7D cancellation UI (the server decides)', () => {
  it('the Cancel action appears ONLY when the server says CANCELLATION_AVAILABLE', async () => {
    for (const [state, allowed] of [['CANCELLATION_NOT_ALLOWED', false], ['CANCELLED', false]] as const) {
      getMyOrders.mockResolvedValueOnce([order({ cancellation: { state, allowed } })]);
      const { unmount } = renderModal();
      await screen.findByTestId('order-detail');
      expect(screen.queryByTestId('cancel-order-button')).not.toBeInTheDocument();
      unmount();
    }
    // an inconsistent server answer (state available but allowed=false) is not an invitation either
    getMyOrders.mockResolvedValueOnce([order({ cancellation: { state: 'CANCELLATION_AVAILABLE', allowed: false } })]);
    const { unmount } = renderModal();
    await screen.findByTestId('order-detail');
    expect(screen.queryByTestId('cancel-order-button')).not.toBeInTheDocument();
    unmount();

    getMyOrders.mockResolvedValueOnce([order()]);
    renderModal();
    expect(await screen.findByTestId('cancel-order-button')).toBeInTheDocument();
  });

  it('opens an accessible dialog: role/aria-modal/name, focus moves in, Escape closes, focus returns to the Cancel button', async () => {
    getMyOrders.mockResolvedValueOnce([order()]);
    renderModal();
    const trigger = await screen.findByTestId('cancel-order-button');
    trigger.focus();
    await userEvent.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: /cancel order pb-123456-789/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(dialogSubmit()).toBeDisabled(); // a reason is required

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /cancel order/i })).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: /your orders/i })).toBeInTheDocument(); // only the inner dialog closed
    expect(document.activeElement).toBe(screen.getByTestId('cancel-order-button'));
  });

  it('offers exactly the five customer reasons with friendly labels, and sends ONLY { reasonCode, note? } semantics (order id + code + note)', async () => {
    getMyOrders.mockResolvedValueOnce([order()]);
    cancelOrder.mockResolvedValueOnce(cancelResult(order()));
    getOrder.mockResolvedValueOnce(cancelledUnpaid());
    renderModal();
    await userEvent.click(await screen.findByTestId('cancel-order-button'));
    const select = screen.getByLabelText(/why are you cancelling/i);
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Select a reason', 'I changed my mind', 'I ordered by mistake', 'Wrong order', 'Delivery is taking too long', 'Other']);

    await userEvent.selectOptions(select, 'OTHER');
    await userEvent.type(screen.getByLabelText(/note/i), 'a short note');
    await userEvent.click(dialogSubmit());

    await waitFor(() => expect(cancelOrder).toHaveBeenCalledTimes(1));
    expect(cancelOrder.mock.calls[0]).toEqual(['order-uuid-1', 'OTHER', 'a short note']); // never an amount, currency, payment or customer id
  });

  it('the note is limited to 200 characters', async () => {
    getMyOrders.mockResolvedValueOnce([order()]);
    renderModal();
    await userEvent.click(await screen.findByTestId('cancel-order-button'));
    const note = screen.getByLabelText(/note/i) as HTMLTextAreaElement;
    await userEvent.click(note);
    await userEvent.paste('x'.repeat(250));
    expect(note.value).toHaveLength(200);
    expect(screen.getByText('200/200')).toBeInTheDocument();
  });

  it('double-clicking Cancel sends ONE request (and the button shows "Cancelling…")', async () => {
    let finish!: (v: ReturnType<typeof cancelResult>) => void;
    cancelOrder.mockReturnValueOnce(new Promise((r) => (finish = r)));
    getMyOrders.mockResolvedValueOnce([order()]);
    getOrder.mockResolvedValue(cancelledUnpaid());
    renderModal();
    await userEvent.click(await screen.findByTestId('cancel-order-button'));
    await userEvent.selectOptions(screen.getByLabelText(/why are you cancelling/i), 'CHANGED_MIND');
    const submit = dialogSubmit();
    await userEvent.dblClick(submit);
    expect(cancelOrder).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /cancelling/i })).toBeDisabled();
    finish(cancelResult(order()));
    await waitFor(() => expect(screen.queryByTestId('cancel-dialog')).not.toBeInTheDocument());
    expect(cancelOrder).toHaveBeenCalledTimes(1);
  });

  it('after an UNPAID cancellation the order is re-read, shows "Order cancelled." and says NOTHING about a refund', async () => {
    getMyOrders.mockResolvedValueOnce([order()]);
    cancelOrder.mockResolvedValueOnce(cancelResult(order()));
    getOrder.mockResolvedValueOnce(cancelledUnpaid());
    renderModal();
    await userEvent.click(await screen.findByTestId('cancel-order-button'));
    await userEvent.selectOptions(screen.getByLabelText(/why are you cancelling/i), 'WRONG_ORDER');
    await userEvent.click(dialogSubmit());

    await waitFor(() => expect(screen.getByTestId('badge-order')).toHaveTextContent('Cancelled'));
    expect(screen.getByTestId('refund-notice')).toHaveTextContent('Order cancelled.');
    expect(screen.queryByTestId('badge-refund')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/refund(ed)? (has|is|was)|requested a refund|your refund/i);
    expect(screen.queryByTestId('cancel-order-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pay-button')).not.toBeInTheDocument();
    expect(getOrder).toHaveBeenCalledWith('order-uuid-1');
  });

  it('after a PAID cancellation "cancelled" does NOT mean "refunded": the separate refund state is shown (REFUND_PENDING)', async () => {
    getMyOrders.mockResolvedValueOnce([confirmedPaid()]);
    cancelOrder.mockResolvedValueOnce(cancelResult(confirmedPaid()));
    getOrder.mockResolvedValueOnce(cancelledPaid('REFUND_PENDING'));
    renderModal();
    await userEvent.click(await screen.findByTestId('cancel-order-button'));
    expect(screen.getByText(/requests a refund of your payment/i)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(/why are you cancelling/i), 'CHANGED_MIND');
    await userEvent.click(dialogSubmit());

    await waitFor(() => expect(screen.getByTestId('badge-order')).toHaveTextContent('Cancelled'));
    expect(screen.getByTestId('badge-payment')).toHaveTextContent('Paid');
    expect(screen.getByTestId('badge-refund')).toHaveTextContent('Refund requested');
    expect(screen.getByTestId('refund-notice')).toHaveTextContent('Order cancelled. Your refund has been requested.');
    expect(screen.getByTestId('refund-notice')).not.toHaveTextContent(/has been issued/i);
  });

  it('a server rejection (409 CANCELLATION_NOT_ALLOWED) shows safe copy, re-reads the order and removes the Cancel action', async () => {
    getMyOrders.mockResolvedValueOnce([order()]);
    cancelOrder.mockRejectedValueOnce(new ApiRequestError('Raw: kitchen accepted order 8812', 'CANCELLATION_NOT_ALLOWED', 409));
    getOrder.mockResolvedValueOnce(order({ status: 'ACCEPTED', cancellation: { state: 'CANCELLATION_NOT_ALLOWED', allowed: false } }));
    renderModal();
    await userEvent.click(await screen.findByTestId('cancel-order-button'));
    await userEvent.selectOptions(screen.getByLabelText(/why are you cancelling/i), 'CHANGED_MIND');
    await userEvent.click(dialogSubmit());

    expect(await screen.findByRole('alert')).toHaveTextContent('This order can no longer be cancelled.');
    expect(document.body).not.toHaveTextContent('kitchen accepted order 8812');
    await userEvent.click(screen.getByRole('button', { name: /keep order/i }));
    await waitFor(() => expect(screen.queryByTestId('cancel-order-button')).not.toBeInTheDocument()); // the server decision wins
    expect(screen.getByTestId('badge-order')).toHaveTextContent('Accepted by the kitchen');
  });

  it('401 during cancellation hands over to sign-in; 429 and 5xx show safe copy only', async () => {
    for (const [err, copy] of [
      [new ApiRequestError('x', 'UNAUTHORIZED', 401), /session has expired/i],
      [new ApiRequestError('x', 'TOO_MANY_REQUESTS', 429), /too many attempts/i],
      [new ApiRequestError('SQL error at line 4', 'INTERNAL_SERVER_ERROR', 500), /something went wrong on our side/i]
    ] as const) {
      getMyOrders.mockResolvedValueOnce([order()]);
      cancelOrder.mockRejectedValueOnce(err);
      getOrder.mockResolvedValueOnce(order());
      const { unmount } = renderModal();
      await userEvent.click(await screen.findByTestId('cancel-order-button'));
      await userEvent.selectOptions(screen.getByLabelText(/why are you cancelling/i), 'OTHER');
      await userEvent.click(dialogSubmit());
      expect(await screen.findByRole('alert')).toHaveTextContent(copy);
      expect(document.body).not.toHaveTextContent('SQL error');
      unmount();
    }
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });
});

describe('P7D refund UX (server states only, no provider data, no promises)', () => {
  const states: Array<[RefundState, RegExp, string | null]> = [
    ['NO_REFUND', /^Order cancelled\.$/, null],
    ['REFUND_PENDING', /^Order cancelled\. Your refund has been requested\.$/, 'Refund requested'],
    ['REFUND_PROCESSING', /^Your refund is being processed\.$/, 'Refund processing'],
    ['REFUNDED', /^Your refund has been issued\. It may take time to appear, depending on your bank or payment provider\.$/, 'Refund issued'],
    ['REFUND_REVIEW_REQUIRED', /^We are reviewing your refund and will update this page\.$/, 'Refund under review']
  ];
  for (const [state, copy, badge] of states) {
    it(`${state}: renders the approved copy${badge ? ' and badge' : ' and no refund badge'}`, async () => {
      getMyOrders.mockResolvedValueOnce([cancelledPaid(state)]);
      renderModal();
      expect(await screen.findByTestId('refund-notice')).toHaveTextContent(copy);
      if (badge) expect(screen.getByTestId('badge-refund')).toHaveTextContent(badge);
      else expect(screen.queryByTestId('badge-refund')).not.toBeInTheDocument();
    });
  }

  it('never promises a refund date and never shows provider / internal refund information', async () => {
    const leaky = { ...cancelledPaid('REFUNDED'), providerRefundId: 'rfnd_SECRET', providerPaymentId: 'pay_SECRET', reviewFlag: 'EXTERNAL_REFUND', failureReason: 'bank says no', attemptCount: 7 } as unknown as ApiOrder;
    getMyOrders.mockResolvedValueOnce([leaky]);
    renderModal();
    await screen.findByTestId('refund-notice');
    expect(document.body.textContent).not.toMatch(/rfnd_|pay_SECRET|EXTERNAL_REFUND|bank says no|attempt/i);
    expect(document.body.textContent).not.toMatch(/within \d+ (business|working)? ?days|by (monday|tuesday|wednesday|thursday|friday|\d{1,2}(st|nd|rd|th)?\s)/i);
  });

  it('RefundNotice renders nothing for a live order without a refund', () => {
    const { container } = render(<RefundNotice order={order()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('P7D order detail: three separate states and friendly labels', () => {
  it('shows order, payment and refund as separate labelled badges, never raw enums', async () => {
    getMyOrders.mockResolvedValueOnce([cancelledPaid('REFUND_PROCESSING')]);
    renderModal();
    await screen.findByTestId('badge-order');
    expect(screen.getByTestId('badge-order')).toHaveTextContent('Cancelled');
    expect(screen.getByTestId('badge-payment')).toHaveTextContent('Paid');
    expect(screen.getByTestId('badge-refund')).toHaveTextContent('Refund processing');
    const list = screen.getByRole('list', { name: /order history/i });
    expect(list).not.toHaveTextContent(/CANCELLED|PENDING|CONFIRMED/);
    expect(screen.getByLabelText(/order, payment and refund status/i)).toBeInTheDocument();
  });

  it('labels every order status for customers', async () => {
    const labels: Record<string, string> = { PENDING: 'Order placed', CONFIRMED: 'Confirmed', ACCEPTED: 'Accepted by the kitchen', PREPARING: 'Being prepared', READY: 'Ready', DISPATCHED: 'Out for delivery', DELIVERED: 'Delivered', CANCELLED: 'Cancelled' };
    for (const [status, label] of Object.entries(labels)) {
      getMyOrders.mockResolvedValueOnce([order({ status, paymentStatus: status === 'PENDING' ? 'PENDING' : 'PAID', payment: { state: status === 'PENDING' ? 'NOT_STARTED' : 'PAID', canStartPayment: false } })]);
      const { unmount } = renderModal();
      expect(await screen.findByTestId('badge-order')).toHaveTextContent(label);
      unmount();
    }
  });

  it('shows the timeline with friendly labels when the server provides it', async () => {
    getMyOrders.mockResolvedValueOnce([order({ timeline: [{ fromStatus: null, toStatus: 'PENDING', at: '2026-10-10T10:00:00.000Z' }, { fromStatus: 'PENDING', toStatus: 'CONFIRMED', at: '2026-10-10T10:05:00.000Z' }] })]);
    renderModal();
    const timeline = await screen.findByRole('list', { name: /order timeline/i });
    expect(within(timeline).getAllByRole('listitem').map((li) => li.textContent?.split('·')[0].trim())).toEqual(['Order placed', 'Confirmed']);
  });

  it('touch targets: financial and navigation controls are at least 44px tall (min-h-11) and the layout stacks on small screens', async () => {
    getMyOrders.mockResolvedValueOnce([order()]);
    renderModal();
    expect(await screen.findByTestId('cancel-order-button')).toHaveClass('min-h-11');
    expect(screen.getByTestId('pay-button')).toHaveClass('min-h-11');
    expect(screen.getByTestId('refresh-order')).toHaveClass('min-h-11');
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass('min-h-11');
    const grid = screen.getByTestId('order-detail').parentElement!.parentElement!;
    expect(grid.className).toMatch(/grid-cols-1/);
    expect(grid.className).toMatch(/md:grid-cols-5/);
  });

  it('a lookup of an order that is missing OR belongs to someone else shows the same generic message', async () => {
    for (const code of ['NOT_FOUND', 'ORDER_NOT_FOUND']) {
      getMyOrders.mockResolvedValueOnce([order()]);
      getOrder.mockRejectedValueOnce(new ApiRequestError("Order PB-999 belongs to customer 12", code, 404));
      const { unmount } = renderModal({ initialOrderNumber: 'PB-OTHER-111' });
      expect(await screen.findByRole('alert')).toHaveTextContent(/^Order not found\.$/);
      expect(document.body).not.toHaveTextContent('belongs to customer');
      unmount();
    }
  });

  it('401 while loading orders hands over to sign-in with safe copy', async () => {
    getMyOrders.mockRejectedValueOnce(new ApiRequestError('jwt expired', 'UNAUTHORIZED', 401));
    renderModal();
    expect(await screen.findByRole('alert')).toHaveTextContent(/session has expired/i);
    expect(document.body).not.toHaveTextContent('jwt expired');
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });
});
