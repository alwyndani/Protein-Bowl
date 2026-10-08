import React, { useState } from 'react';
import { Check, Info, Loader2, Plus, ShoppingBag, AlertCircle, RefreshCw, PackageOpen } from 'lucide-react';
import type { ApiProduct, ApiProductVariant } from '../../services/commerceTypes';
import { formatInr, moneyToNumber } from '../../utils/money';

export type StorefrontTheme = 'amber' | 'emerald';

/** Handler contract: resolves true when the server cart accepted the item. Resolves false when login is required or the call failed. */
export type AddToCartHandler = (productId: string, variantId: string | null, quantity?: number) => Promise<boolean>;

const THEMES: Record<StorefrontTheme, { border: string; title: string; chip: string; addBtn: string; buyBtn: string; accent: string }> = {
  amber: {
    border: 'hover:border-amber-500/50',
    title: 'group-hover:text-amber-300',
    chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    addBtn: 'bg-stone-800 hover:bg-stone-700 text-amber-300 border-stone-700 hover:border-amber-500/40',
    buyBtn: 'bg-amber-500 hover:bg-amber-400 text-stone-950',
    accent: 'text-amber-300'
  },
  emerald: {
    border: 'hover:border-emerald-500/50',
    title: 'group-hover:text-emerald-300',
    chip: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    addBtn: 'bg-stone-800 hover:bg-stone-700 text-emerald-300 border-stone-700 hover:border-emerald-500/40',
    buyBtn: 'bg-emerald-500 hover:bg-emerald-400 text-stone-950',
    accent: 'text-emerald-300'
  }
};

/** Default purchasable variant: the flagged default, otherwise the first active variant. */
export function pickDefaultVariant(product: ApiProduct): ApiProductVariant | null {
  const active = product.variants.filter((v) => v.isActive);
  return active.find((v) => v.isDefault) || active[0] || null;
}

/** Display price of the selected variant (or the product base price when it has no variants). */
export function displayPrice(product: ApiProduct, variant: ApiProductVariant | null) {
  return variant ? variant.price : product.basePrice;
}

/** Container deposit applying to the selected variant, as defined by the server (variant overrides product). */
export function displayDeposit(product: ApiProduct, variant: ApiProductVariant | null): number {
  const raw = variant && variant.containerDeposit !== null && variant.containerDeposit !== undefined ? variant.containerDeposit : product.containerDeposit;
  return moneyToNumber(raw);
}

export const ProductGridState: React.FC<{
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  isEmpty: boolean;
  onRetry: () => void;
  emptyMessage: string;
  children: React.ReactNode;
}> = ({ status, error, isEmpty, onRetry, emptyMessage, children }) => {
  if (status === 'loading') {
    return (
      <div role="status" className="flex items-center justify-center gap-3 py-16 text-stone-300 text-sm">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Loading products…</span>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <p className="text-sm text-stone-200">We could not load products right now.</p>
        {error && <p className="text-xs text-stone-500">{error}</p>}
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-xs font-bold text-white"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Try again
        </button>
      </div>
    );
  }
  if (isEmpty) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center text-stone-400">
        <PackageOpen className="w-8 h-8" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }
  return <>{children}</>;
};

interface ProductCardProps {
  product: ApiProduct;
  theme: StorefrontTheme;
  onAddToCart: AddToCartHandler;
  onBuyNow: AddToCartHandler;
  onShowDetails: (product: ApiProduct) => void;
}

