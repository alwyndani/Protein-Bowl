import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({
  auth: { isAuthenticated: true, isLoading: false, user: { id: 'user-1', roles: ['CUSTOMER'] } as { id: string; roles: string[] } | null }
}));

vi.mock('../../context/AuthContext', () => ({ useAuth: () => h.auth }));
vi.mock('../../services/cartService', () => ({
  CartService: { getCart: vi.fn(), addItem: vi.fn(), updateItemQuantity: vi.fn(), removeItem: vi.fn(), clearCart: vi.fn() }
}));
vi.mock('../../services/orderService', () => ({
  OrderService: { checkoutPreview: vi.fn(), createOrder: vi.fn(), getMyOrders: vi.fn(), getOrder: vi.fn() }
}));
vi.mock('../../services/addressService', () => ({
  AddressService: { getAddresses: vi.fn(), createAddress: vi.fn(), updateAddress: vi.fn(), deleteAddress: vi.fn() }
}));

import { CartService } from '../../services/cartService';
import { OrderService } from '../../services/orderService';
import { AddressService } from '../../services/addressService';
import { ApiRequestError } from '../../services/apiClient';
import { CartProvider } from '../../context/CartContext';
import { DirectCartCheckoutModal } from './DirectCartCheckoutModal';
import { ADDRESS, cartItem, order, preview, serverCart } from '../../test/fixtures';

const getCart = vi.mocked(CartService.getCart);
const updateItemQuantity = vi.mocked(CartService.updateItemQuantity);
const checkoutPreview = vi.mocked(OrderService.checkoutPreview);
const createOrder = vi.mocked(OrderService.createOrder);
const getAddresses = vi.mocked(AddressService.getAddresses);

function renderModal() {
  return render(
    <CartProvider>
      <DirectCartCheckoutModal isOpen onClose={vi.fn()} onOpenTracking={vi.fn()} />
    </CartProvider>
  );
}

async function goToReview() {
  await userEvent.click(await screen.findByRole('button', { name: /continue to delivery/i }));
  await screen.findByText(/12 Marine Drive/);
  await userEvent.click(screen.getByRole('button', { name: /review order/i }));
  await screen.findByTestId('checkout-summary');
}

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.isAuthenticated = true;
  h.auth.user = { id: 'user-1', roles: ['CUSTOMER'] };
  getCart.mockResolvedValue(serverCart([cartItem()]));
  getAddresses.mockResolvedValue([ADDRESS]);
  checkoutPreview.mockResolvedValue(preview());
});

describe('P7A checkout — server minimum order and policy errors', () => {
  it('shows no minimum-order notice when the server reports the rule disabled (or omits it) and Place order stays enabled', async () => {
    checkoutPreview.mockResolvedValue(preview({ minimumOrder: { enabled: false, requiredAmount: 0, met: true, shortfall: 0 } }));
    renderModal();
    await goToReview();
    expect(screen.queryByTestId('minimum-order-notice')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /place order/i })).toBeEnabled();
  });

  it('an older preview without minimumOrder still works (backward compatible)', async () => {
    renderModal();
    await goToReview();
    expect(screen.queryByTestId('minimum-order-notice')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /place order/i })).toBeEnabled();
  });

  it('shows the SERVER-computed requirement and shortfall and blocks Place order when the minimum is not met', async () => {
    checkoutPreview.mockResolvedValue(preview({ minimumOrder: { enabled: true, requiredAmount: 250, met: false, shortfall: 51 } }));
    renderModal();
    await goToReview();

    const notice = screen.getByTestId('minimum-order-notice');
    expect(notice).toHaveTextContent('₹250');
    expect(notice).toHaveTextContent('₹51');
    const place = screen.getByRole('button', { name: /place order/i });
    expect(place).toBeDisabled();
    await userEvent.click(place);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('the notice offers a way back to the cart', async () => {
    checkoutPreview.mockResolvedValue(preview({ minimumOrder: { enabled: true, requiredAmount: 250, met: false, shortfall: 51 } }));
    renderModal();
    await goToReview();
    await userEvent.click(screen.getByRole('button', { name: /back to cart/i }));
    expect(await screen.findByRole('button', { name: /continue to delivery/i })).toBeInTheDocument();
  });

  it('does not decide the rule itself: with met=true the order can be placed even if the cart total looks small', async () => {
    checkoutPreview.mockResolvedValue(preview({ minimumOrder: { enabled: true, requiredAmount: 250, met: true, shortfall: 0 } }));
    createOrder.mockResolvedValueOnce(order());
    renderModal();
    await goToReview();
    await userEvent.click(screen.getByRole('button', { name: /place order/i }));
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1));
  });

  it('a server MINIMUM_ORDER_NOT_MET at order time is shown to the customer and the order is not reported as placed', async () => {
    createOrder.mockRejectedValueOnce(new ApiRequestError('The minimum order is ₹250.00; add ₹51.00 more to continue', 'MINIMUM_ORDER_NOT_MET', 422));
    renderModal();
    await goToReview();
    await userEvent.click(screen.getByRole('button', { name: /place order/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The minimum order is ₹250.00');
    expect(screen.queryByTestId('order-confirmation')).not.toBeInTheDocument();
  });

  it('every order attempt sends an explicit idempotency key, and a retry after a failure reuses the SAME key', async () => {
    createOrder.mockRejectedValueOnce(new ApiRequestError('Network hiccup', 'NETWORK_ERROR')).mockResolvedValueOnce(order());
    renderModal();
    await goToReview();
    await userEvent.click(screen.getByRole('button', { name: /place order/i }));
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: /place order/i }));
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(2));
    const [first, second] = createOrder.mock.calls.map((c) => c[0].idempotencyKey);
    expect(first).toMatch(/^IK-.{8,}/);
    expect(second).toBe(first);
  });

  it('the order response (a customer DTO without internal fields) is displayed as persisted: still PENDING / PENDING and honest about payments', async () => {
    createOrder.mockResolvedValueOnce(order({ status: 'PENDING', paymentStatus: 'PENDING', timeline: [{ fromStatus: null, toStatus: 'PENDING', at: '2026-10-10T10:00:00.000Z' }] }));
    renderModal();
    await goToReview();
    expect(screen.getByText(/Online payment is not available yet/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /place order/i }));
    expect(await screen.findByTestId('order-status')).toHaveTextContent('PENDING');
    expect(screen.getByTestId('order-payment-status')).toHaveTextContent('PENDING');
  });

  it('a server quantity-limit rejection is shown and the cart keeps its previous server state', async () => {
    updateItemQuantity.mockRejectedValueOnce(new ApiRequestError('A single item can be ordered at most 20 times', 'MAX_LINE_QUANTITY_EXCEEDED', 422));
    renderModal();
    await userEvent.click(await screen.findByRole('button', { name: 'Increase quantity of Server Almond Granola' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('at most 20 times');
    expect(screen.getByTestId('qty-ci-1')).toHaveTextContent('1');
  });
});
