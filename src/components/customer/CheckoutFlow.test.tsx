import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
import { CartProvider } from '../../context/CartContext';
import { DirectCartCheckoutModal } from './DirectCartCheckoutModal';
import { ADDRESS, cartItem, order, preview, serverCart } from '../../test/fixtures';

const getCart = vi.mocked(CartService.getCart);
const updateItemQuantity = vi.mocked(CartService.updateItemQuantity);
const removeItem = vi.mocked(CartService.removeItem);
const addItem = vi.mocked(CartService.addItem);
const checkoutPreview = vi.mocked(OrderService.checkoutPreview);
const createOrder = vi.mocked(OrderService.createOrder);
const getAddresses = vi.mocked(AddressService.getAddresses);

const onClose = vi.fn();
const onOpenTracking = vi.fn();

function renderModal() {
  return render(
    <CartProvider>
      <DirectCartCheckoutModal isOpen onClose={onClose} onOpenTracking={onOpenTracking} />
    </CartProvider>
  );
}

/** Walk the modal to the review step with the default address selected. */
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

describe('cart (server-backed)', () => {
  it('hydrates the cart from GET /cart, not from local state', async () => {
    getCart.mockResolvedValue(serverCart([cartItem({ name: 'Cart Item From Server', id: 'ci-9', quantity: 3, subtotal: 597 })]));
    renderModal();

    expect(await screen.findByText('Cart Item From Server')).toBeInTheDocument();
    expect(getCart).toHaveBeenCalled();
    expect(screen.getByTestId('qty-ci-9')).toHaveTextContent('3');
    expect(screen.getByTestId('summary-items-subtotal')).toHaveTextContent('₹597');
  });

  it('shows a loading state, then an empty state for an empty server cart', async () => {
    let resolve!: (c: ReturnType<typeof serverCart>) => void;
    getCart.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    renderModal();
    expect(screen.getByRole('status')).toHaveTextContent('Loading your cart');
    resolve(serverCart([]));
    expect(await screen.findByText('Your cart is empty.')).toBeInTheDocument();
  });

  it('shows an error state with retry when the cart cannot be loaded', async () => {
    getCart.mockRejectedValueOnce(new Error('Cart service down'));
    renderModal();
    expect(await screen.findByRole('alert')).toHaveTextContent('Cart service down');

    getCart.mockResolvedValueOnce(serverCart([cartItem()]));
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('Server Almond Granola')).toBeInTheDocument();
  });

  it('quantity change goes to the backend and the UI shows the server response', async () => {
    // The server answers with a different subtotal than any client arithmetic would give.
    updateItemQuantity.mockResolvedValueOnce(serverCart([cartItem({ quantity: 2, subtotal: 361.5 })]));
    renderModal();

    await userEvent.click(await screen.findByRole('button', { name: 'Increase quantity of Server Almond Granola' }));

    await waitFor(() => expect(updateItemQuantity).toHaveBeenCalledWith('ci-1', 2));
    await waitFor(() => expect(screen.getByTestId('qty-ci-1')).toHaveTextContent('2'));
    expect(screen.getByTestId('summary-items-subtotal')).toHaveTextContent('₹361.50');
  });

  it('removing an item calls the backend and reflects the server cart', async () => {
    removeItem.mockResolvedValueOnce(serverCart([]));
    renderModal();

    await userEvent.click(await screen.findByRole('button', { name: 'Remove Server Almond Granola' }));

    await waitFor(() => expect(removeItem).toHaveBeenCalledWith('ci-1'));
    expect(await screen.findByText('Your cart is empty.')).toBeInTheDocument();
  });

  it('a failed quantity update keeps the previous server state and shows the error', async () => {
    updateItemQuantity.mockRejectedValueOnce(new Error('Quantity not allowed'));
    renderModal();

    await userEvent.click(await screen.findByRole('button', { name: 'Increase quantity of Server Almond Granola' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Quantity not allowed');
    expect(screen.getByTestId('qty-ci-1')).toHaveTextContent('1');
  });
});

describe('checkout preview — server-authoritative totals', () => {
  it('displays the exact breakdown returned by POST /checkout/preview', async () => {
    renderModal();
    await goToReview();

    expect(checkoutPreview).toHaveBeenCalledWith({ addressId: 'addr-1' });
    expect(screen.getByTestId('summary-items-subtotal')).toHaveTextContent('₹199');
    expect(screen.getByTestId('summary-tax')).toHaveTextContent('₹11.11');
    expect(screen.getByTestId('summary-packaging')).toHaveTextContent('₹7.77');
    expect(screen.getByTestId('summary-delivery')).toHaveTextContent('₹33.33');
    expect(screen.getByTestId('summary-total')).toHaveTextContent('₹251.21');
  });

  it('does not recompute totals: a total inconsistent with the line items is shown verbatim', async () => {
    checkoutPreview.mockResolvedValue(preview({ summary: { itemsSubtotal: 199, totalTax: 1, containerDepositTotal: 0, packagingFee: 0, deliveryFee: 0, discountAmount: 0, netAmount: 999.99 } }));
    renderModal();
    await goToReview();

    // 199 + 1 would be 200 if the UI computed anything; the server said 999.99.
    expect(screen.getByTestId('summary-total')).toHaveTextContent('₹999.99');
  });

  it('shows deposit only when the server returns one, from server data (no ₹10 constant)', async () => {
    checkoutPreview.mockResolvedValue(
      preview({ summary: { itemsSubtotal: 120, totalTax: 6, containerDepositTotal: 25, packagingFee: 0, deliveryFee: 0, discountAmount: 0, netAmount: 151 } })
    );
    renderModal();
    await goToReview();

    expect(screen.getByTestId('summary-container-deposit')).toHaveTextContent('₹25');
  });

  it('shows a preview error with retry (no fabricated totals)', async () => {
    checkoutPreview.mockRejectedValueOnce(new Error('Pricing unavailable'));
    renderModal();
    await userEvent.click(await screen.findByRole('button', { name: /continue to delivery/i }));
    await screen.findByText(/12 Marine Drive/);
    await userEvent.click(screen.getByRole('button', { name: /review order/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Pricing unavailable');
    expect(screen.queryByTestId('checkout-summary')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /place order/i })).not.toBeInTheDocument();
  });
});

describe('address selection', () => {
  it('lets the customer create an owned address when none exists, then continues with it', async () => {
    getAddresses.mockResolvedValue([]);
    vi.mocked(AddressService.createAddress).mockResolvedValueOnce({ ...ADDRESS, id: 'addr-new', addressLine1: '5 New Road' });
    renderModal();

    await userEvent.click(await screen.findByRole('button', { name: /continue to delivery/i }));
    await userEvent.type(await screen.findByLabelText('Address line 1'), '5 New Road');
    await userEvent.type(screen.getByLabelText('City'), 'Kochi');
    await userEvent.type(screen.getByLabelText('Postal code'), '682030');
    await userEvent.click(screen.getByRole('button', { name: /save address/i }));

    await waitFor(() =>
      expect(AddressService.createAddress).toHaveBeenCalledWith(expect.objectContaining({ addressLine1: '5 New Road', city: 'Kochi', postalCode: '682030', isDefault: true }))
    );
    await userEvent.click(await screen.findByRole('button', { name: /review order/i }));
    await waitFor(() => expect(checkoutPreview).toHaveBeenCalledWith({ addressId: 'addr-new' }));
  });
});

describe('order creation', () => {
  it('creates the order from the SERVER cart: only addressId + idempotency key are sent, never items or prices', async () => {
    createOrder.mockResolvedValueOnce(order());
    renderModal();
    await goToReview();

    await userEvent.click(screen.getByRole('button', { name: /place order/i }));

    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1));
    const payload = createOrder.mock.calls[0][0];
    expect(Object.keys(payload).sort()).toEqual(['addressId', 'idempotencyKey']);
    expect(payload.addressId).toBe('addr-1');
    expect(payload.idempotencyKey).toMatch(/^IK-/);
    // the storefront never pushes items at checkout time - the server cart is already authoritative
    expect(addItem).not.toHaveBeenCalled();
  });

  it('displays the persisted order returned by the server (number, status, payment status, totals, address)', async () => {
    createOrder.mockResolvedValueOnce(order({ orderNumber: 'PB-777777-123', status: 'PENDING', paymentStatus: 'PENDING', netAmount: '251.21' }));
    renderModal();
    await goToReview();
    await userEvent.click(screen.getByRole('button', { name: /place order/i }));

    const confirmation = await screen.findByTestId('order-confirmation');
    expect(within(confirmation).getByTestId('order-number')).toHaveTextContent('PB-777777-123');
    expect(within(confirmation).getByTestId('order-status')).toHaveTextContent('PENDING');
    expect(within(confirmation).getByTestId('order-payment-status')).toHaveTextContent('PENDING');
    expect(within(confirmation).getByTestId('summary-total')).toHaveTextContent('₹251.21');
    expect(within(confirmation).getByText(/12 Marine Drive/)).toBeInTheDocument();
    expect(within(confirmation).queryByText(/paid/i)).not.toBeInTheDocument();
  });

  it('re-syncs the cart from the server after the order (the server consumed it)', async () => {
    createOrder.mockResolvedValueOnce(order());
    renderModal();
    await goToReview();
    getCart.mockClear();
    getCart.mockResolvedValue(serverCart([]));

    await userEvent.click(screen.getByRole('button', { name: /place order/i }));
    await screen.findByTestId('order-confirmation');

    await waitFor(() => expect(getCart).toHaveBeenCalled());
  });

  it('prevents double submission: a second click while the request is in flight creates no second order', async () => {
    let resolve!: (o: ReturnType<typeof order>) => void;
    createOrder.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    renderModal();
    await goToReview();

    const button = screen.getByRole('button', { name: /place order/i });
    await userEvent.click(button);
    await userEvent.click(button);
    await userEvent.dblClick(button);

    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /placing order/i })).toBeDisabled();

    resolve(order());
    await screen.findByTestId('order-confirmation');
    expect(createOrder).toHaveBeenCalledTimes(1);
  });

  it('an API failure never shows order success, and a retry re-uses the SAME idempotency key', async () => {
    createOrder.mockRejectedValueOnce(new Error('Network down'));
    renderModal();
    await goToReview();

    await userEvent.click(screen.getByRole('button', { name: /place order/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Network down');
    expect(screen.queryByTestId('order-confirmation')).not.toBeInTheDocument();
    expect(screen.queryByText(/your order has been received/i)).not.toBeInTheDocument();

    createOrder.mockResolvedValueOnce(order());
    await userEvent.click(screen.getByRole('button', { name: /place order/i }));
    await screen.findByTestId('order-confirmation');

    expect(createOrder).toHaveBeenCalledTimes(2);
    expect(createOrder.mock.calls[1][0].idempotencyKey).toBe(createOrder.mock.calls[0][0].idempotencyKey);
  });

  it('hands off to order tracking with the persisted order number', async () => {
    createOrder.mockResolvedValueOnce(order({ orderNumber: 'PB-424242-001' }));
    renderModal();
    await goToReview();
    await userEvent.click(screen.getByRole('button', { name: /place order/i }));
    await userEvent.click(await screen.findByRole('button', { name: /view order/i }));

    expect(onOpenTracking).toHaveBeenCalledWith('PB-424242-001');
  });
});
