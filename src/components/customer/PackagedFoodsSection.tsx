import React, { useState, useMemo } from 'react';
import { 
  Boxes, 
  Sparkles, 
  ShoppingBag, 
  Clock, 
  ShieldCheck, 
  Flame, 
  Heart, 
  Check, 
  ChevronRight, 
  Filter, 
  Info,
  Award,
  Plus
} from 'lucide-react';
import { FMCG_PACKAGED_PRODUCTS } from '../../data/mockBakeryFMCGData';
import { PackagedProductItem, DirectCartItem } from '../../types';

interface PackagedFoodsSectionProps {
  onAddToCart: (item: DirectCartItem) => void;
  onQuickBuy?: (item: DirectCartItem) => void;
}

const CATEGORY_TABS = [
  { id: 'all', label: 'All Packaged Foods' },
  { id: 'artisan_breads', label: '🍞 Artisan Breads & Sourdough' },
  { id: 'granola_pouches', label: '🥣 Granola Pouches (Slow Baked)' },
  { id: 'granola_bars', label: '🍫 Granola Bars' },
  { id: 'protein_bars', label: '⚡ 20g Whey & Plant Protein Bars' },
  { id: 'healthy_cookies', label: '🍪 Guilt-Free Cookies' },
  { id: 'healthy_muffins', label: '🧁 Protein Muffins' },
];

