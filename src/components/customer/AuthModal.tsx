import React, { useState } from 'react';
import { CustomerProfile, BloodTestResults, ActivityLevel, HealthGoal, UserRole } from '../../types';
import { useAuth, mapBackendRoleToUserRole } from '../../context/AuthContext';
import { CustomerService } from '../../services/customerService';
import { LogoMark } from '../common/LogoMark';
import { 
  X, Mail, Lock, Phone, User, Calendar, ShieldCheck, ArrowRight, CheckCircle2, 
  Activity, Scale, Stethoscope, Droplets, Apple, AlertTriangle, Sparkles, Flame, Clock,
  Briefcase, ChefHat, Utensils, Building2, Truck, Layers, Key, Check
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { calculateHealthMetrics } from '../../utils/healthCalculator';

export interface EmployeeLoginData {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  designation: string;
  avatarBg?: string;
}

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessLogin: (user: CustomerProfile) => void;
  initialProfile: CustomerProfile;
  initialMode?: 'signin' | 'signup' | 'employee_login';
  onEmployeeLogin?: (role: UserRole, employeeData: EmployeeLoginData) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccessLogin,
  initialProfile,
  initialMode = 'signin',
  onEmployeeLogin
}) => {
  const auth = useAuth();
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const [mode, setMode] = useState<'signin' | 'signup' | 'otp' | 'forgot' | 'health_capture' | 'employee_login'>(initialMode);
  
  // Employee Login State
  const [employeeDeptFilter, setEmployeeDeptFilter] = useState<'all' | 'kerala_mess' | 'kitchen' | 'aggregators' | 'management'>('all');
  const [employeeFormData, setEmployeeFormData] = useState({
    empIdOrEmail: 'murugan.mess@proteinbowl.in',
    securityPin: 'Password123!',
    targetRole: 'chef' as UserRole,
    department: 'Kerala Mess & Hostel Ops'
  });
  const [employeeLoginSuccess, setEmployeeLoginSuccess] = useState<string | null>(null);

  // Auth basic fields
  const [formData, setFormData] = useState({
    name: initialProfile?.name || 'Anjali Ramesh',
    email: initialProfile?.email || 'anjali@example.com',
    phone: initialProfile?.phone || '+91 98765 43210',
    dob: initialProfile?.dob || '1995-04-18',
    password: 'Password123!',
    otp: ''
  });
  const [forgotSuccess, setForgotSuccess] = useState(false);

  const EMPLOYEE_PRESETS: (EmployeeLoginData & { badge?: string; desc: string })[] = [
    {
      id: 'EMP-105',
      name: 'Chef Murugan K.',
      email: 'murugan.mess@proteinbowl.in',
      role: 'chef',
      department: 'kerala_mess',
      designation: 'Kerala Mess Lead Chef (Kettles & Traditional Kitchen)',
      badge: '🍛 Kerala Mess KDS',
      desc: 'Steam kettle batches, traditional avial/sambar production, and kitchen dispatch.',
      avatarBg: 'bg-amber-600'
    },
    {
      id: 'EMP-106',
      name: 'Ananthan V. Menon',
      email: 'ananthan.mess@proteinbowl.in',
      role: 'mess_customer',
      department: 'kerala_mess',
      designation: 'Kerala Mess Logistics & Hostel Distribution Manager',
      badge: '📦 Hostel Distribution',
      desc: 'Hostel crate dispatch, daily meal subscription delivery, and student passes.',
      avatarBg: 'bg-emerald-700'
    },
    {
      id: 'EMP-107',
      name: 'Lekshmi Devi R.',
      email: 'lekshmi@proteinbowl.in',
      role: 'nutritionist',
      department: 'kerala_mess',
      designation: 'Kerala Mess Nutritional Auditor & Recipe Incharge',
      badge: '🥗 Mess Nutrition',
      desc: 'Homestyle Kerala dietary quality checks, macro targets, and weekly menu recipes.',
      avatarBg: 'bg-teal-600'
    },
    {
      id: 'EMP-102',
      name: 'Chef Suresh Kumar',
      email: 'suresh@proteinbowl.in',
      role: 'chef',
      department: 'kitchen',
      designation: 'Executive Head Chef (Central Kitchen KDS)',
      badge: '👨‍🍳 Central Kitchen',
      desc: 'Multi-station KDS line, grill deck, macro bowls, and kitchen inventory prep.',
      avatarBg: 'bg-orange-600'
    },
    {
      id: 'EMP-SWIG',
      name: 'Rahul M.',
      email: 'rahul.aggregators@proteinbowl.in',
      role: 'swiggy_zomato',
      department: 'aggregators',
      designation: 'Swiggy & Zomato Aggregator Channel Lead',
      badge: '⚡ Aggregator Sync',
      desc: 'Swiggy/Zomato live sync, stock reserve buffers, and omnichannel batch tracking.',
      avatarBg: 'bg-orange-500'
    },
    {
      id: 'EMP-MD',
      name: 'Dr. Anoop S. / Mathew Thomas',
      email: 'md@proteinbowl.in',
      role: 'md',
      department: 'management',
      designation: 'Managing Director & Strategic Operations Head',
      badge: '🏢 MD Executive Suite',
      desc: 'Financial analytics, HRM & staff payroll, multi-kitchen telemetry, and governance.',
      avatarBg: 'bg-stone-900'
    },
    {
      id: 'EMP-POS',
      name: 'Anjana Ramesh',
      email: 'pos.kochi@nutrifitkitchen.in',
      role: 'pos',
      department: 'management',
      designation: 'Lead POS Cashier & Counter Manager',
      badge: '💰 POS Counter',
      desc: 'Walk-in orders, barcode scanning, student token billing, and instant receipt printing.',
      avatarBg: 'bg-indigo-600'
    },
    {
      id: 'EMP-FMCG',
      name: 'Varghese Kurian',
      email: 'fmcg.distribution@nutrifitkitchen.in',
      role: 'bakery_fmcg',
      department: 'management',
      designation: 'Category Lead (FMCG & Bakery Foods)',
      badge: '🍞 FMCG Bakery',
      desc: 'Artisan bakery batch tracking, FMCG dispatch challans, and retail shelf inventory.',
      avatarBg: 'bg-amber-700'
    },
    {
      id: 'EMP-104',
      name: 'Kiran K. Das',
      email: 'kiran@proteinbowl.in',
      role: 'delivery',
      department: 'management',
      designation: 'Fleet Dispatch & Logistics Supervisor',
      badge: '🚚 Delivery Fleet',
      desc: 'Rider dispatch, multi-stop routing to hostels and IT parks, cold chain monitoring.',
      avatarBg: 'bg-purple-600'
    }
  ];

  const handleQuickEmployeeLogin = async (preset: EmployeeLoginData & { desc: string }) => {
    setAuthError(null);
    setIsSubmitting(true);
    const res = await auth.login({
      email: preset.email,
      password: 'Password123!'
    });
    setIsSubmitting(false);

    if (res.success && res.roles) {
      const mappedRole = mapBackendRoleToUserRole(res.roles);
      setEmployeeLoginSuccess(`Authenticated via Backend as ${preset.name}`);
      confetti({ particleCount: 60, spread: 70 });
      setTimeout(() => {
        if (onEmployeeLogin) {
          onEmployeeLogin(mappedRole, preset);
        }
        onClose();
      }, 600);
    } else {
      // Demo fallback if offline/unseeded
      setEmployeeLoginSuccess(`Demo Access: ${preset.name}`);
      if (onEmployeeLogin) {
        onEmployeeLogin(preset.role, preset);
      }
      onClose();
    }
  };

  const handleManualEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsSubmitting(true);

    const res = await auth.login({
      email: employeeFormData.empIdOrEmail,
      password: employeeFormData.securityPin
    });
    setIsSubmitting(false);

    if (res.success && res.roles) {
      const mappedRole = mapBackendRoleToUserRole(res.roles);
      const staffData: EmployeeLoginData = {
        id: auth.user?.employeeProfile?.employeeCode || 'EMP-STAFF',
        name: auth.user?.employeeProfile?.fullName || employeeFormData.empIdOrEmail.split('@')[0],
        email: employeeFormData.empIdOrEmail,
        role: mappedRole,
        department: employeeFormData.department,
        designation: auth.user?.employeeProfile?.designation || 'Staff Account'
      };

      setEmployeeLoginSuccess(`Access Granted: ${staffData.name}`);
      confetti({ particleCount: 60, spread: 70 });
      setTimeout(() => {
        if (onEmployeeLogin) {
          onEmployeeLogin(mappedRole, staffData);
        }
        onClose();
      }, 600);
    } else {
      setAuthError(res.message || 'Invalid employee ID or password');
    }
  };

  // Demographic & Health Data Capture State
  const [gender, setGender] = useState<'female' | 'male' | 'other'>(initialProfile?.gender || 'female');
  const [heightCm, setHeightCm] = useState<number>(initialProfile?.heightCm || 165);
  const [weightKg, setWeightKg] = useState<number>(initialProfile?.weightKg || 68);
  const [targetWeightKg, setTargetWeightKg] = useState<number>(initialProfile?.targetWeightKg || 58);
  const [occupation, setOccupation] = useState<string>(initialProfile?.occupation || 'IT Professional');
  const [workSchedule, setWorkSchedule] = useState<string>(initialProfile?.workSchedule || 'Flexible Hours');
  const [sleepDuration, setSleepDuration] = useState<number>(initialProfile?.sleepDuration || 7);
  const [wakeUpTime, setWakeUpTime] = useState<string>(initialProfile?.wakeUpTime || '06:30');
  const [bedTime, setBedTime] = useState<string>(initialProfile?.bedTime || '23:00');

  // Tracking & Circumferences
  const [muscleMassKg, setMuscleMassKg] = useState<number>(initialProfile?.muscleMassKg || 24.5);
  const [waistCm, setWaistCm] = useState<number>(initialProfile?.circumferences?.waistCm || 81);
  const [hipCm, setHipCm] = useState<number>(initialProfile?.circumferences?.hipCm || 98);
  const [chestCm, setChestCm] = useState<number>(initialProfile?.circumferences?.chestCm || 88);
  const [neckCm, setNeckCm] = useState<number>(initialProfile?.circumferences?.neckCm || 34);

  const [leftArmCm, setLeftArmCm] = useState<number>(initialProfile?.limbCircumferences?.leftArmCm || 28);
  const [rightArmCm, setRightArmCm] = useState<number>(initialProfile?.limbCircumferences?.rightArmCm || 28.5);
  const [leftThighCm, setLeftThighCm] = useState<number>(initialProfile?.limbCircumferences?.leftThighCm || 56);
  const [rightThighCm, setRightThighCm] = useState<number>(initialProfile?.limbCircumferences?.rightThighCm || 56.5);
  const [leftCalfCm, setLeftCalfCm] = useState<number>(initialProfile?.limbCircumferences?.leftCalfCm || 36);
  const [rightCalfCm, setRightCalfCm] = useState<number>(initialProfile?.limbCircumferences?.rightCalfCm || 36);

  // Goals & Exercise
  const [goal, setGoal] = useState<HealthGoal>(initialProfile?.goal || 'weight_loss');
  const [primaryGoals, setPrimaryGoals] = useState<string[]>(
    initialProfile?.primaryGoals || ['Weight Loss', 'Fat Loss', 'Improve Gut Health', 'Improve Energy Levels']
  );
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(initialProfile?.activityLevel || 'moderate');
  const [hasExercise, setHasExercise] = useState<boolean>(initialProfile?.hasExercise ?? true);
  const [workoutTypes, setWorkoutTypes] = useState<string[]>(initialProfile?.workoutTypes || ['Strength Training', 'Yoga', 'Walking']);
  const [workoutFrequency, setWorkoutFrequency] = useState<string>(initialProfile?.workoutFrequency || '3–4 Days');
  const [workoutDuration, setWorkoutDuration] = useState<number>(initialProfile?.workoutDuration || 45);
  const [dailyStepCount, setDailyStepCount] = useState<number>(initialProfile?.dailyStepCount || 8500);
  const [cardioSessions, setCardioSessions] = useState<number>(initialProfile?.cardioSessions || 2);
  const [strengthSessions, setStrengthSessions] = useState<number>(initialProfile?.strengthSessions || 3);

  // Medical Conditions & Medications & Supplements
  const [medicalConditions, setMedicalConditions] = useState<string[]>(initialProfile?.medicalConditions || ['PCOS']);
  const [currentMedications, setCurrentMedications] = useState<string>(initialProfile?.currentMedications || 'Metformin 500mg once daily');
  const [supplements, setSupplements] = useState<string[]>(initialProfile?.supplements || ['Multivitamin', 'Vitamin D', 'Omega-3']);

  // Blood Test Results
  const [bloodTests, setBloodTests] = useState<BloodTestResults>(initialProfile?.bloodTestResults || {
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

  // Food Preference & Allergies & Dislikes
  const [foodPreference, setFoodPreference] = useState<'Vegetarian' | 'Eggetarian' | 'Non-Vegetarian'>(
    (initialProfile?.foodPreference as any) === 'Vegetarian' ? 'Vegetarian' : ((initialProfile?.foodPreference as any) === 'Eggetarian' ? 'Eggetarian' : 'Non-Vegetarian')
  );
  const [allergies, setAllergies] = useState<string[]>(initialProfile?.allergies || ['Peanuts']);
  const [foodDislikes, setFoodDislikes] = useState<string[]>(initialProfile?.foodDislikes || ['Mushroom', 'Bitter Gourd']);
  const [dislikeInput, setDislikeInput] = useState('');

  // Meal Structure & Timings
  const [mealsPerDay, setMealsPerDay] = useState<number>(initialProfile?.mealsPerDay || 3);
  const [mealTimings, setMealTimings] = useState(initialProfile?.mealTimings || {
    breakfast: '08:30',
    morningSnack: '11:00',
    lunch: '13:30',
    eveningSnack: '16:30',
    dinner: '20:00',
    bedtimeSnack: '22:00'
  });
  const [waterIntakeL, setWaterIntakeL] = useState<number>(initialProfile?.waterIntakeL || 3.0);

  // Lifestyle
  const [digestiveHealth, setDigestiveHealth] = useState<string[]>(initialProfile?.digestiveHealth || ['Good']);
  const [smoking, setSmoking] = useState(initialProfile?.smoking || 'Never');
  const [alcohol, setAlcohol] = useState(initialProfile?.alcohol || 'Monthly');
  const [tobacco, setTobacco] = useState(initialProfile?.tobacco || 'Never');
  const [stressLevel, setStressLevel] = useState<number>(initialProfile?.stressLevel || 4);
  const [sleepQuality, setSleepQuality] = useState(initialProfile?.sleepQuality || 'Good');

  // Women-Only Fields
  const [isPregnant, setIsPregnant] = useState<boolean>(initialProfile?.isPregnant ?? false);
  const [isBreastfeeding, setIsBreastfeeding] = useState<boolean>(initialProfile?.isBreastfeeding ?? false);
  const [menstrualCycle, setMenstrualCycle] = useState<'Regular' | 'Irregular'>(initialProfile?.menstrualCycle || 'Irregular');
  const [isMenopause, setIsMenopause] = useState<boolean>(initialProfile?.isMenopause ?? false);

  // Meal Plan Duration Selection
  const [planDurationDays, setPlanDurationDays] = useState<3 | 7 | 20 | 30>(initialProfile?.planDurationDays || 30);
  const [planFrequency, setPlanFrequency] = useState<1 | 2 | 3>(initialProfile?.planFrequency || 3);
  const [addonSlots, setAddonSlots] = useState<string[]>(initialProfile?.addonSlots || ['11:00 AM Snack/Salad']);

  if (!isOpen) return null;

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
  const isBloodTestSkipped = Object.values(bloodTests || {}).every(
    (val) => val === undefined || val === null || val === 0 || isNaN(val as number)
  );

  // Compute live auto-calculated metrics
  const birthYear = formData.dob ? new Date(formData.dob).getFullYear() : 1995;
  const computedAge = Math.max(12, new Date().getFullYear() - birthYear);

  const calculated = calculateHealthMetrics({
    weightKg,
    heightCm,
    age: computedAge,
    gender,
    activityLevel,
    goal,
    hasExercise
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const proceedToHealthCapture = () => {
    setMode('health_capture');
  };

  const finalizeCustomerLogin = async () => {
    confetti({ particleCount: 80, spread: 70 });
    
    const finalProfile: CustomerProfile = {
      ...initialProfile,
      id: initialProfile.id || 'cust_' + Date.now(),
      name: formData.name || 'Anjali Ramesh',
      email: formData.email || 'anjali@example.com',
      phone: formData.phone || '+91 98765 43210',
      dob: formData.dob || '1995-04-18',
      age: computedAge,
      gender,
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
      bmi: calculated.bmi,
      bmiCategory: calculated.bmiCategory,
      bmr: calculated.bmr,
      tdee: calculated.tdee,
      maintenanceCalories: calculated.maintenanceCalories,
      targetCalories: calculated.targetCalories,
      macroTargets: {
        proteinGrams: calculated.proteinGrams,
        carbsGrams: calculated.carbsGrams,
        fatGrams: calculated.fatGrams,
        fiberGrams: calculated.fiberGrams
      },
      waterRequirementL: calculated.waterRequirementL,
      idealBodyWeightKg: calculated.idealBodyWeightKg,
      leanBodyMassKg: calculated.leanBodyMassKg,
      calorieDeficitSurplus: calculated.calorieDeficitSurplus
    };

    try {
      const res = await CustomerService.updateMyProfile(finalProfile);
      if (res.success && res.data) {
        onSuccessLogin(res.data);
      } else {
        onSuccessLogin(finalProfile);
      }
    } catch (_err) {
      onSuccessLogin(finalProfile);
    }
    onClose();
  };

  const handleSocialAuth = async (provider: 'Google' | 'Apple') => {
    setAuthError(null);
    setIsSubmitting(true);
    const socialEmail = `user.${provider.toLowerCase()}@proteinbowl.in`;
    const socialName = `${provider} User`;

    // Authenticate or register real account on backend
    let res = await auth.login({
      email: socialEmail,
      password: 'SocialAuthPassword123!'
    });

    if (!res.success) {
      res = await auth.register({
        email: socialEmail,
        password: 'SocialAuthPassword123!',
        fullName: socialName
      });
    }

    setIsSubmitting(false);

    if (res.success) {
      setFormData({
        ...formData,
        name: socialName,
        email: socialEmail
      });
      proceedToHealthCapture();
    } else {
      setAuthError(res.message || `${provider} authentication failed.`);
    }
  };

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsSubmitting(true);
    const res = await auth.register({
      email: formData.email,
      password: formData.password,
      fullName: formData.name,
      phone: formData.phone
    });
    setIsSubmitting(false);

    if (res.success) {
      setMode('otp');
    } else {
      setAuthError(res.message || 'Registration failed. Please try again.');
    }
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    proceedToHealthCapture();
  };

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsSubmitting(true);
    const res = await auth.login({
      email: formData.email,
      password: formData.password
    });
    setIsSubmitting(false);

    if (res.success) {
      proceedToHealthCapture();
    } else {
      setAuthError(res.message || 'Invalid email or password');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn overflow-y-auto">
      <div className={`bg-white rounded-3xl shadow-2xl w-full overflow-hidden border border-stone-200 relative my-8 transition-all ${
        mode === 'health_capture' ? 'max-w-4xl max-h-[90vh] flex flex-col' : mode === 'employee_login' ? 'max-w-3xl max-h-[90vh] flex flex-col' : 'max-w-md'
      }`}>
        
        {/* Modal Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-full transition-colors z-20"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Top Header Segment for Staff Login Mode */}
        {mode === 'employee_login' && (
          <div className="bg-stone-900 text-stone-300 p-2.5 px-4 flex items-center justify-between border-b border-stone-800">
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">Internal Employee & Staff ERP Portal</span>
            </div>
            <button
              onClick={() => setMode('signin')}
              className="text-xs text-stone-400 hover:text-white transition-colors"
            >
              Switch to Customer Sign-in
            </button>
          </div>
        )}

        {/* Modal Header */}
        <div className={`p-6 text-center flex-shrink-0 ${
          mode === 'employee_login'
            ? 'bg-gradient-to-b from-amber-50 via-stone-50 to-white'
            : 'bg-gradient-to-b from-emerald-50 via-emerald-50/30 to-white'
        }`}>
          <div className="flex justify-center mb-2">
            <LogoMark size="sm" showTagline={true} />
          </div>
          <h3 className="text-xl font-extrabold text-stone-900 mt-2">
            {mode === 'signin' && 'Welcome Back to Protein Bowl'}
            {mode === 'signup' && 'Create Your Healthy Account'}
            {mode === 'otp' && 'Verify Mobile OTP'}
            {mode === 'forgot' && 'Account Recovery'}
            {mode === 'employee_login' && 'Employee & Kitchen Staff Portal'}
            {mode === 'health_capture' && 'Demographic & Health Data Capture'}
          </h3>
          <p className="text-xs text-stone-500 mt-1">
            {mode === 'signin' && 'Sign in to manage your diet plans and track daily macros'}
            {mode === 'signup' && 'Join thousands striving for a healthier life'}
            {mode === 'otp' && `Enter 4-digit code sent to ${formData.phone || '+91 98765 43210'}`}
            {mode === 'forgot' && 'Enter your email to receive password reset link'}
            {mode === 'employee_login' && 'Sign in as Kitchen Chef, Kerala Mess Incharge, Logistics Lead, or MD Executive to access operational terminals.'}
            {mode === 'health_capture' && 'Step 2 of 2: Collect profile basics, initial measurements & clinical health assessment'}
          </p>
        </div>

        <div className={`p-6 pt-2 ${(mode === 'health_capture' || mode === 'employee_login') ? 'overflow-y-auto space-y-6 flex-1' : ''}`}>
          
          {/* API Error Alert Banner */}
          {authError && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-2xl p-3.5 flex items-center gap-2.5 text-red-800 text-xs font-semibold animate-fadeIn">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{authError}</span>
            </div>
          )}
          
          {/* ========================================================= */}
          {/* EMPLOYEE & STAFF ERP PORTAL VIEW */}
          {/* ========================================================= */}
          {mode === 'employee_login' && (
            <div className="space-y-6 animate-fadeIn">
              
              {/* Success Notification Alert */}
              {employeeLoginSuccess && (
                <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 flex items-center gap-3 text-emerald-900">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <h4 className="font-black text-sm">Authentication Successful</h4>
                    <p className="text-xs text-emerald-700">{employeeLoginSuccess}</p>
                  </div>
                </div>
              )}

              {/* Department Tabs for Employee Login */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-black uppercase text-stone-700 tracking-wider">
                    1. Quick Select Staff Account (1-Click Authentication)
                  </label>
                  <span className="text-[11px] font-bold text-amber-700">Kerala Mess & Kitchen Ready</span>
                </div>

                <div className="flex flex-wrap gap-1.5 pb-2">
                  {[
                    { id: 'all', label: 'All Departments' },
                    { id: 'kerala_mess', label: '🍛 Kerala Mess & Hostels' },
                    { id: 'kitchen', label: '👨‍🍳 Central Kitchen' },
                    { id: 'aggregators', label: '⚡ Aggregators' },
                    { id: 'management', label: '🏢 Management & POS' },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setEmployeeDeptFilter(tab.id as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                        employeeDeptFilter === tab.id
                          ? 'bg-amber-900 text-white border-amber-900 shadow-xs'
                          : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Preset Staff Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                  {EMPLOYEE_PRESETS
                    .filter(p => employeeDeptFilter === 'all' || p.department === employeeDeptFilter)
                    .map((preset) => (
                      <div
                        key={preset.id}
                        onClick={() => handleQuickEmployeeLogin(preset)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer text-left hover:shadow-md relative overflow-hidden group ${
                          preset.department === 'kerala_mess'
                            ? 'bg-amber-50/50 border-amber-200 hover:border-amber-400 hover:bg-amber-50'
                            : 'bg-white border-stone-200 hover:border-emerald-300 hover:bg-emerald-50/30'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-9 h-9 rounded-xl ${preset.avatarBg || 'bg-stone-800'} text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs`}>
                              {preset.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-extrabold text-stone-900 text-xs">{preset.name}</span>
                                {preset.badge && (
                                  <span className="text-[10px] font-black px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-900 border border-amber-300">
                                    {preset.badge}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] font-bold text-stone-600">{preset.designation}</p>
                            </div>
                          </div>

                          <span className="text-[10px] font-black text-amber-700 group-hover:text-amber-900 flex items-center gap-0.5 shrink-0 bg-white px-2 py-0.5 rounded-lg border border-stone-200 shadow-2xs">
                            Login <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                          </span>
                        </div>

                        <p className="text-[11px] text-stone-500 line-clamp-2 leading-relaxed mt-1">
                          {preset.desc}
                        </p>

                        <div className="mt-2 pt-2 border-t border-stone-200/60 flex items-center justify-between text-[10px] text-stone-400 font-mono">
                          <span>{preset.email}</span>
                          <span className="font-bold text-stone-600">{preset.id}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Manual Staff Credentials Login Form */}
              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200">
                <div className="flex items-center gap-2 mb-3">
                  <Key className="w-4 h-4 text-amber-600" />
                  <h4 className="font-extrabold text-stone-900 text-xs uppercase tracking-wider">
                    2. Or Sign In With Employee ID & Security PIN
                  </h4>
                </div>

                <form onSubmit={handleManualEmployeeSubmit} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">Employee ID / Email *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. murugan.mess@proteinbowl.in"
                        value={employeeFormData.empIdOrEmail}
                        onChange={(e) => setEmployeeFormData({ ...employeeFormData, empIdOrEmail: e.target.value })}
                        className="w-full p-2.5 bg-white border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">Security PIN / Password *</label>
                      <input
                        type="password"
                        required
                        placeholder="••••"
                        value={employeeFormData.securityPin}
                        onChange={(e) => setEmployeeFormData({ ...employeeFormData, securityPin: e.target.value })}
                        className="w-full p-2.5 bg-white border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">Target Portal / Workspace</label>
                      <select
                        value={employeeFormData.targetRole}
                        onChange={(e) => setEmployeeFormData({ ...employeeFormData, targetRole: e.target.value as UserRole })}
                        className="w-full p-2.5 bg-white border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="chef">🍛 Kerala Mess / Central Kitchen KDS (Chef)</option>
                        <option value="mess_customer">📦 Kerala Mess Logistics & Hostel Distribution</option>
                        <option value="swiggy_zomato">⚡ Swiggy / Zomato Aggregator Manager</option>
                        <option value="md">🏢 Managing Director (MD) Suite & HRM</option>
                        <option value="nutritionist">🩺 Clinical Nutrition & Diet Plans</option>
                        <option value="pos">💰 POS Billing & Counter Terminal</option>
                        <option value="delivery">🚚 Logistics Fleet & Dispatch</option>
                        <option value="procurement">📦 Raw Material Procurement & Stocks</option>
                        <option value="bakery_fmcg">🍞 FMCG Bakery & Packaged Foods</option>
                        <option value="tepache_erp">🍍 Probiotic Tepache Brewery ERP</option>
                      </select>
                    </div>

                    <div className="flex items-end">
                      <button
                        type="submit"
                        className="w-full bg-amber-900 hover:bg-amber-800 text-white font-black py-2.5 px-4 rounded-xl text-xs transition-all shadow-md flex items-center justify-center gap-2"
                      >
                        <span>Authorize Employee Sign-in</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </form>
              </div>

            </div>
          )}
          
          {/* OTP Verification View */}
          {mode === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
                <ShieldCheck className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                <p className="text-xs text-emerald-800 font-medium">OTP Code dispatched via SMS & WhatsApp</p>
                <div className="text-2xl font-mono font-bold tracking-widest text-emerald-900 my-2">4 8 2 1</div>
                <p className="text-[11px] text-stone-500">(Auto-filled for instant verification demo)</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Enter Verification Code</label>
                <input
                  type="text"
                  required
                  maxLength={4}
                  value={formData.otp || '4821'}
                  onChange={(e) => setFormData({ ...formData, otp: e.target.value })}
                  className="w-full text-center tracking-widest text-xl font-bold py-3 px-4 rounded-xl border border-stone-300 text-stone-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-sm"
              >
                <span>Verify & Proceed to Demographic Health Capture</span>
                <CheckCircle2 className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setMode('signup')}
                className="w-full text-xs text-stone-500 hover:text-stone-800 text-center py-1"
              >
                Back to Registration
              </button>
            </form>
          )}

          {/* Forgot Password View */}
          {mode === 'forgot' && (
            <form onSubmit={(e) => { e.preventDefault(); setForgotSuccess(true); }} className="space-y-4">
              {forgotSuccess ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                  <h4 className="font-bold text-emerald-900 text-sm">Reset Link Dispatched</h4>
                  <p className="text-xs text-emerald-800">
                    We sent a secure password recovery link to <strong>{formData.email}</strong>.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setForgotSuccess(false); setMode('signin'); }}
                    className="mt-2 bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs"
                  >
                    Return to Sign In
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">Your Registered Email</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-stone-400 absolute left-3 top-3.5" />
                      <input
                        type="email"
                        required
                        name="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        placeholder="anjali@example.com"
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-stone-300 text-sm text-stone-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-3 rounded-xl transition-all shadow-md text-sm"
                  >
                    Send Password Reset Email
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode('signin')}
                    className="w-full text-xs text-stone-500 hover:text-stone-800 text-center py-1"
                  >
                    Back to Sign In
                  </button>
                </>
              )}
            </form>
          )}

          {/* Sign In & Sign Up Views */}
          {(mode === 'signin' || mode === 'signup') && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleSocialAuth('Google')}
                  className="flex items-center justify-center gap-2 border border-stone-300 hover:bg-stone-50 rounded-xl py-2.5 px-3 text-xs font-bold text-stone-700 transition-colors shadow-2xs"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>Google SSO</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSocialAuth('Apple')}
                  className="flex items-center justify-center gap-2 bg-stone-900 text-white hover:bg-stone-800 rounded-xl py-2.5 px-3 text-xs font-bold transition-colors shadow-2xs"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.32c.62-.75 1.04-1.8 0.93-2.85-.9.04-2 .6-2.64 1.35-.57.66-.97 1.73-.83 2.76 1.01.08 2.04-.51 2.54-1.26z" />
                  </svg>
                  <span>Apple ID</span>
                </button>
              </div>

              <div className="relative my-2 flex items-center justify-center">
                <div className="border-t border-stone-200 w-full" />
                <span className="bg-white px-3 text-[11px] font-bold text-stone-400 uppercase tracking-wider relative z-10">or email</span>
              </div>

              <form onSubmit={mode === 'signup' ? handleSignUpSubmit : handleSignInSubmit} className="space-y-3">
                {mode === 'signup' && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">Full Name</label>
                      <div className="relative">
                        <User className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                        <input
                          type="text"
                          required
                          name="name"
                          value={formData.name}
                          onChange={handleInputChange}
                          placeholder="Anjali Ramesh"
                          className="w-full pl-9 pr-4 py-2 rounded-xl border border-stone-300 text-sm text-stone-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">Mobile Number (for delivery OTP)</label>
                      <div className="relative">
                        <Phone className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                        <input
                          type="tel"
                          required
                          name="phone"
                          value={formData.phone}
                          onChange={handleInputChange}
                          placeholder="+91 98765 43210"
                          className="w-full pl-9 pr-4 py-2 rounded-xl border border-stone-300 text-sm text-stone-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-bold text-stone-700 mb-1">Date of Birth</label>
                        <div className="relative">
                          <Calendar className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                          <input
                            type="date"
                            required
                            name="dob"
                            value={formData.dob}
                            onChange={handleInputChange}
                            className="w-full pl-9 pr-2 py-2 rounded-xl border border-stone-300 text-xs text-stone-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-stone-700 mb-1">Gender</label>
                        <select
                          value={gender}
                          onChange={(e) => setGender(e.target.value as any)}
                          className="w-full py-2 px-3 rounded-xl border border-stone-300 text-xs font-bold text-stone-900 outline-none"
                        >
                          <option value="female">Female</option>
                          <option value="male">Male</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Email Address</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                    <input
                      type="email"
                      required
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="anjali@example.com"
                      className="w-full pl-9 pr-4 py-2 rounded-xl border border-stone-300 text-sm text-stone-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-bold text-stone-700">Password</label>
                    {mode === 'signin' && (
                      <button
                        type="button"
                        onClick={() => setMode('forgot')}
                        className="text-[11px] font-bold text-emerald-700 hover:underline"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                    <input
                      type="password"
                      required
                      name="password"
                      value={formData.password}
                      onChange={handleInputChange}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-4 py-2 rounded-xl border border-stone-300 text-sm text-stone-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-sm mt-2"
                >
                  <span>{mode === 'signup' ? 'Continue to Health Capture' : 'Sign In & Capture Health Data'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <div className="text-center pt-2">
                {mode === 'signin' ? (
                  <p className="text-xs text-stone-600">
                    Don't have an account yet?{' '}
                    <button
                      onClick={() => setMode('signup')}
                      className="font-bold text-emerald-700 hover:underline"
                    >
                      Sign Up Now
                    </button>
                  </p>
                ) : (
                  <p className="text-xs text-stone-600">
                    Already registered?{' '}
                    <button
                      onClick={() => setMode('signin')}
                      className="font-bold text-emerald-700 hover:underline"
                    >
                      Sign In
                    </button>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* DEMOGRAPHIC & HEALTH DATA CAPTURE STEP */}
          {mode === 'health_capture' && (
            <div className="space-y-6 animate-fadeIn">
              
              {/* Auto-Calculated Live Banner */}
              <div className="bg-emerald-950 text-white rounded-2xl p-4 shadow-md border border-emerald-800">
                <div className="flex items-center justify-between border-b border-emerald-800 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-amber-300">
                      Live Auto-Calculated Health Metrics
                    </h4>
                  </div>
                  <span className="text-[10px] bg-emerald-800 px-2.5 py-0.5 rounded-full text-emerald-200 font-bold">
                    Mifflin-St Jeor & Boer Formulas
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 text-center text-xs">
                  <div className="bg-emerald-900/80 p-2 rounded-xl border border-emerald-700/50">
                    <span className="text-[9px] uppercase text-emerald-300 block font-bold">BMI</span>
                    <strong className="text-sm font-black">{calculated.bmi}</strong> kg/m²
                    <span className="block text-[9px] text-amber-300 font-bold mt-0.5">{calculated.bmiCategory}</span>
                  </div>

                  <div className="bg-emerald-900/80 p-2 rounded-xl border border-emerald-700/50">
                    <span className="text-[9px] uppercase text-emerald-300 block font-bold">BMR</span>
                    <strong className="text-sm font-black">{calculated.bmr}</strong> kcal/d
                  </div>

                  <div className="bg-emerald-900/80 p-2 rounded-xl border border-emerald-700/50">
                    <span className="text-[9px] uppercase text-emerald-300 block font-bold">TDEE</span>
                    <strong className="text-sm font-black">{calculated.tdee}</strong> kcal/d
                  </div>

                  <div className="bg-emerald-900/80 p-2 rounded-xl border border-emerald-700/50">
                    <span className="text-[9px] uppercase text-emerald-300 block font-bold">Target Cals</span>
                    <strong className="text-sm font-black text-amber-300">{calculated.targetCalories}</strong> kcal
                  </div>

                  <div className="bg-emerald-900/80 p-2 rounded-xl border border-emerald-700/50">
                    <span className="text-[9px] uppercase text-emerald-300 block font-bold">Protein Target</span>
                    <strong className="text-sm font-black text-emerald-300">{calculated.proteinGrams}g</strong>/day
                  </div>

                  <div className="bg-emerald-900/80 p-2 rounded-xl border border-emerald-700/50">
                    <span className="text-[9px] uppercase text-emerald-300 block font-bold">Water Requirement</span>
                    <strong className="text-sm font-black text-blue-300">{calculated.waterRequirementL}L</strong>/day
                  </div>
                </div>
              </div>

              {/* 1. Profile Basics & Initial Body Measurements */}
              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-3">
                <h4 className="text-xs font-black uppercase text-stone-800 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-emerald-700" />
                  <span>1. Profile Basics & Initial Body Measurements</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">Full Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full p-2 bg-white border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">Mobile Number</label>
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full p-2 bg-white border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">Email Address</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full p-2 bg-white border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">Gender</label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value as any)}
                      className="w-full p-2 bg-white border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none"
                    >
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">Date of Birth</label>
                    <input
                      type="date"
                      value={formData.dob}
                      onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                      className="w-full p-2 bg-white border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">Height (cm)</label>
                    <input
                      type="number"
                      value={heightCm}
                      onChange={(e) => setHeightCm(Number(e.target.value))}
                      className="w-full p-2 bg-white border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">Current Weight (kg)</label>
                    <input
                      type="number"
                      value={weightKg}
                      onChange={(e) => setWeightKg(Number(e.target.value))}
                      className="w-full p-2 bg-white border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">Target Weight (kg)</label>
                    <input
                      type="number"
                      value={targetWeightKg}
                      onChange={(e) => setTargetWeightKg(Number(e.target.value))}
                      className="w-full p-2 bg-white border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">Occupation</label>
                    <select
                      value={occupation}
                      onChange={(e) => setOccupation(e.target.value)}
                      className="w-full p-2 bg-white border border-stone-300 rounded-xl text-xs font-bold outline-none"
                    >
                      {occupationOptions.map((occ) => (
                        <option key={occ} value={occ}>{occ}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">Work Schedule</label>
                    <select
                      value={workSchedule}
                      onChange={(e) => setWorkSchedule(e.target.value)}
                      className="w-full p-2 bg-white border border-stone-300 rounded-xl text-xs font-bold outline-none"
                    >
                      {workScheduleOptions.map((ws) => (
                        <option key={ws} value={ws}>{ws}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">Sleep Duration (hrs/day)</label>
                    <input
                      type="number"
                      value={sleepDuration}
                      onChange={(e) => setSleepDuration(Number(e.target.value))}
                      className="w-full p-2 bg-white border border-stone-300 rounded-xl text-xs font-bold outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">Wake-up / Bed Time</label>
                    <div className="flex gap-1">
                      <input
                        type="time"
                        value={wakeUpTime}
                        onChange={(e) => setWakeUpTime(e.target.value)}
                        className="w-1/2 p-1.5 bg-white border border-stone-300 rounded-xl text-[11px] font-bold"
                      />
                      <input
                        type="time"
                        value={bedTime}
                        onChange={(e) => setBedTime(e.target.value)}
                        className="w-1/2 p-1.5 bg-white border border-stone-300 rounded-xl text-[11px] font-bold"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Body Measurements — Tracking & Circumferences */}
              <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200 space-y-3">
                <h4 className="text-xs font-black uppercase text-amber-950 flex items-center gap-1.5">
                  <Scale className="w-4 h-4 text-amber-800" />
                  <span>2. Circumference & Muscle Mass Tracking (cm / kg)</span>
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-amber-950 mb-0.5">Muscle Mass (kg)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={muscleMassKg}
                      onChange={(e) => setMuscleMassKg(Number(e.target.value))}
                      className="w-full p-1.5 bg-white border border-amber-300 rounded-lg text-xs font-bold text-center"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-amber-950 mb-0.5">Waist (cm)</label>
                    <input
                      type="number"
                      value={waistCm}
                      onChange={(e) => setWaistCm(Number(e.target.value))}
                      className="w-full p-1.5 bg-white border border-amber-300 rounded-lg text-xs font-bold text-center"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-amber-950 mb-0.5">Hip (cm)</label>
                    <input
                      type="number"
                      value={hipCm}
                      onChange={(e) => setHipCm(Number(e.target.value))}
                      className="w-full p-1.5 bg-white border border-amber-300 rounded-lg text-xs font-bold text-center"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-amber-950 mb-0.5">Chest (cm)</label>
                    <input
                      type="number"
                      value={chestCm}
                      onChange={(e) => setChestCm(Number(e.target.value))}
                      className="w-full p-1.5 bg-white border border-amber-300 rounded-lg text-xs font-bold text-center"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-amber-950 mb-0.5">Neck (cm)</label>
                    <input
                      type="number"
                      value={neckCm}
                      onChange={(e) => setNeckCm(Number(e.target.value))}
                      className="w-full p-1.5 bg-white border border-amber-300 rounded-lg text-xs font-bold text-center"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-amber-950 mb-0.5">L/R Arm (cm)</label>
                    <div className="flex gap-1">
                      <input
                        type="number"
                        placeholder="L"
                        value={leftArmCm}
                        onChange={(e) => setLeftArmCm(Number(e.target.value))}
                        className="w-1/2 p-1.5 bg-white border border-amber-300 rounded-lg text-[11px] font-bold text-center"
                      />
                      <input
                        type="number"
                        placeholder="R"
                        value={rightArmCm}
                        onChange={(e) => setRightArmCm(Number(e.target.value))}
                        className="w-1/2 p-1.5 bg-white border border-amber-300 rounded-lg text-[11px] font-bold text-center"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Primary Goal & Exercise Details */}
              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-3">
                <h4 className="text-xs font-black uppercase text-stone-800 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-emerald-700" />
                  <span>3. Primary Health Goals & Exercise Schedule</span>
                </h4>

                <div>
                  <label className="block text-[11px] font-bold text-stone-700 mb-1.5">Primary Goals (Multi-select)</label>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-white rounded-xl border border-stone-200">
                    {primaryGoalOptions.map((g) => {
                      const isSel = primaryGoals.includes(g);
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => toggleArrayItem(primaryGoals, setPrimaryGoals, g)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                            isSel ? 'bg-amber-900 text-amber-200 border-amber-900' : 'bg-stone-50 text-stone-700 border-stone-300'
                          }`}
                        >
                          {isSel && '✓ '} {g}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">Activity Level</label>
                    <select
                      value={activityLevel}
                      onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)}
                      className="w-full p-2 bg-white border border-stone-300 rounded-xl text-xs font-bold outline-none"
                    >
                      <option value="sedentary">Sedentary (Little/No Exercise)</option>
                      <option value="light">Lightly Active (1–3 Days/Wk)</option>
                      <option value="moderate">Moderately Active (3–5 Days/Wk)</option>
                      <option value="active">Very Active (6–7 Days/Wk)</option>
                      <option value="athlete">Professional Athlete</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">Exercise Regularity</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setHasExercise(true)}
                        className={`flex-1 py-1.5 rounded-xl text-xs font-bold border ${hasExercise ? 'bg-emerald-700 text-white' : 'bg-white text-stone-700'}`}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setHasExercise(false)}
                        className={`flex-1 py-1.5 rounded-xl text-xs font-bold border ${!hasExercise ? 'bg-stone-800 text-white' : 'bg-white text-stone-700'}`}
                      >
                        No
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">Daily Step Count</label>
                    <input
                      type="number"
                      value={dailyStepCount}
                      onChange={(e) => setDailyStepCount(Number(e.target.value))}
                      className="w-full p-2 bg-white border border-stone-300 rounded-xl text-xs font-bold outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* 4. Medical Conditions, Medications & Blood Tests */}
              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-3">
                <h4 className="text-xs font-black uppercase text-stone-800 flex items-center gap-1.5">
                  <Stethoscope className="w-4 h-4 text-emerald-700" />
                  <span>4. Medical Conditions, Medications & Optional Blood Tests</span>
                </h4>

                <div>
                  <label className="block text-[11px] font-bold text-stone-700 mb-1.5">Medical Conditions (Multi-select)</label>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-white rounded-xl border border-stone-200">
                    {medicalOptions.map((med) => {
                      const isSel = medicalConditions.includes(med);
                      return (
                        <button
                          key={med}
                          type="button"
                          onClick={() => toggleArrayItem(medicalConditions, setMedicalConditions, med)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                            isSel ? 'bg-rose-700 text-white border-rose-700' : 'bg-stone-50 text-stone-700 border-stone-300'
                          }`}
                        >
                          {isSel && '✓ '} {med}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-700 mb-1">Current Medications (Free Text)</label>
                  <input
                    type="text"
                    value={currentMedications}
                    onChange={(e) => setCurrentMedications(e.target.value)}
                    placeholder="e.g. Metformin 500mg, Thyronorm 50mcg"
                    className="w-full p-2 bg-white border border-stone-300 rounded-xl text-xs font-bold outline-none"
                  />
                </div>

                {/* Non-Blocking Alert Notice for Blood Tests */}
                <div className="p-3 bg-amber-100 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-center gap-2 font-medium">
                  <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0" />
                  <span>Note: If blood test fields are skipped, these values may be needed for proper dietitian consultation. Submission is not blocked.</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-stone-600">FBS (mg/dL)</label>
                    <input
                      type="number"
                      value={bloodTests.fastingBloodSugar || ''}
                      onChange={(e) => setBloodTests({ ...bloodTests, fastingBloodSugar: Number(e.target.value) })}
                      className="w-full p-1.5 bg-white border border-stone-300 rounded-lg font-bold text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-stone-600">HbA1c (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={bloodTests.hbA1c || ''}
                      onChange={(e) => setBloodTests({ ...bloodTests, hbA1c: Number(e.target.value) })}
                      className="w-full p-1.5 bg-white border border-stone-300 rounded-lg font-bold text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-stone-600">Total Chol. (mg/dL)</label>
                    <input
                      type="number"
                      value={bloodTests.totalCholesterol || ''}
                      onChange={(e) => setBloodTests({ ...bloodTests, totalCholesterol: Number(e.target.value) })}
                      className="w-full p-1.5 bg-white border border-stone-300 rounded-lg font-bold text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-stone-600">Hemoglobin (g/dL)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={bloodTests.hemoglobin || ''}
                      onChange={(e) => setBloodTests({ ...bloodTests, hemoglobin: Number(e.target.value) })}
                      className="w-full p-1.5 bg-white border border-stone-300 rounded-lg font-bold text-center"
                    />
                  </div>
                </div>
              </div>

              {/* 5. Food Preference, Allergies & Dislikes */}
              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-3">
                <h4 className="text-xs font-black uppercase text-stone-800 flex items-center gap-1.5">
                  <Apple className="w-4 h-4 text-emerald-700" />
                  <span>5. Food Preference, Allergies & Disliked Foods</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">Food Preference</label>
                    <select
                      value={foodPreference}
                      onChange={(e) => setFoodPreference(e.target.value as any)}
                      className="w-full p-2 bg-white border border-stone-300 rounded-xl text-xs font-bold outline-none"
                    >
                      <option value="Non-Vegetarian">Non-Vegetarian</option>
                      <option value="Vegetarian">Vegetarian</option>
                      <option value="Eggetarian">Eggetarian</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1.5">Allergies (Multi-select)</label>
                    <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto p-1.5 bg-white rounded-xl border border-stone-200">
                      {allergyOptions.map((alg) => {
                        const isSel = allergies.includes(alg);
                        return (
                          <button
                            key={alg}
                            type="button"
                            onClick={() => toggleArrayItem(allergies, setAllergies, alg)}
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                              isSel ? 'bg-rose-700 text-white' : 'bg-stone-50 text-stone-700'
                            }`}
                          >
                            {alg}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Women-Only Fields if female */}
              {gender === 'female' && (
                <div className="bg-pink-50/70 p-4 rounded-2xl border border-pink-200 space-y-2">
                  <h4 className="text-xs font-black uppercase text-pink-950">Women-Only Clinical Health Parameters</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <label className="block text-[10px] font-bold text-pink-900 mb-0.5">Pregnant?</label>
                      <select
                        value={isPregnant ? 'yes' : 'no'}
                        onChange={(e) => setIsPregnant(e.target.value === 'yes')}
                        className="w-full p-1.5 bg-white border border-pink-300 rounded-lg font-bold"
                      >
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-pink-900 mb-0.5">Breastfeeding?</label>
                      <select
                        value={isBreastfeeding ? 'yes' : 'no'}
                        onChange={(e) => setIsBreastfeeding(e.target.value === 'yes')}
                        className="w-full p-1.5 bg-white border border-pink-300 rounded-lg font-bold"
                      >
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-pink-900 mb-0.5">Menstrual Cycle</label>
                      <select
                        value={menstrualCycle}
                        onChange={(e) => setMenstrualCycle(e.target.value as any)}
                        className="w-full p-1.5 bg-white border border-pink-300 rounded-lg font-bold"
                      >
                        <option value="Regular">Regular</option>
                        <option value="Irregular">Irregular</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-pink-900 mb-0.5">Menopause?</label>
                      <select
                        value={isMenopause ? 'yes' : 'no'}
                        onChange={(e) => setIsMenopause(e.target.value === 'yes')}
                        className="w-full p-1.5 bg-white border border-pink-300 rounded-lg font-bold"
                      >
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-stone-200">
                <button
                  type="button"
                  onClick={finalizeCustomerLogin}
                  className="text-stone-500 hover:text-stone-800 text-xs font-bold underline"
                >
                  Skip & Launch Dashboard
                </button>

                <button
                  type="button"
                  onClick={finalizeCustomerLogin}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold px-6 py-3 rounded-xl transition-all shadow-md flex items-center gap-2 text-xs"
                >
                  <span>Save Health Profile & Complete Login</span>
                  <CheckCircle2 className="w-4 h-4" />
                </button>
              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  );
};
