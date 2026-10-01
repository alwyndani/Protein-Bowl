import React, { useState } from 'react';
import { DietPlanRequest, CustomerProfile, RecipeItem, ComboOffer } from '../../types';
import { INITIAL_RECIPES, INITIAL_COMBO_OFFERS } from '../../data/mockData';
import { DietService } from '../../services/dietService';
import { Sparkles, Check, RefreshCw, X, Calendar, Utensils, Flame, ChevronRight, AlertCircle, ShoppingBag } from 'lucide-react';

interface CustomerPlanReviewProps {
  request: DietPlanRequest | null;
  profile: CustomerProfile;
  onApproveAndCheckout: (req: DietPlanRequest) => void;
  onRequestRevision: (reqId: string, notes: string) => void;
  onRejectPlan: (reqId: string) => void;
  onOpenMenuModal: (recipe: RecipeItem) => void;
}

export const CustomerPlanReview: React.FC<CustomerPlanReviewProps> = ({
  request,
  profile,
  onApproveAndCheckout,
  onRequestRevision,
  onRejectPlan,
  onOpenMenuModal
}) => {
  const [selectedDayTab, setSelectedDayTab] = useState(1);
  const [revisionNote, setRevisionNote] = useState('');
  const [showRevisionBox, setShowRevisionBox] = useState(false);

  if (!request) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center space-y-4">
        <div className="w-16 h-16 bg-stone-100 text-stone-400 rounded-full flex items-center justify-center mx-auto">
          <Utensils className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-stone-800">No Pending Diet Plan Reviews</h2>
        <p className="text-xs text-stone-500">You do not have a pending plan under dietician review right now.</p>
      </div>
    );
  }

  const recipeMap = new Map(INITIAL_RECIPES.map((r) => [r.id, r]));
  const dayPlans = request.dayWisePlan || [];
  const activeDayPlan = dayPlans.find((d) => d.dayNumber === selectedDayTab) || dayPlans[0];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8 animate-fadeIn">
      {/* Status Header */}
      <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-emerald-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold uppercase tracking-wider mb-2">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> Dietician Customized Day-Wise Plan
            </span>
            <h1 className="text-2xl sm:text-3xl font-black">
              Review Your Personal Subscription Schedule
            </h1>
            <p className="text-xs sm:text-sm text-emerald-100/90 mt-1">
              Custom-balanced for target: <strong className="text-white">{profile.targetCalories} kcal / day</strong> (Goal: {profile.goal.replace('_', ' ')})
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-2xl text-center">
            <span className="text-[10px] uppercase font-bold text-emerald-200 block">Subscription Total</span>
            <span className="text-2xl font-black text-emerald-300">₹{(request.calculatedPrice || 14999).toLocaleString()}</span>
            <span className="text-[10px] text-emerald-200 block">{request.durationDays} Days Duration</span>
          </div>
        </div>

        {/* Dietician Note */}
        {request.dieticianNotes && (
          <div className="mt-4 pt-4 border-t border-emerald-700/60 text-xs text-emerald-100 flex items-start gap-2">
            <span className="font-extrabold text-emerald-300 shrink-0">Dietician Note:</span>
            <span>"{request.dieticianNotes}"</span>
          </div>
        )}
      </div>

      {/* Day Selector Tabs */}
      {dayPlans.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            {dayPlans.map((d) => {
              const active = selectedDayTab === d.dayNumber;
              return (
                <button
                  key={d.dayNumber}
                  onClick={() => setSelectedDayTab(d.dayNumber)}
                  className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all whitespace-nowrap border ${
                    active
                      ? 'bg-emerald-800 text-white border-emerald-800 shadow-md'
                      : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                  }`}
                >
                  <span>{d.dayName ? `${d.dayName} (Day ${d.dayNumber})` : `Day ${d.dayNumber}`}</span>
                  <span className={`ml-2 text-[10px] ${active ? 'text-emerald-200' : 'text-stone-400'}`}>
                    ({d.totalCalories} kcal)
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Day Meal Breakdown Card */}
          {activeDayPlan && (
            <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm space-y-6">
              
              {/* Day Macro Overview Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-emerald-50/70 p-4 rounded-2xl border border-emerald-200/80">
                <div className="bg-white p-2.5 rounded-xl text-center border border-emerald-100 shadow-2xs">
                  <div className="text-[10px] font-bold text-stone-400 uppercase">Calories</div>
                  <div className="text-lg font-black text-emerald-900">{activeDayPlan.totalCalories} kcal</div>
                  <div className="text-[10px] text-emerald-600 font-medium">Target: {profile.targetCalories}</div>
                </div>

                <div className="bg-white p-2.5 rounded-xl text-center border border-emerald-100 shadow-2xs">
                  <div className="text-[10px] font-bold text-stone-400 uppercase">Protein</div>
                  <div className="text-lg font-black text-emerald-900">{activeDayPlan.totalProtein}g</div>
                  <div className="text-[10px] text-emerald-600 font-medium">Target: {profile.macroTargets.proteinGrams}g</div>
                </div>

                <div className="bg-white p-2.5 rounded-xl text-center border border-emerald-100 shadow-2xs">
                  <div className="text-[10px] font-bold text-stone-400 uppercase">Carbs</div>
                  <div className="text-lg font-black text-amber-800">{activeDayPlan.totalCarbs}g</div>
                  <div className="text-[10px] text-amber-600 font-medium">Target: {profile.macroTargets.carbsGrams}g</div>
                </div>

                <div className="bg-white p-2.5 rounded-xl text-center border border-emerald-100 shadow-2xs">
                  <div className="text-[10px] font-bold text-stone-400 uppercase">Fats</div>
                  <div className="text-lg font-black text-blue-800">{activeDayPlan.totalFat}g</div>
                  <div className="text-[10px] text-blue-600 font-medium">Target: {profile.macroTargets.fatGrams}g</div>
                </div>
              </div>

              {/* Day Meals List */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Prescribed Meals for Day {activeDayPlan.dayNumber}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeDayPlan.meals.map((slot, idx) => {
                    const recipe = recipeMap.get(slot.recipeId);
                    return (
                      <div
                        key={idx}
                        onClick={() => recipe && onOpenMenuModal(recipe)}
                        className="p-4 rounded-2xl border border-stone-200 bg-stone-50 hover:bg-emerald-50/50 hover:border-emerald-300 transition-all cursor-pointer flex gap-4 group"
                      >
                        {recipe && (
                          <img
                            src={recipe.image}
                            alt={recipe.name}
                            className="w-16 h-16 rounded-xl object-cover shrink-0 shadow-xs group-hover:scale-105 transition-transform"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                              {slot.timingLabel || slot.mealType.replace('_', ' ')}
                            </span>
                            <span className="text-xs font-bold text-stone-600">
                              {recipe?.calories || slot.calories || 200} kcal
                            </span>
                          </div>
                          <h4 className="font-extrabold text-stone-900 text-sm mt-1 truncate">
                            {recipe?.name || slot.recipeName}
                          </h4>
                          <p className="text-[11px] text-stone-500 mt-0.5">
                            P: {recipe?.protein}g • C: {recipe?.carbs}g • F: {recipe?.fat}g
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}
        </div>
      )}

      {/* Revision Request Input Box */}
      {showRevisionBox && (
        <div className="bg-stone-100 p-5 rounded-3xl border border-stone-300 space-y-3 animate-fadeIn">
          <h4 className="font-bold text-stone-800 text-sm flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-emerald-600" /> Request Custom Revision from Dietician
          </h4>
          <textarea
            rows={3}
            value={revisionNote}
            onChange={(e) => setRevisionNote(e.target.value)}
            placeholder="e.g. Please swap Day 2 dinner to vegetarian salad, or reduce spice on Day 1..."
            className="w-full bg-white p-3 border border-stone-300 rounded-xl text-xs text-stone-900 outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowRevisionBox(false)}
              className="px-4 py-2 bg-stone-200 text-stone-700 font-bold rounded-xl text-xs"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                try {
                  if (request.id) {
                    await DietService.requestRevision(request.id, revisionNote);
                  }
                } catch (e) {
                  console.error('Request revision API error:', e);
                }
                onRequestRevision(request.id, revisionNote);
                setShowRevisionBox(false);
              }}
              className="px-5 py-2 bg-emerald-800 text-white font-bold rounded-xl text-xs hover:bg-emerald-900 transition-colors"
            >
              Send Revision Note
            </button>
          </div>
        </div>
      )}

      {/* Decision Action Buttons */}
      <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-md flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h4 className="font-bold text-stone-900 text-base">Satisfied with this Plan?</h4>
          <p className="text-xs text-stone-500">
            Approve now to confirm your customized diet plan schedule with your dietician.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => onRejectPlan(request.id)}
            className="px-4 py-2.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold transition-colors"
          >
            Reject Plan
          </button>

          <button
            type="button"
            onClick={() => setShowRevisionBox(!showRevisionBox)}
            className="px-4 py-2.5 rounded-xl border border-stone-300 text-stone-700 hover:bg-stone-100 text-xs font-bold transition-colors"
          >
            Request Change
          </button>

          <button
            type="button"
            onClick={async () => {
              try {
                if (request.id) {
                  await DietService.approvePlan(request.id, 'Approved by customer');
                }
              } catch (e) {
                console.error('Approve plan API error:', e);
              }
              onApproveAndCheckout(request);
            }}
            className="px-6 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-sm transition-all shadow-md flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>Approve & Confirm Diet Plan</span>
          </button>
        </div>
      </div>

      {/* Combo Offers Options Banner */}
      <div className="space-y-4 pt-4">
        <h3 className="text-sm font-extrabold uppercase tracking-wider text-stone-600">
          Available Subscription Combos & Value Offers
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {INITIAL_COMBO_OFFERS.map((combo) => (
            <div
              key={combo.id}
              className="bg-white rounded-2xl p-5 border border-stone-200 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                {combo.popularTag && (
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md mb-2 inline-block">
                    {combo.popularTag}
                  </span>
                )}
                <h4 className="font-black text-stone-900 text-base">{combo.title}</h4>
                <p className="text-xs text-stone-500 mt-1 leading-relaxed">{combo.subtitle}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between">
                <div>
                  <span className="text-xs text-stone-400 line-through">₹{Math.round(combo.price * 1.25)}</span>
                  <div className="text-xl font-black text-emerald-800">₹{combo.price.toLocaleString()}</div>
                </div>

                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
                  Save {combo.discountPct}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
