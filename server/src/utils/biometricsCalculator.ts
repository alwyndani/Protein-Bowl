export interface BiometricsInput {
  heightCm: number;
  weightKg: number;
  dob?: string | Date | null;
  age?: number | null;
  gender?: string | null;
  activityLevel: string;
  goal: string;
  hasExercise?: boolean | null;
}

export interface CalculatedBiometricsResult {
  age: number;
  bmi: number;
  bmiCategory: 'Underweight' | 'Normal' | 'Overweight' | 'Obese';
  bmr: number;
  tdee: number;
  maintenanceCalories: number;
  targetCalories: number;
  calorieDeficitSurplus: number;
  macroTargets: {
    proteinGrams: number;
    carbsGrams: number;
    fatGrams: number;
    fiberGrams: number;
  };
  waterRequirementL: number;
  idealBodyWeightKg: number;
}

export function calculateBiometrics(input: BiometricsInput): CalculatedBiometricsResult {
  const heightCm = Math.max(50, Math.min(250, input.heightCm));
  const weightKg = Math.max(20, Math.min(300, input.weightKg));
  const heightM = heightCm / 100;

  // 1. BMI Calculation
  const bmi = Number((weightKg / (heightM * heightM)).toFixed(1));
  let bmiCategory: 'Underweight' | 'Normal' | 'Overweight' | 'Obese' = 'Normal';
  if (bmi < 18.5) bmiCategory = 'Underweight';
  else if (bmi >= 18.5 && bmi < 24.9) bmiCategory = 'Normal';
  else if (bmi >= 25 && bmi < 29.9) bmiCategory = 'Overweight';
  else bmiCategory = 'Obese';

  // 2. Age Determination
  let age = input.age || 25;
  if (input.dob) {
    const dobDate = new Date(input.dob);
    if (!isNaN(dobDate.getTime())) {
      const today = new Date();
      let calculatedAge = today.getFullYear() - dobDate.getFullYear();
      const monthDiff = today.getMonth() - dobDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dobDate.getDate())) {
        calculatedAge--;
      }
      if (calculatedAge > 0 && calculatedAge < 120) {
        age = calculatedAge;
      }
    }
  }

  // 3. BMR Calculation (Mifflin-St Jeor Formula)
  const isMale = (input.gender || '').toLowerCase() === 'male';
  const bmr = Math.round(
    isMale
      ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
      : 10 * weightKg + 6.25 * heightCm - 5 * age - 161
  );

  // 4. TDEE Calculation
  const activityMultipliers: Record<string, number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    athlete: 1.9
  };
  const multiplier = activityMultipliers[input.activityLevel?.toLowerCase()] || 1.55;
  const tdee = Math.round(bmr * multiplier);
  const maintenanceCalories = tdee;

  // 5. Target Calories
  const goalLower = (input.goal || '').toLowerCase();
  let targetCalories = maintenanceCalories;
  if (goalLower === 'weight_loss' || goalLower === 'weight loss' || goalLower === 'fat loss') {
    targetCalories = Math.round(maintenanceCalories - 500);
  } else if (goalLower === 'muscle_gain' || goalLower === 'muscle gain' || goalLower === 'lean muscle gain') {
    targetCalories = Math.round(maintenanceCalories + 350);
  } else if (goalLower === 'diabetic') {
    targetCalories = Math.round(maintenanceCalories - 250);
  }

  const calorieDeficitSurplus = targetCalories - tdee;

  // 6. Macro Targets
  const proteinGrams = Math.round(
    goalLower.includes('muscle')
      ? weightKg * 2.2
      : goalLower.includes('weight') || goalLower.includes('fat')
      ? weightKg * 1.8
      : weightKg * 1.5
  );
  const fatGrams = Math.round((targetCalories * 0.25) / 9);
  const remainingCalForCarbs = targetCalories - (proteinGrams * 4 + fatGrams * 9);
  const carbsGrams = Math.max(80, Math.round(remainingCalForCarbs / 4));
  const fiberGrams = Math.round((targetCalories / 1000) * 14);

  // 7. Water Requirement
  const waterRequirementL = Number((weightKg * 0.035 + (input.hasExercise ? 0.5 : 0)).toFixed(2));

  // 8. Ideal Body Weight
  const idealBodyWeightKg = Number((22 * heightM * heightM).toFixed(1));

  return {
    age,
    bmi,
    bmiCategory,
    bmr,
    tdee,
    maintenanceCalories,
    targetCalories,
    calorieDeficitSurplus,
    macroTargets: {
      proteinGrams,
      carbsGrams,
      fatGrams,
      fiberGrams
    },
    waterRequirementL,
    idealBodyWeightKg
  };
}
