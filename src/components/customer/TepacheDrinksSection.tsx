import React, { useState } from 'react';
import { Sparkles, Store, RotateCcw } from 'lucide-react';
import { useProducts } from '../../hooks/useProducts';
import type { ApiProduct } from '../../services/commerceTypes';
import {
  AddToCartHandler,
  ProductGridState,
  StorefrontProductCard,
  StorefrontProductDetail
} from './StorefrontProduct';

interface TepacheDrinksSectionProps {
  onAddToCart: AddToCartHandler;
  onQuickBuy: AddToCartHandler;
}

/**
 * Tepache storefront. Products come ONLY from the server catalog (GET /products?isTepache=true).
 * Container-deposit amounts are whatever the server returns for each product/variant - never hard-coded here.
 */
export const TepacheDrinksSection: React.FC<TepacheDrinksSectionProps> = ({ onAddToCart, onQuickBuy }) => {
  const { products, status, error, reload } = useProducts({ isTepache: true });
  const [detail, setDetail] = useState<ApiProduct | null>(null);

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 text-white" aria-label="Tepache drinks">
      <div className="bg-gradient-to-br from-emerald-950/70 via-stone-900/90 to-teal-950/70 border-2 border-emerald-500/40 rounded-3xl p-6 sm:p-8 backdrop-blur-md relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-4 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-black uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            Gut-Friendly Fermentation Brewery
          </div>
          <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">Wild Fermented Tepache</h2>
          <p className="text-xs sm:text-sm text-stone-200 leading-relaxed">
            Small-batch fermented pineapple drinks in glass bottles. Container deposits, where they apply, are shown on each product and in your checkout total.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2 text-[11px] text-stone-300">
            <span className="flex items-center gap-1 bg-stone-900/90 px-3 py-1.5 rounded-full border border-emerald-500/40 text-emerald-300">
              <Store className="w-3.5 h-3.5" />
              Live catalog
            </span>
            <span className="flex items-center gap-1 bg-stone-900/90 px-3 py-1.5 rounded-full border border-amber-500/40 text-amber-300">
              <RotateCcw className="w-3.5 h-3.5" />
              Container deposit shown at checkout
            </span>
          </div>
        </div>
      </div>

      <ProductGridState
        status={status}
        error={error}
        isEmpty={products.length === 0}
        onRetry={reload}
        emptyMessage="No Tepache products are available right now."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {products.map((product) => (
            <StorefrontProductCard
              key={product.id}
              product={product}
              theme="emerald"
              onAddToCart={onAddToCart}
              onBuyNow={onQuickBuy}
              onShowDetails={setDetail}
            />
          ))}
        </div>
      </ProductGridState>

      {detail && (
        <StorefrontProductDetail product={detail} theme="emerald" onClose={() => setDetail(null)} onAddToCart={onAddToCart} onBuyNow={onQuickBuy} />
      )}
    </section>
  );
};
