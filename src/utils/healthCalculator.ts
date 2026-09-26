import { ActivityLevel, HealthGoal } from '../types';

export interface CalculatedHealthMetrics {
  bmi: number;
  bmiCategory: 'Underweight' | 'Normal' | 'Overweight' | 'Obese';
  bmr: number;
  tdee: number;
  maintenanceCalories: number;
  targetCalories: number;
  calorieDeficitSurplus: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams: number;
  waterRequirementL: number;
  idealBodyWeightKg: number;
  leanBodyMassKg: number;
}

export function calculateHealthMetrics(params: {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: 'female' | 'male' | 'other';
  activityLevel: ActivityLevel;
  goal: HealthGoal | string;
  hasExercise?: boolean;
}): CalculatedHealthMetrics {
  const { weightKg, heightCm, age, gender, activityLevel, goal, hasExercise } = params;

  const validWeight = Math.max(20, weightKg || 65);
  const validHeight = Math.max(100, heightCm || 165);
  const validAge = Math.max(12, age || 28);

  // 1. BMI = Weight (kg) ÷ Height² (m²)
  const heightM = validHeight / 100;
  const bmi = Number((validWeight / (heightM * heightM)).toFixed(1));

  let bmiCategory: 'Underweight' | 'Normal' | 'Overweight' | 'Obese' = 'Normal';
  if (bmi < 18.5) {
    bmiCategory = 'Underweight';
  } else if (bmi >= 18.5 && bmi < 24.9) {
    bmiCategory = 'Normal';
  } else if (bmi >= 25 && bmi < 29.9) {
    bmiCategory = 'Overweight';
  } else {
    bmiCategory = 'Obese';
  }

  // 2. BMR — Mifflin-St Jeor
  // Male: (10 × Weight) + (6.25 × Height) − (5 × Age) + 5
  // Female: (10 × Weight) + (6.25 × Height) − (5 × Age) − 161
  const bmr = Math.round(
    gender === 'male'
      ? 10 * validWeight + 6.25 * validHeight - 5 * validAge + 5
      : 10 * validWeight + 6.25 * validHeight - 5 * validAge - 161
  );

  // 3. TDEE = BMR × Activity Factor
  const activityMultipliers: Record<ActivityLevel, number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    athlete: 1.9
  };
  const factor = activityMultipliers[activityLevel] || 1.55;
  const tdee = Math.round(bmr * factor);
  const maintenanceCalories = tdee;

  // 4. Daily Calorie Target = TDEE ± Calorie Deficit/Surplus
  let targetCalories = maintenanceCalories;
  if (goal === 'weight_loss' || goal === 'Weight Loss' || goal === 'Fat Loss') {
    targetCalories = Math.round(maintenanceCalories - 500);
  } else if (goal === 'muscle_gain' || goal === 'Muscle Gain' || goal === 'Lean Muscle Gain' || goal === 'Weight Gain') {
    targetCalories = Math.round(maintenanceCalories + 350);
  } else if (goal === 'diabetic' || goal === 'Disease Management') {
    targetCalories = Math.round(maintenanceCalories - 250);
  }

  const calorieDeficitSurplus = targetCalories - tdee;

  // 5. Protein Requirement = Body Weight × Protein Factor
  const proteinFactor = (goal === 'muscle_gain' || goal === 'Muscle Gain' || goal === 'Lean Muscle Gain') ? 2.2 : ((goal === 'weight_loss' || goal === 'Fat Loss') ? 1.8 : 1.5);
  const proteinGrams = Math.round(validWeight * proteinFactor);
  const proteinCalories = proteinGrams * 4;

  // 6. Fat Requirement = (Daily Calories × Fat %) ÷ 9
  const fatGrams = Math.round((targetCalories * 0.25) / 9);
  const fatCalories = fatGrams * 9;

  // 7. Carbohydrate Requirement = (Daily Calories − Protein Calories − Fat Calories) ÷ 4
  const remainingCarbCal = targetCalories - proteinCalories - fatCalories;
  const carbsGrams = Math.max(60, Math.round(remainingCarbCal / 4));

  // 8. Fibre Requirement = 14 × (Daily Calories ÷ 1000)
  const fiberGrams = Math.round((targetCalories / 1000) * 14);

  // 9. Water Requirement = Weight × 35 ml ÷ 1000 L/day
  const waterRequirementL = Number(((validWeight * 35) / 1000 + (hasExercise ? 0.5 : 0)).toFixed(2));

  // 10. Ideal Body Weight — Devine Formula
  // Male: 50 + (2.3 × (Height in inches − 60))
  // Female: 45.5 + (2.3 × (Height in inches − 60))
  const heightInches = validHeight / 2.54;
  const inchesOver60 = Math.max(0, heightInches - 60);
  const idealBodyWeightKg = Number(
    (gender === 'male' ? 50 + 2.3 * inchesOver60 : 45.5 + 2.3 * inchesOver60).toFixed(1)
  );

  // 11. Lean Body Mass — Boer Formula
  // Male: (0.407 × Weight) + (0.267 × Height) − 19.2
  // Female: (0.252 × Weight) + (0.473 × Height) − 48.3
  const leanBodyMassKg = Number(
    (gender === 'male'
      ? 0.407 * validWeight + 0.267 * validHeight - 19.2
      : 0.252 * validWeight + 0.473 * validHeight - 48.3).toFixed(1)
  );

  return {
    bmi,
    bmiCategory,
    bmr,
    tdee,
    maintenanceCalories,
    targetCalories,
    calorieDeficitSurplus,
    proteinGrams,
    carbsGrams,
    fatGrams,
    fiberGrams,
    waterRequirementL,
    idealBodyWeightKg,
    leanBodyMassKg
  };
}
