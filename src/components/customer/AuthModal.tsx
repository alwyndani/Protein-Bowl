import React, { useState } from 'react';
import { CustomerProfile, BloodTestResults, ActivityLevel, HealthGoal, UserRole } from '../../types';
import { useAuth, mapBackendRoleToUserRole } from '../../context/AuthContext';
import { CustomerService } from '../../services/customerService';
import { PasswordResetService } from '../../services/passwordResetService';
import { toPlanDuration, type PlanDurationDays } from '../../utils/planDuration';
import { ApiRequestError } from '../../services/apiClient';
import { LogoMark } from '../common/LogoMark';
import { 
  X, Mail, Lock, Phone, User, Calendar, ShieldCheck, ArrowRight, CheckCircle2, 
  Activity, Scale, Stethoscope, Droplets, Apple, AlertTriangle, Sparkles, Flame, Clock,
  Briefcase, ChefHat, Utensils, Building2, Truck, Layers, Key, Check
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { calculateHealthMetrics } from '../../utils/healthCalculator';
import { isHealthProfileComplete, triToSelect, selectToTri } from '../../utils/healthProfile';
import { isValidPhone } from '../../utils/phone';

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
  /** Called after sign-in when the stored profile is incomplete: the parent re-opens this modal on the health step, prefilled from `profile`. */
  onProfileLoaded: (profile: CustomerProfile) => void;
  initialMode?: 'signin' | 'signup' | 'employee_login' | 'health_capture';
  onEmployeeLogin?: (role: UserRole, employeeData: EmployeeLoginData) => void;
}

