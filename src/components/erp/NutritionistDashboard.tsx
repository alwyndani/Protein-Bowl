import React, { useState } from 'react';
import { DietPlanRequest, RecipeItem, DayPlan, DayMealSlot, MealSlotItem, CustomerProfile } from '../../types';
import { ALL_RECIPES } from '../../data/recipeDatabase';
import { 
  Stethoscope, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  User, 
  Calendar, 
  Plus, 
  Trash2, 
  Send, 
  HeartPulse, 
  Scale, 
  Flame, 
  RefreshCw,
  Clock,
  Table,
  FileText,
  Activity,
  Droplets,
  Dumbbell,
  Pill,
  AlertCircle,
  Copy,
  Edit3,
  Check,
  ShieldAlert,
  Search,
  ChevronRight,
  ChevronDown,
  Info,
  Utensils,
  Moon,
  MessageSquare,
  Sparkle
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface NutritionistDashboardProps {
  requests: DietPlanRequest[];
  customerProfile?: CustomerProfile;
  onUpdatePlan: (updatedReq: DietPlanRequest) => void;
  onOpenMenuModal: (recipe: RecipeItem) => void;
}

// 5 Meal Timings definition
export const FIVE_MEAL_TIMINGS = [
  { key: 'breakfast', label: '08:00 AM - Breakfast', icon: '🌅', defaultCat: 'Breakfast' },
  { key: 'morning_snack', label: '11:00 AM - Morning Snack', icon: '🍎', defaultCat: 'Yogurt Bowls' },
  { key: 'lunch', label: '01:30 PM - Lunch', icon: '🥗', defaultCat: 'Kerala Lunch' },
  { key: 'evening_snack', label: '05:00 PM - Evening Snack', icon: '🥜', defaultCat: 'Desserts & Snacks' },
  { key: 'dinner', label: '08:30 PM - Dinner', icon: '🍲', defaultCat: 'Salads' },
] as const;

// 7 Days Monday to Sunday definition
export const SEVEN_DAYS = [
  { dayNumber: 1, dayName: 'Monday', short: 'Mon' },
  { dayNumber: 2, dayName: 'Tuesday', short: 'Tue' },
  { dayNumber: 3, dayName: 'Wednesday', short: 'Wed' },
  { dayNumber: 4, dayName: 'Thursday', short: 'Thu' },
  { dayNumber: 5, dayName: 'Friday', short: 'Fri' },
  { dayNumber: 6, dayName: 'Saturday', short: 'Sat' },
  { dayNumber: 7, dayName: 'Sunday', short: 'Sun' },
] as const;

const RECIPE_MAP = new Map(ALL_RECIPES.map((r) => [r.id, r]));

// Helper to generate clean multi-item 7-day Monday to Sunday plan
export function generateInitial7DayPlan(): DayPlan[] {
  const defaultTimingRecipes: Record<string, string[][]> = {
    breakfast: [
      ['eg-3', 'ob-1'], // Monday: Spinach Omelette + Oats
      ['eg-1', 'ob-2'], // Tuesday: Scrambled Eggs + Berry Parfait
      ['ob-1', 'yo-12'],// Wednesday
      ['eg-3', 'ob-2'], // Thursday
      ['eg-1', 'ob-1'], // Friday
      ['ob-2', 'yo-12'],// Saturday
      ['eg-3', 'ob-1']  // Sunday
    ],
    morning_snack: [
      ['yo-12'], ['yo-1'], ['yo-2'], ['yo-12'], ['yo-1'], ['yo-2'], ['yo-12']
    ],
    lunch: [
      ['kl-2', 'sl-6'], // Monday: Kerala Matta Rice + Greek Salad
      ['qb-1', 'cg-1'], // Tuesday: Quinoa Bowl + Chicken Grill
      ['cg-1', 'sl-2'], // Wednesday
      ['kl-2', 'cg-1'], // Thursday
      ['qb-1', 'sl-6'], // Friday
      ['kl-2', 'cg-1'], // Saturday
      ['qb-1', 'sl-2']  // Sunday
    ],
    evening_snack: [
      ['ds-10'], ['ds-1'], ['yo-12'], ['ds-10'], ['ds-1'], ['yo-12'], ['ds-10']
    ],
    dinner: [
      ['sl-6', 'cg-1'], ['cg-1', 'sl-2'], ['sl-6', 'ds-10'], ['sl-2', 'cg-1'], ['sl-6', 'cg-1'], ['cg-1', 'sl-2'], ['sl-6', 'cg-1']
    ]
  };

  return SEVEN_DAYS.map((dayObj, dayIdx) => {
    const meals: DayMealSlot[] = FIVE_MEAL_TIMINGS.map((timing) => {
      const recipeIds = defaultTimingRecipes[timing.key]?.[dayIdx] || ['cg-1'];
      
      const items: MealSlotItem[] = recipeIds.map((rId, itemIdx) => {
        const recipe = RECIPE_MAP.get(rId) || ALL_RECIPES[0];
        const portionGrams = recipe.servingGrams || 200;
        return {
          id: `item-${dayObj.dayNumber}-${timing.key}-${itemIdx}-${Math.random().toString(36).substr(2, 4)}`,
          recipeId: recipe.id,
          recipeName: recipe.name,
          portionSize: `${portionGrams}g (1 Portion)`,
          portionGrams: portionGrams,
          calories: recipe.calories,
          protein: recipe.protein,
          carbs: recipe.carbs,
          fat: recipe.fat,
          customizationNote: itemIdx === 0 ? 'Customized for patient: Low oil, extra herbs.' : ''
        };
      });

      let defaultRemarks = '';
      if (timing.key === 'breakfast') {
        defaultRemarks = 'Drink 1 glass of warm lemon chia water 15 minutes before breakfast.';
      } else if (timing.key === 'morning_snack') {
        defaultRemarks = 'Chew slowly; stay hydrated.';
      } else if (timing.key === 'lunch') {
        defaultRemarks = 'Take 10-minute slow walk post-lunch.';
      } else if (timing.key === 'evening_snack') {
        defaultRemarks = 'Green tea or herbal infusion with no added refined sugar.';
      } else if (timing.key === 'dinner') {
        defaultRemarks = 'Finish dinner at least 2.5 hours before bedtime.';
      }

      return {
        mealType: timing.key,
        timingLabel: timing.label,
        items,
        slotRemarks: defaultRemarks
      };
    });

    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;

    meals.forEach((slot) => {
      slot.items?.forEach((item) => {
        totalCalories += item.calories || 0;
        totalProtein += item.protein || 0;
        totalCarbs += item.carbs || 0;
        totalFat += item.fat || 0;
      });
    });

    return {
      dayNumber: dayObj.dayNumber,
      dayName: dayObj.dayName,
      meals,
      totalCalories,
      totalProtein: Math.round(totalProtein),
      totalCarbs: Math.round(totalCarbs),
      totalFat: Math.round(totalFat)
    };
  });
}

export const NutritionistDashboard: React.FC<NutritionistDashboardProps> = ({
  requests,
  customerProfile,
  onUpdatePlan,
  onOpenMenuModal
}) => {
  const [selectedReqId, setSelectedReqId] = useState<string>(requests[0]?.id || '');
  const activeRequest = requests.find((r) => r.id === selectedReqId) || requests[0];

  // Active expanded day for 7-Day Plan (Monday expanded by default)
  const [expandedDayNumber, setExpandedDayNumber] = useState<number>(1);

  // 7-day Monday to Sunday plan builder state
  const [weeklyPlan, setWeeklyPlan] = useState<DayPlan[]>(() => {
    if (activeRequest?.dayWisePlan && activeRequest.dayWisePlan.length >= 7) {
      // Ensure items array exists on slots for older data structures
      return activeRequest.dayWisePlan.map((d) => ({
        ...d,
        meals: d.meals.map((m) => {
          if (!m.items || m.items.length === 0) {
            const recipe = RECIPE_MAP.get(m.recipeId || '') || ALL_RECIPES[0];
            return {
              ...m,
              items: [{
                id: `item-${d.dayNumber}-${m.mealType}-0`,
                recipeId: recipe.id,
                recipeName: recipe.name,
                portionSize: `${m.customPortionGrams || 200}g`,
                portionGrams: m.customPortionGrams || 200,
                calories: m.calories || recipe.calories,
                protein: m.protein || recipe.protein,
                carbs: m.carbs || recipe.carbs,
                fat: m.fat || recipe.fat,
                customizationNote: 'Patient custom note: Low sodium.'
              }],
              slotRemarks: m.mealType === 'breakfast' ? 'Drink warm water before breakfast' : ''
            };
          }
          return m;
        })
      }));
    }
    return generateInitial7DayPlan();
  });

  // Dietitian comment box input
  const [dieticianNoteInput, setDieticianNoteInput] = useState<string>(
    activeRequest?.dieticianNotes || 'Clinical Summary: PCOS & Metabolic Care. Focus on low-GI carbohydrates, high fiber, and gut-soothing herbal teas.'
  );

  // Modal / Dish Picker state
  const [addingDishTarget, setAddingDishTarget] = useState<{ dayNumber: number; timingKey: string } | null>(null);
  const [recipeSearch, setRecipeSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');

  if (!activeRequest) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center text-stone-500">
        No pending client plan requests in queue.
      </div>
    );
  }

  // Calculate day totals
  const recalculateDayTotals = (day: DayPlan): DayPlan => {
    let cal = 0;
    let p = 0;
    let c = 0;
    let f = 0;

    day.meals.forEach((slot) => {
      slot.items?.forEach((item) => {
        cal += item.calories || 0;
        p += item.protein || 0;
        c += item.carbs || 0;
        f += item.fat || 0;
      });
    });

    return {
      ...day,
      totalCalories: Math.round(cal),
      totalProtein: Math.round(p),
      totalCarbs: Math.round(c),
      totalFat: Math.round(f)
    };
  };

  // Add a new menu item to a timing slot
  const handleAddDishToSlot = (dayNumber: number, timingKey: string, recipe: RecipeItem) => {
    const portionGrams = recipe.servingGrams || 200;
    const newItem: MealSlotItem = {
      id: `item-${dayNumber}-${timingKey}-${Date.now()}`,
      recipeId: recipe.id,
      recipeName: recipe.name,
      portionSize: `${portionGrams}g (1 Portion)`,
      portionGrams: portionGrams,
      calories: recipe.calories,
      protein: recipe.protein,
      carbs: recipe.carbs,
      fat: recipe.fat,
      customizationNote: ''
    };

    const updatedPlan = weeklyPlan.map((d) => {
      if (d.dayNumber === dayNumber) {
        const updatedMeals = d.meals.map((m) => {
          if (m.mealType === timingKey) {
            const currentItems = m.items || [];
            return {
              ...m,
              items: [...currentItems, newItem]
            };
          }
          return m;
        });
        return recalculateDayTotals({ ...d, meals: updatedMeals });
      }
      return d;
    });

    setWeeklyPlan(updatedPlan);
    setAddingDishTarget(null);
  };

  // Remove a dish item from timing slot
  const handleRemoveDishItem = (dayNumber: number, timingKey: string, itemId: string) => {
    const updatedPlan = weeklyPlan.map((d) => {
      if (d.dayNumber === dayNumber) {
        const updatedMeals = d.meals.map((m) => {
          if (m.mealType === timingKey) {
            const filteredItems = (m.items || []).filter((it) => it.id !== itemId);
            return {
              ...m,
              items: filteredItems
            };
          }
          return m;
        });
        return recalculateDayTotals({ ...d, meals: updatedMeals });
      }
      return d;
    });

    setWeeklyPlan(updatedPlan);
  };

  // Change Portion Size (Grams) for an item -> automatically updates macros
  const handleUpdatePortion = (dayNumber: number, timingKey: string, itemId: string, newGrams: number) => {
    const validGrams = Math.max(10, newGrams);
    const updatedPlan = weeklyPlan.map((d) => {
      if (d.dayNumber === dayNumber) {
        const updatedMeals = d.meals.map((m) => {
          if (m.mealType === timingKey) {
            const updatedItems = (m.items || []).map((it) => {
              if (it.id === itemId) {
                const recipe = RECIPE_MAP.get(it.recipeId);
                const baseGrams = recipe?.servingGrams || 200;
                const ratio = validGrams / baseGrams;

                const cal = recipe ? Math.round(recipe.calories * ratio) : Math.round((it.calories / (it.portionGrams || 200)) * validGrams);
                const p = recipe ? Math.round(recipe.protein * ratio) : Math.round((it.protein / (it.portionGrams || 200)) * validGrams);
                const c = recipe ? Math.round(recipe.carbs * ratio) : Math.round((it.carbs / (it.portionGrams || 200)) * validGrams);
                const f = recipe ? Math.round(recipe.fat * ratio) : Math.round((it.fat / (it.portionGrams || 200)) * validGrams);

                return {
                  ...it,
                  portionGrams: validGrams,
                  portionSize: `${validGrams}g (${(validGrams / baseGrams).toFixed(1)} portion)`,
                  calories: cal,
                  protein: p,
                  carbs: c,
                  fat: f
                };
              }
              return it;
            });
            return { ...m, items: updatedItems };
          }
          return m;
        });
        return recalculateDayTotals({ ...d, meals: updatedMeals });
      }
      return d;
    });

    setWeeklyPlan(updatedPlan);
  };

  // Update Customization Note per dish for patient
  const handleUpdateItemCustomization = (dayNumber: number, timingKey: string, itemId: string, note: string) => {
    const updatedPlan = weeklyPlan.map((d) => {
      if (d.dayNumber === dayNumber) {
        const updatedMeals = d.meals.map((m) => {
          if (m.mealType === timingKey) {
            const updatedItems = (m.items || []).map((it) => {
              if (it.id === itemId) {
                return { ...it, customizationNote: note };
              }
              return it;
            });
            return { ...m, items: updatedItems };
          }
          return m;
        });
        return { ...d, meals: updatedMeals };
      }
      return d;
    });

    setWeeklyPlan(updatedPlan);
  };

  // Update Slot Remarks (e.g. after breakfast)
  const handleUpdateSlotRemarks = (dayNumber: number, timingKey: string, remarks: string) => {
    const updatedPlan = weeklyPlan.map((d) => {
      if (d.dayNumber === dayNumber) {
        const updatedMeals = d.meals.map((m) => {
          if (m.mealType === timingKey) {
            return { ...m, slotRemarks: remarks };
          }
          return m;
        });
        return { ...d, meals: updatedMeals };
      }
      return d;
    });

    setWeeklyPlan(updatedPlan);
  };

  // Auto Fill Week
  const handleAutoFillWeek = () => {
    const freshPlan = generateInitial7DayPlan();
    setWeeklyPlan(freshPlan);
    confetti({ particleCount: 50, spread: 60 });
  };

  // Copy Monday plan to Tuesday-Sunday
  const handleCopyMondayToAllDays = () => {
    const mondayPlan = weeklyPlan.find((d) => d.dayNumber === 1);
    if (!mondayPlan) return;

    const clonedPlan = SEVEN_DAYS.map((dayObj) => {
      const clonedMeals = mondayPlan.meals.map((m) => ({
        ...m,
        items: (m.items || []).map((it) => ({ ...it, id: `item-${dayObj.dayNumber}-${m.mealType}-${Math.random().toString(36).substr(2, 4)}` }))
      }));
      return recalculateDayTotals({
        ...mondayPlan,
        dayNumber: dayObj.dayNumber,
        dayName: dayObj.dayName,
        meals: clonedMeals
      });
    });

    setWeeklyPlan(clonedPlan);
    confetti({ particleCount: 40, spread: 50 });
  };

  // Send completed plan to client
  const handleSendToClient = () => {
    confetti({ particleCount: 80, spread: 90 });

    const updatedReq: DietPlanRequest = {
      ...activeRequest,
      status: 'plan_ready',
      dieticianNotes: dieticianNoteInput,
      dayWisePlan: weeklyPlan,
      calculatedPrice: activeRequest.durationDays === 30 ? 14999 : activeRequest.durationDays === 20 ? 9999 : 4499
    };

    onUpdatePlan(updatedReq);
  };

  // Insert Clinical Preset
  const handleInsertPresetComment = (preset: string) => {
    if (dieticianNoteInput.includes(preset)) return;
    setDieticianNoteInput((prev) => (prev ? `${prev}\n• ${preset}` : `• ${preset}`));
  };

  // Helper for lab test badge
  const getLabBadge = (name: string, val?: number, min?: number, max?: number, unit?: string) => {
    if (val === undefined || val === null) return null;
    let isWarning = false;
    let isHigh = false;
    if (min !== undefined && val < min) isWarning = true;
    if (max !== undefined && val > max) {
      isWarning = true;
      isHigh = true;
    }

    return (
      <div className={`p-3 rounded-2xl border flex flex-col justify-between text-xs ${
        isWarning ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50/70 border-emerald-200'
      }`}>
        <span className="text-[10px] uppercase font-extrabold text-stone-500">{name}</span>
        <div className="flex items-baseline justify-between mt-1.5">
          <strong className={`text-base font-black ${isWarning ? 'text-amber-950' : 'text-emerald-950'}`}>
            {val} <span className="text-[10px] font-medium text-stone-500">{unit}</span>
          </strong>
          <span className={`text-[9px] px-2 py-0.5 rounded-md font-bold uppercase ${
            isWarning ? 'bg-amber-200 text-amber-900' : 'bg-emerald-200 text-emerald-900'
          }`}>
            {isWarning ? (isHigh ? 'High' : 'Low') : 'Normal'}
          </span>
        </div>
      </div>
    );
  };

  // Filtered recipes for modal
  const filteredRecipes = ALL_RECIPES.filter((r) => {
    const matchesSearch = r.name.toLowerCase().includes(recipeSearch.toLowerCase()) || r.cuisine.toLowerCase().includes(recipeSearch.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || r.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const allCategories = ['All', ...Array.from(new Set(ALL_RECIPES.map((r) => r.category)))];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8 animate-fadeIn">
      
      {/* Top Title Banner */}
      <div className="bg-gradient-to-r from-teal-950 via-emerald-900 to-teal-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-teal-300 bg-teal-900/60 px-3 py-1 rounded-full border border-teal-700/50">
              <Stethoscope className="w-4 h-4 text-teal-400" /> Clinical Dietitian Portal
            </span>
            <h1 className="text-2xl sm:text-4xl font-black mt-2">
              Dietitian Customization & Patient Workspace
            </h1>
            <p className="text-xs sm:text-sm text-teal-100 mt-1">
              Complete patient medical parameter review, 7-day (Monday-Sunday) 5-timing customizable diet builder with multiple dishes & patient notes.
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/20 text-center shrink-0">
            <span className="text-[10px] text-teal-200 font-bold uppercase block">Pending Clients</span>
            <span className="text-3xl font-black text-white">{requests.length}</span>
            <span className="text-[10px] text-teal-200 block">Active Requests</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Queue (3 cols) + Right Patient Workspace (9 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Client Queue Selector */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">Select Patient ({requests.length})</h3>
            <span className="text-[10px] bg-emerald-100 px-2 py-0.5 rounded text-emerald-800 font-bold">Active</span>
          </div>

          <div className="space-y-3">
            {requests.map((req) => {
              const active = req.id === activeRequest.id;
              const hasAlert = req.allergiesExclusions && (
                req.allergiesExclusions.toLowerCase().includes('pcos') || 
                req.allergiesExclusions.toLowerCase().includes('diabet') || 
                req.allergiesExclusions.toLowerCase().includes('allergy')
              );

              return (
                <div
                  key={req.id}
                  onClick={() => {
                    setSelectedReqId(req.id);
                    if (req.dayWisePlan && req.dayWisePlan.length >= 7) {
                      setWeeklyPlan(req.dayWisePlan);
                    } else {
                      setWeeklyPlan(generateInitial7DayPlan());
                    }
                    if (req.dieticianNotes) {
                      setDieticianNoteInput(req.dieticianNotes);
                    }
                  }}
                  className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                    active
                      ? 'border-teal-600 bg-teal-50/80 shadow-md ring-2 ring-teal-500/20'
                      : 'border-stone-200 bg-white hover:border-teal-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-stone-900">{req.customerName}</span>
                    <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded uppercase ${
                      req.status === 'plan_ready' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {req.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="text-xs text-stone-600 mt-1">
                    Goal: <strong className="capitalize text-stone-900">{req.goal.replace('_', ' ')}</strong> • <strong className="text-teal-800">{req.targetCalories} kcal</strong>
                  </div>

                  {hasAlert && (
                    <div className="mt-2 text-[10px] font-bold text-amber-900 bg-amber-100 p-1.5 rounded-xl flex items-center gap-1 border border-amber-200">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      <span className="truncate">Clinical / Medical Condition Flagged</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Full Patient Workspace */}
        <div className="lg:col-span-9 space-y-8">

          {/* Active Patient Header Bar */}
          <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-stone-100">
              <div className="flex items-center gap-3.5">
                <div className="w-14 h-14 bg-teal-100 text-teal-900 rounded-2xl flex items-center justify-center font-black text-2xl border border-teal-200">
                  {activeRequest.customerName.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-extrabold text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                      Patient Health Record
                    </span>
                    <span className="text-[10px] font-mono bg-stone-100 px-2 py-0.5 rounded text-stone-600">{activeRequest.id}</span>
                  </div>
                  <h2 className="text-2xl font-black text-stone-900 mt-0.5">{activeRequest.customerName}</h2>
                  <p className="text-xs text-stone-500 font-medium">
                    {activeRequest.customerEmail} • {activeRequest.customerPhone}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="bg-stone-50 p-3 rounded-2xl border border-stone-200 text-center min-w-[120px]">
                  <span className="text-[10px] font-bold text-stone-400 uppercase block">Calorie Target</span>
                  <span className="text-xl font-black text-teal-900">{activeRequest.targetCalories} kcal</span>
                </div>

                <div className="bg-stone-50 p-3 rounded-2xl border border-stone-200 text-center min-w-[100px]">
                  <span className="text-[10px] font-bold text-stone-400 uppercase block">Duration</span>
                  <span className="text-xl font-black text-stone-900">{activeRequest.durationDays} Days</span>
                </div>
              </div>
            </div>

            {/* Quick Preference Summary Bar */}
            <div className="text-xs text-stone-800 bg-stone-50/80 p-3.5 rounded-2xl border border-stone-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <strong>Dietary Type:</strong> <span className="uppercase font-extrabold text-emerald-800">{activeRequest.dietaryPreference}</span> • Grain: <strong>{activeRequest.grainPreference}</strong> • Spice: <strong>{activeRequest.spiceLevel}</strong>
              </div>
              <div className="text-amber-950 bg-amber-100/80 px-3 py-1 rounded-xl border border-amber-300 font-bold flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-700" />
                <span>Allergies/Exclusions: {activeRequest.allergiesExclusions || 'None reported'}</span>
              </div>
            </div>
          </div>


          {/* SECTION 1: CUSTOMER HEALTH & PARAMETERS DASHBOARD (MUST COME FIRST) */}
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-2 border-b-2 border-teal-800">
              <h2 className="text-lg font-black text-stone-900 uppercase tracking-wide flex items-center gap-2">
                <HeartPulse className="w-6 h-6 text-rose-600" />
                <span>1. Customer Health & Clinical Parameters</span>
              </h2>
              <span className="text-xs font-bold text-teal-800 bg-teal-100 px-3 py-1 rounded-full">
                Reflected from Customer Module
              </span>
            </div>

            {/* Medical Caution Banner */}
            {activeRequest.allergiesExclusions && (
              <div className="bg-amber-50 rounded-3xl p-5 border-2 border-amber-300 flex items-start gap-3.5 shadow-xs">
                <ShieldAlert className="w-6 h-6 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-black text-amber-950 uppercase tracking-wider">Clinical Medical / Allergy Caution</h4>
                  <p className="text-xs text-amber-900 mt-1 font-medium leading-relaxed">
                    Patient has reported: <strong>{activeRequest.allergiesExclusions}</strong>. Ensure low sodium, non-allergenic ingredients, and proper portion control.
                  </p>
                </div>
              </div>
            )}

            {/* 1A. Body Composition & Metabolic Parameters */}
            <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs space-y-4">
              <h3 className="text-sm font-black text-stone-900 uppercase tracking-wider flex items-center gap-2 border-b border-stone-100 pb-3">
                <Scale className="w-4.5 h-4.5 text-teal-800" />
                <span>Body Composition & Metabolic Rate Parameters</span>
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-center">
                <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-200">
                  <span className="text-[10px] text-stone-400 font-bold uppercase block">Height</span>
                  <strong className="text-base font-black text-stone-900">{customerProfile?.heightCm || 165} cm</strong>
                </div>

                <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-200">
                  <span className="text-[10px] text-stone-400 font-bold uppercase block">Current Weight</span>
                  <strong className="text-base font-black text-stone-900">{customerProfile?.weightKg || 68} kg</strong>
                </div>

                <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-200">
                  <span className="text-[10px] text-stone-400 font-bold uppercase block">Target Weight</span>
                  <strong className="text-base font-black text-teal-900">{customerProfile?.targetWeightKg || 58} kg</strong>
                </div>

                <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-200">
                  <span className="text-[10px] text-stone-400 font-bold uppercase block">BMI Score</span>
                  <strong className="text-base font-black text-amber-900">{activeRequest.bmi || 25.0}</strong>
                  <span className="text-[9px] block text-stone-500 font-bold">{customerProfile?.bmiCategory || 'Overweight'}</span>
                </div>

                <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-200">
                  <span className="text-[10px] text-stone-400 font-bold uppercase block">BMR Rate</span>
                  <strong className="text-base font-black text-stone-900">{customerProfile?.bmr || 1420} kcal</strong>
                </div>

                <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-200">
                  <span className="text-[10px] text-stone-400 font-bold uppercase block">Maintenance TDEE</span>
                  <strong className="text-base font-black text-stone-900">{customerProfile?.maintenanceCalories || 2200} kcal</strong>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs">
                <div className="bg-teal-50 p-4 rounded-2xl border border-teal-200 flex justify-between items-center">
                  <div>
                    <span className="text-[10px] text-teal-800 font-bold uppercase block">Target Calorie Deficit</span>
                    <strong className="text-base font-black text-teal-950">{activeRequest.targetCalories} kcal/day</strong>
                  </div>
                  <span className="text-xs font-bold text-teal-900 bg-teal-200/90 px-2.5 py-1 rounded-xl">
                    {customerProfile?.calorieDeficitSurplus || -500} kcal Deficit
                  </span>
                </div>

                <div className="bg-blue-50 p-4 rounded-2xl border border-blue-200 flex justify-between items-center">
                  <div>
                    <span className="text-[10px] text-blue-800 font-bold uppercase block">Daily Water Requirement</span>
                    <strong className="text-base font-black text-blue-950">{customerProfile?.waterRequirementL || 3.0} Liters</strong>
                  </div>
                  <Droplets className="w-5 h-5 text-blue-600" />
                </div>

                <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200 flex justify-between items-center">
                  <div>
                    <span className="text-[10px] text-emerald-800 font-bold uppercase block">Ideal Body Weight</span>
                    <strong className="text-base font-black text-emerald-950">{customerProfile?.idealBodyWeightKg || 56.8} kg</strong>
                  </div>
                  <span className="text-xs font-bold text-emerald-800 bg-emerald-200/80 px-2 py-1 rounded-xl">
                    Lean: {customerProfile?.leanBodyMassKg || 49.5}kg
                  </span>
                </div>
              </div>
            </div>

            {/* 1B. Body Circumferences & Limb Measurements */}
            <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs space-y-4">
              <h3 className="text-sm font-black text-stone-900 uppercase tracking-wider flex items-center gap-2 border-b border-stone-100 pb-3">
                <Activity className="w-4.5 h-4.5 text-teal-800" />
                <span>Body Circumferences & Limb Measurements</span>
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200">
                  <span className="text-[10px] text-stone-400 font-bold uppercase block">Waist</span>
                  <strong className="text-base font-black text-stone-900">{customerProfile?.circumferences?.waistCm || 81} cm</strong>
                </div>

                <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200">
                  <span className="text-[10px] text-stone-400 font-bold uppercase block">Hip</span>
                  <strong className="text-base font-black text-stone-900">{customerProfile?.circumferences?.hipCm || 98} cm</strong>
                </div>

                <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200">
                  <span className="text-[10px] text-stone-400 font-bold uppercase block">Chest</span>
                  <strong className="text-base font-black text-stone-900">{customerProfile?.circumferences?.chestCm || 88} cm</strong>
                </div>

                <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200">
                  <span className="text-[10px] text-stone-400 font-bold uppercase block">Neck</span>
                  <strong className="text-base font-black text-stone-900">{customerProfile?.circumferences?.neckCm || 34} cm</strong>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs">
                <div className="p-3 bg-stone-50/80 rounded-2xl border border-stone-200">
                  <span className="text-[10px] text-stone-400 font-bold uppercase block">Arm Circumference</span>
                  <span className="font-bold text-stone-800">L: {customerProfile?.limbCircumferences?.leftArmCm || 28} cm • R: {customerProfile?.limbCircumferences?.rightArmCm || 28.5} cm</span>
                </div>

                <div className="p-3 bg-stone-50/80 rounded-2xl border border-stone-200">
                  <span className="text-[10px] text-stone-400 font-bold uppercase block">Thigh Circumference</span>
                  <span className="font-bold text-stone-800">L: {customerProfile?.limbCircumferences?.leftThighCm || 56} cm • R: {customerProfile?.limbCircumferences?.rightThighCm || 56.5} cm</span>
                </div>

                <div className="p-3 bg-stone-50/80 rounded-2xl border border-stone-200">
                  <span className="text-[10px] text-stone-400 font-bold uppercase block">Calf Circumference</span>
                  <span className="font-bold text-stone-800">L: {customerProfile?.limbCircumferences?.leftCalfCm || 36} cm • R: {customerProfile?.limbCircumferences?.rightCalfCm || 36} cm</span>
                </div>
              </div>
            </div>

            {/* 1C. Blood Test Lab Results & Medical Conditions */}
            <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs space-y-4">
              <h3 className="text-sm font-black text-stone-900 uppercase tracking-wider flex items-center gap-2 border-b border-stone-100 pb-3">
                <Pill className="w-4.5 h-4.5 text-teal-800" />
                <span>Clinical Blood Test Results & Medical Conditions</span>
              </h3>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200">
                    <span className="text-[10px] text-amber-800 font-bold uppercase block">Medical Conditions</span>
                    <strong className="text-xs text-amber-950 font-black">
                      {customerProfile?.medicalConditions?.join(', ') || 'PCOS, Insulin Resistance'}
                    </strong>
                  </div>

                  <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200">
                    <span className="text-[10px] text-stone-400 font-bold uppercase block">Medications</span>
                    <strong className="text-xs text-stone-900 font-medium">
                      {customerProfile?.currentMedications || 'Metformin 500mg daily'}
                    </strong>
                  </div>

                  <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200">
                    <span className="text-[10px] text-stone-400 font-bold uppercase block">Supplements</span>
                    <strong className="text-xs text-stone-900 font-medium">
                      {customerProfile?.supplements?.join(', ') || 'Multivitamin, Omega-3, Vitamin D3'}
                    </strong>
                  </div>
                </div>

                <h4 className="text-xs font-bold uppercase text-stone-600 pt-1">Blood Test Panel (Lab Values)</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {getLabBadge('Fasting Sugar', customerProfile?.bloodTestResults?.fastingBloodSugar || 98, 70, 100, 'mg/dL')}
                  {getLabBadge('HbA1c', customerProfile?.bloodTestResults?.hbA1c || 5.6, 4.0, 5.7, '%')}
                  {getLabBadge('Total Cholesterol', customerProfile?.bloodTestResults?.totalCholesterol || 185, 120, 200, 'mg/dL')}
                  {getLabBadge('HDL', customerProfile?.bloodTestResults?.hdl || 52, 40, 60, 'mg/dL')}
                  {getLabBadge('LDL', customerProfile?.bloodTestResults?.ldl || 110, 50, 130, 'mg/dL')}
                  {getLabBadge('Triglycerides', customerProfile?.bloodTestResults?.triglycerides || 115, 50, 150, 'mg/dL')}
                  {getLabBadge('Hemoglobin', customerProfile?.bloodTestResults?.hemoglobin || 13.2, 12.0, 16.0, 'g/dL')}
                  {getLabBadge('Vitamin D', customerProfile?.bloodTestResults?.vitaminD || 24, 30, 100, 'ng/mL')}
                  {getLabBadge('Vitamin B12', customerProfile?.bloodTestResults?.vitaminB12 || 310, 200, 900, 'pg/mL')}
                  {getLabBadge('TSH Thyroid', customerProfile?.bloodTestResults?.tsh || 2.4, 0.4, 4.0, 'mIU/L')}
                </div>
              </div>
            </div>
          </div>


          {/* SECTION 2: 7-DAY DIET PLAN (MONDAY TO SUNDAY) - CLEAN VERTICAL TIMINGS LAYOUT */}
          <div className="space-y-6 pt-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b-2 border-teal-800">
              <div>
                <h2 className="text-lg font-black text-stone-900 uppercase tracking-wide flex items-center gap-2">
                  <Calendar className="w-6 h-6 text-teal-800" />
                  <span>2. 7-Day Customized Diet Plan (Monday to Sunday)</span>
                </h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  5 Meal Timings stacked vertically for each day. Support 2-3 dishes per timing slot, automatic portion size values, patient customization notes & timing remarks.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleAutoFillWeek}
                  className="px-3.5 py-2 bg-teal-100 hover:bg-teal-200 text-teal-950 font-bold text-xs rounded-xl border border-teal-300 flex items-center gap-1.5 transition-all shadow-xs"
                >
                  <Sparkles className="w-3.5 h-3.5 text-teal-800" />
                  <span>Auto-Balance 7 Days</span>
                </button>

                <button
                  onClick={handleCopyMondayToAllDays}
                  className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs rounded-xl border border-stone-300 flex items-center gap-1.5 transition-all"
                >
                  <Copy className="w-3.5 h-3.5 text-stone-600" />
                  <span>Copy Monday to All</span>
                </button>
              </div>
            </div>

            {/* Day Selector Tabs (Monday through Sunday) */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
              {SEVEN_DAYS.map((dayObj) => {
                const dayPlan = weeklyPlan.find((d) => d.dayNumber === dayObj.dayNumber);
                const isSelected = expandedDayNumber === dayObj.dayNumber;
                const cal = dayPlan?.totalCalories || 0;
                const targetCal = activeRequest.targetCalories || 1700;
                const isMatch = Math.abs(cal - targetCal) <= 100;

                return (
                  <button
                    key={dayObj.dayNumber}
                    onClick={() => setExpandedDayNumber(dayObj.dayNumber)}
                    className={`flex-1 min-w-[110px] p-3 rounded-2xl border-2 transition-all text-left flex flex-col justify-between gap-1 ${
                      isSelected
                        ? 'bg-teal-900 text-white border-teal-900 shadow-md ring-2 ring-teal-600/30'
                        : 'bg-white text-stone-800 border-stone-200 hover:border-teal-400'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-black text-sm">{dayObj.dayName}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                        isSelected ? 'bg-teal-800 text-teal-200' : 'bg-stone-100 text-stone-600'
                      }`}>
                        Day {dayObj.dayNumber}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between text-xs mt-1">
                      <strong className={`font-mono font-bold ${isSelected ? 'text-amber-300' : 'text-stone-900'}`}>
                        {cal} kcal
                      </strong>
                      <span className={`text-[9px] font-bold ${
                        isMatch 
                          ? (isSelected ? 'text-emerald-300' : 'text-emerald-700') 
                          : (isSelected ? 'text-amber-300' : 'text-amber-700')
                      }`}>
                        {isMatch ? '✓ Target' : `${cal > targetCal ? '+' : ''}${cal - targetCal}`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Active Selected Day Details (e.g. MONDAY) with 5 Vertical Meal Timings */}
            {(() => {
              const currentDayPlan = weeklyPlan.find((d) => d.dayNumber === expandedDayNumber) || weeklyPlan[0];
              const currentDayObj = SEVEN_DAYS.find((d) => d.dayNumber === expandedDayNumber) || SEVEN_DAYS[0];

              return (
                <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm space-y-6">
                  
                  {/* Day Header Banner */}
                  <div className="bg-stone-900 text-white p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-amber-400 bg-stone-800 px-2.5 py-1 rounded-lg">
                          Day {currentDayPlan.dayNumber} Schedule
                        </span>
                        <h3 className="text-xl font-black">{currentDayObj.dayName} Diet Plan</h3>
                      </div>
                      <p className="text-xs text-stone-400 mt-1">
                        5 Meal Timings stacked downwards. Add 2-3 menu items per timing with custom portion sizes and patient notes.
                      </p>
                    </div>

                    <div className="flex items-center gap-4 bg-stone-800 px-4 py-2.5 rounded-xl border border-stone-700">
                      <div>
                        <span className="text-[10px] text-stone-400 font-bold uppercase block">Day Total Calories</span>
                        <strong className="text-lg font-black text-amber-400 font-mono">{currentDayPlan.totalCalories} kcal</strong>
                      </div>
                      <div className="text-xs text-stone-300 border-l border-stone-700 pl-4 space-y-0.5">
                        <div>Protein: <strong className="text-white">{currentDayPlan.totalProtein}g</strong></div>
                        <div>Carbs: <strong className="text-white">{currentDayPlan.totalCarbs}g</strong></div>
                        <div>Fat: <strong className="text-white">{currentDayPlan.totalFat}g</strong></div>
                      </div>
                    </div>
                  </div>

                  {/* 5 VERTICAL MEAL TIMINGS (Breakfast, Morning Snack, Lunch, Evening Snack, Dinner) */}
                  <div className="space-y-6">
                    {FIVE_MEAL_TIMINGS.map((timing) => {
                      const mealSlot = currentDayPlan.meals.find((m) => m.mealType === timing.key) || {
                        mealType: timing.key,
                        timingLabel: timing.label,
                        items: [],
                        slotRemarks: ''
                      };

                      const slotItems = mealSlot.items || [];
                      let slotTotalCal = 0;
                      let slotTotalP = 0;
                      let slotTotalC = 0;
                      let slotTotalF = 0;

                      slotItems.forEach((it) => {
                        slotTotalCal += it.calories || 0;
                        slotTotalP += it.protein || 0;
                        slotTotalC += it.carbs || 0;
                        slotTotalF += it.fat || 0;
                      });

                      return (
                        <div 
                          key={timing.key}
                          className="bg-stone-50/70 rounded-2xl p-5 border border-stone-200/90 hover:border-teal-300 transition-all space-y-4"
                        >
                          {/* Timing Slot Header */}
                          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-stone-200">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl p-2 bg-white rounded-xl shadow-2xs border border-stone-200">{timing.icon}</span>
                              <div>
                                <h4 className="font-black text-stone-900 text-base flex items-center gap-2">
                                  <span>{timing.label}</span>
                                  <span className="text-[10px] font-bold bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full">
                                    {slotItems.length} {slotItems.length === 1 ? 'Menu Item' : 'Menu Items'}
                                  </span>
                                </h4>
                                <span className="text-xs text-stone-500 font-medium">Recommended timing for patient intake</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <span className="text-xs font-black text-emerald-900 font-mono">{slotTotalCal} kcal</span>
                                <div className="text-[10px] text-stone-500 font-medium">
                                  P:{slotTotalP}g • C:{slotTotalC}g • F:{slotTotalF}g
                                </div>
                              </div>

                              <button
                                onClick={() => setAddingDishTarget({ dayNumber: currentDayPlan.dayNumber, timingKey: timing.key })}
                                className="px-3 py-1.5 bg-teal-800 hover:bg-teal-900 text-white font-bold text-xs rounded-xl flex items-center gap-1 transition-all shadow-2xs"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Add Menu Dish</span>
                              </button>
                            </div>
                          </div>

                          {/* List of 2-3 Menus loaded in this timing slot */}
                          {slotItems.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {slotItems.map((item, idx) => {
                                const recipe = RECIPE_MAP.get(item.recipeId);

                                return (
                                  <div 
                                    key={item.id}
                                    className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs space-y-3 flex flex-col justify-between"
                                  >
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[9px] font-extrabold uppercase bg-stone-100 text-stone-700 px-2 py-0.5 rounded">
                                          Dish #{idx + 1}
                                        </span>
                                        <button
                                          onClick={() => handleRemoveDishItem(currentDayPlan.dayNumber, timing.key, item.id)}
                                          className="text-stone-400 hover:text-rose-600 p-1 rounded transition-colors"
                                          title="Remove this menu dish"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>

                                      <h5 className="font-extrabold text-stone-900 text-sm leading-snug">
                                        {item.recipeName}
                                      </h5>

                                      {/* Auto-calculated Macro Values Display */}
                                      <div className="grid grid-cols-4 gap-1 bg-teal-50/80 p-2 rounded-xl text-center text-[10px]">
                                        <div>
                                          <span className="text-stone-400 font-bold block">Calories</span>
                                          <strong className="text-emerald-900 font-black">{item.calories} kcal</strong>
                                        </div>
                                        <div>
                                          <span className="text-stone-400 font-bold block">Protein</span>
                                          <strong className="text-stone-800 font-extrabold">{item.protein}g</strong>
                                        </div>
                                        <div>
                                          <span className="text-stone-400 font-bold block">Carbs</span>
                                          <strong className="text-stone-800 font-extrabold">{item.carbs}g</strong>
                                        </div>
                                        <div>
                                          <span className="text-stone-400 font-bold block">Fat</span>
                                          <strong className="text-stone-800 font-extrabold">{item.fat}g</strong>
                                        </div>
                                      </div>

                                      {/* Portion Size Selector (not quantity) */}
                                      <div className="space-y-1">
                                        <label className="text-[10px] font-bold uppercase text-stone-500 block">
                                          Portion Size (Grams):
                                        </label>
                                        <div className="flex items-center gap-2 bg-stone-50 p-1.5 rounded-xl border border-stone-200">
                                          <input
                                            type="number"
                                            step={10}
                                            value={item.portionGrams}
                                            onChange={(e) => handleUpdatePortion(currentDayPlan.dayNumber, timing.key, item.id, Number(e.target.value))}
                                            className="w-16 font-extrabold text-stone-900 bg-white border border-stone-300 rounded-lg px-2 py-0.5 text-xs text-center outline-none focus:border-teal-600"
                                          />
                                          <span className="text-xs font-bold text-stone-600">grams</span>
                                          <span className="text-[10px] text-stone-400 ml-auto font-mono">
                                            ({((item.portionGrams || 200) / (recipe?.servingGrams || 200)).toFixed(1)} portion)
                                          </span>
                                        </div>
                                      </div>

                                      {/* Customisation Option for this particular menu to this person */}
                                      <div className="space-y-1 pt-1">
                                        <label className="text-[10px] font-bold uppercase text-teal-800 flex items-center gap-1">
                                          <Edit3 className="w-3 h-3 text-teal-700" />
                                          <span>Patient Customization Note:</span>
                                        </label>
                                        <input
                                          type="text"
                                          placeholder="e.g. Less salt for BP, use Stevia, cook soft"
                                          value={item.customizationNote || ''}
                                          onChange={(e) => handleUpdateItemCustomization(currentDayPlan.dayNumber, timing.key, item.id, e.target.value)}
                                          className="w-full text-xs font-medium text-stone-800 bg-amber-50/60 border border-amber-200 rounded-xl px-2.5 py-1.5 outline-none focus:border-amber-400 focus:bg-white"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="p-4 border-2 border-dashed border-stone-200 rounded-2xl text-center text-stone-400 bg-white">
                              No menu dishes loaded for this timing slot yet. Click "Add Menu Dish" above to assign 1 to 3 recipes.
                            </div>
                          )}

                          {/* Remarks Option towards end of timing slot (e.g. after breakfast) */}
                          <div className="bg-white p-3.5 rounded-2xl border border-stone-200/80 space-y-1.5">
                            <label className="text-[11px] font-extrabold text-stone-700 flex items-center gap-1.5 uppercase tracking-wide">
                              <MessageSquare className="w-3.5 h-3.5 text-amber-600" />
                              <span>{timing.label.split('-')[1]} Remarks & Drinking Instructions:</span>
                            </label>
                            <input
                              type="text"
                              placeholder={`e.g. Drink warm water 15 mins before ${timing.label.split('-')[1].toLowerCase()}, avoid sugar.`}
                              value={mealSlot.slotRemarks || ''}
                              onChange={(e) => handleUpdateSlotRemarks(currentDayPlan.dayNumber, timing.key, e.target.value)}
                              className="w-full text-xs font-medium text-stone-800 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 outline-none focus:border-teal-600 focus:bg-white"
                            />
                          </div>

                        </div>
                      );
                    })}
                  </div>

                </div>
              );
            })()}

          </div>


          {/* SECTION 3: DIETITIAN COMMENT BOX & CLINICAL RECOMMENDATIONS */}
          <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <h3 className="text-base font-black text-stone-900 uppercase tracking-wide flex items-center gap-2">
                <FileText className="w-5 h-5 text-teal-800" />
                <span>3. Dietitian Clinical Comment Box & Master Guidance</span>
              </h3>
              <span className="text-xs text-stone-500 font-bold">Appears on Client Dashboard</span>
            </div>

            {/* Quick Presets */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-stone-500 block">Quick Insert Clinical Remarks:</span>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleInsertPresetComment('PCOS & Low GI Carbohydrate Control: Avoid refined flour, pair matta rice with fiber.')}
                  className="px-3 py-1.5 bg-stone-100 hover:bg-teal-100 text-stone-800 hover:text-teal-900 text-xs font-bold rounded-xl border border-stone-200 transition-all"
                >
                  + PCOS & Low GI Protocol
                </button>

                <button
                  onClick={() => handleInsertPresetComment('Low Sodium & BP Management: Strictly limit raw salt intake to <3g/day; use herbs & lemon.')}
                  className="px-3 py-1.5 bg-stone-100 hover:bg-teal-100 text-stone-800 hover:text-teal-900 text-xs font-bold rounded-xl border border-stone-200 transition-all"
                >
                  + Low Sodium / BP Guidance
                </button>

                <button
                  onClick={() => handleInsertPresetComment('Hydration & Electrolytes: Consume 3.2L water daily; include buttermilk or coconut water.')}
                  className="px-3 py-1.5 bg-stone-100 hover:bg-teal-100 text-stone-800 hover:text-teal-900 text-xs font-bold rounded-xl border border-stone-200 transition-all"
                >
                  + Hydration Rule
                </button>

                <button
                  onClick={() => handleInsertPresetComment('Post-Meal Walk: 10-15 minutes brisk walk post-lunch and dinner to improve insulin sensitivity.')}
                  className="px-3 py-1.5 bg-stone-100 hover:bg-teal-100 text-stone-800 hover:text-teal-900 text-xs font-bold rounded-xl border border-stone-200 transition-all"
                >
                  + Post-Meal Activity
                </button>
              </div>
            </div>

            {/* Comment Box */}
            <div className="space-y-2">
              <textarea
                rows={4}
                value={dieticianNoteInput}
                onChange={(e) => setDieticianNoteInput(e.target.value)}
                placeholder="Enter dietitian's clinical summary, health instructions, and custom recommendations..."
                className="w-full text-sm font-medium text-stone-900 bg-stone-50 border-2 border-stone-200 rounded-2xl p-4 outline-none focus:border-teal-700 focus:bg-white leading-relaxed"
              />
            </div>

            {/* Bottom Finalize Button */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-3 border-t border-stone-100">
              <p className="text-xs text-stone-500">
                Clicking finalize will synchronize the 7-day 5-timing diet plan and dietitian comments directly to the customer's portal.
              </p>

              <button
                onClick={handleSendToClient}
                className="bg-teal-800 hover:bg-teal-900 text-white font-black px-8 py-4 rounded-2xl text-sm transition-all shadow-md flex items-center gap-2 shrink-0"
              >
                <Send className="w-4 h-4" />
                <span>Finalize & Send Plan to Client</span>
              </button>
            </div>
          </div>

        </div>

      </div>

      {/* DISH SELECTION MODAL */}
      {addingDishTarget && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-stone-200 animate-fadeIn">
            
            <div className="p-5 bg-stone-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-black">Select Dish for Day {addingDishTarget.dayNumber}</h3>
                <p className="text-xs text-stone-400">
                  {FIVE_MEAL_TIMINGS.find((t) => t.key === addingDishTarget.timingKey)?.label}
                </p>
              </div>
              <button
                onClick={() => setAddingDishTarget(null)}
                className="text-stone-400 hover:text-white p-1 rounded-lg text-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-4 border-b border-stone-200 bg-stone-50 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Search recipes by name or cuisine..."
                  value={recipeSearch}
                  onChange={(e) => setRecipeSearch(e.target.value)}
                  className="w-full bg-white border border-stone-300 rounded-xl pl-9 pr-4 py-2 text-xs text-stone-900 outline-none focus:border-teal-700"
                />
              </div>

              <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
                {allCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-3 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                      categoryFilter === cat
                        ? 'bg-teal-800 text-white'
                        : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 overflow-y-auto space-y-2 flex-1">
              {filteredRecipes.map((recipe) => (
                <div
                  key={recipe.id}
                  onClick={() => handleAddDishToSlot(addingDishTarget.dayNumber, addingDishTarget.timingKey, recipe)}
                  className="p-3 bg-white hover:bg-teal-50/60 rounded-2xl border border-stone-200 cursor-pointer transition-all flex items-center justify-between gap-3 group"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={recipe.image}
                      alt={recipe.name}
                      className="w-12 h-12 object-cover rounded-xl shrink-0"
                    />
                    <div>
                      <h5 className="text-xs font-extrabold text-stone-900 group-hover:text-teal-900">{recipe.name}</h5>
                      <div className="text-[10px] text-stone-500 mt-0.5">
                        {recipe.category} • <strong className="text-emerald-800">{recipe.calories} kcal</strong> • P:{recipe.protein}g C:{recipe.carbs}g F:{recipe.fat}g
                      </div>
                    </div>
                  </div>

                  <button className="px-3 py-1.5 bg-stone-100 group-hover:bg-teal-800 text-stone-800 group-hover:text-white font-bold text-xs rounded-xl transition-all shrink-0">
                    + Add Dish
                  </button>
                </div>
              ))}
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
