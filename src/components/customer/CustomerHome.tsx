import React, { useState } from 'react';
import { RecipeItem, CustomerProfile } from '../../types';
import { useCart } from '../../context/CartContext';
import { formatInr } from '../../utils/money';
import type { AddToCartHandler } from './StorefrontProduct';
import { INITIAL_COMBO_OFFERS } from '../../data/mockData';
import { ALL_RECIPES } from '../../data/recipeDatabase';
import { matchCategoryToRecipe } from '../../utils/categoryFilter';
import { LogoMark } from '../common/LogoMark';
import { CinematicHeroAnimation } from './CinematicHeroAnimation';
import { PackagedFoodsSection } from './PackagedFoodsSection';
import { TepacheDrinksSection } from './TepacheDrinksSection';
import { 
  Sparkles, 
  ArrowRight, 
  CheckCircle2, 
  Flame, 
  ShieldCheck, 
  Heart, 
  Utensils, 
  Scale, 
  Star, 
  ChefHat, 
  Stethoscope, 
  Award, 
  ChevronRight,
  Image as ImageIcon,
  ShoppingBag,
  Truck
} from 'lucide-react';

interface CustomerHomeProps {
  onSelectTab: (tab: string) => void;
  onOpenMenuModal: (recipe: RecipeItem) => void;
  onOpenAuthModal: () => void;
  isLoggedIn?: boolean;
  currentUser?: CustomerProfile | null;
  activeTab?: string;
  currentRole?: any;
  onRoleChange?: (role: any) => void;
  onOpenKeralaMessPortal?: () => void;
  onAddToCart: AddToCartHandler;
  onQuickBuy: AddToCartHandler;
  onOpenCart?: () => void;
  onOpenDirectTracking?: () => void;
}

export const CHEF_MENU_12_CATEGORIES = [
  { id: 'Choice of Rice', title: 'Choice of Rice', icon: '🍚', count: '6 Dishes', desc: 'Kerala Matta, Organic White & Brown Rice' },
  { id: 'Flavored Rice', title: 'Flavored Rice', icon: '🌿', count: '5 Dishes', desc: 'Lemon Herb, Garlic Butter & Spiced Rice' },
  { id: 'Choice of Chicken – Air Fried', title: 'Air-Fried Chicken', icon: '🍗', count: '12 Dishes', desc: 'Lean Lemon Garlic & Pepper Chicken' },
  { id: 'Lunch Accomplishments – Kerala', title: 'Kerala Accompaniments', icon: '🍛', count: '8 Dishes', desc: 'Beetroot Thoran, Aviyal & Mezhukkupuratti' },
  { id: 'Choice of Fish', title: 'Choice of Fish', icon: '🐟', count: '5 Dishes', desc: 'Grilled Sear Fish & Coastal Curry Bowls' },
  { id: 'Choice of Salads – Veg', title: 'Veg Salads', icon: '🥗', count: '7 Dishes', desc: 'Greek Feta, Garden Fresh & Sprouts' },
  { id: 'Choice of Salads – Non-Veg', title: 'Non-Veg Salads', icon: '🥑', count: '6 Dishes', desc: 'High-Protein Avocado Chicken & Egg' },
  { id: 'Choice of Quinoa', title: 'Choice of Quinoa', icon: '🌾', count: '5 Dishes', desc: 'Organic Tri-Color Quinoa Bowls' },
  { id: 'Choice of Egg', title: 'Choice of Egg', icon: '🍳', count: '8 Dishes', desc: 'Spinach Omelette & Scrambled Egg Bowls' },
  { id: 'Choice of Oatmeal', title: 'Choice of Oatmeal', icon: '🥣', count: '5 Dishes', desc: 'Apple Cinnamon & Peanut Butter Oats' },
  { id: 'Yogurt Bowls', title: 'Yogurt Bowls', icon: '🫐', count: '6 Dishes', desc: 'Mocha Protein & Berry Parfaits' },
  { id: 'Desserts, Snacks & Bites', title: 'Desserts & Beverages', icon: '🍮', count: '8 Dishes', desc: 'Protein Brownies & Cold-Pressed Juices' },
];

