import React, { useState } from 'react';
import { CustomerProfile, ActivityLevel, HealthGoal, BloodTestResults } from '../../types';
import { calculateMDCostEngine } from '../../utils/costEngine';
import { CustomerService } from '../../services/customerService';
import { 
  Activity, 
  HeartPulse, 
  Scale, 
  Flame, 
  ShieldAlert, 
  Sparkles, 
  Check, 
  ArrowRight, 
  Save, 
  Info, 
  AlertTriangle, 
  Droplets, 
  Calendar, 
  Clock, 
  Dumbbell, 
  FileText, 
  Apple, 
  User, 
  Layers, 
  Moon, 
  Briefcase, 
  Stethoscope,
  ChevronDown,
  Calculator,
  Tag,
  Receipt,
  Phone,
  X
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface HealthProfileWizardProps {
  profile?: CustomerProfile;
  initialProfile?: CustomerProfile;
  onSaveProfile: (updatedProfile: CustomerProfile) => void;
  onProceedToPlan?: () => void;
  onProceedToCustomerModule?: (updatedProfile: CustomerProfile) => void;
}

export const HealthProfileWizard: React.FC<HealthProfileWizardProps> = ({
  profile: propProfile,
  initialProfile,
  onSaveProfile,
  onProceedToPlan,
  onProceedToCustomerModule
}) => {
  const profile = propProfile || initialProfile || ({} as CustomerProfile);
  // Navigation tab within Health Profile Wizard
  const [activeStep, setActiveStep] = useState<
    'basic' | 'tracking' | 'goals_activity' | 'medical_blood' | 'nutrition_lifestyle' | 'plan_selection'
  >('basic');

  // Basic Information & Initial Entry
  const [name, setName] = useState(profile.name || 'Anjali Ramesh');
  const [email, setEmail] = useState(profile.email || 'anjali@example.com');
  const [phone, setPhone] = useState(profile.phone || '+91 98765 43210');
  const [dob, setDob] = useState(profile.dob || '1995-04-18');
  const [gender, setGender] = useState<'female' | 'male' | 'other'>(profile.gender || 'female');
  const [age, setAge] = useState(profile.age || 29);

  const [heightCm, setHeightCm] = useState(profile.heightCm || 165);
  const [weightKg, setWeightKg] = useState(profile.weightKg || 68);
  const [targetWeightKg, setTargetWeightKg] = useState(profile.targetWeightKg || 58);
  const [occupation, setOccupation] = useState(profile.occupation || 'IT Professional');
  const [workSchedule, setWorkSchedule] = useState(profile.workSchedule || 'Flexible Hours');
  const [sleepDuration, setSleepDuration] = useState(profile.sleepDuration || 7);
  const [wakeUpTime, setWakeUpTime] = useState(profile.wakeUpTime || '06:30');
  const [bedTime, setBedTime] = useState(profile.bedTime || '23:00');

  // Tracking & Circumferences
  const [muscleMassKg, setMuscleMassKg] = useState(profile.muscleMassKg || 24.5);
  const [waistCm, setWaistCm] = useState(profile.circumferences?.waistCm || 81);
  const [hipCm, setHipCm] = useState(profile.circumferences?.hipCm || 98);
  const [chestCm, setChestCm] = useState(profile.circumferences?.chestCm || 88);
  const [neckCm, setNeckCm] = useState(profile.circumferences?.neckCm || 34);

  const [leftArmCm, setLeftArmCm] = useState(profile.limbCircumferences?.leftArmCm || 28);
  const [rightArmCm, setRightArmCm] = useState(profile.limbCircumferences?.rightArmCm || 28.5);
  const [leftThighCm, setLeftThighCm] = useState(profile.limbCircumferences?.leftThighCm || 56);
  const [rightThighCm, setRightThighCm] = useState(profile.limbCircumferences?.rightThighCm || 56.5);
  const [leftCalfCm, setLeftCalfCm] = useState(profile.limbCircumferences?.leftCalfCm || 36);
  const [rightCalfCm, setRightCalfCm] = useState(profile.limbCircumferences?.rightCalfCm || 36);

  // Goals & Activity
  const [goal, setGoal] = useState<HealthGoal>(profile.goal || 'weight_loss');
  const [primaryGoals, setPrimaryGoals] = useState<string[]>(
    profile.primaryGoals || ['Weight Loss', 'Fat Loss', 'Improve Gut Health', 'Improve Energy Levels']
  );
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(profile.activityLevel || 'moderate');

  // Exercise Details
  const [hasExercise, setHasExercise] = useState<boolean>(profile.hasExercise ?? true);
  const [workoutTypes, setWorkoutTypes] = useState<string[]>(profile.workoutTypes || ['Strength Training', 'Yoga', 'Walking']);
  const [workoutFrequency, setWorkoutFrequency] = useState<string>(profile.workoutFrequency || '3–4 Days');
  const [workoutDuration, setWorkoutDuration] = useState<number>(profile.workoutDuration || 45);
  const [dailyStepCount, setDailyStepCount] = useState<number>(profile.dailyStepCount || 8500);
  const [cardioSessions, setCardioSessions] = useState<number>(profile.cardioSessions || 2);
  const [strengthSessions, setStrengthSessions] = useState<number>(profile.strengthSessions || 3);

  // Medical Conditions & Medications & Supplements
  const [medicalConditions, setMedicalConditions] = useState<string[]>(profile.medicalConditions || ['PCOS']);
  const [currentMedications, setCurrentMedications] = useState<string>(profile.currentMedications || 'Metformin 500mg once daily');
  const [supplements, setSupplements] = useState<string[]>(profile.supplements || ['Multivitamin', 'Vitamin D', 'Omega-3']);

  // Blood Test Results
  const [bloodTests, setBloodTests] = useState<BloodTestResults>(profile.bloodTestResults || {
    fastingBloodSugar: 98,
    hbA1c: 5.6,
    totalCholesterol: 185,
    hdl: 52,
    ldl: 110,
    triglycerides: 115,
    hemoglobin: 13.2,
    vitaminD: 24,
    vitaminB12: 310,
    ferritin: 45,
    uricAcid: 4.8,
    creatinine: 0.8,
    tsh: 2.4,
    sgot: 22,
    sgpt: 24
  });

  // Food Preferences & Allergies
  const [foodPreference, setFoodPreference] = useState<'Vegetarian' | 'Eggetarian' | 'Non-Vegetarian' | 'Vegan' | 'Keto' | 'High-Protein'>(
    (profile.foodPreference as any) || 'Non-Vegetarian'
  );
  const [allergies, setAllergies] = useState<string[]>(profile.allergies || ['Peanuts']);
  const [foodDislikes, setFoodDislikes] = useState<string[]>(profile.foodDislikes || ['Mushroom', 'Bitter Gourd']);
  const [dislikeInput, setDislikeInput] = useState('');
  const [customQuery, setCustomQuery] = useState<string>(profile.customQuery || '');

  // Meal Structure
  const [mealsPerDay, setMealsPerDay] = useState<number>(profile.mealsPerDay || 3);
  const [mealTimings, setMealTimings] = useState(profile.mealTimings || {
    breakfast: '08:30',
    morningSnack: '11:00',
    lunch: '13:30',
    eveningSnack: '16:30',
    dinner: '20:00',
    bedtimeSnack: '22:00'
  });
  const [waterIntakeL, setWaterIntakeL] = useState<number>(profile.waterIntakeL || 3.0);

  // Lifestyle
  const [digestiveHealth, setDigestiveHealth] = useState<string[]>(profile.digestiveHealth || ['Good']);
  const [smoking, setSmoking] = useState(profile.smoking || 'Never');
  const [alcohol, setAlcohol] = useState(profile.alcohol || 'Monthly');
  const [tobacco, setTobacco] = useState(profile.tobacco || 'Never');
  const [stressLevel, setStressLevel] = useState<number>(profile.stressLevel || 4);
  const [sleepQuality, setSleepQuality] = useState(profile.sleepQuality || 'Good');

  // Women-Only Fields
  const [isPregnant, setIsPregnant] = useState<boolean>(profile.isPregnant ?? false);
  const [isBreastfeeding, setIsBreastfeeding] = useState<boolean>(profile.isBreastfeeding ?? false);
  const [menstrualCycle, setMenstrualCycle] = useState<'Regular' | 'Irregular'>(profile.menstrualCycle || 'Irregular');
  const [isMenopause, setIsMenopause] = useState<boolean>(profile.isMenopause ?? false);

  // Meal Plan Duration Selection
  const [planDurationDays, setPlanDurationDays] = useState<3 | 7 | 20 | 30>(profile.planDurationDays || 30);
  const [planFrequency, setPlanFrequency] = useState<1 | 2 | 3>(profile.planFrequency || 3);
  const [addonSlots, setAddonSlots] = useState<string[]>(profile.addonSlots || ['11:00 AM Snack/Salad']);

  // OTP Verification Flow State
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpPhone, setOtpPhone] = useState(profile.phone || '+91 98765 43210');
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');

  const [savedNotice, setSavedNotice] = useState(false);

  // Options Master Arrays
  const occupationOptions = [
    'Student', 'Office Employee', 'Government Employee', 'Business Owner', 
    'Homemaker', 'Healthcare Worker', 'Teacher', 'IT Professional', 
    'Driver', 'Construction Worker', 'Retired', 'Other'
  ];

  const workScheduleOptions = ['Day Shift', 'Night Shift', 'Rotational Shift', 'Flexible Hours', 'Work From Home'];

  const primaryGoalOptions = [
    'Weight Loss', 'Fat Loss', 'Muscle Gain', 'Lean Muscle Gain', 'Body Recomposition', 
    'Weight Gain', 'Improve Athletic Performance', 'Improve Strength', 'Improve Endurance', 
    'Healthy Lifestyle', 'Disease Management', 'Improve Gut Health', 'Improve Energy Levels', 
    'Improve Skin & Hair', 'Other'
  ];

  const workoutTypeOptions = [
    'Strength Training', 'Cardio', 'HIIT', 'Yoga', 'Pilates', 'Running', 
    'Walking', 'Cycling', 'Swimming', 'Sports', 'CrossFit', 'Functional Training', 'Mixed'
  ];

  const medicalOptions = [
    'None', 'Diabetes Type 1', 'Diabetes Type 2', 'Prediabetes', 'Hypertension', 'Hypotension', 
    'Hypothyroidism', 'Hyperthyroidism', 'PCOS', 'High Cholesterol', 'Heart Disease', 'Fatty Liver', 
    'Kidney Disease', 'Liver Disease', 'Arthritis', 'Osteoporosis', 'Gout', 'IBS', 'IBD', 
    'Gastritis', 'Acid Reflux (GERD)', 'Constipation', 'Food Allergies', 'Asthma', 'Sleep Apnea', 'Cancer', 'Other'
  ];

  const supplementOptions = [
    'None', 'Whey Protein', 'Creatine', 'Fish Oil', 'Omega-3', 'Multivitamin', 
    'Vitamin D', 'Vitamin B12', 'Calcium', 'Magnesium', 'Zinc', 'Iron', 
    'Collagen', 'Probiotics', 'Electrolytes', 'Other'
  ];

  const allergyOptions = ['None', 'Milk', 'Egg', 'Fish', 'Shellfish', 'Peanut', 'Tree Nuts', 'Soy', 'Wheat', 'Gluten', 'Sesame', 'Other'];

  const digestiveOptions = [
    'Good', 'Bloating', 'Gas', 'Constipation', 'Diarrhea', 'Acidity', 'Acid Reflux', 
    'IBS', 'Lactose Intolerance', 'Gluten Sensitivity', 'Poor Appetite', 'Other'
  ];

  const toggleArrayItem = (arr: string[], setArr: (val: string[]) => void, item: string) => {
    if (item === 'None') {
      setArr(['None']);
      return;
    }
    const filtered = arr.filter((x) => x !== 'None');
    if (filtered.includes(item)) {
      const res = filtered.filter((x) => x !== item);
      setArr(res.length === 0 ? ['None'] : res);
    } else {
      setArr([...filtered, item]);
    }
  };

  const handleAddDislike = () => {
    if (dislikeInput.trim() && !foodDislikes.includes(dislikeInput.trim())) {
      setFoodDislikes([...foodDislikes, dislikeInput.trim()]);
      setDislikeInput('');
    }
  };

  // Check if blood tests are completely skipped
  const isBloodTestSkipped = Object.values(bloodTests).every((val) => val === undefined || val === null || val === 0 || isNaN(val as number));

  // --- AUTO CALCULATIONS ---
  // 1. BMI
  const heightM = heightCm / 100;
  const bmi = Number((weightKg / (heightM * heightM)).toFixed(1));

  let bmiCategory: 'Underweight' | 'Normal' | 'Overweight' | 'Obese' = 'Normal';
  let bmiColor = 'text-emerald-700 bg-emerald-50 border-emerald-300';
  if (bmi < 18.5) {
    bmiCategory = 'Underweight';
    bmiColor = 'text-amber-700 bg-amber-50 border-amber-300';
  } else if (bmi >= 18.5 && bmi < 24.9) {
    bmiCategory = 'Normal';
    bmiColor = 'text-emerald-700 bg-emerald-50 border-emerald-300';
  } else if (bmi >= 25 && bmi < 29.9) {
    bmiCategory = 'Overweight';
    bmiColor = 'text-amber-800 bg-amber-100 border-amber-400';
  } else {
    bmiCategory = 'Obese';
    bmiColor = 'text-rose-700 bg-rose-50 border-rose-300';
  }

  // 2. BMR (Mifflin-St Jeor)
  const bmr = Math.round(
    gender === 'male'
      ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
      : 10 * weightKg + 6.25 * heightCm - 5 * age - 161
  );

  // 3. TDEE
  const activityMultipliers: Record<ActivityLevel, number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    athlete: 1.9
  };
  const tdee = Math.round(bmr * activityMultipliers[activityLevel]);
  const maintenanceCalories = tdee;

  // 4. Target Calories
  let targetCalories = maintenanceCalories;
  if (goal === 'weight_loss') targetCalories = Math.round(maintenanceCalories - 500);
  else if (goal === 'muscle_gain') targetCalories = Math.round(maintenanceCalories + 350);
  else if (goal === 'diabetic') targetCalories = Math.round(maintenanceCalories - 250);

  const calorieDeficitSurplus = targetCalories - tdee;

  // 5. Macros
  const proteinGrams = Math.round(
    goal === 'muscle_gain' ? weightKg * 2.2 : (goal === 'weight_loss' ? weightKg * 1.8 : weightKg * 1.5)
  );
  const fatGrams = Math.round((targetCalories * 0.25) / 9);
  const remainingCalForCarbs = targetCalories - (proteinGrams * 4 + fatGrams * 9);
  const carbsGrams = Math.max(80, Math.round(remainingCalForCarbs / 4));
  const fiberGrams = Math.round((targetCalories / 1000) * 14);

  // 6. Water Requirement (L)
  const waterRequirementL = Number((weightKg * 0.035 + (hasExercise ? 0.5 : 0)).toFixed(2));

  // 7. Ideal Body Weight (Devine Formula)
  const heightInchesOver5ft = Math.max(0, (heightCm - 152.4) / 2.54);
  const idealBodyWeightKg = Number(
    (gender === 'male' ? 50 + 2.3 * heightInchesOver5ft : 45.5 + 2.3 * heightInchesOver5ft).toFixed(1)
  );

  // 8. Lean Body Mass (Boer Formula)
  const leanBodyMassKg = Number(
    (gender === 'male'
      ? 0.407 * weightKg + 0.267 * heightCm - 19.2
      : 0.252 * weightKg + 0.473 * heightCm - 48.3).toFixed(1)
  );

  const getUpdatedProfileObj = (): CustomerProfile => {
    return {
      ...profile,
      name,
      email,
      phone: otpPhone || phone,
      dob,
      gender,
      age,
      heightCm,
      weightKg,
      targetWeightKg,
      occupation,
      workSchedule,
      sleepDuration,
      wakeUpTime,
      bedTime,
      muscleMassKg,
      circumferences: { waistCm, hipCm, chestCm, neckCm },
      limbCircumferences: {
        leftArmCm, rightArmCm, leftThighCm, rightThighCm, leftCalfCm, rightCalfCm
      },
      goal,
      primaryGoals,
      activityLevel,
      hasExercise,
      workoutTypes,
      workoutFrequency,
      workoutDuration,
      dailyStepCount,
      cardioSessions,
      strengthSessions,
      medicalConditions,
      currentMedications,
      supplements,
      bloodTestResults: bloodTests,
      foodPreference,
      allergies,
      foodDislikes,
      customQuery,
      mealsPerDay,
      mealTimings,
      waterIntakeL,
      digestiveHealth,
      smoking,
      alcohol,
      tobacco,
      stressLevel,
      sleepQuality,
      isPregnant,
      isBreastfeeding,
      menstrualCycle,
      isMenopause,
      planDurationDays,
      planFrequency,
      addonSlots,

      // Auto-calculated fields
      bmi,
      bmiCategory,
      bmr,
      tdee,
      maintenanceCalories,
      targetCalories,
      macroTargets: {
        proteinGrams,
        carbsGrams,
        fatGrams,
        fiberGrams
      },
      waterRequirementL,
      idealBodyWeightKg,
      leanBodyMassKg,
      calorieDeficitSurplus
    };
  };

  const handleSave = async () => {
    const updated = getUpdatedProfileObj();
    onSaveProfile(updated);
    setSavedNotice(true);
    confetti({ particleCount: 50, spread: 60 });
    try {
      const res = await CustomerService.updateMyProfile(updated);
      if (res.success && res.data) {
        onSaveProfile(res.data);
      }
    } catch (_err) {
      // Retain optimistic UI state
    }
    setTimeout(() => setSavedNotice(false), 3000);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8 animate-fadeIn">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-amber-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden border border-emerald-700/50">
        <div className="relative z-10 max-w-3xl space-y-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 text-xs font-extrabold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" /> FRS 1.1 Customer Management & Clinical Health Onboarding
          </span>
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight leading-tight">
            Comprehensive Clinical Health Portfolio
          </h1>
          <p className="text-emerald-100/90 text-xs sm:text-sm leading-relaxed">
            Configure body measurements, tracking circumferences, medical conditions, blood lab markers, food dislikes, and workout schedules. Live auto-calculates BMR, TDEE, Lean Body Mass, and macro splits for Dietitian review.
          </p>
        </div>
        <div className="absolute right-[-40px] bottom-[-40px] opacity-10 pointer-events-none">
          <HeartPulse className="w-80 h-80 text-white" />
        </div>
      </div>

      {/* Wizard Step Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-stone-200 pb-2">
        {[
          { id: 'basic', label: '1. Basic Info & Measurements', icon: User },
          { id: 'tracking', label: '2. Circumference Tracking', icon: Scale },
          { id: 'goals_activity', label: '3. Goals & Exercise Details', icon: Activity },
          { id: 'medical_blood', label: '4. Medical & Blood Lab Tests', icon: Stethoscope },
          { id: 'nutrition_lifestyle', label: '5. Food Preferences & Lifestyle', icon: Apple },
          { id: 'plan_selection', label: '6. Macro Calculations', icon: Layers },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeStep === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveStep(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all ${
                isActive
                  ? 'bg-amber-950 text-white shadow-md'
                  : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-100'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-amber-400' : 'text-stone-500'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* STEP 1: BASIC INFO & INITIAL MEASUREMENTS */}
      {activeStep === 'basic' && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-6">
          <div className="border-b border-stone-100 pb-4 flex items-center justify-between">
            <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
              <User className="w-5 h-5 text-emerald-700" />
              <span>1. Customer Authentication & Initial Measurements</span>
            </h3>
            <span className="text-xs font-bold text-stone-400">Step 1 of 6</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none focus:border-amber-800"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none focus:border-amber-800"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Mobile Number</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none focus:border-amber-800"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Date of Birth (DOB)</label>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none focus:border-amber-800"
              />
            </div>
          </div>

          {/* Gender & Age */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Biological Sex</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as any)}
                className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none focus:border-amber-800"
              >
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other / Prefer not to say</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Age (Years)</label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(Number(e.target.value))}
                className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none focus:border-amber-800"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Occupation</label>
              <select
                value={occupation}
                onChange={(e) => setOccupation(e.target.value)}
                className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none focus:border-amber-800"
              >
                {occupationOptions.map((occ) => (
                  <option key={occ} value={occ}>{occ}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Measurements: Height, Weight, Target Weight */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Current Height (cm)</label>
              <input
                type="number"
                value={heightCm}
                onChange={(e) => setHeightCm(Number(e.target.value))}
                className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none focus:border-amber-800"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Current Weight (kg)</label>
              <input
                type="number"
                value={weightKg}
                onChange={(e) => setWeightKg(Number(e.target.value))}
                className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none focus:border-amber-800"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Target Goal Weight (kg)</label>
              <input
                type="number"
                value={targetWeightKg}
                onChange={(e) => setTargetWeightKg(Number(e.target.value))}
                className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none focus:border-amber-800"
              />
            </div>
          </div>

          {/* Work Schedule & Sleep */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-2">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Work Schedule</label>
              <select
                value={workSchedule}
                onChange={(e) => setWorkSchedule(e.target.value)}
                className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none focus:border-amber-800"
              >
                {workScheduleOptions.map((ws) => (
                  <option key={ws} value={ws}>{ws}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Sleep Duration (Hours/day)</label>
              <input
                type="number"
                value={sleepDuration}
                onChange={(e) => setSleepDuration(Number(e.target.value))}
                className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none focus:border-amber-800"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Wake-up Time (HH:MM)</label>
              <input
                type="time"
                value={wakeUpTime}
                onChange={(e) => setWakeUpTime(e.target.value)}
                className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none focus:border-amber-800"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Bed Time (HH:MM)</label>
              <input
                type="time"
                value={bedTime}
                onChange={(e) => setBedTime(e.target.value)}
                className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none focus:border-amber-800"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              onClick={() => setActiveStep('tracking')}
              className="bg-amber-950 text-white font-extrabold px-6 py-2.5 rounded-xl text-xs hover:bg-amber-900 transition-all flex items-center gap-2"
            >
              <span>Proceed to Circumference Tracking</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: CIRCUMFERENCE TRACKING & MUSCLE MASS */}
      {activeStep === 'tracking' && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-6">
          <div className="border-b border-stone-100 pb-4 flex items-center justify-between">
            <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
              <Scale className="w-5 h-5 text-emerald-700" />
              <span>2. Body Measurements — Tracking & Circumferences</span>
            </h3>
            <span className="text-xs font-bold text-stone-400">Step 2 of 6</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Core & Muscle Mass */}
            <div className="p-5 bg-stone-50 rounded-2xl border border-stone-200 space-y-4">
              <h4 className="text-xs font-extrabold uppercase text-stone-800 tracking-wider">Core Body & Circumferences (cm)</h4>
              
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Muscle Mass (kg)</label>
                <input
                  type="number"
                  value={muscleMassKg}
                  onChange={(e) => setMuscleMassKg(Number(e.target.value))}
                  className="w-full p-2.5 bg-white border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Waist Circumference (cm)</label>
                  <input
                    type="number"
                    value={waistCm}
                    onChange={(e) => setWaistCm(Number(e.target.value))}
                    className="w-full p-2.5 bg-white border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Hip Circumference (cm)</label>
                  <input
                    type="number"
                    value={hipCm}
                    onChange={(e) => setHipCm(Number(e.target.value))}
                    className="w-full p-2.5 bg-white border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Chest Circumference (cm)</label>
                  <input
                    type="number"
                    value={chestCm}
                    onChange={(e) => setChestCm(Number(e.target.value))}
                    className="w-full p-2.5 bg-white border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Neck Circumference (cm)</label>
                  <input
                    type="number"
                    value={neckCm}
                    onChange={(e) => setNeckCm(Number(e.target.value))}
                    className="w-full p-2.5 bg-white border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Limb Circumferences */}
            <div className="p-5 bg-amber-50/60 rounded-2xl border border-amber-200/80 space-y-4">
              <h4 className="text-xs font-extrabold uppercase text-amber-950 tracking-wider">Limb Circumferences (cm)</h4>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-amber-950 mb-1">Left Arm (cm)</label>
                  <input
                    type="number"
                    value={leftArmCm}
                    onChange={(e) => setLeftArmCm(Number(e.target.value))}
                    className="w-full p-2.5 bg-white border border-amber-300 rounded-xl text-xs font-bold outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-amber-950 mb-1">Right Arm (cm)</label>
                  <input
                    type="number"
                    value={rightArmCm}
                    onChange={(e) => setRightArmCm(Number(e.target.value))}
                    className="w-full p-2.5 bg-white border border-amber-300 rounded-xl text-xs font-bold outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-amber-950 mb-1">Left Thigh (cm)</label>
                  <input
                    type="number"
                    value={leftThighCm}
                    onChange={(e) => setLeftThighCm(Number(e.target.value))}
                    className="w-full p-2.5 bg-white border border-amber-300 rounded-xl text-xs font-bold outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-amber-950 mb-1">Right Thigh (cm)</label>
                  <input
                    type="number"
                    value={rightThighCm}
                    onChange={(e) => setRightThighCm(Number(e.target.value))}
                    className="w-full p-2.5 bg-white border border-amber-300 rounded-xl text-xs font-bold outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-amber-950 mb-1">Left Calf (cm)</label>
                  <input
                    type="number"
                    value={leftCalfCm}
                    onChange={(e) => setLeftCalfCm(Number(e.target.value))}
                    className="w-full p-2.5 bg-white border border-amber-300 rounded-xl text-xs font-bold outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-amber-950 mb-1">Right Calf (cm)</label>
                  <input
                    type="number"
                    value={rightCalfCm}
                    onChange={(e) => setRightCalfCm(Number(e.target.value))}
                    className="w-full p-2.5 bg-white border border-amber-300 rounded-xl text-xs font-bold outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <button
              onClick={() => setActiveStep('basic')}
              className="bg-stone-200 text-stone-700 font-bold px-5 py-2.5 rounded-xl text-xs hover:bg-stone-300"
            >
              Back
            </button>
            <button
              onClick={() => setActiveStep('goals_activity')}
              className="bg-amber-950 text-white font-extrabold px-6 py-2.5 rounded-xl text-xs hover:bg-amber-900 transition-all flex items-center gap-2"
            >
              <span>Proceed to Goals & Activity</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: GOALS & EXERCISE DETAILS */}
      {activeStep === 'goals_activity' && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-6">
          <div className="border-b border-stone-100 pb-4 flex items-center justify-between">
            <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-700" />
              <span>3. Primary Goals, Activity Level & Exercise Details</span>
            </h3>
            <span className="text-xs font-bold text-stone-400">Step 3 of 6</span>
          </div>

          {/* Primary Goals Multi-select */}
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-2">Primary Health & Fitness Goals (Multi-select)</label>
            <div className="flex flex-wrap gap-2">
              {primaryGoalOptions.map((g) => {
                const isSelected = primaryGoals.includes(g);
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => toggleArrayItem(primaryGoals, setPrimaryGoals, g)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                      isSelected
                        ? 'bg-amber-950 text-amber-300 border-amber-900 shadow-xs'
                        : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    {isSelected && '✓ '} {g}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Activity Level Dropdown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Activity Level</label>
              <select
                value={activityLevel}
                onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)}
                className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none"
              >
                <option value="sedentary">Sedentary (Little/No Exercise)</option>
                <option value="light">Lightly Active (1–3 Days/Wk)</option>
                <option value="moderate">Moderately Active (3–5 Days/Wk)</option>
                <option value="active">Very Active (6–7 Days/Wk)</option>
                <option value="athlete">Professional Athlete</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Do You Exercise Regularly?</label>
              <div className="flex gap-3 mt-1">
                <button
                  type="button"
                  onClick={() => setHasExercise(true)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border ${hasExercise ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-stone-50 text-stone-700'}`}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setHasExercise(false)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border ${!hasExercise ? 'bg-stone-800 text-white border-stone-800' : 'bg-stone-50 text-stone-700'}`}
                >
                  No
                </button>
              </div>
            </div>
          </div>

          {/* Exercise Detail Fields */}
          {hasExercise && (
            <div className="p-5 bg-stone-50 rounded-2xl border border-stone-200 space-y-4">
              <h4 className="text-xs font-extrabold uppercase text-stone-800 tracking-wider">Exercise & Workout Details</h4>
              
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5">Workout Types</label>
                <div className="flex flex-wrap gap-2">
                  {workoutTypeOptions.map((wt) => {
                    const isSelected = workoutTypes.includes(wt);
                    return (
                      <button
                        key={wt}
                        type="button"
                        onClick={() => toggleArrayItem(workoutTypes, setWorkoutTypes, wt)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold border ${
                          isSelected ? 'bg-emerald-800 text-white border-emerald-800' : 'bg-white text-stone-700 border-stone-300'
                        }`}
                      >
                        {wt}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Workout Frequency</label>
                  <select
                    value={workoutFrequency}
                    onChange={(e) => setWorkoutFrequency(e.target.value)}
                    className="w-full p-2.5 bg-white border border-stone-300 rounded-xl text-xs font-bold"
                  >
                    <option value="Never">Never</option>
                    <option value="1–2 Days">1–2 Days/Wk</option>
                    <option value="3–4 Days">3–4 Days/Wk</option>
                    <option value="5–6 Days">5–6 Days/Wk</option>
                    <option value="Daily">Daily</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Workout Duration</label>
                  <select
                    value={workoutDuration}
                    onChange={(e) => setWorkoutDuration(Number(e.target.value))}
                    className="w-full p-2.5 bg-white border border-stone-300 rounded-xl text-xs font-bold"
                  >
                    <option value={15}>15 Minutes</option>
                    <option value={30}>30 Minutes</option>
                    <option value={45}>45 Minutes</option>
                    <option value={60}>60 Minutes</option>
                    <option value={90}>90 Minutes</option>
                    <option value={120}>120 Minutes</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Daily Step Count</label>
                  <input
                    type="number"
                    value={dailyStepCount}
                    onChange={(e) => setDailyStepCount(Number(e.target.value))}
                    className="w-full p-2.5 bg-white border border-stone-300 rounded-xl text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Strength / Cardio Sessions</label>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      placeholder="Strength"
                      value={strengthSessions}
                      onChange={(e) => setStrengthSessions(Number(e.target.value))}
                      className="w-1/2 p-2.5 bg-white border border-stone-300 rounded-xl text-xs font-bold text-center"
                    />
                    <input
                      type="number"
                      placeholder="Cardio"
                      value={cardioSessions}
                      onChange={(e) => setCardioSessions(Number(e.target.value))}
                      className="w-1/2 p-2.5 bg-white border border-stone-300 rounded-xl text-xs font-bold text-center"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between pt-4">
            <button
              onClick={() => setActiveStep('tracking')}
              className="bg-stone-200 text-stone-700 font-bold px-5 py-2.5 rounded-xl text-xs hover:bg-stone-300"
            >
              Back
            </button>
            <button
              onClick={() => setActiveStep('medical_blood')}
              className="bg-amber-950 text-white font-extrabold px-6 py-2.5 rounded-xl text-xs hover:bg-amber-900 transition-all flex items-center gap-2"
            >
              <span>Proceed to Medical & Blood Lab Tests</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: MEDICAL CONDITIONS & BLOOD TEST RESULTS */}
      {activeStep === 'medical_blood' && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-6">
          <div className="border-b border-stone-100 pb-4 flex items-center justify-between">
            <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-emerald-700" />
              <span>4. Medical Conditions, Medications & Blood Test Results</span>
            </h3>
            <span className="text-xs font-bold text-stone-400">Step 4 of 6</span>
          </div>

          {/* Medical Conditions */}
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-2">Medical Conditions (Multi-select)</label>
            <div className="flex flex-wrap gap-2">
              {medicalOptions.map((med) => {
                const isSelected = medicalConditions.includes(med);
                return (
                  <button
                    key={med}
                    type="button"
                    onClick={() => toggleArrayItem(medicalConditions, setMedicalConditions, med)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                      isSelected
                        ? 'bg-rose-700 text-white border-rose-700 shadow-xs'
                        : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    {isSelected && '✓ '} {med}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Current Medications & Supplements */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Current Medications (Free Text)</label>
              <textarea
                rows={2}
                value={currentMedications}
                onChange={(e) => setCurrentMedications(e.target.value)}
                placeholder="e.g. Metformin 500mg, Thyronorm 50mcg"
                className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1.5">Supplements (Multi-select)</label>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-stone-50 rounded-xl border border-stone-200">
                {supplementOptions.map((sup) => {
                  const isSelected = supplements.includes(sup);
                  return (
                    <button
                      key={sup}
                      type="button"
                      onClick={() => toggleArrayItem(supplements, setSupplements, sup)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                        isSelected ? 'bg-amber-800 text-white border-amber-800' : 'bg-white text-stone-700 border-stone-300'
                      }`}
                    >
                      {sup}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Blood Test Results Section */}
          <div className="p-5 bg-amber-50/50 rounded-2xl border border-amber-200/80 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-extrabold uppercase text-amber-950 tracking-wider flex items-center gap-2">
                <Droplets className="w-4 h-4 text-amber-800" />
                <span>Blood Test Results (Optional Clinical Entry)</span>
              </h4>
              <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300">
                15 Lab Parameters
              </span>
            </div>

            {/* Non-Blocking Alert Notice */}
            {isBloodTestSkipped && (
              <div className="p-3 bg-amber-100 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-center gap-2 font-medium">
                <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0" />
                <span>Note: Blood test parameters are skipped. Dietitian consultation may request blood work for clinical accuracy. Submission is not blocked.</span>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-stone-600 mb-1">Fasting Blood Sugar (mg/dL)</label>
                <input
                  type="number"
                  value={bloodTests.fastingBloodSugar || ''}
                  onChange={(e) => setBloodTests({ ...bloodTests, fastingBloodSugar: Number(e.target.value) })}
                  className="w-full p-2 bg-white border border-stone-300 rounded-lg text-xs font-bold text-center outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-stone-600 mb-1">HbA1c (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={bloodTests.hbA1c || ''}
                  onChange={(e) => setBloodTests({ ...bloodTests, hbA1c: Number(e.target.value) })}
                  className="w-full p-2 bg-white border border-stone-300 rounded-lg text-xs font-bold text-center outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-stone-600 mb-1">Total Cholesterol (mg/dL)</label>
                <input
                  type="number"
                  value={bloodTests.totalCholesterol || ''}
                  onChange={(e) => setBloodTests({ ...bloodTests, totalCholesterol: Number(e.target.value) })}
                  className="w-full p-2 bg-white border border-stone-300 rounded-lg text-xs font-bold text-center outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-stone-600 mb-1">HDL (mg/dL)</label>
                <input
                  type="number"
                  value={bloodTests.hdl || ''}
                  onChange={(e) => setBloodTests({ ...bloodTests, hdl: Number(e.target.value) })}
                  className="w-full p-2 bg-white border border-stone-300 rounded-lg text-xs font-bold text-center outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-stone-600 mb-1">LDL (mg/dL)</label>
                <input
                  type="number"
                  value={bloodTests.ldl || ''}
                  onChange={(e) => setBloodTests({ ...bloodTests, ldl: Number(e.target.value) })}
                  className="w-full p-2 bg-white border border-stone-300 rounded-lg text-xs font-bold text-center outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-stone-600 mb-1">Triglycerides (mg/dL)</label>
                <input
                  type="number"
                  value={bloodTests.triglycerides || ''}
                  onChange={(e) => setBloodTests({ ...bloodTests, triglycerides: Number(e.target.value) })}
                  className="w-full p-2 bg-white border border-stone-300 rounded-lg text-xs font-bold text-center outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-stone-600 mb-1">Hemoglobin (g/dL)</label>
                <input
                  type="number"
                  step="0.1"
                  value={bloodTests.hemoglobin || ''}
                  onChange={(e) => setBloodTests({ ...bloodTests, hemoglobin: Number(e.target.value) })}
                  className="w-full p-2 bg-white border border-stone-300 rounded-lg text-xs font-bold text-center outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-stone-600 mb-1">Vitamin D (ng/mL)</label>
                <input
                  type="number"
                  value={bloodTests.vitaminD || ''}
                  onChange={(e) => setBloodTests({ ...bloodTests, vitaminD: Number(e.target.value) })}
                  className="w-full p-2 bg-white border border-stone-300 rounded-lg text-xs font-bold text-center outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-stone-600 mb-1">Vitamin B12 (pg/mL)</label>
                <input
                  type="number"
                  value={bloodTests.vitaminB12 || ''}
                  onChange={(e) => setBloodTests({ ...bloodTests, vitaminB12: Number(e.target.value) })}
                  className="w-full p-2 bg-white border border-stone-300 rounded-lg text-xs font-bold text-center outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-stone-600 mb-1">Ferritin (ng/mL)</label>
                <input
                  type="number"
                  value={bloodTests.ferritin || ''}
                  onChange={(e) => setBloodTests({ ...bloodTests, ferritin: Number(e.target.value) })}
                  className="w-full p-2 bg-white border border-stone-300 rounded-lg text-xs font-bold text-center outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-stone-600 mb-1">Uric Acid (mg/dL)</label>
                <input
                  type="number"
                  step="0.1"
                  value={bloodTests.uricAcid || ''}
                  onChange={(e) => setBloodTests({ ...bloodTests, uricAcid: Number(e.target.value) })}
                  className="w-full p-2 bg-white border border-stone-300 rounded-lg text-xs font-bold text-center outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-stone-600 mb-1">Creatinine (mg/dL)</label>
                <input
                  type="number"
                  step="0.1"
                  value={bloodTests.creatinine || ''}
                  onChange={(e) => setBloodTests({ ...bloodTests, creatinine: Number(e.target.value) })}
                  className="w-full p-2 bg-white border border-stone-300 rounded-lg text-xs font-bold text-center outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-stone-600 mb-1">TSH (mIU/L)</label>
                <input
                  type="number"
                  step="0.1"
                  value={bloodTests.tsh || ''}
                  onChange={(e) => setBloodTests({ ...bloodTests, tsh: Number(e.target.value) })}
                  className="w-full p-2 bg-white border border-stone-300 rounded-lg text-xs font-bold text-center outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-stone-600 mb-1">SGOT (U/L)</label>
                <input
                  type="number"
                  value={bloodTests.sgot || ''}
                  onChange={(e) => setBloodTests({ ...bloodTests, sgot: Number(e.target.value) })}
                  className="w-full p-2 bg-white border border-stone-300 rounded-lg text-xs font-bold text-center outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-stone-600 mb-1">SGPT (U/L)</label>
                <input
                  type="number"
                  value={bloodTests.sgpt || ''}
                  onChange={(e) => setBloodTests({ ...bloodTests, sgpt: Number(e.target.value) })}
                  className="w-full p-2 bg-white border border-stone-300 rounded-lg text-xs font-bold text-center outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <button
              onClick={() => setActiveStep('goals_activity')}
              className="bg-stone-200 text-stone-700 font-bold px-5 py-2.5 rounded-xl text-xs hover:bg-stone-300"
            >
              Back
            </button>
            <button
              onClick={() => setActiveStep('nutrition_lifestyle')}
              className="bg-amber-950 text-white font-extrabold px-6 py-2.5 rounded-xl text-xs hover:bg-amber-900 transition-all flex items-center gap-2"
            >
              <span>Proceed to Food Preferences & Lifestyle</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: FOOD PREFERENCES, ALLERGIES & LIFESTYLE */}
      {activeStep === 'nutrition_lifestyle' && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-6">
          <div className="border-b border-stone-100 pb-4 flex items-center justify-between">
            <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
              <Apple className="w-5 h-5 text-emerald-700" />
              <span>5. Food Preference, Allergies, Dislikes & Lifestyle</span>
            </h3>
            <span className="text-xs font-bold text-stone-400">Step 5 of 6</span>
          </div>

          {/* Food Preference & Allergies */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Dietary Preference</label>
              <select
                value={foodPreference}
                onChange={(e) => setFoodPreference(e.target.value as any)}
                className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="Non-Vegetarian">Non-Vegetarian</option>
                <option value="Vegetarian">Vegetarian</option>
                <option value="Eggetarian">Eggetarian</option>
                <option value="Vegan">Pure Vegan</option>
                <option value="Keto">Keto (Low Carb, High Healthy Fats)</option>
                <option value="High-Protein">High-Protein Power Diet</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1.5">Allergies (Multi-select)</label>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-stone-50 rounded-xl border border-stone-200">
                {allergyOptions.map((alg) => {
                  const isSelected = allergies.includes(alg);
                  return (
                    <button
                      key={alg}
                      type="button"
                      onClick={() => toggleArrayItem(allergies, setAllergies, alg)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                        isSelected ? 'bg-rose-700 text-white border-rose-700' : 'bg-white text-stone-700 border-stone-300'
                      }`}
                    >
                      {alg}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Custom Queries / Special Medical Instructions */}
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Custom Queries & Special Requests for Dietitian</label>
            <textarea
              rows={2}
              value={customQuery}
              onChange={(e) => setCustomQuery(e.target.value)}
              placeholder="e.g. Please avoid nightshades due to joint pain, or prefer extra olive oil in dressings..."
              className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Disliked Ingredients Free Text List */}
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Foods You Dislike (Excluded from meal swap engine)</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                placeholder="Type ingredient (e.g. Bitter Gourd, Mushrooms) and press Add"
                value={dislikeInput}
                onChange={(e) => setDislikeInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddDislike())}
                className="flex-1 p-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold outline-none"
              />
              <button
                type="button"
                onClick={handleAddDislike}
                className="bg-stone-800 text-white font-bold px-4 py-2.5 rounded-xl text-xs hover:bg-stone-900"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {foodDislikes.map((dis) => (
                <span key={dis} className="px-3 py-1 bg-stone-100 text-stone-800 rounded-xl text-xs font-bold border border-stone-300 flex items-center gap-1.5">
                  <span>{dis}</span>
                  <button type="button" onClick={() => setFoodDislikes(foodDislikes.filter((x) => x !== dis))} className="text-stone-400 hover:text-stone-700">×</button>
                </span>
              ))}
            </div>
          </div>

          {/* Lifestyle: Digestive Health, Smoking, Alcohol, Stress */}
          <div className="p-5 bg-stone-50 rounded-2xl border border-stone-200 space-y-4">
            <h4 className="text-xs font-extrabold uppercase text-stone-800 tracking-wider">Lifestyle & Digestive Health</h4>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1.5">Digestive Health Concerns</label>
              <div className="flex flex-wrap gap-1.5">
                {digestiveOptions.map((dig) => {
                  const isSelected = digestiveHealth.includes(dig);
                  return (
                    <button
                      key={dig}
                      type="button"
                      onClick={() => toggleArrayItem(digestiveHealth, setDigestiveHealth, dig)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                        isSelected ? 'bg-amber-900 text-amber-200 border-amber-900' : 'bg-white text-stone-700 border-stone-300'
                      }`}
                    >
                      {dig}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Smoking</label>
                <select
                  value={smoking}
                  onChange={(e) => setSmoking(e.target.value as any)}
                  className="w-full p-2.5 bg-white border border-stone-300 rounded-xl text-xs font-bold"
                >
                  <option value="Never">Never</option>
                  <option value="Occasionally">Occasionally</option>
                  <option value="Daily">Daily</option>
                  <option value="Former Smoker">Former Smoker</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Alcohol</label>
                <select
                  value={alcohol}
                  onChange={(e) => setAlcohol(e.target.value as any)}
                  className="w-full p-2.5 bg-white border border-stone-300 rounded-xl text-xs font-bold"
                >
                  <option value="Never">Never</option>
                  <option value="Monthly">Monthly</option>
                  <option value="Weekly">Weekly</option>
                  <option value="Daily">Daily</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Tobacco</label>
                <select
                  value={tobacco}
                  onChange={(e) => setTobacco(e.target.value as any)}
                  className="w-full p-2.5 bg-white border border-stone-300 rounded-xl text-xs font-bold"
                >
                  <option value="Never">Never</option>
                  <option value="Occasionally">Occasionally</option>
                  <option value="Daily">Daily</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Sleep Quality</label>
                <select
                  value={sleepQuality}
                  onChange={(e) => setSleepQuality(e.target.value as any)}
                  className="w-full p-2.5 bg-white border border-stone-300 rounded-xl text-xs font-bold"
                >
                  <option value="Excellent">Excellent</option>
                  <option value="Good">Good</option>
                  <option value="Average">Average</option>
                  <option value="Poor">Poor</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold text-stone-700 mb-1">
                <span>Stress Level (1–10 Slider)</span>
                <span className="text-amber-800 font-extrabold">{stressLevel} / 10</span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                value={stressLevel}
                onChange={(e) => setStressLevel(Number(e.target.value))}
                className="w-full accent-amber-800 cursor-pointer"
              />
            </div>
          </div>

          {/* Women-Only Fields (if gender is female) */}
          {gender === 'female' && (
            <div className="p-5 bg-pink-50/60 rounded-2xl border border-pink-200 space-y-3">
              <h4 className="text-xs font-extrabold uppercase text-pink-950 tracking-wider">Women-Only Clinical Health Parameters</h4>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-pink-950 mb-1">Pregnant?</label>
                  <select
                    value={isPregnant ? 'yes' : 'no'}
                    onChange={(e) => setIsPregnant(e.target.value === 'yes')}
                    className="w-full p-2 bg-white border border-pink-300 rounded-xl text-xs font-bold"
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-pink-950 mb-1">Breastfeeding?</label>
                  <select
                    value={isBreastfeeding ? 'yes' : 'no'}
                    onChange={(e) => setIsBreastfeeding(e.target.value === 'yes')}
                    className="w-full p-2 bg-white border border-pink-300 rounded-xl text-xs font-bold"
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-pink-950 mb-1">Menstrual Cycle</label>
                  <select
                    value={menstrualCycle}
                    onChange={(e) => setMenstrualCycle(e.target.value as any)}
                    className="w-full p-2 bg-white border border-pink-300 rounded-xl text-xs font-bold"
                  >
                    <option value="Regular">Regular</option>
                    <option value="Irregular">Irregular</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-pink-950 mb-1">Menopause?</label>
                  <select
                    value={isMenopause ? 'yes' : 'no'}
                    onChange={(e) => setIsMenopause(e.target.value === 'yes')}
                    className="w-full p-2 bg-white border border-pink-300 rounded-xl text-xs font-bold"
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between pt-4">
            <button
              onClick={() => setActiveStep('medical_blood')}
              className="bg-stone-200 text-stone-700 font-bold px-5 py-2.5 rounded-xl text-xs hover:bg-stone-300"
            >
              Back
            </button>
            <button
              onClick={() => setActiveStep('plan_selection')}
              className="bg-amber-950 text-white font-extrabold px-6 py-2.5 rounded-xl text-xs hover:bg-amber-900 transition-all flex items-center gap-2"
            >
              <span>Proceed to Meal Plan Schedule & Duration</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 6: MACRO CALCULATIONS & TAILORED MEALS SUBSCRIPTION PROMPT */}
      {activeStep === 'plan_selection' && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-6">
          <div className="border-b border-stone-100 pb-4 flex items-center justify-between">
            <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-700" />
              <span>6. Macro Calculations</span>
            </h3>
            <span className="text-xs font-bold text-stone-400">Step 6 of 6</span>
          </div>

          {/* COMPREHENSIVE CLINICAL PARAMETERS DISPLAY */}
          <div className="bg-stone-900 text-white p-6 rounded-3xl space-y-4 border border-stone-800 shadow-md">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <h4 className="text-sm font-black text-amber-300 uppercase tracking-wider">
                  Clinical Body & Macro Parameters Calculated
                </h4>
              </div>
              <span className="text-[10px] font-extrabold px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full border border-emerald-500/30">
                Verified Formula Calculations
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              
              {/* BMI Index */}
              <div className="bg-stone-800/80 p-3.5 rounded-2xl border border-stone-700/80 space-y-1">
                <span className="text-[10px] font-extrabold uppercase text-stone-400 block">BMI Index</span>
                <div className="text-xl font-black text-white">{bmi} <span className="text-[10px] text-stone-400 font-normal">kg/m²</span></div>
                <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                  bmiCategory === 'Normal' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                }`}>
                  {bmiCategory}
                </span>
              </div>

              {/* Baseline BMR */}
              <div className="bg-stone-800/80 p-3.5 rounded-2xl border border-stone-700/80 space-y-1">
                <span className="text-[10px] font-extrabold uppercase text-stone-400 block">Baseline BMR</span>
                <div className="text-xl font-black text-emerald-400">{bmr} <span className="text-[10px] text-stone-400 font-normal">kcal/d</span></div>
                <span className="text-[9px] text-stone-400 font-semibold block">Mifflin-St Jeor</span>
              </div>

              {/* TDEE Calories */}
              <div className="bg-stone-800/80 p-3.5 rounded-2xl border border-stone-700/80 space-y-1">
                <span className="text-[10px] font-extrabold uppercase text-stone-400 block">TDEE Calories</span>
                <div className="text-xl font-black text-amber-400">{tdee} <span className="text-[10px] text-stone-400 font-normal">kcal/d</span></div>
                <span className="text-[9px] text-stone-400 capitalize font-bold block">{activityLevel} Activity</span>
              </div>

              {/* Ideal Body Weight */}
              <div className="bg-stone-800/80 p-3.5 rounded-2xl border border-stone-700/80 space-y-1">
                <span className="text-[10px] font-extrabold uppercase text-stone-400 block">Ideal Weight</span>
                <div className="text-xl font-black text-blue-300">{idealBodyWeightKg} <span className="text-[10px] text-stone-400 font-normal">kg</span></div>
                <span className="text-[9px] text-stone-400 font-semibold block">Target: {targetWeightKg} kg</span>
              </div>

              {/* Lean Body Mass */}
              <div className="bg-stone-800/80 p-3.5 rounded-2xl border border-stone-700/80 space-y-1">
                <span className="text-[10px] font-extrabold uppercase text-stone-400 block">Lean Weight</span>
                <div className="text-xl font-black text-teal-300">{leanBodyMassKg} <span className="text-[10px] text-stone-400 font-normal">kg</span></div>
                <span className="text-[9px] text-stone-400 font-semibold block">Boer Formula</span>
              </div>

              {/* Water Target */}
              <div className="bg-stone-800/80 p-3.5 rounded-2xl border border-stone-700/80 space-y-1">
                <span className="text-[10px] font-extrabold uppercase text-stone-400 block">Water Target</span>
                <div className="text-xl font-black text-cyan-300">{waterRequirementL} <span className="text-[10px] text-stone-400 font-normal">L/d</span></div>
                <span className="text-[9px] text-cyan-400 font-bold block">Hydration Goal</span>
              </div>

            </div>

            {/* Target Daily Calories & Macro Breakdown Row */}
            <div className="pt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-emerald-950/80 rounded-2xl border border-emerald-800/80 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-300">Target Daily Calories</span>
                  <div className="text-2xl font-black text-white">{targetCalories} <span className="text-xs text-stone-300 font-normal">kcal / day</span></div>
                  <span className="text-[10px] text-emerald-200 font-bold">
                    {calorieDeficitSurplus > 0 ? `+${calorieDeficitSurplus} kcal surplus` : `${calorieDeficitSurplus} kcal deficit`} ({goal.replace('_', ' ')})
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-stone-400 block font-bold">Waist-to-Hip Ratio</span>
                  <span className="text-base font-black text-amber-300">
                    {hipCm > 0 ? (waistCm / hipCm).toFixed(2) : '0.82'}
                  </span>
                </div>
              </div>

              <div className="p-4 bg-stone-800/90 rounded-2xl border border-stone-700 grid grid-cols-4 gap-2 text-center">
                <div>
                  <span className="text-[9px] font-extrabold uppercase text-amber-300 block">Protein</span>
                  <span className="text-base font-black text-white">{proteinGrams}g</span>
                  <span className="text-[9px] text-stone-400 block">{Math.round((proteinGrams * 4 / targetCalories) * 100)}%</span>
                </div>
                <div>
                  <span className="text-[9px] font-extrabold uppercase text-emerald-300 block">Carbs</span>
                  <span className="text-base font-black text-white">{carbsGrams}g</span>
                  <span className="text-[9px] text-stone-400 block">{Math.round((carbsGrams * 4 / targetCalories) * 100)}%</span>
                </div>
                <div>
                  <span className="text-[9px] font-extrabold uppercase text-amber-400 block">Fats</span>
                  <span className="text-base font-black text-white">{fatGrams}g</span>
                  <span className="text-[9px] text-stone-400 block">{Math.round((fatGrams * 9 / targetCalories) * 100)}%</span>
                </div>
                <div>
                  <span className="text-[9px] font-extrabold uppercase text-cyan-300 block">Fiber</span>
                  <span className="text-base font-black text-white">{fiberGrams}g</span>
                  <span className="text-[9px] text-stone-400 block">Daily</span>
                </div>
              </div>
            </div>
          </div>

          {/* TAILORED MEALS DOORSTEP SUBSCRIPTION PROMPT BANNER */}
          <div className="bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-stone-950 p-6 sm:p-8 rounded-3xl border-2 border-amber-300 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-1.5 text-center md:text-left">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-stone-950 text-amber-300 text-xs font-black uppercase rounded-full">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Doorstep Meal Delivery
              </span>
              <h3 className="text-xl sm:text-2xl font-black text-stone-950 tracking-tight leading-tight">
                Do you wish to tailored meals at your doorsteps?
              </h3>
              <p className="text-xs sm:text-sm font-bold text-stone-800 max-w-xl leading-relaxed">
                Receive freshly prepared, chef-crafted protein bowls and diet meals delivered right to your home or office based on your calculated BMR ({bmr} kcal) and TDEE ({tdee} kcal).
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setOtpPhone(phone || '+91 98765 43210');
                setOtpCode('');
                setOtpError('');
                setShowOtpModal(true);
              }}
              className="w-full md:w-auto bg-stone-950 hover:bg-stone-900 text-amber-300 font-black px-8 py-4 rounded-2xl text-sm transition-all shadow-xl hover:scale-105 flex items-center justify-center gap-2 border-2 border-amber-300 shrink-0 cursor-pointer"
            >
              <span>Click Here</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* MOBILE PHONE OTP VERIFICATION MODAL */}
      {showOtpModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white text-stone-900 rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-stone-200 relative">
            <button
              onClick={() => setShowOtpModal(false)}
              className="absolute top-4 right-4 text-stone-400 hover:text-stone-700 p-2 rounded-full hover:bg-stone-100"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-emerald-100 rounded-2xl mx-auto flex items-center justify-center text-emerald-800">
                <Phone className="w-6 h-6 text-emerald-700" />
              </div>
              <h3 className="text-xl font-black text-stone-900">Mobile OTP Verification</h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                Confirm your mobile phone number to authenticate your doorstep meal subscription and launch your customer dashboard.
              </p>
            </div>

            {!otpSent ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Mobile Phone Number</label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-stone-400 absolute left-3 top-3.5" />
                    <input
                      type="tel"
                      value={otpPhone}
                      onChange={(e) => setOtpPhone(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold outline-none focus:border-emerald-700 text-stone-900"
                      placeholder="+91 98765 43210"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setOtpSent(true);
                    setOtpCode('1234');
                  }}
                  className="w-full bg-emerald-800 hover:bg-emerald-700 text-white font-extrabold py-3.5 rounded-xl text-xs transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <span>Send OTP to Mobile Phone</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                  <span className="text-xs text-emerald-900 font-bold block">
                    OTP Code Sent to {otpPhone}
                  </span>
                  <span className="text-[11px] text-stone-600 font-medium">
                    Enter verification code (Demo OTP: <strong className="font-mono text-emerald-800 font-black">1234</strong>)
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Verification OTP</label>
                  <input
                    type="text"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => {
                      setOtpCode(e.target.value);
                      setOtpError('');
                    }}
                    className="w-full p-3 bg-stone-50 border border-stone-300 rounded-xl text-center text-xl font-mono font-black tracking-widest text-stone-900 outline-none focus:border-emerald-700"
                    placeholder="1234"
                  />
                </div>

                {otpError && (
                  <p className="text-xs text-rose-600 font-bold text-center">{otpError}</p>
                )}

                <button
                  type="button"
                  onClick={() => {
                    if (!otpCode || otpCode.length < 4) {
                      setOtpError('Please enter the 4-digit OTP (1234)');
                      return;
                    }
                    const updated = getUpdatedProfileObj();
                    onSaveProfile(updated);
                    confetti({ particleCount: 80, spread: 80 });
                    setShowOtpModal(false);
                    if (onProceedToCustomerModule) {
                      onProceedToCustomerModule(updated);
                    } else if (onProceedToPlan) {
                      onProceedToPlan();
                    }
                  }}
                  className="w-full bg-emerald-800 hover:bg-emerald-700 text-white font-black py-3.5 rounded-xl text-xs transition-all shadow-lg flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4 text-emerald-300" />
                  <span>Verify OTP & Launch Customer Dashboard</span>
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setOtpSent(false)}
                    className="text-[11px] text-stone-500 hover:text-stone-800 font-bold underline"
                  >
                    Change Phone Number
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
