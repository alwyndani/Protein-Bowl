import React, { useState } from 'react';
import { RecipeItem, UserRole } from '../../types';
import { LogoMark } from './LogoMark';
import { X, Flame, Shield, Sparkles, Utensils, Heart, Calculator, Lock, ChefHat } from 'lucide-react';
import { IngredientPriceCalculator } from './IngredientPriceCalculator';

interface MenuCardModalProps {
  recipe: RecipeItem | null;
  onClose: () => void;
  onSelectForPlan?: (recipe: RecipeItem) => void;
  userRole?: UserRole;
}

export const MenuCardModal: React.FC<MenuCardModalProps> = ({
  recipe,
  onClose,
  onSelectForPlan,
  userRole = 'customer'
}) => {
  const [activeTab, setActiveTab] = useState<'nutrition' | 'pricing'>('nutrition');

  if (!recipe) return null;

  const isChefOrAdmin = userRole === 'chef' || userRole === 'super_admin';

  const dietaryColors = {
    veg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    'non-veg': 'bg-red-100 text-red-800 border-red-300',
    egg: 'bg-amber-100 text-amber-800 border-amber-300',
    vegan: 'bg-teal-100 text-teal-800 border-teal-300'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border-2 border-emerald-500/30 relative flex flex-col max-h-[92vh]">
        
        {/* Card Header matching brand menu card style */}
        <div className="p-6 bg-gradient-to-r from-emerald-50 via-white to-stone-50 border-b border-stone-200 relative flex items-start justify-between">
          <div className="pr-12">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border ${dietaryColors[recipe.dietaryTag]}`}>
                {recipe.dietaryTag}
              </span>
              <span className="text-xs font-semibold text-stone-500">{recipe.category}</span>
              {isChefOrAdmin && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-100 text-orange-900 border border-orange-300 flex items-center gap-1">
                  <ChefHat className="w-3 h-3 text-orange-600" />
                  <span>Authorized Recipe View ({userRole.toUpperCase()})</span>
                </span>
              )}
            </div>
            
            {/* Green Title in Script Font per brand design requirement */}
            <h2 className="font-script text-3xl sm:text-4xl font-bold text-emerald-800 leading-tight">
              {recipe.name}
            </h2>
            
            <p className="text-xs text-stone-500 mt-1 font-medium flex items-center gap-3">
              <span>Standard Serving Size: <strong className="text-stone-800">{recipe.servingSize}</strong></span>
              <span>•</span>
              <span>Cuisine: <strong className="text-stone-800">{recipe.cuisine}</strong></span>
            </p>
          </div>

          {/* Small Logo Top-Right per brand design requirement */}
          <div className="shrink-0 flex flex-col items-end">
            <LogoMark size="sm" showTagline={false} />
            <button
              onClick={onClose}
              className="mt-2 p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Navigation Tabs (Only if Chef or Admin) */}
        {isChefOrAdmin && (
          <div className="flex border-b border-stone-200 bg-stone-50 px-6 pt-2 gap-2">
            <button
              onClick={() => setActiveTab('nutrition')}
              className={`px-4 py-2.5 text-xs font-extrabold rounded-t-xl transition-all flex items-center gap-2 border-b-2 ${
                activeTab === 'nutrition'
                  ? 'border-emerald-700 text-emerald-900 bg-white shadow-2xs'
                  : 'border-transparent text-stone-500 hover:text-stone-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Nutritional Card & Prep Steps</span>
            </button>

            <button
              onClick={() => setActiveTab('pricing')}
              className={`px-4 py-2.5 text-xs font-extrabold rounded-t-xl transition-all flex items-center gap-2 border-b-2 ${
                activeTab === 'pricing'
                  ? 'border-emerald-700 text-emerald-900 bg-white shadow-2xs'
                  : 'border-transparent text-stone-500 hover:text-stone-800'
              }`}
            >
              <Calculator className="w-3.5 h-3.5 text-amber-600" />
              <span>💰 Ingredient Price Calculator & Rates</span>
            </button>
          </div>
        )}

        {/* Card Body - Tab 1: Recipe Image & Nutrition Table */}
        {activeTab === 'nutrition' && (
          <div className="p-6 overflow-y-auto space-y-6">
            {/* Dish Image */}
            <div className="relative h-48 rounded-2xl overflow-hidden shadow-inner group">
              <img 
                src={recipe.image} 
                alt={recipe.name} 
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-md">
                <Flame className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                <span>{recipe.calories} kcal / serving</span>
              </div>
            </div>

            {/* Clean Nutrition Table per brand design requirement */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 mb-2.5 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span>Certified Macro Nutrition Breakdown</span>
              </h3>

              <div className="grid grid-cols-4 gap-2 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3 text-center">
                <div className="bg-white rounded-xl p-2.5 shadow-2xs border border-emerald-100">
                  <div className="text-[11px] font-semibold text-stone-500 uppercase">Protein</div>
                  <div className="text-lg font-black text-emerald-800">{recipe.protein}g</div>
                  <div className="text-[10px] text-emerald-600 font-medium">High Lean</div>
                </div>

                <div className="bg-white rounded-xl p-2.5 shadow-2xs border border-emerald-100">
                  <div className="text-[11px] font-semibold text-stone-500 uppercase">Carbs</div>
                  <div className="text-lg font-black text-amber-700">{recipe.carbs}g</div>
                  <div className="text-[10px] text-amber-600 font-medium">Complex</div>
                </div>

                <div className="bg-white rounded-xl p-2.5 shadow-2xs border border-emerald-100">
                  <div className="text-[11px] font-semibold text-stone-500 uppercase">Fat</div>
                  <div className="text-lg font-black text-blue-800">{recipe.fat}g</div>
                  <div className="text-[10px] text-blue-600 font-medium">Healthy</div>
                </div>

                <div className="bg-white rounded-xl p-2.5 shadow-2xs border border-emerald-100">
                  <div className="text-[11px] font-semibold text-stone-500 uppercase">Fiber</div>
                  <div className="text-lg font-black text-teal-800">{recipe.fiber}g</div>
                  <div className="text-[10px] text-teal-600 font-medium">Digestive</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Price Calculator (Chef & Admin Only) */}
        {isChefOrAdmin && activeTab === 'pricing' && (
          <div className="p-6 overflow-y-auto space-y-6">
            <IngredientPriceCalculator compact={true} />
          </div>
        )}

        {/* Card Footer */}
        <div className="p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-between">
          <div className="text-xs text-stone-500 font-medium flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-emerald-700" />
            <span>Cloud Kitchen Menu Catalog</span>
          </div>
          {onSelectForPlan && (
            <button
              onClick={() => {
                onSelectForPlan(recipe);
                onClose();
              }}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all shadow-md flex items-center gap-1.5"
            >
              <Heart className="w-4 h-4 fill-white" />
              <span>Select for Diet Plan</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
