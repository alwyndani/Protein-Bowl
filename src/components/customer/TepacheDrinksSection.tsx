import React, { useState } from 'react';
import { 
  Sparkles, 
  ShoppingBag, 
  ShieldCheck, 
  RotateCcw, 
  Store, 
  HeartHandshake, 
  Flame, 
  Check, 
  Info, 
  Award,
  ChevronRight,
  Droplets,
  Activity,
  Layers,
  Plus
} from 'lucide-react';
import { TEPACHE_PRODUCTS } from '../../data/mockTepacheData';
import { TepacheBottleProduct, DirectCartItem } from '../../types';

interface TepacheDrinksSectionProps {
  onAddToCart: (item: DirectCartItem) => void;
  onQuickBuy?: (item: DirectCartItem) => void;
}

export const TepacheDrinksSection: React.FC<TepacheDrinksSectionProps> = ({ 
  onAddToCart,
  onQuickBuy 
}) => {
  const [selectedTepache, setSelectedTepache] = useState<TepacheBottleProduct>(TEPACHE_PRODUCTS[0]);
  const [showDetailModal, setShowDetailModal] = useState<TepacheBottleProduct | null>(null);
  const [addedItemIds, setAddedItemIds] = useState<Record<string, boolean>>({});

  const handleAddItemToCart = (product: TepacheBottleProduct) => {
    const item: DirectCartItem = {
      id: product.id,
      name: product.name,
      sku: product.sku,
      category: 'Probiotic Tepache Drinks',
      price: product.mrp,
      quantity: 1,
      weightOrVolume: product.volumeSize,
      storageType: product.storageTemp,
      image: product.image,
      isTepacheBottle: true
    };
    onAddToCart(item);
    setAddedItemIds(prev => ({ ...prev, [product.id]: true }));
    setTimeout(() => {
      setAddedItemIds(prev => ({ ...prev, [product.id]: false }));
    }, 1400);
  };

  const handleDirectBuy = (product: TepacheBottleProduct) => {
    const item: DirectCartItem = {
      id: product.id,
      name: product.name,
      sku: product.sku,
      category: 'Probiotic Tepache Drinks',
      price: product.mrp,
      quantity: 1,
      weightOrVolume: product.volumeSize,
      storageType: product.storageTemp,
      image: product.image,
      isTepacheBottle: true
    };
    if (onQuickBuy) {
      onQuickBuy(item);
    } else {
      onAddToCart(item);
    }
  };

  const handleOrderFourPackBundle = () => {
    TEPACHE_PRODUCTS.forEach(prod => {
      onAddToCart({
        id: prod.id,
        name: prod.name,
        sku: prod.sku,
        category: 'Probiotic Tepache Drinks',
        price: prod.mrp,
        quantity: 1,
        weightOrVolume: prod.volumeSize,
        storageType: prod.storageTemp,
        image: prod.image,
        isTepacheBottle: true
      });
    });

    if (onQuickBuy) {
      const first = TEPACHE_PRODUCTS[0];
      onQuickBuy({
        id: first.id,
        name: first.name,
        sku: first.sku,
        category: 'Probiotic Tepache Drinks',
        price: first.mrp,
        quantity: 1,
        weightOrVolume: first.volumeSize,
        storageType: first.storageTemp,
        image: first.image,
        isTepacheBottle: true
      });
    }
  };

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 text-white">
      
      {/* Section Hero Banner */}
      <div className="bg-gradient-to-br from-emerald-950/70 via-stone-900/90 to-teal-950/70 border-2 border-emerald-500/40 rounded-3xl p-6 sm:p-8 backdrop-blur-md relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          
          <div className="space-y-4 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-black uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              Gut-Friendly Fermentation Brewery
            </div>

            <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              Wild Fermented Sparkling Tepache: Live Probiotic & Bromelain Gut Elixir
            </h2>

            <p className="text-xs sm:text-sm text-stone-200 leading-relaxed">
              Brewed from organic Queen Pineapple peels, raw palm jaggery (piloncillo), Ceylon cinnamon, and wild lactic acid cultures. Loaded with active digestive bromelain enzymes, billions of live probiotics, and crisp micro-carbonation for total gut rejuvenation.
            </p>

            {/* Scientific Gut Pillars */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              <div className="bg-stone-950/80 border border-emerald-500/30 rounded-2xl p-3 text-center">
                <div className="text-[10px] text-emerald-400 font-black uppercase">Live LAB Cultures</div>
                <div className="text-sm sm:text-base font-black text-white mt-0.5">3.5+ Billion</div>
                <div className="text-[9px] text-stone-400">CFU / Bottle</div>
              </div>

              <div className="bg-stone-950/80 border border-emerald-500/30 rounded-2xl p-3 text-center">
                <div className="text-[10px] text-teal-400 font-black uppercase">Enzyme Power</div>
                <div className="text-sm sm:text-base font-black text-white mt-0.5">Bromelain</div>
                <div className="text-[9px] text-stone-400">Breaks Down Protein</div>
              </div>

              <div className="bg-stone-950/80 border border-emerald-500/30 rounded-2xl p-3 text-center">
                <div className="text-[10px] text-amber-400 font-black uppercase">Low Calorie</div>
                <div className="text-sm sm:text-base font-black text-white mt-0.5">~32 kcal</div>
                <div className="text-[9px] text-stone-400">&lt; 3.5g Residual Sugar</div>
              </div>

              <div className="bg-stone-950/80 border border-emerald-500/30 rounded-2xl p-3 text-center">
                <div className="text-[10px] text-purple-400 font-black uppercase">Zero Alcohol</div>
                <div className="text-sm sm:text-base font-black text-white mt-0.5">&lt; 0.4% ABV</div>
                <div className="text-[9px] text-stone-400">100% Non-Alcoholic</div>
              </div>
            </div>

            {/* POS Outlets & Deposit Info */}
            <div className="flex flex-wrap items-center gap-3 pt-2 text-[11px] text-stone-300">
              <span className="flex items-center gap-1 bg-stone-900/90 px-3 py-1.5 rounded-full border border-emerald-500/40 text-emerald-300">
                <Store className="w-3.5 h-3.5" />
                Available at all NutriFit POS Outlets statewide
              </span>
              <span className="flex items-center gap-1 bg-stone-900/90 px-3 py-1.5 rounded-full border border-amber-500/40 text-amber-300">
                <RotateCcw className="w-3.5 h-3.5" />
                ₹10 Refundable Glass Bottle Deposit Scheme
              </span>
            </div>
          </div>

          {/* Right Action Box: Explorer 4-Pack */}
          <div className="bg-stone-950/90 border border-emerald-500/40 rounded-3xl p-5 sm:p-6 text-center space-y-4 shrink-0 lg:max-w-xs w-full shadow-2xl">
            <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase">
              <Sparkles className="w-3 h-3" />
              Best Seller Sampler
            </div>
            
            <div>
              <h4 className="text-lg font-black text-white">4-Flavor Gut Immunity Explorer Box</h4>
              <p className="text-xs text-stone-400 mt-1">1x of each signature flavor in UV-protective amber glass (330ml x 4)</p>
            </div>

            <div className="py-2 border-y border-stone-800">
              <div className="text-2xl font-black text-emerald-400">
                ₹595 <span className="text-xs text-stone-500 font-normal line-through">₹615</span>
              </div>
              <div className="text-[10px] text-amber-400 mt-0.5">+ ₹40 Refundable Bottle Deposit</div>
            </div>

            <button
              onClick={handleOrderFourPackBundle}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black py-3.5 rounded-2xl text-xs sm:text-sm transition-all shadow-xl flex items-center justify-center gap-2 hover:scale-105"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Order 4-Pack Direct (No Account)</span>
            </button>

            <span className="text-[10px] text-stone-500 block">
              Cold thermal dispatched with ice gel pack to ensure live probiotic CFU survival.
            </span>
          </div>

        </div>
      </div>

      {/* 4 Handcrafted Flavors Showcase Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {TEPACHE_PRODUCTS.map((tepache) => (
          <div
            key={tepache.id}
            className="bg-stone-900/90 border border-stone-800 hover:border-emerald-500/50 rounded-3xl p-5 flex flex-col justify-between transition-all group hover:scale-[1.02] hover:shadow-2xl relative overflow-hidden"
          >
            <div className="space-y-3">
              {/* Header Badges */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {tepache.volumeSize} Chilled Glass
                </span>
                <span className="text-[10px] font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-500/30">
                  pH {tepache.phRange.split(' ')[0]}
                </span>
              </div>

              {/* Title & Tagline */}
              <div>
                <h3 className="text-base font-black text-white group-hover:text-emerald-300 transition-colors leading-snug">
                  {tepache.name}
                </h3>
                <p className="text-xs text-stone-400 mt-1 font-medium italic">
                  "{tepache.tagline}"
                </p>
              </div>

              {/* Probiotic & Enzyme Highlights */}
              <div className="bg-stone-950/80 border border-stone-800 rounded-2xl p-3 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-stone-400">Live Probiotics:</span>
                  <span className="font-bold text-emerald-400">{tepache.probioticCfu.split(' ')[0]} {tepache.probioticCfu.split(' ')[1]}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-stone-400">Calories / Sugar:</span>
                  <span className="font-bold text-white">{tepache.caloriesPerServing} kcal / {tepache.sugarGramsPerServing}g</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-stone-400">Shelf Life:</span>
                  <span className="font-bold text-teal-400">{tepache.shelfLifeDays} Days Chilled</span>
                </div>
              </div>

              {/* Tasting Notes Tags */}
              <div className="flex flex-wrap gap-1">
                {tepache.tastingNotes.map((note, idx) => (
                  <span key={idx} className="text-[9px] px-2 py-0.5 rounded bg-stone-800 text-stone-300">
                    {note}
                  </span>
                ))}
              </div>
            </div>

            {/* Price & Direct Order Action */}
            <div className="pt-4 mt-4 border-t border-stone-800 flex items-center justify-between gap-2">
              <div>
                <div className="text-[10px] text-stone-400 uppercase">Single Bottle</div>
                <div className="text-lg font-black text-white">
                  ₹{tepache.mrp}
                  <span className="text-[10px] text-amber-400 font-normal ml-1">(+₹10 dep.)</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowDetailModal(tepache)}
                  className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white transition-colors border border-stone-700"
                  title="View Fermentation & Botanical Specs"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>

                {/* Add to Cart button */}
                <button
                  type="button"
                  onClick={() => handleAddItemToCart(tepache)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-1 ${
                    addedItemIds[tepache.id]
                      ? 'bg-emerald-500 text-stone-950 border-emerald-400 font-black'
                      : 'bg-stone-800 hover:bg-stone-700 text-emerald-300 border-stone-700 hover:border-emerald-500/40'
                  }`}
                >
                  {addedItemIds[tepache.id] ? (
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
                  onClick={() => handleDirectBuy(tepache)}
                  className="bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black px-3.5 py-2 rounded-xl text-xs transition-all shadow-md flex items-center gap-1 hover:scale-105"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Buy</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* DETAILED TEPACHE BOTANICAL & LAB SPEC MODAL */}
      {showDetailModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-emerald-500/40 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setShowDetailModal(null)}
              className="absolute top-5 right-5 text-stone-400 hover:text-white bg-stone-800 p-2 rounded-full"
            >
              ✕
            </button>

            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase tracking-wider mb-1">
                Wild Fermented Probiotic Elixir (330ml)
              </div>
              <h3 className="text-xl font-black text-white">{showDetailModal.name}</h3>
              <p className="text-xs text-stone-300 mt-1">{showDetailModal.description}</p>
            </div>

            {/* Fermentation & Lab Stats */}
            <div className="bg-stone-950 rounded-2xl p-4 border border-stone-800 space-y-2 text-xs">
              <div className="font-bold text-emerald-400 uppercase tracking-wider text-[11px]">
                Fermentation Lab Certificate & Live CFU Metrics
              </div>
              <div className="grid grid-cols-2 gap-2 text-stone-300 pt-1">
                <div className="flex justify-between py-1 border-b border-stone-900">
                  <span>Probiotic Density:</span>
                  <span className="font-bold text-emerald-400">{showDetailModal.probioticCfu}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-stone-900">
                  <span>Enzymatic Action:</span>
                  <span className="font-bold text-teal-300">{showDetailModal.bromelainActivity}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-stone-900">
                  <span>Acidity (pH Level):</span>
                  <span className="font-bold text-amber-400">{showDetailModal.phRange}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-stone-900">
                  <span>Alcohol Content:</span>
                  <span className="font-bold text-white">{showDetailModal.alcoholByVolume}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-stone-900">
                  <span>Storage Protocol:</span>
                  <span className="font-bold text-cyan-400">{showDetailModal.storageTemp}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-stone-900">
                  <span>FSSAI License:</span>
                  <span className="font-bold text-stone-400">{showDetailModal.fssaiLicense}</span>
                </div>
              </div>
            </div>

            {/* Ingredients */}
            <div className="space-y-2 text-xs">
              <div>
                <strong className="text-white">Botanical Ingredients: </strong>
                <span className="text-stone-300">{showDetailModal.ingredients.join(', ')}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] flex items-center gap-2">
                <RotateCcw className="w-4 h-4 shrink-0" />
                <span>₹10 Refundable Glass Bottle Deposit is refunded in full upon return to rider or POS counter.</span>
              </div>
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  handleAddItemToCart(showDetailModal);
                  setShowDetailModal(null);
                }}
                className="flex-1 bg-stone-800 hover:bg-stone-700 text-emerald-300 border border-stone-700 font-bold py-3 rounded-2xl text-xs transition-all flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add to Cart</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  handleDirectBuy(showDetailModal);
                  setShowDetailModal(null);
                }}
                className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black py-3 rounded-2xl text-xs transition-all shadow-lg flex items-center justify-center gap-2"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Buy Now (₹{showDetailModal.mrp})</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </section>
  );
};