export const StorefrontProductCard: React.FC<ProductCardProps> = ({ product, theme, onAddToCart, onBuyNow, onShowDetails }) => {
  const t = THEMES[theme];
  const variants = product.variants.filter((v) => v.isActive);
  const [variantId, setVariantId] = useState<string | null>(() => pickDefaultVariant(product)?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);

  const selected = variants.find((v) => v.id === variantId) || null;
  const deposit = displayDeposit(product, selected);

  const handleAdd = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await onAddToCart(product.id, variantId, 1);
    setBusy(false);
    if (ok) {
      setAdded(true);
      setTimeout(() => setAdded(false), 1400);
    }
  };

  const handleBuy = async () => {
    if (busy) return;
    setBusy(true);
    await onBuyNow(product.id, variantId, 1);
    setBusy(false);
  };

  return (
    <div
      data-testid={`product-card-${product.id}`}
      className={`bg-stone-900/90 border border-stone-800 ${t.border} rounded-3xl p-5 flex flex-col justify-between transition-all group`}
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${t.chip}`}>{product.category.name}</span>
          {selected && (
            <span className="text-[11px] font-bold text-stone-400 px-2 py-0.5 rounded-md bg-stone-950 border border-stone-800 shrink-0">{selected.name}</span>
          )}
        </div>

        {product.image && <img src={product.image} alt={product.name} className="w-full h-36 object-cover rounded-2xl border border-stone-800" />}

        <div>
          <h3 className={`text-base font-black text-white ${t.title} transition-colors leading-snug`}>{product.name}</h3>
          <p className="text-xs text-stone-400 mt-1.5 line-clamp-2 leading-relaxed">{product.description}</p>
        </div>

        {variants.length > 1 && (
          <label className="block text-[11px] text-stone-400">
            <span className="block mb-1 font-bold uppercase tracking-wider">Variant</span>
            <select
              aria-label={`Variant for ${product.name}`}
              value={variantId ?? ''}
              onChange={(e) => setVariantId(e.target.value)}
              className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-xs text-white"
            >
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} — {formatInr(v.price)}
                </option>
              ))}
            </select>
          </label>
        )}

        {selected && (selected.calories !== null || selected.protein !== null || selected.carbs !== null || selected.fat !== null) && (
          <div className="bg-stone-950/80 border border-stone-800/80 rounded-2xl p-3 grid grid-cols-4 gap-2 text-center">
            <div>
              <div className="text-[10px] text-stone-500 uppercase font-bold">kcal</div>
              <div className="text-xs font-black text-white">{selected.calories ?? '—'}</div>
            </div>
            <div>
              <div className="text-[10px] text-stone-500 uppercase font-bold">Protein</div>
              <div className="text-xs font-black text-emerald-400">{selected.protein ?? '—'}{selected.protein !== null && 'g'}</div>
            </div>
            <div>
              <div className="text-[10px] text-stone-500 uppercase font-bold">Carbs</div>
              <div className="text-xs font-black text-amber-400">{selected.carbs ?? '—'}{selected.carbs !== null && 'g'}</div>
            </div>
            <div>
              <div className="text-[10px] text-stone-500 uppercase font-bold">Fat</div>
              <div className="text-xs font-black text-blue-400">{selected.fat ?? '—'}{selected.fat !== null && 'g'}</div>
            </div>
          </div>
        )}
      </div>

      <div className="pt-4 mt-4 border-t border-stone-800 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] text-stone-400 uppercase">Price</div>
          <div className="text-lg font-black text-white" data-testid={`product-price-${product.id}`}>
            {formatInr(displayPrice(product, selected))}
          </div>
          {deposit > 0 && <div className="text-[10px] text-amber-400">+ {formatInr(deposit)} container deposit</div>}
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => onShowDetails(product)}
            className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white transition-colors border border-stone-700"
            title="View details"
            aria-label={`Details for ${product.name}`}
          >
            <Info className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleAdd}
            aria-label={`Add ${product.name} to cart`}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-1 disabled:opacity-60 ${
              added ? 'bg-emerald-500 text-stone-950 border-emerald-400 font-black' : t.addBtn
            }`}
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : added ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            <span>{added ? 'Added!' : 'Add'}</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleBuy}
            aria-label={`Buy ${product.name} now`}
            className={`${t.buyBtn} font-black px-3.5 py-2 rounded-xl text-xs transition-all shadow-md flex items-center gap-1 disabled:opacity-60`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Buy</span>
          </button>
        </div>
      </div>
    </div>
  );
};

/** Product detail modal built only from fields the server actually provides. */
export const StorefrontProductDetail: React.FC<{
  product: ApiProduct;
  theme: StorefrontTheme;
  onClose: () => void;
  onAddToCart: AddToCartHandler;
  onBuyNow: AddToCartHandler;
}> = ({ product, theme, onClose, onAddToCart, onBuyNow }) => {
  const t = THEMES[theme];
  const variants = product.variants.filter((v) => v.isActive);

  return (
    <div role="dialog" aria-label={`${product.name} details`} className="fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-stone-900 border border-stone-700 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative">
        <button onClick={onClose} aria-label="Close details" className="absolute top-5 right-5 text-stone-400 hover:text-white bg-stone-800 p-2 rounded-full">
          ✕
        </button>
        <div>
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider mb-2 ${t.chip}`}>
            {product.category.name}
          </div>
          <h3 className="text-xl font-black text-white">{product.name}</h3>
          <p className="text-xs text-stone-300 mt-1">{product.description}</p>
        </div>

        {variants.length > 0 ? (
          <div className="bg-stone-950 rounded-2xl p-4 border border-stone-800 space-y-2 text-xs">
            <div className={`font-bold uppercase tracking-wider text-[11px] ${t.accent}`}>Available options</div>
            {variants.map((v) => {
              const dep = displayDeposit(product, v);
              return (
                <div key={v.id} className="flex justify-between py-1 border-b border-stone-900 text-stone-300">
                  <span>{v.name}</span>
                  <span className="font-bold text-white">
                    {formatInr(v.price)}
                    {dep > 0 && <span className="text-amber-400 font-normal"> + {formatInr(dep)} deposit</span>}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-stone-300">Price: {formatInr(product.basePrice)}</div>
        )}

        <div className="pt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={async () => {
              const v = pickDefaultVariant(product);
              if (await onAddToCart(product.id, v?.id ?? null, 1)) onClose();
            }}
            className={`flex-1 border font-bold py-3 rounded-2xl text-xs transition-all flex items-center justify-center gap-2 ${t.addBtn}`}
          >
            <Plus className="w-4 h-4" />
            <span>Add to Cart</span>
          </button>
          <button
            type="button"
            onClick={async () => {
              const v = pickDefaultVariant(product);
              await onBuyNow(product.id, v?.id ?? null, 1);
              onClose();
            }}
            className={`flex-1 ${t.buyBtn} font-black py-3 rounded-2xl text-xs transition-all shadow-lg flex items-center justify-center gap-2`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Buy Now</span>
          </button>
        </div>
      </div>
    </div>
  );
};