export const PackagedFoodsSection: React.FC<PackagedFoodsSectionProps> = ({ 
  onAddToCart,
  onQuickBuy 
}) => {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [activeProductDetail, setActiveProductDetail] = useState<PackagedProductItem | null>(null);
  const [addedItemIds, setAddedItemIds] = useState<Record<string, boolean>>({});

  const filteredProducts = useMemo(() => {
    if (selectedCategory === 'all') return FMCG_PACKAGED_PRODUCTS;
    return FMCG_PACKAGED_PRODUCTS.filter(p => p.category === selectedCategory);
  }, [selectedCategory]);

  const handleAddItemToCart = (product: PackagedProductItem) => {
    const item: DirectCartItem = {
      id: product.id,
      name: product.name,
      sku: product.sku,
      category: product.category,
      price: product.mrp,
      quantity: 1,
      weightOrVolume: product.netWeight,
      storageType: product.storageCondition
    };
    onAddToCart(item);
    setAddedItemIds(prev => ({ ...prev, [product.id]: true }));
    setTimeout(() => {
      setAddedItemIds(prev => ({ ...prev, [product.id]: false }));
    }, 1400);
  };

  const handleDirectBuy = (product: PackagedProductItem) => {
    const item: DirectCartItem = {
      id: product.id,
      name: product.name,
      sku: product.sku,
      category: product.category,
      price: product.mrp,
      quantity: 1,
      weightOrVolume: product.netWeight,
      storageType: product.storageCondition
    };
    if (onQuickBuy) {
      onQuickBuy(item);
    } else {
      onAddToCart(item);
    }
  };

  const handleOrderBreakfastBundle = () => {
    const bundleProducts = [
      FMCG_PACKAGED_PRODUCTS.find(p => p.category === 'artisan_breads') || FMCG_PACKAGED_PRODUCTS[0],
      FMCG_PACKAGED_PRODUCTS.find(p => p.category === 'granola_pouches') || FMCG_PACKAGED_PRODUCTS[1],
      FMCG_PACKAGED_PRODUCTS.find(p => p.category === 'granola_bars') || FMCG_PACKAGED_PRODUCTS[2]
    ];

    bundleProducts.forEach(p => {
      onAddToCart({
        id: p.id,
        name: p.name,
        sku: p.sku,
        category: p.category,
        price: p.mrp,
        quantity: 1,
        weightOrVolume: p.netWeight,
        storageType: p.storageCondition
      });
    });

    if (onQuickBuy) {
      const first = bundleProducts[0];
      onQuickBuy({
        id: first.id,
        name: first.name,
        sku: first.sku,
        category: first.category,
        price: first.mrp,
        quantity: 1,
        weightOrVolume: first.netWeight,
        storageType: first.storageCondition
      });
    }
  };

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 text-white">
      
      {/* Section Header */}
      <div className="bg-gradient-to-br from-amber-950/40 via-stone-900/90 to-stone-950 border border-amber-500/30 rounded-3xl p-6 sm:p-8 backdrop-blur-md relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-black uppercase tracking-wider">
              <Boxes className="w-3.5 h-3.5" />
              NutriFit Nutrition Bakery & FMCG
            </div>
            
            <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              Packaged Nutrition: Artisan Sourdough, Slow-Baked Granola & Protein Bars
            </h2>
            
            <p className="text-xs sm:text-sm text-stone-300 leading-relaxed">
              Crafted in small batches with zero refined flour, zero artificial preservatives, and certified organic grains. Baked fresh daily in our centralized bakery and delivered directly to your doorstep or available at our retail counters.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-amber-200">
              <span className="flex items-center gap-1 bg-stone-900/80 px-2.5 py-1 rounded-full border border-amber-500/30">
                <ShieldCheck className="w-3 h-3 text-amber-400" />
                100% Zero Chemical Preservatives
              </span>
              <span className="flex items-center gap-1 bg-stone-900/80 px-2.5 py-1 rounded-full border border-amber-500/30">
                <Clock className="w-3 h-3 text-amber-400" />
                Baked Fresh Daily
              </span>
              <span className="flex items-center gap-1 bg-stone-900/80 px-2.5 py-1 rounded-full border border-amber-500/30">
                <Award className="w-3 h-3 text-amber-400" />
                FSSAI Licensed & Lab Tested
              </span>
            </div>
          </div>

          <div className="shrink-0 flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleOrderBreakfastBundle}
              className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-black px-6 py-3.5 rounded-2xl text-xs sm:text-sm transition-all shadow-xl flex items-center justify-center gap-2 hover:scale-105"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Order Artisan Breakfast Trio (Direct)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSelectedCategory(tab.id)}
            className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all border ${
              selectedCategory === tab.id
                ? 'bg-amber-500 text-stone-950 border-amber-400 shadow-md scale-105'
                : 'bg-stone-900/80 text-stone-300 border-stone-800 hover:border-amber-500/40 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredProducts.map((prod) => (
          <div
            key={prod.id}
            className="bg-stone-900/90 border border-stone-800 hover:border-amber-500/50 rounded-3xl p-5 flex flex-col justify-between transition-all group hover:scale-[1.01] hover:shadow-2xl relative"
          >
            {/* Header Tags */}
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {prod.dietaryTags.map((tag, i) => (
                    <span
                      key={i}
                      className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <span className="text-[11px] font-bold text-stone-400 px-2 py-0.5 rounded-md bg-stone-950 border border-stone-800 shrink-0">
                  {prod.netWeight}
                </span>
              </div>

              {/* Title & Description */}
              <div>
                <h3 className="text-base font-black text-white group-hover:text-amber-300 transition-colors leading-snug">
                  {prod.name}
                </h3>
                <p className="text-xs text-stone-400 mt-1.5 line-clamp-2 leading-relaxed">
                  {prod.description}
                </p>
              </div>

              {/* Macro Nutrition Badges */}
              <div className="bg-stone-950/80 border border-stone-800/80 rounded-2xl p-3 grid grid-cols-4 gap-2 text-center">
                <div>
                  <div className="text-[10px] text-stone-500 uppercase font-bold">Protein</div>
                  <div className="text-xs font-black text-emerald-400">{prod.nutritionPer100g.protein}g</div>
                </div>
                <div>
                  <div className="text-[10px] text-stone-500 uppercase font-bold">Carbs</div>
                  <div className="text-xs font-black text-amber-400">{prod.nutritionPer100g.carbs}g</div>
                </div>
                <div>
                  <div className="text-[10px] text-stone-500 uppercase font-bold">Fats</div>
                  <div className="text-xs font-black text-blue-400">{prod.nutritionPer100g.fat}g</div>
                </div>
                <div>
                  <div className="text-[10px] text-stone-500 uppercase font-bold">Fiber</div>
                  <div className="text-xs font-black text-purple-400">{prod.nutritionPer100g.fiber}g</div>
                </div>
              </div>

              {/* Ingredients Snippet */}
              <div className="text-[11px] text-stone-400">
                <strong className="text-stone-300">Key Ingredients: </strong>
                {prod.keyIngredients.slice(0, 4).join(', ')}
              </div>
            </div>

            {/* Price & Action */}
            <div className="pt-4 mt-4 border-t border-stone-800 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] text-stone-400 uppercase">Direct Price</div>
                <div className="text-lg font-black text-white">
                  ₹{prod.mrp}
                  <span className="text-[10px] text-stone-500 font-normal ml-1">/ {prod.netWeight}</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => setActiveProductDetail(prod)}
                  className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white transition-colors border border-stone-700"
                  title="View Full Nutritional Specs"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>

                {/* Add to Cart button */}
                <button
                  type="button"
                  onClick={() => handleAddItemToCart(prod)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-1 ${
                    addedItemIds[prod.id]
                      ? 'bg-emerald-500 text-stone-950 border-emerald-400 font-black'
                      : 'bg-stone-800 hover:bg-stone-700 text-amber-300 border-stone-700 hover:border-amber-500/40'
                  }`}
                >
                  {addedItemIds[prod.id] ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Added!</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </>
                  )}
                </button>

                {/* Direct Buy */}
                <button
                  type="button"
                  onClick={() => handleDirectBuy(prod)}
                  className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-black px-3.5 py-2 rounded-xl text-xs transition-all shadow-md flex items-center gap-1 hover:scale-105"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Buy</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* PRODUCT SPEC DETAIL MODAL */}
      {activeProductDetail && (
        <div className="fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-700 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setActiveProductDetail(null)}
              className="absolute top-5 right-5 text-stone-400 hover:text-white bg-stone-800 p-2 rounded-full"
            >
              ✕
            </button>

            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-black uppercase tracking-wider mb-1">
                {activeProductDetail.category.replace(/_/g, ' ')}
              </div>
              <h3 className="text-xl font-black text-white">{activeProductDetail.name}</h3>
              <p className="text-xs text-stone-300 mt-1">{activeProductDetail.description}</p>
            </div>

            {/* Nutrition per 100g table */}
            <div className="bg-stone-950 rounded-2xl p-4 border border-stone-800 space-y-2 text-xs">
              <div className="font-bold text-amber-300 uppercase tracking-wider text-[11px]">
                Nutritional Profile (Per 100g / Serving: {activeProductDetail.servingSize})
              </div>
              <div className="grid grid-cols-2 gap-2 text-stone-300 pt-1">
                <div className="flex justify-between py-1 border-b border-stone-900">
                  <span>Energy / Calories:</span>
                  <span className="font-bold text-white">{activeProductDetail.nutritionPer100g.calories} kcal</span>
                </div>
                <div className="flex justify-between py-1 border-b border-stone-900">
                  <span>Dietary Protein:</span>
                  <span className="font-bold text-emerald-400">{activeProductDetail.nutritionPer100g.protein} g</span>
                </div>
                <div className="flex justify-between py-1 border-b border-stone-900">
                  <span>Total Carbohydrates:</span>
                  <span className="font-bold text-amber-400">{activeProductDetail.nutritionPer100g.carbs} g</span>
                </div>
                <div className="flex justify-between py-1 border-b border-stone-900">
                  <span>Dietary Fiber:</span>
                  <span className="font-bold text-purple-400">{activeProductDetail.nutritionPer100g.fiber} g</span>
                </div>
                <div className="flex justify-between py-1 border-b border-stone-900">
                  <span>Healthy Fats:</span>
                  <span className="font-bold text-blue-400">{activeProductDetail.nutritionPer100g.fat} g</span>
                </div>
                <div className="flex justify-between py-1 border-b border-stone-900">
                  <span>Added Sugar:</span>
                  <span className="font-bold text-white">{activeProductDetail.nutritionPer100g.sugarAdded} g</span>
                </div>
              </div>
            </div>

            {/* Ingredients & Allergens */}
            <div className="space-y-2 text-xs">
              <div>
                <strong className="text-white">All Ingredients: </strong>
                <span className="text-stone-300">{activeProductDetail.keyIngredients.join(', ')}</span>
              </div>
              <div>
                <strong className="text-red-400">Allergen Advice: </strong>
                <span className="text-stone-300">{activeProductDetail.allergenWarning}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-stone-400 pt-1">
                <span>Storage: {activeProductDetail.storageCondition}</span>
                <span>Shelf Life: {activeProductDetail.shelfLifeDays} Days</span>
              </div>
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  handleAddItemToCart(activeProductDetail);
                  setActiveProductDetail(null);
                }}
                className="flex-1 bg-stone-800 hover:bg-stone-700 text-amber-300 border border-stone-700 font-bold py-3 rounded-2xl text-xs transition-all flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add to Cart</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  handleDirectBuy(activeProductDetail);
                  setActiveProductDetail(null);
                }}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black py-3 rounded-2xl text-xs transition-all shadow-lg flex items-center justify-center gap-2"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Buy Now (₹{activeProductDetail.mrp})</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </section>
  );
};
