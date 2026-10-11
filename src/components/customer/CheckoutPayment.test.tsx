import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({
  auth: { isAuthenticated: true, isLoading: false, user: { id: 'user-1', roles: ['CUSTOMER'] } as { id: string; roles: string[] } | null }
}));

vi.mock('../../context/AuthContext', () => ({ useAuth: () => h.auth }));
vi.mock('../../services/cartService', () => ({
  CartService: { getCart: vi.fn(), addItem: vi.fn(), updateItemQuantity: vi.fn(), removeItem: vi.fn(), clearCart: vi.fn() }
}));
vi.mock('../../services/orderService', () => ({
  OrderService: { checkoutPreview: vi.fn(), createOrder: vi.fn(), getMyOrders: vi.fn(), getOrder: vi.fn(), cancelOrder: vi.fn(), getOrderRefunds: vi.fn() }
}));
vi.mock('../../services/addressService', () => ({
  AddressService: { getAddresses: vi.fn(), createAddress: vi.fn(), updateAddress: vi.fn(), deleteAddress: vi.fn() }
}));
vi.mock('../../services/paymentService', () => ({ PaymentService: { createSession: vi.fn(), verify: vi.fn() } }));

import { CartService } from '../../services/cartService';
import { OrderService } from '../../services/orderService';
import { AddressService } from '../../services/addressService';
import { PaymentService } from '../../services/paymentService';
import { CartProvider } from '../../context/CartContext';
import { DirectCartCheckoutModal } from './DirectCartCheckoutModal';
import { ADDRESS, cartItem, order, preview, serverCart } from '../../test/fixtures';
import { FakeRazorpay, installFakeRazorpay, SESSION, uninstallFakeRazorpay } from '../../test/razorpayFake';
import { resetRazorpayLoaderForTests } from '../../utils/razorpayLoader';

const getCart = vi.mocked(CartService.getCart);
const checkoutPreview = vi.mocked(OrderService.checkoutPreview);
const createOrder = vi.mocked(OrderService.createOrder);
const getOrder = vi.mocked(OrderService.getOrder);
const getAddresses = vi.mocked(AddressService.getAddresses);
const createSession = vi.mocked(PaymentService.createSession);
const verify = vi.mocked(PaymentService.verify);
const onSessionExpired = vi.fn();

const paid = () => order({ status: 'CONFIRMED', paymentStatus: 'PAID', payment: { state: 'PAID', canStartPayment: false } });

function renderModal() {
  return render(
    <CartProvider>
      <DirectCartCheckoutModal isOpen onClose={vi.fn()} onOpenTracking={vi.fn()} onSessionExpired={onSessionExpired} />
    </CartProvider>
  );
}

async function placeOrder() {
  await userEvent.click(await screen.findByRole('button', { name: /continue to delivery/i }));
  await screen.findByText(/12 Marine Drive/);
  await userEvent.click(screen.getByRole('button', { name: /review order/i }));
  await screen.findByTestId('checkout-summary');
  await userEvent.click(screen.getByRole('button', { name: /place order/i }));
  return await screen.findByTestId('order-confirmation');
}

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.isAuthenticated = true;
  installFakeRazorpay();
  resetRazorpayLoaderForTests();
  getCart.mockResolvedValue(serverCart([cartItem()]));
  getAddresses.mockResolvedValue([ADDRESS]);
  checkoutPreview.mockResolvedValue(preview());
  createSession.mockResolvedValue(SESSION);
});
afterEach(() => {
  uninstallFakeRazorpay();
  vi.useRealTimers();
});

