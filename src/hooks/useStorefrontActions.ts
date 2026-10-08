import { useCallback } from 'react';
import type { AddToCartHandler } from '../components/customer/StorefrontProduct';

interface StorefrontActionDeps {
  /** True when a customer session exists. */
  isCustomerSession: boolean;
  /** Prompts customer login for unauthenticated users and runs the action after a successful login. */
  requireCustomerAuth: (action: () => void) => void;
  /** Adds to the SERVER cart. Resolves true when the server accepted the change. */
  addItem: (productId: string, variantId?: string | null, quantity?: number) => Promise<boolean>;
  /** Called after a successful Buy Now so checkout can open. */
  openCheckout: () => void;
}

/**
 * Add-to-cart / Buy-now behaviour for the storefront.
 * - Authenticated customers: the item goes straight to the server cart.
 * - Unauthenticated visitors: they may browse, but purchasing requires Customer Login; no local/guest cart is kept.
 */
export function useStorefrontActions({ isCustomerSession, requireCustomerAuth, addItem, openCheckout }: StorefrontActionDeps) {
  const add: AddToCartHandler = useCallback(
    async (productId, variantId, quantity = 1) => {
      if (!isCustomerSession) {
        requireCustomerAuth(() => {
          void addItem(productId, variantId, quantity);
        });
        return false;
      }
      return addItem(productId, variantId, quantity);
    },
    [isCustomerSession, requireCustomerAuth, addItem]
  );

  const buyNow: AddToCartHandler = useCallback(
    async (productId, variantId, quantity = 1) => {
      if (!isCustomerSession) {
        requireCustomerAuth(() => {
          void addItem(productId, variantId, quantity).then((ok) => {
            if (ok) openCheckout();
          });
        });
        return false;
      }
      const ok = await addItem(productId, variantId, quantity);
      if (ok) openCheckout();
      return ok;
    },
    [isCustomerSession, requireCustomerAuth, addItem, openCheckout]
  );

  return { add, buyNow };
}
