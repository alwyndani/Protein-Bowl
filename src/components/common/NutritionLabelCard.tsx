import React from 'react';
import { RecipeItem } from '../../types';
import { LogoMark } from './LogoMark';
import { ShieldCheck } from 'lucide-react';

interface NutritionLabelCardProps {
  recipe?: RecipeItem;
  customTitle?: string;
  servingGrams?: number;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  batchNo?: string;
  packedDate?: string;
}

export const NutritionLabelCard: React.FC<NutritionLabelCardProps> = ({
  recipe,
  customTitle,
  servingGrams,
  calories,
  protein,
  carbs,
  fat,
  fiber,
  batchNo = 'PB-BATCH-20260724-01',
  packedDate = '24-JUL-2026'
}) => {
  const title = customTitle || recipe?.name || 'Protein Bowl Healthy Meal';
  const grams = servingGrams || recipe?.servingGrams || 200;
  const cal = calories !== undefined ? calories : (recipe?.calories || 250);
  const p = protein !== undefined ? protein : (recipe?.protein || 25);
  const c = carbs !== undefined ? carbs : (recipe?.carbs || 30);
  const f = fat !== undefined ? fat : (recipe?.fat || 8);
  const fib = fiber !== undefined ? fiber : (recipe?.fiber || 4);

  return (
    <div className="bg-white border-2 border-stone-900 rounded-xl p-4 max-w-sm font-sans shadow-md text-stone-900">
      {/* Brand Header */}
      <div className="flex items-center justify-between border-b-2 border-stone-900 pb-2 mb-2">
        <div>
          <h4 className="font-extrabold text-stone-900 text-lg leading-tight lowercase">
            protein <span className="text-emerald-700">bowl</span>
          </h4>
          <p className="font-script text-emerald-700 text-xs font-bold">Striving for a healthier life</p>
        </div>
        <div className="text-right">
          <span className="text-[10px] uppercase font-bold text-stone-500 block">KITCHEN LIC NO.</span>
          <span className="text-xs font-mono font-bold text-stone-800">11322007000341</span>
        </div>
      </div>

      {/* Dish Name */}
      <div className="bg-stone-100 p-2 rounded-lg text-center font-bold text-sm text-stone-800 mb-2 border border-stone-300">
        {title} ({grams}g)
      </div>

      {/* Standard Nutrition Facts Header */}
      <div className="border-b-4 border-stone-900 pb-1 mb-1">
        <h3 className="font-black text-xl uppercase tracking-tight">Nutrition Facts</h3>
        <div className="text-xs font-semibold text-stone-600 flex justify-between">
          <span>Serving Size: {grams}g</span>
          <span>Pack Batch: {batchNo.slice(-6)}</span>
        </div>
      </div>

      <div className="border-b-2 border-stone-900 py-1.5 flex justify-between items-baseline">
        <span className="font-bold text-sm">Amount Per Serving</span>
        <span className="font-black text-lg">Calories {cal}</span>
      </div>

      <div className="text-xs font-semibold border-b border-stone-300 py-1 flex justify-between">
        <span>Total Fat {f}g</span>
        <span className="font-bold">{Math.round((f / 65) * 100)}% DV</span>
      </div>

      <div className="text-xs font-semibold border-b border-stone-300 py-1 flex justify-between">
        <span>Total Carbohydrates {c}g</span>
        <span className="font-bold">{Math.round((c / 300) * 100)}% DV</span>
      </div>

      <div className="text-xs font-semibold border-b border-stone-300 py-1 pl-3 flex justify-between text-stone-600">
        <span>Dietary Fiber {fib}g</span>
        <span>{Math.round((fib / 25) * 100)}% DV</span>
      </div>

      <div className="text-xs font-semibold border-b-2 border-stone-900 py-1 flex justify-between bg-emerald-50 px-1 rounded-sm my-1">
        <span className="font-black text-emerald-900">Protein {p}g</span>
        <span className="font-black text-emerald-900">{Math.round((p / 50) * 100)}% DV</span>
      </div>

      <div className="text-[10px] text-stone-500 pt-1 flex justify-between items-center">
        <span>Prepared Fresh on: {packedDate}</span>
        <span className="flex items-center gap-1 font-bold text-emerald-700">
          <ShieldCheck className="w-3 h-3" /> Quality Checked
        </span>
      </div>
    </div>
  );
};
