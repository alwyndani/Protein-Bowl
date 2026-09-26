import React, { useState } from 'react';
import { CustomerProfile, PlanType, DietaryPreference, RecipeItem, DietPlanRequest } from '../../types';
import { ALL_RECIPES } from '../../data/recipeDatabase';
import { calculateMDCostEngine } from '../../utils/costEngine';
import { Calendar, Utensils, Sparkles, Check, ChevronRight, ShieldCheck, Heart, Sliders, ArrowRight, AlertCircle, Receipt } from 'lucide-react';
import confetti from 'canvas-confetti';

interface DietPlanBuilderProps {
  profile: CustomerProfile;
  onSubmitRequest: (request: DietPlanRequest) => void;
  onOpenMenuModal: (recipe: RecipeItem) => void;
}

export const DietPlanBuilder: React.FC<DietPlanBuilderProps> = ({
  profile,
  onSubmitRequest,
  onOpenMenuModal
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Plan configuration states
  const [planType, setPlanType] = useState<PlanType>('complete');
  const [durationDays, setDurationDays] = useState<number>(30);

  // Preferences
  const [dietaryPreference, setDietaryPreference] = useState<DietaryPreference>('non-veg');
  const [cuisinePreference, setCuisinePreference] = useState<string>('Kerala Traditional');
  const [grainPreference, setGrainPreference] = useState<string>('Kerala Matta Rice');
  const [spiceLevel, setSpiceLevel] = useState<'Mild' | 'Medium' | 'Spicy'>('Medium');
  const [addonSlots, setAddonSlots] = useState<string[]>(['4:00 PM Afternoon Snack/Salad']);
  
  // Preferred Dish Categories shortlist
  const [selectedCategories, setSelectedCategories] = useState<string[]>([
    'Choice of Chicken – Air Fried',
    'Choice of Salads – Non-Veg',
    'Kerala Breakfast',
    'Choice of Quinoa'
  ]);

  const [allergiesExclusions, setAllergiesExclusions] = useState<string>(
    `${profile.allergies.join(', ')} | Conditions: ${profile.medicalConditions.join(', ')}`
  );

  const availableCategories = Array.from(new Set(ALL_RECIPES.map((r) => r.category)));

  const toggleCategory = (cat: string) => {
    if (selectedCategories.includes(cat)) {
      setSelectedCategories(selectedCategories.filter((c) => c !== cat));
    } else {
      setSelectedCategories([...selectedCategories, cat]);
    }
  };

  const toggleAddonSlot = (slot: string) => {
    if (addonSlots.includes(slot)) {
      setAddonSlots(addonSlots.filter((s) => s !== slot));
    } else {
      setAddonSlots([...addonSlots, slot]);
    }
  };

  const pricing = calculateMDCostEngine(
    planType === '1meal' ? 1 : planType === '2meal' ? 2 : 3,
    durationDays,
    dietaryPreference,
    addonSlots.length
  );

  const handleFinalSubmit = () => {
    confetti({ particleCount: 80, spread: 80 });

    const newReq: DietPlanRequest = {
      id: `req-${Date.now().toString().slice(-4)}`,
      customerId: profile.id,
      customerName: profile.name,
      customerEmail: profile.email,
      customerPhone: profile.phone,
      bmi: profile.bmi,
      goal: profile.goal,
      targetCalories: profile.targetCalories,
      planType,
      durationDays,
      preferredCategories: selectedCategories,
      dietaryPreference,
      cuisinePreference,
      grainPreference,
      spiceLevel,
      allergiesExclusions,
      customQuery: profile.customQuery,
      addonSlots,
      status: 'pending_review',
      calculatedPrice: pricing.totalPayable,
      pricingBreakdown: {
        baseMealCost: pricing.dailyBaseCost * durationDays,
        addonCost: pricing.dailyAddonCost * durationDays,
        durationDiscount: pricing.discountAmount,
        gstAmount: pricing.gstAmount,
        totalPayable: pricing.totalPayable
      },
      createdAt: new Date().toISOString().split('T')[0]
    };

    onSubmitRequest(newReq);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8 animate-fadeIn text-white">
      {/* Page Title Header */}
      <div className="text-center space-y-2">
        <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-black uppercase tracking-wider border border-emerald-500/30">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> Custom Diet Subscription Setup
        </span>
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
          Subscribe to Your Tailored Diet Plan
        </h1>
        <p className="text-stone-300 text-sm max-w-xl mx-auto">
          Configure your meal frequency, subscription duration, and favorite dishes. Our certified Dietician will craft your daily meal plan to hit your exact macro targets.
        </p>
      </div>

      {/* Progress Steps Header */}
      <div className="flex items-center justify-center gap-2 sm:gap-4 max-w-lg mx-auto">
        <button
          onClick={() => setStep(1)}
          className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-2xl text-xs font-bold transition-all ${
            step === 1 ? 'bg-emerald-500 text-stone-950 font-black shadow-lg' : 'bg-stone-900 text-stone-400 border border-stone-800'
          }`}
        >
          <span className="w-5 h-5 rounded-full bg-black/20 flex items-center justify-center text-[10px]">1</span>
          <span>Plan & Duration</span>
        </button>

        <div className="w-6 h-0.5 bg-stone-800" />

        <button
          onClick={() => setStep(2)}
          className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-2xl text-xs font-bold transition-all ${
            step === 2 ? 'bg-emerald-500 text-stone-950 font-black shadow-lg' : 'bg-stone-900 text-stone-400 border border-stone-800'
          }`}
        >
          <span className="w-5 h-5 rounded-full bg-black/20 flex items-center justify-center text-[10px]">2</span>
          <span>Menu Preferences</span>
        </button>

        <div className="w-6 h-0.5 bg-stone-800" />

        <button
          onClick={() => setStep(3)}
          className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-2xl text-xs font-bold transition-all ${
            step === 3 ? 'bg-emerald-500 text-stone-950 font-black shadow-lg' : 'bg-stone-900 text-stone-400 border border-stone-800'
          }`}
        >
          <span className="w-5 h-5 rounded-full bg-black/20 flex items-center justify-center text-[10px]">3</span>
          <span>Review & Send</span>
        </button>
      </div>

      {/* STEP 1: Plan Type & Duration */}
      {step === 1 && (
        <div className="space-y-6 bg-stone-900 p-6 sm:p-8 rounded-3xl border border-stone-800 shadow-xl">
          <div>
            <h3 className="text-base font-extrabold text-white mb-1">Select Plan Type</h3>
            <p className="text-xs text-stone-400 mb-4">Choose how many daily meals you want prepared & delivered by Protein Bowl</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  type: 'complete',
                  title: 'Complete Meal Plan',
                  desc: 'Breakfast + Lunch + Evening Snack + Dinner (Full Daily Fuel)',
                  badge: 'Recommended for Results'
                },
                {
                  type: '2meal',
                  title: '2 Meal Plan',
                  desc: 'Lunch & Dinner delivered to your office or home daily',
                  badge: 'Most Flexible'
                },
                {
                  type: '1meal',
                  title: '1 Meal Plan',
                  desc: '1 High-Protein Power Meal per day (Lunch or Dinner)',
                  badge: 'Starter'
                }
              ].map((p) => {
                const active = planType === p.type;
                return (
                  <button
                    key={p.type}
                    type="button"
                    onClick={() => setPlanType(p.type as PlanType)}
                    className={`p-5 rounded-2xl text-left border transition-all relative flex flex-col justify-between ${
                      active
                        ? 'border-emerald-500 bg-emerald-950/80 text-white shadow-lg ring-1 ring-emerald-500/50'
                        : 'border-stone-800 hover:border-emerald-500/40 bg-stone-950/50 text-stone-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          {p.badge}
                        </span>
                        {active && <Check className="w-5 h-5 text-emerald-400" />}
                      </div>
                      <h4 className="font-extrabold text-white text-base">{p.title}</h4>
                      <p className="text-xs text-stone-400 mt-1 leading-relaxed">{p.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Duration Selector */}
          <div>
            <h3 className="text-base font-extrabold text-white mb-1">Select Subscription Duration</h3>
            <p className="text-xs text-stone-400 mb-4">Choose 3 Days (Min Trial), 7 Days, 20 Days, or 30 Days (22% Package Savings)</p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { days: 3, label: '3 Days (Min Trial)', discount: 'Trial Tier' },
                { days: 7, label: '7 Days Plan', discount: '8% OFF' },
                { days: 20, label: '20 Days Plan', discount: '15% OFF' },
                { days: 30, label: '30 Days Plan', discount: '22% OFF' },
              ].map((item) => {
                const active = durationDays === item.days;
                return (
                  <button
                    key={item.days}
                    type="button"
                    onClick={() => setDurationDays(item.days)}
                    className={`p-4 rounded-2xl text-center border transition-all ${
                      active
                        ? 'border-emerald-500 bg-emerald-500 text-stone-950 font-black shadow-lg'
                        : 'border-stone-800 bg-stone-950 text-stone-300 hover:bg-stone-800'
                    }`}
                  >
                    <div className="text-base font-black">{item.days} Days</div>
                    <div className={`text-[10px] font-extrabold mt-0.5 ${active ? 'text-stone-950' : 'text-emerald-400'}`}>
                      {item.discount}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              onClick={() => setStep(2)}
              className="bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black px-6 py-3 rounded-xl text-sm transition-all shadow-lg flex items-center gap-2 hover:scale-105"
            >
              <span>Next: Food & Grain Preferences</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Food & Grain Preferences */}
      {step === 2 && (
        <div className="space-y-6 bg-stone-900 p-6 sm:p-8 rounded-3xl border border-stone-800 shadow-xl">
          {/* Dietary Type */}
          <div>
            <h3 className="text-base font-extrabold text-white mb-2">Dietary Classification</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { id: 'non-veg', label: 'Non-Vegetarian', icon: '🍗' },
                { id: 'veg', label: 'Vegetarian', icon: '🥦' },
                { id: 'egg', label: 'Eggitarian', icon: '🥚' },
                { id: 'vegan', label: 'Pure Vegan', icon: '🌱' },
                { id: 'keto', label: 'Keto (Low-Carb)', icon: '🥑' },
                { id: 'high-protein', label: 'High-Protein', icon: '🥩' },
              ].map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDietaryPreference(d.id as DietaryPreference)}
                  className={`p-3.5 rounded-2xl border text-left font-bold text-xs flex items-center gap-2 transition-all ${
                    dietaryPreference === d.id
                      ? 'bg-emerald-500 text-stone-950 font-black border-emerald-500 shadow-md'
                      : 'bg-stone-950 text-stone-300 border-stone-800 hover:bg-stone-800'
                  }`}
                >
                  <span className="text-lg">{d.icon}</span>
                  <span>{d.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Grain & Flour Preference per menu material */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-stone-300 mb-1.5">Grain / Rice Preference</label>
              <select
                value={grainPreference}
                onChange={(e) => setGrainPreference(e.target.value)}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-sm font-semibold text-white outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="Kerala Matta Rice">Kerala Matta Rice (Low GI, Fiber-rich)</option>
                <option value="Basmati Rice">Aromatic Basmati Rice</option>
                <option value="Organic Quinoa">Organic Quinoa Bowl Base</option>
                <option value="Ragi / Millet">Ragi & Finger Millet Base</option>
                <option value="Mixed Rotation">Dietician Mixed Rotation</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-300 mb-1.5">Spice Level Preference</label>
              <select
                value={spiceLevel}
                onChange={(e) => setSpiceLevel(e.target.value as any)}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-sm font-semibold text-white outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="Mild">Mild (Low Chili, Herbal Infusions)</option>
                <option value="Medium">Medium (Balanced Authentic Kerala/Continental)</option>
                <option value="Spicy">Spicy (Kerala Pepper & Red Chili Roast)</option>
              </select>
            </div>
          </div>

          {/* Add-on Slots Selector */}
          <div>
            <h3 className="text-base font-extrabold text-white mb-1">Attach Add-ons to Designated Time Slots</h3>
            <p className="text-xs text-stone-400 mb-3">Attach fresh salads, cold-pressed juices, or protein snacks (₹99 / slot / day)</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                '11:00 AM Morning Snack/Salad',
                '4:00 PM Afternoon Snack/Salad',
                '11:00 PM Late-Night Protein Snack'
              ].map((slot) => {
                const active = addonSlots.includes(slot);
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => toggleAddonSlot(slot)}
                    className={`p-3 rounded-2xl border text-left font-bold text-xs flex items-center justify-between transition-all ${
                      active
                        ? 'bg-emerald-500 text-stone-950 font-black border-emerald-500 shadow-md'
                        : 'bg-stone-950 text-stone-300 border-stone-800 hover:bg-stone-800'
                    }`}
                  >
                    <span>{slot}</span>
                    {active && <Check className="w-4 h-4 text-stone-950" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Category Shortlist */}
          <div>
            <h3 className="text-base font-extrabold text-white mb-1">Shortlist Preferred Recipe Categories</h3>
            <p className="text-xs text-stone-400 mb-3">Select categories you'd love to see in your daily rotation</p>

            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 border border-stone-800 rounded-2xl bg-stone-950">
              {availableCategories.map((cat) => {
                const selected = selectedCategories.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                      selected
                        ? 'bg-emerald-500 text-stone-950 font-black border-emerald-500 shadow-xs'
                        : 'bg-stone-900 text-stone-300 border-stone-800 hover:bg-stone-800'
                    }`}
                  >
                    {selected && '✓ '} {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Allergies and Special Notes */}
          <div>
            <label className="block text-xs font-bold text-stone-300 mb-1">Special Instructions & Exclusions</label>
            <textarea
              rows={2}
              value={allergiesExclusions}
              onChange={(e) => setAllergiesExclusions(e.target.value)}
              placeholder="e.g. Peanut allergy, extra lemon, low sodium..."
              className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex justify-between pt-4">
            <button
              onClick={() => setStep(1)}
              className="bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold px-5 py-2.5 rounded-xl text-sm"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              className="bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black px-6 py-3 rounded-xl text-sm transition-all shadow-lg flex items-center gap-2 hover:scale-105"
            >
              <span>Next: Review & Submit</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Final Review & Submit Request */}
      {step === 3 && (
        <div className="space-y-6 bg-stone-900 p-6 sm:p-8 rounded-3xl border border-stone-800 shadow-xl">
          <div className="bg-emerald-950/80 border border-emerald-500/40 rounded-2xl p-5 flex items-start gap-3">
            <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-extrabold text-white text-base">Send Request to Dietician Team</h4>
              <p className="text-xs text-stone-300 mt-1 leading-relaxed">
                Once submitted, our Chief Nutritionist will review your BMI ({profile.bmi}), goal ({profile.goal}), macro target ({profile.targetCalories} kcal), and chosen preferences to assemble a day-by-day customized plan. You will receive the plan in your login for review & approval before paying!
              </p>
            </div>
          </div>

          {/* MD Cost Engine Price Calculation Summary Box */}
          <div className="bg-gradient-to-br from-emerald-950 to-emerald-900 text-white rounded-2xl p-5 border border-emerald-500/40 space-y-3">
            <div className="flex items-center justify-between border-b border-emerald-800/80 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-amber-400" /> MD Cost Engine Auto-Calculated Package Pricing
              </span>
              <span className="text-[10px] bg-amber-400/20 text-amber-300 font-extrabold px-2.5 py-0.5 rounded-full border border-amber-400/30">
                {pricing.discountPercentage}% Savings Applied
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-emerald-300 text-[10px] uppercase font-bold block">Base Daily Cost</span>
                <strong className="text-white text-sm">₹{pricing.dailyBaseCost} / day</strong>
              </div>
              <div>
                <span className="text-emerald-300 text-[10px] uppercase font-bold block">Add-ons ({addonSlots.length})</span>
                <strong className="text-white text-sm">₹{pricing.dailyAddonCost} / day</strong>
              </div>
              <div>
                <span className="text-emerald-300 text-[10px] uppercase font-bold block">Package Discount</span>
                <strong className="text-amber-300 text-sm">-₹{pricing.discountAmount.toLocaleString()}</strong>
              </div>
              <div>
                <span className="text-emerald-300 text-[10px] uppercase font-bold block">Estimated Total</span>
                <strong className="text-amber-300 text-lg font-black">₹{pricing.totalPayable.toLocaleString()}</strong>
              </div>
            </div>
          </div>

          {/* Summary Box */}
          <div className="bg-stone-950 rounded-2xl p-5 border border-stone-800 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400">Subscription Request Overview</h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-stone-400 text-xs block">Client Name</span>
                <strong className="text-white">{profile.name}</strong>
              </div>
              <div>
                <span className="text-stone-400 text-xs block">Plan Type</span>
                <strong className="text-white capitalize">{planType} Plan</strong>
              </div>
              <div>
                <span className="text-stone-400 text-xs block">Duration</span>
                <strong className="text-white">{durationDays} Days</strong>
              </div>
              <div>
                <span className="text-stone-400 text-xs block">Target Calories</span>
                <strong className="text-emerald-400 font-black">{profile.targetCalories} kcal / day</strong>
              </div>
            </div>

            <div className="border-t border-stone-800 pt-3 text-xs text-stone-300 space-y-1">
              <div><strong>Preferences:</strong> {dietaryPreference.toUpperCase()} • {grainPreference} • {spiceLevel} Spice</div>
              <div><strong>Add-on Slots:</strong> {addonSlots.length > 0 ? addonSlots.join(', ') : 'None'}</div>
              <div><strong>Selected Categories:</strong> {selectedCategories.join(', ')}</div>
              <div><strong>Notes/Exclusions:</strong> {allergiesExclusions}</div>
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <button
              onClick={() => setStep(2)}
              className="bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold px-5 py-2.5 rounded-xl text-sm"
            >
              Back
            </button>
            <button
              onClick={handleFinalSubmit}
              className="bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black px-8 py-3.5 rounded-xl text-base transition-all shadow-lg flex items-center gap-2 hover:scale-105"
            >
              <span>Submit Request to Dietician</span>
              <Sparkles className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