export const CustomerHome: React.FC<CustomerHomeProps> = ({
  onSelectTab,
  onOpenMenuModal,
  onOpenAuthModal,
  isLoggedIn = false,
  currentUser = null,
  activeTab = 'home',
  currentRole = 'customer',
  onRoleChange,
  onOpenKeralaMessPortal,
  onAddToCart,
  onQuickBuy,
  onOpenCart,
  onOpenDirectTracking
}) => {
  const [selectedMenuCategory, setSelectedMenuCategory] = useState<string>('Choice of Chicken – Air Fried');

  const filteredRecipes = ALL_RECIPES.filter((r) => matchCategoryToRecipe(selectedMenuCategory, r));

  // Cart figures come from the SERVER cart (CartContext); nothing is computed locally.
  const serverCart = useCart();
  const totalCartCount = serverCart.itemCount;
  const cartSubtotal = serverCart.cart?.itemsSubtotal ?? 0;

  return (
    <div className="space-y-16 pb-24 relative">
      
      {/* Edge-to-Edge Full Width Video Hero Section */}
      <section className="w-full">
        <CinematicHeroAnimation
          activeTab={activeTab}
          onSelectTab={onSelectTab}
          onOpenAuthModal={onOpenAuthModal}
          isLoggedIn={isLoggedIn}
          currentUser={currentUser}
          currentRole={currentRole}
          onRoleChange={onRoleChange}
          cartItemsCount={totalCartCount}
          cartTotal={cartSubtotal}
          onOpenCart={onOpenCart}
          onOpenDirectTracking={onOpenDirectTracking}
        />
      </section>

      {/* Floating Sticky Bottom Cart & Quick Tracking Bar */}
      {totalCartCount > 0 && onOpenCart && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-40 animate-bounce-short">
          <div className="bg-stone-900/95 border-2 border-amber-500/80 rounded-2xl p-4 shadow-2xl backdrop-blur-lg flex items-center justify-between gap-4 text-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-stone-950 flex items-center justify-center font-black relative">
                <ShoppingBag className="w-5 h-5" />
                <span className="absolute -top-1 -right-1 bg-stone-950 text-amber-400 text-[10px] w-4 h-4 rounded-full flex items-center justify-center border border-amber-400">
                  {totalCartCount}
                </span>
              </div>
              <div>
                <div className="text-xs text-stone-400 font-bold">{totalCartCount} item{totalCartCount > 1 ? 's' : ''} in Cart</div>
                <div className="text-sm font-black text-amber-400">{formatInr(cartSubtotal)} <span className="text-[10px] text-stone-400 font-normal">+ taxes & fees at checkout</span></div>
              </div>
            </div>

            <button
              onClick={onOpenCart}
              className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-black px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-lg hover:scale-105"
            >
              <span>Checkout</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* WHO WE ARE - BRAND & CLOUD KITCHEN STORY */}
      <section id="who_we_are" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <div className="bg-stone-900 text-white rounded-3xl p-8 sm:p-12 border border-stone-800 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="max-w-3xl space-y-6 relative z-10">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-black uppercase tracking-wider">
              <ChefHat className="w-4 h-4 text-emerald-400" />
              <span>Who We Are • Certified High-Protein Kitchen</span>
            </div>

            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
              Culinary Precision Built for Your Peak Health Goals
            </h2>

            <p className="text-stone-300 text-base sm:text-lg leading-relaxed">
              <strong className="text-emerald-400 font-bold">protein bowl</strong> is a modern cloud kitchen dedicated to transforming daily nutrition. We eliminate processed fillers and hidden oils, crafting delicious high-protein meal bowls tailored to your exact macro requirements.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4">
              <div className="p-5 rounded-2xl bg-stone-800/80 border border-stone-700/80 space-y-2">
                <Stethoscope className="w-6 h-6 text-emerald-400" />
                <h4 className="font-bold text-white text-sm">Dietician Approved</h4>
                <p className="text-xs text-stone-400">Calculated BMR, TDEE & macro targets for every subscriber.</p>
              </div>

              <div className="p-5 rounded-2xl bg-stone-800/80 border border-stone-700/80 space-y-2">
                <ChefHat className="w-6 h-6 text-amber-400" />
                <h4 className="font-bold text-white text-sm">Master Chef Crafted</h4>
                <p className="text-xs text-stone-400">12 culinary categories cooked fresh in certified cloud facilities.</p>
              </div>

              <div className="p-5 rounded-2xl bg-stone-800/80 border border-stone-700/80 space-y-2">
                <ShieldCheck className="w-6 h-6 text-teal-400" />
                <h4 className="font-bold text-white text-sm">Thermal Hot Dispatch</h4>
                <p className="text-xs text-stone-400">Dispatched in food-safe eco boxes at optimal temperature.</p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 4 Blank Photo Placeholders - Blank Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((num) => (
            <div 
              key={num} 
              className="aspect-[4/3] sm:aspect-square bg-stone-900/80 border-2 border-dashed border-stone-800 rounded-3xl flex flex-col items-center justify-center p-4 text-center group hover:border-emerald-500/50 transition-all shadow-lg"
            >
              <div className="w-10 h-10 rounded-2xl bg-stone-800 flex items-center justify-center text-stone-500 mb-2 group-hover:text-emerald-400 transition-colors">
                <ImageIcon className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-stone-500 uppercase tracking-wider group-hover:text-stone-300 transition-colors">Photo Place {num}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Interactive Quick BMR Teaser Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-emerald-950/80 border-2 border-emerald-500/40 rounded-3xl p-8 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 backdrop-blur-md">
          <div className="space-y-2">
            <h2 className="text-2xl sm:text-3xl font-black text-white">
              Not sure how many calories your body burns daily?
            </h2>
            <p className="text-xs sm:text-sm text-stone-300 max-w-xl">
              Calculate your BMR, total daily energy expenditure (TDEE), and target protein/carbs/fats split in less than 30 seconds.
            </p>
          </div>

          <button
            onClick={() => {
              onSelectTab('health_profile');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black px-6 py-3.5 rounded-2xl text-sm transition-all shadow-lg shrink-0 flex items-center gap-2 hover:scale-105"
          >
            <span>Launch Macro Calculator</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* KERALA HOMESTYLE MESS FOR HOSTEL & PG STUDENTS SECTION */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-gradient-to-br from-emerald-950 via-stone-900 to-amber-950/90 rounded-3xl p-6 sm:p-10 border-2 border-emerald-500/40 shadow-2xl relative overflow-hidden space-y-6">
          <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-black uppercase tracking-wider">
                <Utensils className="w-3.5 h-3.5 text-amber-400" />
                <span>Kerala Homestyle Mess • Hostel & PG Budget Delivery</span>
              </div>
              <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight leading-tight">
                Traditional Homestyle Kerala Meals for College Hostels & PGs
              </h2>
              <p className="text-stone-300 text-xs sm:text-sm leading-relaxed">
                Appam with Stew, Kerala Matta Rice, Fish Curry, Sambar & Thoran cooked in central cloud kitchens using pure coconut oil. Enjoy monthly budget meal passes starting at only <strong className="text-emerald-400">₹70/meal</strong> with free home-trip meal pausing & instant refund credits.
              </p>

              {/* Fast feature bullets */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 text-xs">
                <div className="flex items-center gap-2 text-stone-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Breakfast, Lunch & Dinner</span>
                </div>
                <div className="flex items-center gap-2 text-stone-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Insulated Crate Drop to Hostels</span>
                </div>
                <div className="flex items-center gap-2 text-stone-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Pause Meal when Travelling</span>
                </div>
              </div>
            </div>

            {/* CTA Box */}
            <div className="bg-stone-950/80 p-6 rounded-2xl border border-stone-800 space-y-4 shrink-0 lg:w-80 text-center">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-stone-400">Student & PG Subscription</span>
                <div className="text-2xl font-black text-amber-400">₹2,100 <span className="text-xs text-stone-400 font-normal">/ month (30 meals)</span></div>
                <p className="text-[11px] text-stone-400">Or single daily meal from ₹70</p>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => {
                    if (onOpenKeralaMessPortal) {
                      onOpenKeralaMessPortal();
                    } else if (onRoleChange) {
                      onRoleChange('mess_customer');
                    }
                  }}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black py-3 rounded-xl text-xs transition-all shadow-lg hover:scale-105 flex items-center justify-center gap-2"
                >
                  <Utensils className="w-4 h-4" />
                  <span>Open Kerala Mess Portal</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 1. PACKAGED NUTRITION FOODS SECTION (Bread, Granola, Bars, Cookies) */}
      <PackagedFoodsSection 
        onAddToCart={onAddToCart} 
        onQuickBuy={onQuickBuy}
      />

      {/* 2. GUT-FRIENDLY WILD FERMENTED TEPACHE DRINKS SECTION */}
      <TepacheDrinksSection 
        onAddToCart={onAddToCart} 
        onQuickBuy={onQuickBuy}
      />

      {/* Menu & Recipe Database Catalog Preview - 12 Categories */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 text-white">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black text-white tracking-tight">
              Chef-Crafted Healthy Menu (12 Categories)
            </h2>
            <p className="text-xs text-stone-300 mt-1">
              All 12 distinct macro-calibrated meal categories viewable at a single stance without scrolling. Click any category to view recipes.
            </p>
          </div>

          <button
            onClick={() => onSelectTab('menu')}
            className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 shrink-0"
          >
            <span>View Full Menu Catalog</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* 12-Category Single Stance Grid - NO HORIZONTAL/LONG SCROLLING */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-3">
          {CHEF_MENU_12_CATEGORIES.map((cat) => {
            const active = selectedMenuCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedMenuCategory(cat.id)}
                className={`p-3 rounded-2xl text-left border transition-all flex flex-col justify-between relative group ${
                  active
                    ? 'bg-emerald-950 text-white border-emerald-500 shadow-lg ring-1 ring-emerald-500/50'
                    : 'bg-stone-900 text-stone-200 border-stone-800 hover:border-emerald-500/50 hover:bg-stone-800'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="text-xl sm:text-2xl">{cat.icon}</span>
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                    active ? 'bg-emerald-400 text-stone-950 font-black' : 'bg-stone-800 text-stone-400'
                  }`}>
                    {cat.count}
                  </span>
                </div>

                <div>
                  <h4 className={`text-xs font-black leading-tight ${active ? 'text-emerald-300' : 'text-white'}`}>
                    {cat.title}
                  </h4>
                  <p className={`text-[10px] line-clamp-1 mt-0.5 ${active ? 'text-emerald-200' : 'text-stone-400'}`}>
                    {cat.desc}
                  </p>
                </div>

                {active && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-stone-900 animate-pulse" />
                )}
              </button>
            );
          })}
        </div>

        {/* Recipe Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRecipes.map((recipe) => (
            <div
              key={recipe.id}
              onClick={() => onOpenMenuModal(recipe)}
              className="bg-stone-900 rounded-3xl border border-stone-800 overflow-hidden shadow-xl hover:shadow-2xl hover:border-emerald-500/50 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="relative h-48 overflow-hidden">
                  <img
                    src={recipe.image}
                    alt={recipe.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute top-3 left-3 bg-stone-950/90 backdrop-blur-md px-3 py-1 rounded-full text-[11px] font-extrabold text-emerald-400 border border-emerald-500/30">
                    {recipe.category}
                  </div>
                  <div className="absolute top-3 right-3 bg-emerald-950/90 border border-emerald-500/40 text-emerald-300 px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1">
                    <Flame className="w-3 h-3 text-amber-400 fill-amber-400" />
                    <span>{recipe.calories} kcal</span>
                  </div>
                </div>

                <div className="p-5">
                  <h3 className="font-bold text-2xl text-white group-hover:text-emerald-400 transition-colors leading-tight">
                    {recipe.name}
                  </h3>
                  <p className="text-xs text-stone-400 mt-1 font-medium">
                    Portion: {recipe.servingSize} • {recipe.cuisine}
                  </p>

                  {/* Macros Bar */}
                  <div className="grid grid-cols-4 gap-1.5 my-3 text-center bg-stone-950 p-2.5 rounded-2xl border border-stone-800 text-xs font-bold">
                    <div>
                      <span className="text-[10px] text-stone-500 block font-bold">PRO</span>
                      <strong className="text-emerald-400">{recipe.protein}g</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-500 block font-bold">CARB</span>
                      <strong className="text-amber-400">{recipe.carbs}g</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-500 block font-bold">FAT</span>
                      <strong className="text-blue-400">{recipe.fat}g</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-500 block font-bold">FIBER</span>
                      <strong className="text-teal-400">{recipe.fiber}g</strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-stone-950/80 border-t border-stone-800 flex items-center justify-between text-xs text-emerald-400 font-bold">
                <span>View Macro Nutrition Card</span>
                <ChevronRight className="w-4 h-4 text-emerald-400 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Subscription Plans & Combo Offers */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 text-white">
        <div className="text-center space-y-2">
          <span className="text-xs font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/20 px-3.5 py-1 rounded-full border border-emerald-500/30">Flexible Subscriptions</span>
          <h2 className="text-3xl font-black text-white tracking-tight">
            Popular Subscription Packages
          </h2>
          <p className="text-xs text-stone-300 max-w-md mx-auto">
            Doorstep delivery in Kochi. Free meal swaps, pause/resume anytime.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {INITIAL_COMBO_OFFERS.map((combo) => (
            <div
              key={combo.id}
              className="bg-stone-900 rounded-3xl p-6 border border-stone-800 hover:border-emerald-500 transition-all shadow-xl hover:shadow-2xl flex flex-col justify-between"
            >
              <div>
                {combo.popularTag && (
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full mb-3 inline-block">
                    {combo.popularTag}
                  </span>
                )}
                <h3 className="text-xl font-black text-white">{combo.title}</h3>
                <p className="text-xs text-stone-300 mt-2 leading-relaxed">{combo.subtitle}</p>

                <ul className="mt-4 space-y-2.5 text-xs text-stone-300">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Dietician Macro & BMI Review Included</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Free Same-Day Meal Swapping</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Pause or Skip Days Anytime</span>
                  </li>
                </ul>
              </div>

              <div className="mt-6 pt-4 border-t border-stone-800">
                <div className="flex items-baseline justify-between mb-4">
                  <div>
                    <span className="text-xs text-stone-500 line-through block">₹{Math.round(combo.price * 1.25)}</span>
                    <span className="text-2xl font-black text-emerald-400">₹{combo.price.toLocaleString()}</span>
                  </div>
                  <span className="text-xs font-bold text-emerald-300 bg-emerald-950 px-2.5 py-1 rounded-lg border border-emerald-500/30">
                    {combo.durationDays} Days Duration
                  </span>
                </div>

                <button
                  onClick={() => onSelectTab('plan_builder')}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black py-3 rounded-xl text-xs transition-all shadow-lg hover:scale-[1.02]"
                >
                  Configure & Subscribe
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
};