describe('P7D end-to-end checkout: cart -> address -> review -> order -> pay -> verify -> backend-driven outcome', () => {
  it('places the order, then pays through Razorpay; success appears only after the BACKEND says paid', async () => {
    createOrder.mockResolvedValueOnce(order());
    verify.mockResolvedValueOnce({ result: 'PAID', orderStatus: 'CONFIRMED', orderPaymentStatus: 'PAID' });
    getOrder.mockResolvedValue(paid());
    renderModal();
    const confirmation = await placeOrder();

    // order created (idempotently), NOT paid yet: honest copy, a Pay action, no success claims
    expect(within(confirmation).getByRole('heading', { name: /your order has been placed/i })).toBeInTheDocument();
    expect(within(confirmation).getByTestId('badge-payment')).toHaveTextContent('Payment pending');
    expect(createOrder.mock.calls[0][0].idempotencyKey).toMatch(/^IK-/);
    expect(createSession).not.toHaveBeenCalled(); // nothing is created until the customer asks to pay

    await userEvent.click(within(confirmation).getByTestId('pay-button'));
    await waitFor(() => expect(FakeRazorpay.instances).toHaveLength(1));
    expect(createSession).toHaveBeenCalledWith('order-uuid-1');

    act(() => FakeRazorpay.instances[0].succeed({ razorpay_payment_id: 'pay_ok' }));
    await waitFor(() => expect(verify).toHaveBeenCalledWith('order-uuid-1', 'attempt-1', { providerOrderId: 'order_PB_1', providerPaymentId: 'pay_ok', signature: 'sig_test_secret_value' }));
    expect(await screen.findByRole('heading', { name: /your payment is confirmed/i })).toBeInTheDocument();
    expect(screen.getByTestId('badge-payment')).toHaveTextContent('Paid');
    expect(screen.queryByTestId('pay-button')).not.toBeInTheDocument();
  });

  it('when the backend says "confirming" the checkout never claims success and never offers a second payment', async () => {
    createOrder.mockResolvedValueOnce(order());
    verify.mockResolvedValueOnce({ result: 'PENDING', orderStatus: 'PENDING', orderPaymentStatus: 'PENDING' });
    getOrder.mockResolvedValue(order({ payment: { state: 'CONFIRMING', canStartPayment: false } }));
    renderModal();
    await placeOrder();
    await userEvent.click(screen.getByTestId('pay-button'));
    await waitFor(() => expect(FakeRazorpay.instances).toHaveLength(1));
    act(() => FakeRazorpay.instances[0].succeed());

    expect(await screen.findByText(/do not pay again yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('pay-button')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /payment is confirmed/i })).not.toBeInTheDocument();
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it('an order the server reports as not startable (e.g. payment already in flight) shows no Pay action straight after creation', async () => {
    createOrder.mockResolvedValueOnce(order({ payment: { state: 'CONFIRMING', canStartPayment: false } }));
    renderModal();
    await placeOrder();
    expect(screen.queryByTestId('pay-button')).not.toBeInTheDocument();
    expect(screen.getByText(/do not pay again yet/i)).toBeInTheDocument();
  });

  it('the review step no longer claims that online payment is unavailable and shows no payment status', async () => {
    renderModal();
    await userEvent.click(await screen.findByRole('button', { name: /continue to delivery/i }));
    await screen.findByText(/12 Marine Drive/);
    await userEvent.click(screen.getByRole('button', { name: /review order/i }));
    await screen.findByTestId('checkout-summary');
    expect(screen.queryByText(/not available yet/i)).not.toBeInTheDocument();
    expect(screen.getByText(/secure online payment/i)).toBeInTheDocument();
  });

  it('only the server cart and order endpoints are used to build the order: no price, amount or currency is sent by the client', async () => {
    createOrder.mockResolvedValueOnce(order());
    renderModal();
    await placeOrder();
    expect(Object.keys(createOrder.mock.calls[0][0]).sort()).toEqual(['addressId', 'idempotencyKey']);
    expect(createSession.mock.calls).toEqual([]);
  });

  it('an expired session during order creation hands over to sign-in (session expired copy, order not reported as placed)', async () => {
    const { ApiRequestError } = await import('../../services/apiClient');
    createOrder.mockRejectedValueOnce(new ApiRequestError('jwt expired', 'UNAUTHORIZED', 401));
    renderModal();
    await userEvent.click(await screen.findByRole('button', { name: /continue to delivery/i }));
    await screen.findByText(/12 Marine Drive/);
    await userEvent.click(screen.getByRole('button', { name: /review order/i }));
    await screen.findByTestId('checkout-summary');
    await userEvent.click(screen.getByRole('button', { name: /place order/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/session has expired/i);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('order-confirmation')).not.toBeInTheDocument();
  });

  it('the checkout dialog is accessible: named modal dialog, Escape closes it', async () => {
    const onClose = vi.fn();
    render(
      <CartProvider>
        <DirectCartCheckoutModal isOpen onClose={onClose} />
      </CartProvider>
    );
    const dialog = await screen.findByRole('dialog', { name: /cart and checkout/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
