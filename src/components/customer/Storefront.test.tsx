import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({
  auth: { isAuthenticated: true, isLoading: false, user: { id: 'user-1', roles: ['CUSTOMER'] } as { id: string; roles: string[] } | null }
}));

vi.mock('../../context/AuthContext', () => ({ useAuth: () => h.auth }));
vi.mock('../../services/productService', () => ({
  ProductService: { getProducts: vi.fn(), getCategories: vi.fn(), getProductBySlug: vi.fn() }
}));
vi.mock('../../services/cartService', () => ({
  CartService: { getCart: vi.fn(), addItem: vi.fn(), updateItemQuantity: vi.fn(), removeItem: vi.fn(), clearCart: vi.fn() }
}));

import { ProductService } from '../../services/productService';
import { CartService } from '../../services/cartService';
import { CartProvider, useCart } from '../../context/CartContext';
import { useStorefrontActions } from '../../hooks/useStorefrontActions';
import { PackagedFoodsSection } from './PackagedFoodsSection';
import { TepacheDrinksSection } from './TepacheDrinksSection';
import { FMCG_PACKAGED_PRODUCTS } from '../../data/mockBakeryFMCGData';
import { TEPACHE_PRODUCTS } from '../../data/mockTepacheData';
import { cartItem, product, serverCart, variant } from '../../test/fixtures';

const getProducts = vi.mocked(ProductService.getProducts);
const getCart = vi.mocked(CartService.getCart);
const addItem = vi.mocked(CartService.addItem);

const requireCustomerAuth = vi.fn();
const openCheckout = vi.fn();

const CartBadge: React.FC = () => {
  const { itemCount, cart } = useCart();
  return (
    <div>
      <span data-testid="cart-count">{itemCount}</span>
      <span data-testid="cart-subtotal">{cart ? cart.itemsSubtotal : 'none'}</span>
    </div>
  );
};

const Harness: React.FC<{ tepache?: boolean }> = ({ tepache }) => {
  const auth = h.auth;
  const cart = useCart();
  const { add, buyNow } = useStorefrontActions({
    isCustomerSession: auth.isAuthenticated,
    requireCustomerAuth,
    addItem: cart.addItem,
    openCheckout
  });
  return tepache ? <TepacheDrinksSection onAddToCart={add} onQuickBuy={buyNow} /> : <PackagedFoodsSection onAddToCart={add} onQuickBuy={buyNow} />;
};

function renderStorefront(opts: { tepache?: boolean } = {}) {
  return render(
    <CartProvider>
      <CartBadge />
      <Harness tepache={opts.tepache} />
    </CartProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.isAuthenticated = true;
  h.auth.user = { id: 'user-1', roles: ['CUSTOMER'] };
  getCart.mockResolvedValue(serverCart([]));
});

describe('storefront — server products', () => {
  it('loads and renders products from the server API', async () => {
    getProducts.mockResolvedValueOnce([product(), product({ id: 'prod-2', name: 'Server Oat Bar', slug: 'oat', variants: [variant({ id: 'var-2', productId: 'prod-2', price: '89.00' })] })]);
    renderStorefront();

    expect(await screen.findByText('Server Almond Granola')).toBeInTheDocument();
    expect(screen.getByText('Server Oat Bar')).toBeInTheDocument();
    expect(screen.getByTestId('product-price-prod-1')).toHaveTextContent('₹199');
    expect(getProducts).toHaveBeenCalledTimes(1);
    // none of the old mock FMCG catalog leaks into the UI
    expect(screen.queryByText(FMCG_PACKAGED_PRODUCTS[0].name)).not.toBeInTheDocument();
  });

  it('shows a loading state while the catalog request is pending', async () => {
    let resolve!: (v: ReturnType<typeof product>[]) => void;
    getProducts.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    renderStorefront();

    expect(screen.getByRole('status')).toHaveTextContent('Loading products');
    resolve([product()]);
    expect(await screen.findByText('Server Almond Granola')).toBeInTheDocument();
  });

  it('shows an error state with retry when the product API fails — and never falls back to mock products', async () => {
    getProducts.mockRejectedValueOnce(new Error('Server unreachable'));
    renderStorefront();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('We could not load products');
    expect(alert).toHaveTextContent('Server unreachable');
    expect(screen.queryByText(FMCG_PACKAGED_PRODUCTS[0].name)).not.toBeInTheDocument();
    expect(screen.queryByText(TEPACHE_PRODUCTS[0].name)).not.toBeInTheDocument();

    getProducts.mockResolvedValueOnce([product()]);
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('Server Almond Granola')).toBeInTheDocument();
    expect(getProducts).toHaveBeenCalledTimes(2);
  });

  it('shows an empty state when the catalog has no products', async () => {
    getProducts.mockResolvedValueOnce([]);
    renderStorefront();
    expect(await screen.findByText(/no packaged products are available/i)).toBeInTheDocument();
  });
});

