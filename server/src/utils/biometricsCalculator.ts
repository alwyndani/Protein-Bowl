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
  /**
   * false when the figures that depend on age and sex cannot be calculated: NOTHING is assumed. Those figures (bmr, tdee, calories, macros)
   * are then 0 = "not calculated", `missing` names what is needed, and only BMI, water and ideal weight (which need just height/weight) are real.
   */
  available: boolean;
  missing: Array<'dateOfBirth' | 'gender' | 'calculationPolicy'>;
  age: number | null;
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

  // 2. Age Determination: from the saved date of birth (or an explicit age). There is NO default age.
  let age: number | null = typeof input.age === 'number' && input.age > 0 && input.age < 120 ? input.age : null;
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

  // Water and ideal weight need only height and weight.
  const waterRequirementL = Number((weightKg * 0.035 + (input.hasExercise ? 0.5 : 0)).toFixed(2));
  const idealBodyWeightKg = Number((22 * heightM * heightM).toFixed(1));

  // BMR (and everything built on it) needs the age and the sex: without them it is NOT CALCULATED, never assumed.
  // Mifflin-St Jeor has two published constants (male, female). "other" is NOT silently mapped to either: it is unavailable
  // ('calculationPolicy') until the business approves how it is to be calculated. Any other unknown value counts as a missing gender.
  const missing: Array<'dateOfBirth' | 'gender' | 'calculationPolicy'> = [];
  if (age === null) missing.push('dateOfBirth');
  const sex = (input.gender || '').trim().toLowerCase();
  if (sex === 'other') missing.push('calculationPolicy');
  else if (sex !== 'male' && sex !== 'female') missing.push('gender');
  if (missing.length > 0 || age === null) {
    return {
      available: false, missing, age, bmi, bmiCategory,
      bmr: 0, tdee: 0, maintenanceCalories: 0, targetCalories: 0, calorieDeficitSurplus: 0,
      macroTargets: { proteinGrams: 0, carbsGrams: 0, fatGrams: 0, fiberGrams: 0 },
      waterRequirementL, idealBodyWeightKg
    };
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

  return {
    available: true,
    missing: [],
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
