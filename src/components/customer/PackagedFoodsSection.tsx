import React, { useMemo, useState } from 'react';
import { Boxes, Clock, ShieldCheck, Award } from 'lucide-react';
import { useProducts } from '../../hooks/useProducts';
import { useCart } from '../../context/CartContext';
import type { ApiProduct } from '../../services/commerceTypes';
import {
  AddToCartHandler,
  ProductGridState,
  StorefrontProductCard,
  StorefrontProductDetail
} from './StorefrontProduct';

interface PackagedFoodsSectionProps {
  onAddToCart: AddToCartHandler;
  onQuickBuy: AddToCartHandler;
}

/**
 * Packaged foods storefront. Products come ONLY from the server catalog (GET /products); Tepache has its own section.
 * Category tabs are derived from the categories of the products the server returns.
 */
export const PackagedFoodsSection: React.FC<PackagedFoodsSectionProps> = ({ onAddToCart, onQuickBuy }) => {
  const { products, status, error, reload } = useProducts();
  const cart = useCart();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [detail, setDetail] = useState<ApiProduct | null>(null);

  const packaged = useMemo(() => products.filter((p) => !p.isTepache), [products]);

  const categories = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; order: number }>();
    for (const p of packaged) {
      if (!seen.has(p.category.id)) seen.set(p.category.id, { id: p.category.id, name: p.category.name, order: p.category.displayOrder });
    }
    return Array.from(seen.values()).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }, [packaged]);

  const visible = useMemo(
    () => (selectedCategory === 'all' ? packaged : packaged.filter((p) => p.categoryId === selectedCategory)),
    [packaged, selectedCategory]
  );

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 text-white" aria-label="Packaged foods">
      <div className="bg-gradient-to-br from-amber-950/40 via-stone-900/90 to-stone-950 border border-amber-500/30 rounded-3xl p-6 sm:p-8 backdrop-blur-md relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-3 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-black uppercase tracking-wider">
            <Boxes className="w-3.5 h-3.5" />
            NutriFit Nutrition Bakery & FMCG
          </div>
          <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">Packaged Nutrition & Ready-to-Eat Bowls</h2>
          <p className="text-xs sm:text-sm text-stone-300 leading-relaxed">
            Browse our live catalog. Sign in as a customer to add items to your cart and check out.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-amber-200">
            <span className="flex items-center gap-1 bg-stone-900/80 px-2.5 py-1 rounded-full border border-amber-500/30">
              <ShieldCheck className="w-3 h-3 text-amber-400" />
              Prices set by the server
            </span>
            <span className="flex items-center gap-1 bg-stone-900/80 px-2.5 py-1 rounded-full border border-amber-500/30">
              <Clock className="w-3 h-3 text-amber-400" />
              Live catalog
            </span>
            <span className="flex items-center gap-1 bg-stone-900/80 px-2.5 py-1 rounded-full border border-amber-500/30">
              <Award className="w-3 h-3 text-amber-400" />
              Taxes & fees shown at checkout
            </span>
          </div>
        </div>
      </div>

      {cart.mutationError && (
        <div role="alert" className="flex items-center justify-between gap-3 bg-red-950/60 border border-red-500/40 text-red-200 text-xs rounded-2xl px-4 py-3">
          <span>{cart.mutationError}</span>
          <button type="button" onClick={cart.dismissMutationError} className="font-bold underline">
            Dismiss
          </button>
        </div>
      )}

      <ProductGridState
        status={status}
        error={error}
        isEmpty={packaged.length === 0}
        onRetry={reload}
        emptyMessage="No packaged products are available right now."
      >
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {[{ id: 'all', name: 'All Products' }, ...categories].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedCategory(tab.id)}
              className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all border ${
                selectedCategory === tab.id
                  ? 'bg-amber-500 text-stone-950 border-amber-400 shadow-md scale-105'
                  : 'bg-stone-900/80 text-stone-300 border-stone-800 hover:border-amber-500/40 hover:text-white'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {visible.map((product) => (
            <StorefrontProductCard
              key={product.id}
              product={product}
              theme="amber"
              onAddToCart={onAddToCart}
              onBuyNow={onQuickBuy}
              onShowDetails={setDetail}
            />
          ))}
        </div>
      </ProductGridState>

      {detail && (
        <StorefrontProductDetail product={detail} theme="amber" onClose={() => setDetail(null)} onAddToCart={onAddToCart} onBuyNow={onQuickBuy} />
      )}
    </section>
  );
};