describe('storefront — add to cart uses the server cart', () => {
  it('authenticated Add calls the backend with the correct productId and default variantId, and syncs the UI to the server response', async () => {
    getProducts.mockResolvedValueOnce([product()]);
    addItem.mockResolvedValueOnce(serverCart([cartItem({ quantity: 1 })]));
    renderStorefront();

    await userEvent.click(await screen.findByRole('button', { name: 'Add Server Almond Granola to cart' }));

    await waitFor(() => expect(addItem).toHaveBeenCalledWith('prod-1', 'var-1', 1));
    await waitFor(() => expect(screen.getByTestId('cart-count')).toHaveTextContent('1'));
    expect(screen.getByTestId('cart-subtotal')).toHaveTextContent('199');
    expect(await screen.findByText('Added!')).toBeInTheDocument();
  });

  it('sends the variant the customer selected (not the default) to the backend', async () => {
    getProducts.mockResolvedValueOnce([
      product({
        variants: [
          variant({ id: 'var-small', name: 'Small', price: '99.00', isDefault: true }),
          variant({ id: 'var-large', name: 'Large', price: '149.00', isDefault: false })
        ]
      })
    ]);
    addItem.mockResolvedValueOnce(serverCart([cartItem({ variantId: 'var-large' })]));
    renderStorefront();

    await userEvent.selectOptions(await screen.findByLabelText('Variant for Server Almond Granola'), 'var-large');
    expect(screen.getByTestId('product-price-prod-1')).toHaveTextContent('₹149');
    await userEvent.click(screen.getByRole('button', { name: 'Add Server Almond Granola to cart' }));

    await waitFor(() => expect(addItem).toHaveBeenCalledWith('prod-1', 'var-large', 1));
  });

  it('a rejected add shows the server error and does not change the cart', async () => {
    getProducts.mockResolvedValueOnce([product()]);
    addItem.mockRejectedValueOnce(new Error('Product is no longer available'));
    renderStorefront();

    await userEvent.click(await screen.findByRole('button', { name: 'Add Server Almond Granola to cart' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Product is no longer available');
    expect(screen.getByTestId('cart-count')).toHaveTextContent('0');
    expect(screen.queryByText('Added!')).not.toBeInTheDocument();
  });

  it('an unauthenticated visitor can browse, but Add prompts customer login and never touches the cart API', async () => {
    h.auth.isAuthenticated = false;
    h.auth.user = null;
    getProducts.mockResolvedValueOnce([product()]);
    renderStorefront();

    await userEvent.click(await screen.findByRole('button', { name: 'Add Server Almond Granola to cart' }));

    expect(requireCustomerAuth).toHaveBeenCalledTimes(1);
    expect(addItem).not.toHaveBeenCalled();
    expect(getCart).not.toHaveBeenCalled();
    expect(screen.getByTestId('cart-count')).toHaveTextContent('0');
  });

  it('after login, the deferred purchase action adds to the SERVER cart', async () => {
    h.auth.isAuthenticated = false;
    h.auth.user = null;
    getProducts.mockResolvedValueOnce([product()]);
    addItem.mockResolvedValueOnce(serverCart([cartItem()]));
    requireCustomerAuth.mockImplementation((action: () => void) => action()); // simulate: login succeeded, pending action runs
    renderStorefront();

    await userEvent.click(await screen.findByRole('button', { name: 'Add Server Almond Granola to cart' }));
    await waitFor(() => expect(addItem).toHaveBeenCalledWith('prod-1', 'var-1', 1));
    requireCustomerAuth.mockReset();
  });

  it('Buy opens checkout only after the server accepted the item', async () => {
    getProducts.mockResolvedValue([product()]);
    addItem.mockResolvedValueOnce(serverCart([cartItem()]));
    renderStorefront();

    await userEvent.click(await screen.findByRole('button', { name: 'Buy Server Almond Granola now' }));
    await waitFor(() => expect(openCheckout).toHaveBeenCalledTimes(1));

    addItem.mockRejectedValueOnce(new Error('nope'));
    await userEvent.click(screen.getByRole('button', { name: 'Buy Server Almond Granola now' }));
    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(2));
    expect(openCheckout).toHaveBeenCalledTimes(1);
  });
});

describe('storefront — Tepache container deposit comes from the server', () => {
  it('renders the deposit the server returns and does not hard-code ₹10', async () => {
    getProducts.mockResolvedValueOnce([
      product({
        id: 'tep-1',
        name: 'Server Tepache',
        slug: 'server-tepache',
        isFMCG: false,
        isTepache: true,
        containerDeposit: '15.00',
        variants: [variant({ id: 'tv-1', productId: 'tep-1', name: '500ml Glass Bottle', price: '120.00', containerDeposit: '15.00' })]
      })
    ]);
    renderStorefront({ tepache: true });

    expect(await screen.findByText('Server Tepache')).toBeInTheDocument();
    expect(screen.getByText(/\+ ₹15 container deposit/)).toBeInTheDocument();
    expect(screen.queryByText(/₹10\b/)).not.toBeInTheDocument();
    expect(getProducts).toHaveBeenCalledWith(undefined, undefined, true);
  });

  it('shows no deposit text when the server defines no deposit', async () => {
    getProducts.mockResolvedValueOnce([
      product({ id: 'tep-2', name: 'No Deposit Tepache', isFMCG: false, isTepache: true, containerDeposit: '0.00', variants: [variant({ containerDeposit: null })] })
    ]);
    renderStorefront({ tepache: true });
    expect(await screen.findByText('No Deposit Tepache')).toBeInTheDocument();
    expect(screen.queryByText(/container deposit/)).not.toBeInTheDocument();
  });
});