// There are no demo shortcuts, preset accounts or prefilled credentials in ANY build (development included).

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccessLogin,
  initialProfile,
  onProfileLoaded,
  initialMode = 'signin',
  onEmployeeLogin
}) => {
  const auth = useAuth();
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot' | 'health_capture' | 'employee_login'>(initialMode);
  
  // Employee Login State
  const [employeeFormData, setEmployeeFormData] = useState({
    empIdOrEmail: '',
    securityPin: '',
    targetRole: 'chef' as UserRole,
    department: 'Kerala Mess & Hostel Ops'
  });
  const [employeeLoginSuccess, setEmployeeLoginSuccess] = useState<string | null>(null);

  // Auth basic fields
  const [formData, setFormData] = useState({
    // Every field starts EMPTY in development and production alike (only a stored profile can prefill name/email/phone/dob): a demo value
    // that a developer forgets to overwrite would be saved as the customer's real data. The password is never prefilled.
    name: initialProfile?.name || '',
    email: initialProfile?.email || '',
    phone: initialProfile?.phone || '',
    dob: initialProfile?.dob || '',
    password: '',
    otp: ''
  });
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  // Staff sign in ONLY with their own account: no preset accounts, no shortcut logins, no credentials in the source.
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
  const [gender, setGender] = useState<'' | 'female' | 'male' | 'other'>(initialProfile?.gender || '');
  // 0 = not entered; the profile cannot be saved until all three are (see handleCompleteHealth gate).
  const [heightCm, setHeightCm] = useState<number>(initialProfile?.heightCm || 0);
  const [weightKg, setWeightKg] = useState<number>(initialProfile?.weightKg || 0);
  const [targetWeightKg, setTargetWeightKg] = useState<number>(initialProfile?.targetWeightKg || 0);
  // Optional fields: empty (0 / '' / []) means the customer has not provided them. Nothing below is a suggested value.
  const [occupation, setOccupation] = useState<string>(initialProfile?.occupation || '');
  const [workSchedule, setWorkSchedule] = useState<string>(initialProfile?.workSchedule || '');
  const [sleepDuration, setSleepDuration] = useState<number>(initialProfile?.sleepDuration || 0);
  const [wakeUpTime, setWakeUpTime] = useState<string>(initialProfile?.wakeUpTime || '');
  const [bedTime, setBedTime] = useState<string>(initialProfile?.bedTime || '');

  // Tracking & Circumferences
  const [muscleMassKg, setMuscleMassKg] = useState<number>(initialProfile?.muscleMassKg || 0);
  const [waistCm, setWaistCm] = useState<number>(initialProfile?.circumferences?.waistCm || 0);
  const [hipCm, setHipCm] = useState<number>(initialProfile?.circumferences?.hipCm || 0);
  const [chestCm, setChestCm] = useState<number>(initialProfile?.circumferences?.chestCm || 0);
  const [neckCm, setNeckCm] = useState<number>(initialProfile?.circumferences?.neckCm || 0);

  const [leftArmCm, setLeftArmCm] = useState<number>(initialProfile?.limbCircumferences?.leftArmCm || 0);
  const [rightArmCm, setRightArmCm] = useState<number>(initialProfile?.limbCircumferences?.rightArmCm || 0);
  const [leftThighCm, setLeftThighCm] = useState<number>(initialProfile?.limbCircumferences?.leftThighCm || 0);
  const [rightThighCm, setRightThighCm] = useState<number>(initialProfile?.limbCircumferences?.rightThighCm || 0);
  const [leftCalfCm, setLeftCalfCm] = useState<number>(initialProfile?.limbCircumferences?.leftCalfCm || 0);
  const [rightCalfCm, setRightCalfCm] = useState<number>(initialProfile?.limbCircumferences?.rightCalfCm || 0);

  // Goals & Exercise
  // Main goal, activity level and food preference are the CUSTOMER's explicit choices: nothing is preselected for a new profile. (The blank profile's
  // 'maintenance'/'sedentary' are placeholders; goal and activity are only trusted as stored when height and weight are stored with them.)
  const storedHealth = isHealthProfileComplete(initialProfile);
  const [goal, setGoal] = useState<HealthGoal | ''>(storedHealth ? initialProfile.goal : '');
  const [primaryGoals, setPrimaryGoals] = useState<string[]>(initialProfile?.primaryGoals || []);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | ''>(storedHealth ? initialProfile.activityLevel : '');
  const [hasExercise, setHasExercise] = useState<boolean | null>(initialProfile?.hasExercise ?? null); // unanswered until the customer chooses: never a default "Yes"
  const [workoutTypes, setWorkoutTypes] = useState<string[]>(initialProfile?.workoutTypes || []);
  const [workoutFrequency, setWorkoutFrequency] = useState<string>(initialProfile?.workoutFrequency || '');
  const [workoutDuration, setWorkoutDuration] = useState<number>(initialProfile?.workoutDuration || 0);
  const [dailyStepCount, setDailyStepCount] = useState<number>(initialProfile?.dailyStepCount || 0);
  const [cardioSessions, setCardioSessions] = useState<number>(initialProfile?.cardioSessions || 0);
  const [strengthSessions, setStrengthSessions] = useState<number>(initialProfile?.strengthSessions || 0);

  // Medical Conditions & Medications & Supplements: clinical data is never pre-filled
  const [medicalConditions, setMedicalConditions] = useState<string[]>(initialProfile?.medicalConditions || []);
  const [currentMedications, setCurrentMedications] = useState<string>(initialProfile?.currentMedications || '');
  const [supplements, setSupplements] = useState<string[]>(initialProfile?.supplements || []);

  // Blood Test Results: only values the customer enters (no sample lab values)
  const [bloodTests, setBloodTests] = useState<BloodTestResults>(initialProfile?.bloodTestResults || {});

  // Food Preference & Allergies & Dislikes
  const [foodPreference, setFoodPreference] = useState<'' | 'Vegetarian' | 'Eggetarian' | 'Non-Vegetarian'>(
    initialProfile?.foodPreference === 'Vegetarian' || initialProfile?.foodPreference === 'Eggetarian' || initialProfile?.foodPreference === 'Non-Vegetarian' ? initialProfile.foodPreference : ''
  );
  const [allergies, setAllergies] = useState<string[]>(initialProfile?.allergies || []);
  const [foodDislikes, setFoodDislikes] = useState<string[]>(initialProfile?.foodDislikes || []);
  const [dislikeInput, setDislikeInput] = useState('');

  // Meal Structure & Timings
  const [mealsPerDay, setMealsPerDay] = useState<number>(initialProfile?.mealsPerDay || 0);
  const [mealTimings, setMealTimings] = useState<Record<string, string>>(initialProfile?.mealTimings || {});
  const [waterIntakeL, setWaterIntakeL] = useState<number>(initialProfile?.waterIntakeL || 0);

  // Lifestyle
  const [digestiveHealth, setDigestiveHealth] = useState<string[]>(initialProfile?.digestiveHealth || []);
  const [smoking, setSmoking] = useState(initialProfile?.smoking || '');
  const [alcohol, setAlcohol] = useState(initialProfile?.alcohol || '');
  const [tobacco, setTobacco] = useState(initialProfile?.tobacco || '');
  const [stressLevel, setStressLevel] = useState<number>(initialProfile?.stressLevel || 0);
  const [sleepQuality, setSleepQuality] = useState(initialProfile?.sleepQuality || '');

  // Women-Only Fields
  // Women-only questions start UNANSWERED (null), never "No"; an unanswered question is not sent and stays unanswered on the server.
  const [isPregnant, setIsPregnant] = useState<boolean | null>(initialProfile?.isPregnant ?? null);
  const [isBreastfeeding, setIsBreastfeeding] = useState<boolean | null>(initialProfile?.isBreastfeeding ?? null);
  const [menstrualCycle, setMenstrualCycle] = useState<'' | 'Regular' | 'Irregular'>(initialProfile?.menstrualCycle || '');
  const [isMenopause, setIsMenopause] = useState<boolean | null>(initialProfile?.isMenopause ?? null);

  // Meal Plan Duration Selection
  const [planDurationDays, setPlanDurationDays] = useState<PlanDurationDays>(toPlanDuration(initialProfile?.planDurationDays));
  const [planFrequency, setPlanFrequency] = useState<1 | 2 | 3>(initialProfile?.planFrequency || 3);
  const [addonSlots, setAddonSlots] = useState<string[]>(initialProfile?.addonSlots || []);

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
  // Age comes only from the date of birth the customer entered; without it nothing is calculated or shown.
  const dobYear = formData.dob ? new Date(formData.dob).getFullYear() : NaN;
  const computedAge = Number.isNaN(dobYear) ? 0 : Math.max(12, new Date().getFullYear() - dobYear);
  const metricsReady = (gender === 'male' || gender === 'female') && computedAge > 0 && heightCm > 0 && weightKg > 0 && goal !== '' && activityLevel !== ''; // "other": not available yet

  const calculated = calculateHealthMetrics({
    weightKg,
    heightCm,
    age: computedAge,
    gender: gender === '' ? 'other' : gender, // never displayed or saved while gender is unchosen (metricsReady)
    activityLevel: activityLevel || 'sedentary', // placeholders keep the call well-defined; nothing is shown or saved until both are chosen (metricsReady)
    goal: goal || 'maintenance',
    hasExercise: hasExercise === true // unanswered adds nothing to the water requirement
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const proceedToHealthCapture = () => {
    setMode('health_capture');
  };

  // "Skip" really skips: nothing is saved (the account exists; the health profile stays empty) and the customer lands on the dashboard.
  // The next sign-in finds the profile incomplete and shows this step again, prefilled with whatever is stored.
  // Skipping the health step keeps what the customer already entered (date of birth, gender) and invents nothing else: no height, weight,
  // goal or activity level is sent, so the server stores the basics only and no health profile.
  const skipHealthCapture = async () => {
    setAuthError(null);
    const basics: Partial<CustomerProfile> = {};
    if (formData.dob) basics.dob = formData.dob;
    if (gender) basics.gender = gender;
    let saved: CustomerProfile | undefined;
    if (Object.keys(basics).length > 0) {
      try {
        const res = await CustomerService.updateMyProfile(basics);
        if (!res.success || !res.data) throw new Error('profile not saved');
        saved = res.data;
      } catch {
        setAuthError('Your date of birth and gender could not be saved. Please try again, or fill in the health step.');
        return;
      }
    }
    onSuccessLogin(saved ?? { ...initialProfile, name: formData.name, email: formData.email, phone: formData.phone });
    onClose();
  };

  const finalizeCustomerLogin = async () => {
    if (!gender || !goal || !activityLevel || !(heightCm > 0) || !(weightKg > 0) || !(targetWeightKg > 0)) {
      setAuthError('Please choose your gender, main goal and activity level, and enter your height, current weight and target weight to continue.');
      return;
    }
    setAuthError(null);
    confetti({ particleCount: 80, spread: 70 });

    const finalProfile: CustomerProfile = {
      ...initialProfile,
      id: initialProfile.id || 'cust_' + Date.now(),
      name: formData.name,
      email: formData.email,
      phone: formData.phone || '',
      dob: formData.dob,
      age: computedAge,
      gender: gender || undefined,
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
      goal: goal as HealthGoal, // chosen explicitly (checked by the gate above)
      primaryGoals,
      activityLevel: activityLevel as ActivityLevel,
      hasExercise: hasExercise ?? undefined, // omitted when unanswered: the server keeps whatever it has (nothing is invented)
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
      foodPreference: foodPreference || undefined,
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
      isPregnant: isPregnant ?? undefined,
      isBreastfeeding: isBreastfeeding ?? undefined,
      menstrualCycle,
      isMenopause: isMenopause ?? undefined,
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

    // The account already exists at this step, so a failed save can simply be retried: never continue with a profile the server does not have.
    try {
      const res = await CustomerService.updateMyProfile(finalProfile);
      if (!res.success || !res.data) throw new Error('profile not saved');
      onSuccessLogin(res.data);
    } catch {
      setAuthError('Your health profile could not be saved. Please try again.');
      return;
    }
    onClose();
  };

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!isValidPhone(formData.phone)) {
      setAuthError('Enter a valid mobile number (8–15 digits, optional leading +).');
      return;
    }
    setIsSubmitting(true);
    const res = await auth.register({
      email: formData.email,
      password: formData.password,
      fullName: formData.name,
      phone: formData.phone
    });
    setIsSubmitting(false);

    if (res.success) {
      // No phone-OTP step exists (there is no SMS service): a fake verification screen would only pretend to protect the account.
      proceedToHealthCapture();
    } else {
      setAuthError(res.message || 'Registration failed. Please try again.');
    }
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

    if (!res.success) {
      setAuthError(res.message || 'Invalid email or password');
      return;
    }
    // Staff accounts have no customer profile: they sign in through the staff form, never through this one.
    if (res.roles && !res.roles.includes('CUSTOMER')) {
      await auth.logout();
      setAuthError('This is a staff account. Please use the staff sign-in.');
      return;
    }
    // Existing customers keep their stored profile: read it BEFORE deciding what to show, and never save anything on their behalf.
    setIsSubmitting(true);
    try {
      const fetched = await CustomerService.getMyProfile();
      if (!fetched.success || !fetched.data) throw new Error('profile unavailable');
      if (isHealthProfileComplete(fetched.data)) {
        onSuccessLogin(fetched.data); // straight to the dashboard
        onClose();
      } else {
        onProfileLoaded(fetched.data); // health-capture step, prefilled with what is stored
      }
    } catch {
      setAuthError('You are signed in, but your health profile could not be loaded. Please try again; nothing was changed.');
    } finally {
      setIsSubmitting(false);
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
            {mode === 'forgot' && 'Account Recovery'}
            {mode === 'employee_login' && 'Employee & Kitchen Staff Portal'}
            {mode === 'health_capture' && 'Demographic & Health Data Capture'}
          </h3>
          <p className="text-xs text-stone-500 mt-1">
            {mode === 'signin' && 'Sign in to manage your diet plans and track daily macros'}
            {mode === 'signup' && 'Join thousands striving for a healthier life'}
            {mode === 'forgot' && 'Enter your email to receive password reset link'}
            {mode === 'employee_login' && 'Sign in with your staff email and password (Super Admin, Chef, Nutritionist, Trainer or Procurement).'}
            {mode === 'health_capture' && 'Step 2 of 2: Collect profile basics, initial measurements & clinical health assessment'}
          </p>
        </div>

        <div className={`p-6 pt-2 ${(mode === 'health_capture' || mode === 'employee_login') ? 'overflow-y-auto space-y-6 flex-1' : ''}`}>
          
          {/* API Error Alert Banner */}
          {authError && (
            <div
              role="alert"
              ref={(el) => { el?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }} // a message must never sit out of sight above a scrolled form
              className="mb-4 bg-red-50 border border-red-200 rounded-2xl p-3.5 flex items-center gap-2.5 text-red-800 text-xs font-semibold animate-fadeIn"
            >
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

              {/* Manual Staff Credentials Login Form (the only staff sign-in: no preset accounts or prefilled credentials, in any build) */}
              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200">
                <div className="flex items-center gap-2 mb-3">
                  <Key className="w-4 h-4 text-amber-600" />
                  <h4 className="font-extrabold text-stone-900 text-xs uppercase tracking-wider">
                    Sign in with your staff email and password
                  </h4>
                </div>

                <form onSubmit={handleManualEmployeeSubmit} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">Employee ID / Email *</label>
                      <input
                        type="text"
                        required
                        placeholder="Employee ID or work email"
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
                        <option value="nutritionist">🩺 Clinical Nutrition & Diet Plans</option>
                        <option value="trainer">🏋️ Fitness & Workout Plans (Trainer)</option>
                        <option value="procurement">📦 Raw Material Procurement & Stocks</option>
                        <option value="super_admin">🛡️ Super Admin (Platform & Operations)</option>
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
          
          {/* Forgot Password View */}
          {mode === 'forgot' && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (forgotBusy) return;
                setForgotBusy(true);
                setForgotError(null);
                try {
                  await PasswordResetService.requestReset(formData.email);
                  setForgotSuccess(true);
                } catch (err) {
                  setForgotError(err instanceof ApiRequestError && err.code === 'EMAIL_NOT_CONFIGURED' ? 'Password reset by email is not available right now. Please contact Protein Bowl support.' : 'We could not process that request. Please try again in a few minutes.');
                } finally {
                  setForgotBusy(false);
                }
              }}
              className="space-y-4"
            >
              {forgotSuccess ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                  <h4 className="font-bold text-emerald-900 text-sm">Check your email</h4>
                  <p className="text-xs text-emerald-800">
                    If an account exists for <strong>{formData.email}</strong>, we have sent a password reset link. It expires soon and can be used once.
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
                        placeholder="you@example.com"
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-stone-300 text-sm text-stone-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                  </div>

                  {forgotError && <p role="alert" className="text-xs text-red-700">{forgotError}</p>}
                  <button
                    type="submit"
                    disabled={forgotBusy}
                    className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-all shadow-md text-sm"
                  >
                    {forgotBusy ? 'Sending…' : 'Send Password Reset Email'}
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
              {/* No social sign-in: no OAuth provider is configured, and the former development stand-in registered accounts with a shared fixed password. */}
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
                          placeholder="Your full name"
                          className="w-full pl-9 pr-4 py-2 rounded-xl border border-stone-300 text-sm text-stone-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">Mobile Number</label>
                      <div className="relative">
                        <Phone className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                        <input
                          type="tel"
                          required
                          name="phone"
                          value={formData.phone}
                          onChange={handleInputChange}
                          placeholder="Mobile number"
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
                          <option value="">Choose…</option>
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
                      placeholder="you@example.com"
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
                  <span>{mode === 'signup' ? 'Continue to Health Capture' : 'Sign In'}</span>
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
              
              {/* Auto-Calculated Live Banner: only from values the customer entered */}
              {!metricsReady && (
                <p className="p-3 rounded-2xl bg-stone-100 border border-stone-200 text-xs font-bold text-stone-600">
                  {gender === 'other'
                    ? 'Calorie and macro figures are not available for this selection yet. Your profile can still be saved.'
                    : 'Enter your date of birth, gender, height, weight, main goal and activity level to see your calculated health metrics.'}
                </p>
              )}
              {metricsReady && (
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
              )}

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
                      <option value="">Choose…</option>
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
                      value={heightCm || ''}
                      onChange={(e) => setHeightCm(Number(e.target.value))}
                      className="w-full p-2 bg-white border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">Current Weight (kg)</label>
                    <input
                      type="number"
                      value={weightKg || ''}
                      onChange={(e) => setWeightKg(Number(e.target.value))}
                      className="w-full p-2 bg-white border border-stone-300 rounded-xl text-xs font-bold text-stone-900 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">Target Weight (kg)</label>
                    <input
                      type="number"
                      value={targetWeightKg || ''}
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
                      <option value="">Choose…</option>
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
                      <option value="">Choose…</option>
                      {workScheduleOptions.map((ws) => (
                        <option key={ws} value={ws}>{ws}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">Sleep Duration (hrs/day)</label>
                    <input
                      type="number"
                      value={sleepDuration || ''}
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
                      value={muscleMassKg || ''}
                      onChange={(e) => setMuscleMassKg(Number(e.target.value))}
                      className="w-full p-1.5 bg-white border border-amber-300 rounded-lg text-xs font-bold text-center"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-amber-950 mb-0.5">Waist (cm)</label>
                    <input
                      type="number"
                      value={waistCm || ''}
                      onChange={(e) => setWaistCm(Number(e.target.value))}
                      className="w-full p-1.5 bg-white border border-amber-300 rounded-lg text-xs font-bold text-center"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-amber-950 mb-0.5">Hip (cm)</label>
                    <input
                      type="number"
                      value={hipCm || ''}
                      onChange={(e) => setHipCm(Number(e.target.value))}
                      className="w-full p-1.5 bg-white border border-amber-300 rounded-lg text-xs font-bold text-center"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-amber-950 mb-0.5">Chest (cm)</label>
                    <input
                      type="number"
                      value={chestCm || ''}
                      onChange={(e) => setChestCm(Number(e.target.value))}
                      className="w-full p-1.5 bg-white border border-amber-300 rounded-lg text-xs font-bold text-center"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-amber-950 mb-0.5">Neck (cm)</label>
                    <input
                      type="number"
                      value={neckCm || ''}
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
                        value={leftArmCm || ''}
                        onChange={(e) => setLeftArmCm(Number(e.target.value))}
                        className="w-1/2 p-1.5 bg-white border border-amber-300 rounded-lg text-[11px] font-bold text-center"
                      />
                      <input
                        type="number"
                        placeholder="R"
                        value={rightArmCm || ''}
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
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">Main Goal</label>
                    <select
                      value={goal}
                      onChange={(e) => setGoal(e.target.value as HealthGoal | '')}
                      className="w-full p-2 bg-white border border-stone-300 rounded-xl text-xs font-bold outline-none"
                    >
                      <option value="">Choose…</option>
                      <option value="weight_loss">Weight loss</option>
                      <option value="muscle_gain">Muscle gain</option>
                      <option value="maintenance">Maintain weight</option>
                      <option value="wellness">General wellness</option>
                      <option value="diabetic">Diabetes management</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">Activity Level</label>
                    <select
                      value={activityLevel}
                      onChange={(e) => setActivityLevel(e.target.value as ActivityLevel | '')}
                      className="w-full p-2 bg-white border border-stone-300 rounded-xl text-xs font-bold outline-none"
                    >
                      <option value="">Choose…</option>
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
                        className={`flex-1 py-1.5 rounded-xl text-xs font-bold border ${hasExercise === true ? 'bg-emerald-700 text-white' : 'bg-white text-stone-700'}`}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setHasExercise(false)}
                        className={`flex-1 py-1.5 rounded-xl text-xs font-bold border ${hasExercise === false ? 'bg-stone-800 text-white' : 'bg-white text-stone-700'}`}
                      >
                        No
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">Daily Step Count</label>
                    <input
                      type="number"
                      value={dailyStepCount || ''}
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
                      <option value="">Choose…</option>
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
                        value={triToSelect(isPregnant)}
                        onChange={(e) => setIsPregnant(selectToTri(e.target.value))}
                        className="w-full p-1.5 bg-white border border-pink-300 rounded-lg font-bold"
                      >
                        <option value="">Choose…</option>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-pink-900 mb-0.5">Breastfeeding?</label>
                      <select
                        value={triToSelect(isBreastfeeding)}
                        onChange={(e) => setIsBreastfeeding(selectToTri(e.target.value))}
                        className="w-full p-1.5 bg-white border border-pink-300 rounded-lg font-bold"
                      >
                        <option value="">Choose…</option>
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
                        <option value="">Choose…</option>
                        <option value="Regular">Regular</option>
                        <option value="Irregular">Irregular</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-pink-900 mb-0.5">Menopause?</label>
                      <select
                        value={triToSelect(isMenopause)}
                        onChange={(e) => setIsMenopause(selectToTri(e.target.value))}
                        className="w-full p-1.5 bg-white border border-pink-300 rounded-lg font-bold"
                      >
                        <option value="">Choose…</option>
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
                  onClick={skipHealthCapture}
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
