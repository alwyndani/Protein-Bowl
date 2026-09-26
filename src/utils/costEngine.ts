import { PlanType, DietaryPreference } from '../types';

export interface PricingCalculationResult {
  frequency: number; // 1, 2, or 3 meals/day
  durationDays: number; // 3, 7, 20, 30 days
  basePerMealRate: number;
  dailyBaseCost: number;
  dailyAddonCost: number;
  totalDailyCost: number;
  rawSubtotal: number;
  discountPercentage: number;
  discountAmount: number;
  netSubtotal: number;
  gstPercent: number;
  gstAmount: number;
  totalPayable: number;
  perMealEffectiveCost: number;
}

export function calculateMDCostEngine(
  planType: PlanType | number,
  durationDays: number,
  dietaryPreference: DietaryPreference | string = 'non-veg',
  addonSlotsCount: number = 0
): PricingCalculationResult {
  // Determine frequency (1, 2, or 3 meals/day)
  let frequency = 3;
  if (typeof planType === 'number') {
    frequency = planType;
  } else if (planType === '1meal') {
    frequency = 1;
  } else if (planType === '2meal') {
    frequency = 2;
  } else {
    frequency = 3;
  }

  // Base per meal rate matrix
  let basePerMealRate = 220; // Default rate
  if (frequency === 1) basePerMealRate = 250;
  if (frequency === 2) basePerMealRate = 220;
  if (frequency === 3) basePerMealRate = 200;

  // Premium for specialized diets (Keto / High-Protein)
  const isSpecialtyDiet = 
    dietaryPreference === 'keto' || 
    dietaryPreference === 'high-protein' || 
    dietaryPreference === 'High-Protein' ||
    dietaryPreference === 'Keto';

  if (isSpecialtyDiet) {
    basePerMealRate = Math.round(basePerMealRate * 1.12); // +12% for premium ingredients
  }

  const dailyBaseCost = basePerMealRate * frequency;
  const dailyAddonCost = addonSlotsCount * 99; // ₹99 per snack/salad add-on
  const totalDailyCost = dailyBaseCost + dailyAddonCost;

  const rawSubtotal = totalDailyCost * durationDays;

  // Duration Discount Tier (3 min, 7, 20, 30 days)
  let discountPercentage = 0;
  if (durationDays >= 30) {
    discountPercentage = 22; // 22% OFF for monthly
  } else if (durationDays >= 20) {
    discountPercentage = 15; // 15% OFF for 20 days
  } else if (durationDays >= 7) {
    discountPercentage = 8; // 8% OFF for weekly
  } else {
    discountPercentage = 0; // 3 Days trial (0%)
  }

  const discountAmount = Math.round((rawSubtotal * discountPercentage) / 100);
  const netSubtotal = rawSubtotal - discountAmount;

  const gstPercent = 5; // 5% GST for cloud kitchen services
  const gstAmount = Math.round((netSubtotal * gstPercent) / 100);
  const totalPayable = netSubtotal + gstAmount;

  const totalMealsCount = frequency * durationDays;
  const perMealEffectiveCost = Math.round(totalPayable / (totalMealsCount || 1));

  return {
    frequency,
    durationDays,
    basePerMealRate,
    dailyBaseCost,
    dailyAddonCost,
    totalDailyCost,
    rawSubtotal,
    discountPercentage,
    discountAmount,
    netSubtotal,
    gstPercent,
    gstAmount,
    totalPayable,
    perMealEffectiveCost
  };
}
