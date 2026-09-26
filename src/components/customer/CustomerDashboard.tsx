import React, { useState } from 'react';
import { CustomerProfile, Order, RecipeItem, WeightLog, MealFeedback, ClientWorkoutPlan, ProgressPhoto, OneOnOneVideoSession } from '../../types';
import { ALL_RECIPES } from '../../data/recipeDatabase';
import { INITIAL_WORKOUT_PLAN, INITIAL_PROGRESS_PHOTOS, INITIAL_VIDEO_SESSIONS } from '../../data/mockFitnessData';
import { CHEF_MENU_12_CATEGORIES } from './CustomerHome';
import { NutritionLabelCard } from '../common/NutritionLabelCard';
import { HealthProfileTab } from './HealthProfileTab';
import { WorkoutPlanTab } from './WorkoutPlanTab';
import { 
  UserCheck, Layers, Stethoscope, FileText, ShoppingBag, Truck, Star, Award, Dumbbell,
  Phone, MessageSquare, Send, CheckCircle2, AlertTriangle, Calendar, MapPin,
  CreditCard, ShieldCheck, Clock, RefreshCw, Plus, PauseCircle, PlayCircle,
  Download, ChevronRight, X, Sparkles, HelpCircle, AlertCircle, PhoneCall,
  Check, ArrowRight, ShieldAlert, Receipt
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface CustomerDashboardProps {
  profile: CustomerProfile;
  orders: Order[];
  onOpenMenuModal: (recipe: RecipeItem) => void;
  workoutPlan?: ClientWorkoutPlan;
  onUpdateWorkoutPlanRequest?: (level: 'Beginner' | 'Intermediate' | 'Advanced', split: '3_day' | '5_day' | '6_day', reqs: string) => void;
  progressPhotos?: ProgressPhoto[];
  onUploadProgressPhoto?: (newPhoto: ProgressPhoto) => void;
  videoSessions?: OneOnOneVideoSession[];
  onBookVideoSession?: (session: OneOnOneVideoSession) => void;
}

export const CustomerDashboard: React.FC<CustomerDashboardProps> = ({
  profile,
  orders,
  onOpenMenuModal,
  workoutPlan = INITIAL_WORKOUT_PLAN,
  onUpdateWorkoutPlanRequest,
  progressPhotos = INITIAL_PROGRESS_PHOTOS,
  onUploadProgressPhoto,
  videoSessions = INITIAL_VIDEO_SESSIONS,
  onBookVideoSession
}) => {
  const [currentProfile, setCurrentProfile] = useState<CustomerProfile>(profile);
  
  // Local Fitness States
  const [currentWorkoutPlan, setCurrentWorkoutPlan] = useState<ClientWorkoutPlan>(workoutPlan);
  const [currentPhotos, setCurrentPhotos] = useState<ProgressPhoto[]>(progressPhotos);
  const [currentSessions, setCurrentSessions] = useState<OneOnOneVideoSession[]>(videoSessions);

  // The 9 Customer Module Tabs
  const [activeTab, setActiveTab] = useState<
    'health-profile' | 'subscription-details' | 'dietitian-support' | 'workout-plan' | 'orders-receipts' | 'active-subscription' | 'tracking' | 'ratings-support' | 'referral'
  >('health-profile');

  // --- TAB 2: SUBSCRIPTION DETAILS STATE ---
  const [selectedMealsPerDay, setSelectedMealsPerDay] = useState<number>(3);
  const [selectedDurationDays, setSelectedDurationDays] = useState<number>(30);
  const [selectedAddons, setSelectedAddons] = useState<string[]>(['11:00 AM Morning Protein Shake']);
  const [selectedCustomDishes, setSelectedCustomDishes] = useState<Record<string, string>>({
    'Breakfast': 'Spinach & Feta Omelette Wrap',
    'Lunch': 'Lemon Garlic Air-Fried Chicken + Matta Rice',
    'Dinner': 'High Protein Avocado Chicken Salad'
  });

  // --- TAB 3: DIETITIAN SUPPORT STATE ---
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'dietician'; text: string; time: string }>>([
    { sender: 'dietician', text: 'Hello! I am Dr. Priya Sharma, Chief Dietitian. I reviewed your clinical health profile. How can I assist with your 3-meal plan today?', time: '09:30 AM' },
    { sender: 'user', text: 'Hi Dr. Priya! I need extra lean protein for my evening workout days.', time: '10:15 AM' },
    { sender: 'dietician', text: 'Perfect! I have adjusted your dinner to Air-Fried Lemon Pepper Chicken Breast with Tri-Color Quinoa (48g protein). Menu confirmed!', time: '10:20 AM' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'connected'>('idle');

  // --- TAB 4: ORDERS & RECEIPTS STATE ---
  const [startDate, setStartDate] = useState<string>('2026-08-01');
  const [deliveryLocation, setDeliveryLocation] = useState<string>('Marine Drive, Kochi, Kerala - 682031');
  const [deliveryDistanceKm, setDeliveryDistanceKm] = useState<number>(18);
  const [agreedToTerms, setAgreedToTerms] = useState<boolean>(false);
  const [showPaymentGatewayModal, setShowPaymentGatewayModal] = useState<boolean>(false);
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'card' | 'netbanking' | 'cod'>('upi');

  // --- TAB 5: MY ACTIVE SUBSCRIPTION & PAUSE PLAN STATE ---
  const [activeSubscriptions, setActiveSubscriptions] = useState<Array<{
    id: string;
    planTitle: string;
    mealsPerDay: number;
    durationDays: number;
    startDate: string;
    endDate: string;
    amountPaid: number;
    status: 'Active' | 'Paused';
    deliveryLocation: string;
  }>>([
    {
      id: 'SUB-2026-8801',
      planTitle: '30-Day Complete Clinical Dietitian Plan',
      mealsPerDay: 3,
      durationDays: 30,
      startDate: '2026-08-01',
      endDate: '2026-08-30',
      amountPaid: 16538,
      status: 'Active',
      deliveryLocation: 'Marine Drive, Kochi, Kerala - 682031'
    }
  ]);

  // Pause Plan Tracking
  const [pauseRequests, setPauseRequests] = useState<Array<{
    id: string;
    pauseDate: string;
    replacementDate: string;
    status: 'Approved & Schedule Frozen';
  }>>([]);
  const [inputPauseDate, setInputPauseDate] = useState<string>('2026-08-10');
  const [inputReplacementDate, setInputReplacementDate] = useState<string>('2026-08-31');
  const [pauseNotice, setPauseNotice] = useState<string | null>(null);

  // --- TAB 6: ORDER TRACKING & NON-DELIVERY QUERY STATE ---
  const [orderTrackingStage, setOrderTrackingStage] = useState<'In Prep' | 'Packing' | 'Out for Delivery' | 'Delivered'>('Out for Delivery');
  const [queryModalOpen, setQueryModalOpen] = useState<boolean>(false);
  const [nonDeliveryReason, setNonDeliveryReason] = useState<string>('Delayed beyond estimated slot');
  const [queryLogs, setQueryLogs] = useState<Array<{ id: string; date: string; reason: string; status: string }>>([]);

  // --- TAB 7: MEAL RATINGS & ISSUE SUPPORT STATE ---
  const [feedbacks, setFeedbacks] = useState<MealFeedback[]>([
    { id: 'f1', date: '23 Jul', mealName: 'Lemon Garlic Air-Fried Chicken Breast', rating: 5, comment: 'Juicy and super flavorful! Loved the lemon herb marinade.' },
    { id: 'f2', date: '22 Jul', mealName: 'Kerala Matta Rice & Beetroot Thoran', rating: 4, comment: 'Authentic taste and very filling.' }
  ]);
  const [newFeedbackMeal, setNewFeedbackMeal] = useState('High Protein Avocado Chicken Salad');
  const [newFeedbackRating, setNewFeedbackRating] = useState(5);
  const [newFeedbackComment, setNewFeedbackComment] = useState('');

  // Issue Raise Modal State
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [issueCategory, setIssueCategory] = useState('Portion Size Too Small');
  const [issueDetails, setIssueDetails] = useState('');
  const [raisedIssues, setRaisedIssues] = useState<Array<{ id: string; category: string; details: string; resolution: string; date: string }>>([
    { id: 'ISS-901', category: 'Packaging Leak', details: 'Salad dressing leaked slightly inside box.', resolution: '₹100 Wallet Credit Issued', date: '20 Jul' }
  ]);

  // --- TAB 8: REFER & EARN STATE ---
  const [referralWallet, setReferralWallet] = useState<number>(1000);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // --- WALLET REDEEM & 7-DAY ROTATIONAL MENU STATE ---
  const [applyWalletCredit, setApplyWalletCredit] = useState<boolean>(false);
  const [selectedMenuDay, setSelectedMenuDay] = useState<number>(1);

  // --------------------------------------------------------------------------
  // 7-DAY ROTATIONAL MENU SCHEDULE (REPEATS WEEKLY)
  // --------------------------------------------------------------------------
  const ROTATIONAL_7_DAY_SCHEDULE = [
    {
      day: 1,
      label: 'Day 1 (Mon)',
      title: 'Day 1: High Protein Lean Fuel',
      meals: [
        { slot: 'Breakfast', name: 'Spinach & Feta Omelette Wrap', macros: '260 kcal • 22g Protein', desc: 'Egg whites, fresh spinach, crumbled feta in whole wheat tortilla' },
        { slot: 'Lunch', name: 'Air-Fried Lemon Garlic Chicken + Kerala Matta Rice', macros: '595 kcal • 45g Protein', desc: 'Skinless breast cooked in extra virgin olive oil and garlic herbs' },
        { slot: 'Dinner', name: 'High Protein Avocado Chicken Salad', macros: '340 kcal • 35g Protein', desc: 'Diced grilled breast, hass avocado, cherry tomatoes & lemon vinaigrette' },
      ]
    },
    {
      day: 2,
      label: 'Day 2 (Tue)',
      title: 'Day 2: Omega-Rich & Clean Carbs',
      meals: [
        { slot: 'Breakfast', name: 'High Protein Oats Bowl with Almonds & Berries', macros: '280 kcal • 20g Protein', desc: 'Rolled oats, whey isolate, sliced almonds, chia seeds & blueberries' },
        { slot: 'Lunch', name: 'Grilled Herb Chicken Breast & Tri-Color Quinoa', macros: '550 kcal • 48g Protein', desc: 'Herb-crusted chicken breast over steamed organic quinoa & roasted veggies' },
        { slot: 'Dinner', name: 'Pan-Seared Salmon Fillet with Asparagus', macros: '380 kcal • 36g Protein', desc: 'Fresh Sear Fish / Salmon fillet pan-cooked with garlic lemon drizzle' },
      ]
    },
    {
      day: 3,
      label: 'Day 3 (Wed)',
      title: 'Day 3: Low-GI Clinical Balance',
      meals: [
        { slot: 'Breakfast', name: 'Egg White Mayo & Spinach Toast', macros: '250 kcal • 24g Protein', desc: 'Hard boiled egg whites on sourdough toast with organic spinach' },
        { slot: 'Lunch', name: 'Roasted Chicken Breast with Sweet Potato Mash', macros: '570 kcal • 46g Protein', desc: 'Herb-roasted breast served with steamed sweet potato mash & broccoli' },
        { slot: 'Dinner', name: 'Tofu Tikka Kebabs with Mint Yoghurt Dip', macros: '310 kcal • 28g Protein', desc: 'Charbroiled cottage tofu kebabs tossed in aromatic spices' },
      ]
    },
    {
      day: 4,
      label: 'Day 4 (Thu)',
      title: 'Day 4: Fiber & Energy Recharge',
      meals: [
        { slot: 'Breakfast', name: 'Flaxseed & Banana Protein Pancakes', macros: '290 kcal • 22g Protein', desc: 'Oat flour pancakes enriched with flaxseeds and natural honey drizzle' },
        { slot: 'Lunch', name: 'Kerala Spiced Fish Curry + Brown Rice & Thoran', macros: '580 kcal • 42g Protein', desc: 'Fresh coastal kingfish in coconut turmeric curry with beetroot thoran' },
        { slot: 'Dinner', name: 'Smoked Turkey / Chicken Wrap with Greek Dressing', macros: '330 kcal • 34g Protein', desc: 'Lean smoked breast with crisp romaine lettuce & Greek yoghurt tzatziki' },
      ]
    },
    {
      day: 5,
      label: 'Day 5 (Fri)',
      title: 'Day 5: Lean Muscle Recovery',
      meals: [
        { slot: 'Breakfast', name: 'Scrambled Egg Whites with Sauteed Mushrooms', macros: '240 kcal • 25g Protein', desc: '5 egg whites scrambled in light olive oil with wild mushrooms' },
        { slot: 'Lunch', name: 'Tender Grilled Chicken Steak with Sauteed Veggies', macros: '610 kcal • 50g Protein', desc: 'Thick marinated chicken breast steak served with grilled peppers' },
        { slot: 'Dinner', name: 'Cottage Cheese & Paneer Power Bowl with Broccoli', macros: '350 kcal • 30g Protein', desc: 'Low-fat artisanal paneer cubes tossed in herb garlic marinade' },
      ]
    },
    {
      day: 6,
      label: 'Day 6 (Sat)',
      title: 'Day 6: Ancient Grains & Superfoods',
      meals: [
        { slot: 'Breakfast', name: 'Millet Dosa with High-Protein Chutney', macros: '270 kcal • 18g Protein', desc: 'Foxtail millet dosa served with high-protein peanut & lentil chutney' },
        { slot: 'Lunch', name: 'Peri-Peri Chicken Breast Bowl with Foxtail Millet', macros: '590 kcal • 47g Protein', desc: 'Zesty peri-peri chicken served over fluffy foxtail millet' },
        { slot: 'Dinner', name: 'Mediterranean Greek Salad with Grilled Egg Whites', macros: '320 kcal • 28g Protein', desc: 'Crisp cucumbers, olives, cherry tomatoes and grilled egg whites' },
      ]
    },
    {
      day: 7,
      label: 'Day 7 (Sun)',
      title: 'Day 7: Chef’s Sunday Special Fiesta',
      meals: [
        { slot: 'Breakfast', name: 'Protein French Toast with Cinnamon Whey Drizzle', macros: '310 kcal • 24g Protein', desc: 'Whole grain toast soaked in egg white cinnamon protein glaze' },
        { slot: 'Lunch', name: 'Sunday Roast Chicken Breast with Herbed Rice', macros: '620 kcal • 52g Protein', desc: 'Slow-roasted herb chicken breast with buttered parsley rice' },
        { slot: 'Dinner', name: 'Light Roasted Lentil & Mushroom Stew with Toast', macros: '340 kcal • 26g Protein', desc: 'Hearty high-fiber lentil stew cooked with rosemary and root veggies' },
      ]
    }
  ];

  // --------------------------------------------------------------------------
  // CALCULATED PRICING ENGINE
  // --------------------------------------------------------------------------
  const basePricePerMeal = 180;
  const rawMealTotal = selectedMealsPerDay * selectedDurationDays * basePricePerMeal;
  const discountRate = selectedDurationDays >= 30 ? 0.20 : selectedDurationDays >= 15 ? 0.15 : selectedDurationDays >= 7 ? 0.10 : 0.05;
  const discountAmount = Math.round(rawMealTotal * discountRate);
  const isFarDelivery = deliveryDistanceKm > 20;
  const deliveryChargeTotal = isFarDelivery ? 30 * selectedDurationDays : 0;
  const gstAmount = Math.round((rawMealTotal - discountAmount) * 0.05);
  const initialGrandTotal = (rawMealTotal - discountAmount) + deliveryChargeTotal + gstAmount;

  // Wallet Redemption Engine
  const walletDeduction = applyWalletCredit ? Math.min(referralWallet, initialGrandTotal) : 0;
  const grandTotalPayable = Math.max(0, initialGrandTotal - walletDeduction);

  // --------------------------------------------------------------------------
  // PAUSE ENTITLEMENT COMPUTATION
  // --------------------------------------------------------------------------
  const getPauseEntitlements = (days: number) => {
    if (days === 3) return { maxPauseDays: 0, maxRequests: 0, label: '3-Day Plan: No pause permitted.' };
    if (days === 7) return { maxPauseDays: 1, maxRequests: 1, label: '7-Day Plan: Maximum of 1 pause day.' };
    if (days === 15) return { maxPauseDays: 3, maxRequests: 3, label: '15-Day Plan: Maximum of 3 pause days (max 3 requests).' };
    return { maxPauseDays: 5, maxRequests: 3, label: '30-Day Plan: Maximum pause days as approved by management (Max 3 separate requests).' };
  };

  const pauseEntitlement = getPauseEntitlements(selectedDurationDays);

  const handleApplyPause = (e: React.FormEvent) => {
    e.preventDefault();
    if (pauseEntitlement.maxPauseDays === 0) {
      alert('3-Day Plan does not permit pause requests.');
      return;
    }
    if (pauseRequests.length >= pauseEntitlement.maxRequests) {
      alert(`Limit reached: Maximum of ${pauseEntitlement.maxRequests} separate pause requests allowed for your plan.`);
      return;
    }

    const newReq = {
      id: `P-${Date.now()}`,
      pauseDate: inputPauseDate,
      replacementDate: inputReplacementDate,
      status: 'Approved & Schedule Frozen' as const
    };

    setPauseRequests([newReq, ...pauseRequests]);
    setPauseNotice(`Plan paused for ${inputPauseDate}. Alternate date ${inputReplacementDate} selected & freezed in kitchen system!`);
    confetti({ particleCount: 40, spread: 50 });
  };

  // --------------------------------------------------------------------------
  // PAYMENT COMPLETION HANDLER
  // --------------------------------------------------------------------------
  const handleCompletePayment = () => {
    confetti({ particleCount: 80, spread: 70 });
    setShowPaymentGatewayModal(false);

    if (applyWalletCredit && walletDeduction > 0) {
      setReferralWallet(prev => Math.max(0, prev - walletDeduction));
    }

    const newSub = {
      id: `SUB-${Date.now().toString().slice(-4)}`,
      planTitle: `${selectedDurationDays}-Day ${selectedMealsPerDay}-Meal Custom Subscription`,
      mealsPerDay: selectedMealsPerDay,
      durationDays: selectedDurationDays,
      startDate: startDate,
      endDate: new Date(new Date(startDate).getTime() + selectedDurationDays * 86400000).toISOString().split('T')[0],
      amountPaid: grandTotalPayable,
      status: 'Active' as const,
      deliveryLocation: deliveryLocation
    };

    setActiveSubscriptions([newSub, ...activeSubscriptions]);
    setActiveTab('active-subscription');
  };

  // Chat send
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const msg = { sender: 'user' as const, text: chatInput, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    setChatMessages(prev => [...prev, msg]);
    setChatInput('');

    setTimeout(() => {
      setChatMessages(prev => [
        ...prev,
        {
          sender: 'dietician',
          text: 'Thank you! Your custom macro adjustments have been updated in your profile.',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    }, 1000);
  };

  // Feedback add
  const handleAddFeedback = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFeedbackComment) return;
    const newFb: MealFeedback = {
      id: Date.now().toString(),
      date: 'Today',
      mealName: newFeedbackMeal,
      rating: newFeedbackRating,
      comment: newFeedbackComment
    };
    setFeedbacks([newFb, ...feedbacks]);
    setNewFeedbackComment('');
    confetti({ particleCount: 30, spread: 40 });
  };

  // Raise Issue add
  const handleRaiseIssue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueDetails) return;
    const newIss = {
      id: `ISS-${Date.now().toString().slice(-3)}`,
      category: issueCategory,
      details: issueDetails,
      resolution: 'Assigned to Kitchen Manager & ₹150 Credit Initiated',
      date: 'Today'
    };
    setRaisedIssues([newIss, ...raisedIssues]);
    setIssueDetails('');
    setIssueModalOpen(false);
    confetti({ particleCount: 30, spread: 40 });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 animate-fadeIn text-white">
      
      {/* Top Welcome Header - Cleaned per user instructions */}
      <div className="bg-gradient-to-r from-stone-900 via-emerald-950 to-stone-900 text-white rounded-3xl p-6 sm:p-8 border border-stone-800 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Welcome, {currentProfile.name}!
            </h1>
            <p className="text-stone-300 text-xs sm:text-sm mt-1">
              Goal: <strong className="capitalize text-emerald-300">{currentProfile.goal.replace('_', ' ')}</strong> • Target: <strong className="text-white">{currentProfile.targetCalories} kcal / day</strong>
            </p>
          </div>

          <div className="flex items-center gap-2 bg-stone-900/90 border border-stone-800 px-4 py-2 rounded-2xl text-xs font-bold text-stone-300">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Subscriber Profile Verified</span>
          </div>
        </div>
      </div>

      {/* 9 CUSTOMER MODULE TABS */}
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-1.5 p-1.5 bg-stone-900 rounded-2xl border border-stone-800 text-center">
        {[
          { id: 'health-profile', label: '1. Health Profile', icon: <UserCheck className="w-4 h-4" /> },
          { id: 'subscription-details', label: '2. Sub Details', icon: <Layers className="w-4 h-4" /> },
          { id: 'dietitian-support', label: '3. Dietitian', icon: <Stethoscope className="w-4 h-4" /> },
          { id: 'workout-plan', label: '4. Workout Plan', icon: <Dumbbell className="w-4 h-4" /> },
          { id: 'orders-receipts', label: '5. Orders & Receipts', icon: <FileText className="w-4 h-4" /> },
          { id: 'active-subscription', label: '6. Active Plan', icon: <ShoppingBag className="w-4 h-4" /> },
          { id: 'tracking', label: '7. Tracking', icon: <Truck className="w-4 h-4" /> },
          { id: 'ratings-support', label: '8. Ratings & Issues', icon: <Star className="w-4 h-4" /> },
          { id: 'referral', label: '9. Refer & Earn', icon: <Award className="w-4 h-4" /> },
        ].map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`p-2 sm:p-2.5 rounded-xl text-[11px] sm:text-xs font-black transition-all flex flex-col items-center justify-center gap-1 leading-tight ${
                active
                  ? 'bg-emerald-500 text-stone-950 shadow-md scale-[1.02]'
                  : 'text-stone-300 hover:text-white hover:bg-stone-800/80'
              }`}
            >
              {tab.icon}
              <span className="truncate w-full">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ====================================================================== */}
      {/* 1st TAB: DEMOGRAPHIC & CLINICAL HEALTH PROFILE                         */}
      {/* ====================================================================== */}
      {activeTab === 'health-profile' && (
        <HealthProfileTab
          profile={currentProfile}
          onUpdateProfile={(updated) => setCurrentProfile(updated)}
        />
      )}

      {/* ====================================================================== */}
      {/* WORKOUT PLAN TAB (FITNESS MODULE)                                      */}
      {/* ====================================================================== */}
      {activeTab === 'workout-plan' && (
        <WorkoutPlanTab
          profile={currentProfile}
          workoutPlan={currentWorkoutPlan}
          onUpdateWorkoutPlanRequest={(level, split, reqs) => {
            const updated = {
              ...currentWorkoutPlan,
              fitnessLevel: level,
              splitType: split,
              specificRequirements: reqs,
              updatedAt: new Date().toISOString().split('T')[0]
            };
            setCurrentWorkoutPlan(updated);
            if (onUpdateWorkoutPlanRequest) onUpdateWorkoutPlanRequest(level, split, reqs);
          }}
          progressPhotos={currentPhotos}
          onUploadProgressPhoto={(newPhoto) => {
            const updated = [newPhoto, ...currentPhotos];
            setCurrentPhotos(updated);
            if (onUploadProgressPhoto) onUploadProgressPhoto(newPhoto);
          }}
          videoSessions={currentSessions}
          onBookVideoSession={(newSession) => {
            const updated = [newSession, ...currentSessions];
            setCurrentSessions(updated);
            if (onBookVideoSession) onBookVideoSession(newSession);
          }}
          hasActive21or30DayPlan={activeSubscriptions.some(sub => sub.durationDays >= 21) || selectedDurationDays >= 21}
        />
      )}

      {/* ====================================================================== */}
      {/* 2nd TAB: SUBSCRIPTION DETAILS (MEALS PER DAY & PLAN OPTIONS)           */}
      {/* ====================================================================== */}
      {activeTab === 'subscription-details' && (
        <div className="bg-stone-900 rounded-3xl p-6 sm:p-8 border border-stone-800 shadow-xl space-y-6">
          <div className="border-b border-stone-800 pb-4">
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-400" />
              <span>2. Subscription Details & Meal Configuration</span>
            </h2>
            <p className="text-xs text-stone-400 mt-1">
              Select your required meals per day, package duration, and custom dish choices.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Meal Frequency Picker */}
            <div className="p-5 bg-stone-950 rounded-2xl border border-stone-800 space-y-3">
              <label className="block text-xs font-extrabold uppercase text-amber-300">1. Number of Meals Per Day</label>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setSelectedMealsPerDay(f)}
                    className={`py-3 px-3 rounded-xl text-xs font-black border transition-all ${
                      selectedMealsPerDay === f
                        ? 'bg-emerald-500 text-stone-950 border-emerald-400 shadow-md'
                        : 'bg-stone-900 text-stone-300 border-stone-800 hover:bg-stone-800'
                    }`}
                  >
                    {f} Meal{f > 1 ? 's' : ''}/day
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-stone-400">
                {selectedMealsPerDay === 3 
                  ? '⭐ 3-Meal Plan requires Dietitian Consultation to confirm clinical macro split.' 
                  : 'Direct Menu Selection available for 1 or 2 meal daily options.'}
              </p>
            </div>

            {/* Duration Picker */}
            <div className="p-5 bg-stone-950 rounded-2xl border border-stone-800 space-y-3">
              <label className="block text-xs font-extrabold uppercase text-amber-300">2. Plan Duration Options</label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[3, 7, 15, 20, 30].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSelectedDurationDays(d)}
                    className={`py-3 px-2 rounded-xl text-xs font-black border transition-all ${
                      selectedDurationDays === d
                        ? 'bg-amber-400 text-stone-950 border-amber-300 shadow-md'
                        : 'bg-stone-900 text-stone-300 border-stone-800 hover:bg-stone-800'
                    }`}
                  >
                    {d} Days {d === 3 ? '(Trial)' : d === 30 ? '(Monthly)' : ''}
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* IF 3 MEALS PER DAY IS SELECTED -> DIETITIAN CONSULTATION PROMPT */}
          {selectedMealsPerDay === 3 ? (
            <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-stone-900 p-6 rounded-2xl border-2 border-emerald-500/50 space-y-4">
              <div className="flex items-start gap-3">
                <Stethoscope className="w-6 h-6 text-emerald-400 shrink-0 mt-1" />
                <div>
                  <h3 className="font-extrabold text-white text-base">3-Meal Full Daily Nutrition Plan Selected</h3>
                  <p className="text-xs text-stone-300 mt-1 leading-relaxed">
                    Because you selected 3 meals per day, your order requires personalized consultation with our Chief Dietitian to ensure your breakfast, lunch, and dinner calories match your clinical health assessment before confirming your menu.
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('dietitian-support')}
                  className="bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black px-6 py-3 rounded-xl text-xs shadow-lg flex items-center gap-2 transition-all hover:scale-105"
                >
                  <span>Proceed to Dietitian Support</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            /* IF 1 OR 2 MEALS PER DAY IS SELECTED -> INLINE MENU SELECTION WINDOW */
            <div className="bg-stone-950 p-6 rounded-2xl border border-stone-800 space-y-4">
              <div className="flex items-center justify-between border-b border-stone-800 pb-3">
                <div>
                  <h3 className="font-extrabold text-amber-300 text-sm uppercase">Menu Selection Window (12 Cloud Kitchen Categories)</h3>
                  <p className="text-xs text-stone-400">Select dishes directly from our fresh loaded menu database for your daily meal slot(s).</p>
                </div>
                <span className="px-3 py-1 bg-amber-400/20 text-amber-300 text-xs font-bold rounded-full border border-amber-400/30">
                  {selectedMealsPerDay} Meal(s) Selected
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {ALL_RECIPES.slice(0, 6).map((recipe) => (
                  <div key={recipe.id} className="p-3.5 bg-stone-900 rounded-xl border border-stone-800 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <img src={recipe.image} alt={recipe.name} className="w-12 h-12 rounded-lg object-cover" />
                      <div>
                        <h4 className="font-bold text-white text-xs">{recipe.name}</h4>
                        <p className="text-[10px] text-emerald-400">{recipe.calories} kcal • {recipe.protein}g Protein</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenMenuModal(recipe)}
                      className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 text-[10px] font-bold rounded-lg border border-emerald-500/30 hover:bg-emerald-500 hover:text-stone-950"
                    >
                      Inspect
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('orders-receipts')}
                  className="bg-amber-400 hover:bg-amber-300 text-stone-950 font-black px-6 py-3 rounded-xl text-xs shadow-lg flex items-center gap-2 transition-all hover:scale-105"
                >
                  <span>Proceed to Orders & Receipts</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================== */}
      {/* 3rd TAB: DIETITIAN SUPPORT (CHAT, CALL & MENU CONFIRMATION)            */}
      {/* ====================================================================== */}
      {activeTab === 'dietitian-support' && (
        <div className="bg-stone-900 rounded-3xl p-6 sm:p-8 border border-stone-800 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-800 pb-4">
            <div>
              <h2 className="text-xl font-black text-white flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-emerald-400" />
                <span>3. Dietitian Support & Macro Consultation</span>
              </h2>
              <p className="text-xs text-stone-400 mt-1">
                Chat or request call support with Dr. Priya Sharma (PCOS & Weight Loss Clinical Specialist)
              </p>
            </div>

            {/* Voice Call Action Button */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setCallStatus('calling');
                  setTimeout(() => setCallStatus('connected'), 1500);
                }}
                className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-extrabold text-xs rounded-xl shadow-md flex items-center gap-2 transition-all"
              >
                <PhoneCall className="w-4 h-4" />
                <span>{callStatus === 'idle' ? 'Request Dietitian Voice Call' : callStatus === 'calling' ? 'Dialing (+91 98765 00112)...' : 'Call Connected ✓'}</span>
              </button>
            </div>
          </div>

          {callStatus === 'connected' && (
            <div className="p-4 bg-emerald-950 border border-emerald-500 rounded-2xl text-xs flex items-center justify-between text-emerald-200">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
                <span>Dietitian Hotline Connected with Dr. Priya Sharma. Menu customization verified!</span>
              </div>
              <button onClick={() => setCallStatus('idle')} className="text-xs text-emerald-400 hover:underline">End Call</button>
            </div>
          )}

          {/* Interactive Chat Box */}
          <div className="bg-stone-950 p-4 rounded-2xl border border-stone-800 space-y-3">
            <h3 className="text-xs font-extrabold uppercase text-stone-400">Live Chat Consultation Log</h3>
            <div className="h-48 overflow-y-auto space-y-2.5 p-3 bg-stone-900 rounded-xl border border-stone-800 text-xs">
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`max-w-[85%] p-3 rounded-2xl ${
                    msg.sender === 'user'
                      ? 'ml-auto bg-emerald-700 text-white rounded-br-none'
                      : 'bg-stone-800 text-stone-200 border border-stone-700 rounded-bl-none'
                  }`}
                >
                  <p className="leading-relaxed">{msg.text}</p>
                  <span className={`text-[9px] mt-1 block text-right ${msg.sender === 'user' ? 'text-emerald-200' : 'text-stone-400'}`}>
                    {msg.time}
                  </span>
                </div>
              ))}
            </div>

            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                placeholder="Type your question or menu preference..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="flex-1 bg-stone-900 border border-stone-800 rounded-xl px-4 py-2.5 text-xs text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="submit"
                className="bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send</span>
              </button>
            </form>
          </div>

          {/* 7-DAY ROTATIONAL MENU CONFIRMED BY DIETITIAN */}
          <div className="bg-stone-950 p-6 rounded-2xl border border-stone-800 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-800 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin-slow" />
                  <span>Dietitian Prescribed 7-Day Rotational Schedule</span>
                </span>
                <h3 className="text-base font-black text-white">Full 7-Day Menu Confirmed by Dr. Priya Sharma</h3>
              </div>
              <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 text-xs font-bold rounded-full border border-emerald-500/30">
                1,680 kcal • 128g Daily Target • Rotates Weekly
              </span>
            </div>

            {/* 7-Day Day Selector Buttons */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-stone-400">
                <span className="font-extrabold uppercase text-amber-300">Select Day to Inspect Menu (Up to 7 Days)</span>
                <span className="text-[11px] text-emerald-400 font-bold">🔁 Auto-rotates every 7 days for {selectedDurationDays} days</span>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
                {ROTATIONAL_7_DAY_SCHEDULE.map((d) => (
                  <button
                    key={d.day}
                    type="button"
                    onClick={() => setSelectedMenuDay(d.day)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap border ${
                      selectedMenuDay === d.day
                        ? 'bg-emerald-500 text-stone-950 border-emerald-400 font-black shadow-md scale-105'
                        : 'bg-stone-900 text-stone-300 border-stone-800 hover:bg-stone-800 hover:text-white'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Selected Day Menu Details */}
            {(() => {
              const currentDayObj = ROTATIONAL_7_DAY_SCHEDULE.find(d => d.day === selectedMenuDay) || ROTATIONAL_7_DAY_SCHEDULE[0];
              const visibleMeals = currentDayObj.meals.slice(0, selectedMealsPerDay);

              return (
                <div className="space-y-3 bg-stone-900/80 p-5 rounded-2xl border border-stone-800">
                  <div className="flex items-center justify-between border-b border-stone-800 pb-2">
                    <h4 className="font-black text-amber-300 text-xs sm:text-sm">{currentDayObj.title}</h4>
                    <span className="text-[10px] font-bold text-stone-400 uppercase bg-stone-950 px-2.5 py-1 rounded-md border border-stone-800">
                      Showing {selectedMealsPerDay} Meal{selectedMealsPerDay > 1 ? 's' : ''} / Day
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                    {visibleMeals.map((m, i) => (
                      <div key={i} className="p-4 bg-stone-950 rounded-xl border border-stone-800 space-y-1.5 hover:border-emerald-500/40 transition-all">
                        <span className="text-[10px] font-extrabold text-amber-300 uppercase tracking-wider">{m.slot}</span>
                        <h5 className="font-extrabold text-white text-xs">{m.name}</h5>
                        <p className="text-[11px] text-emerald-400 font-bold">{m.macros}</p>
                        <p className="text-[10px] text-stone-400 leading-snug">{m.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Rotational Assurance Notice */}
            <div className="p-3 bg-emerald-950/60 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center justify-between">
              <span className="font-medium">
                ✓ <strong>7-Day Rotational Menu Locked:</strong> This 7-day clinical meal menu will automatically cycle continuously throughout your {selectedDurationDays}-day subscription period.
              </span>
            </div>

            {/* CONFIRM & PROCEED BUTTON */}
            <div className="flex justify-end pt-2 border-t border-stone-800">
              <button
                type="button"
                onClick={() => setActiveTab('orders-receipts')}
                className="bg-amber-400 hover:bg-amber-300 text-stone-950 font-black px-8 py-3.5 rounded-xl text-xs shadow-lg flex items-center gap-2 transition-all hover:scale-105"
              >
                <span>Confirm 7-Day Menu & Proceed to Orders & Receipts</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* 4th TAB: ORDERS & RECEIPTS (CALENDAR, LOCATION & PAYMENT GATEWAY)      */}
      {/* ====================================================================== */}
      {activeTab === 'orders-receipts' && (
        <div className="bg-stone-900 rounded-3xl p-6 sm:p-8 border border-stone-800 shadow-xl space-y-6">
          <div className="border-b border-stone-800 pb-4">
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-400" />
              <span>4. Orders, Delivery Calendar & Payment Checkout</span>
            </h2>
            <p className="text-xs text-stone-400 mt-1">
              Select delivery schedule dates, verify kitchen distance, agree to detailed T&C, and proceed to payment.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Calendar Date Picker */}
            <div className="p-5 bg-stone-950 rounded-2xl border border-stone-800 space-y-3">
              <label className="block text-xs font-extrabold uppercase text-amber-300 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-emerald-400" />
                <span>Select Subscription Start Date ({selectedDurationDays} Days Schedule)</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full p-3 bg-stone-900 border border-stone-800 rounded-xl text-xs font-bold text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-[11px] text-stone-400">
                Food will be freshly dispatched daily from <strong>{startDate}</strong> for <strong>{selectedDurationDays} consecutive days</strong>.
              </p>
            </div>

            {/* Delivery Location & Distance Calculation */}
            <div className="p-5 bg-stone-950 rounded-2xl border border-stone-800 space-y-3">
              <label className="block text-xs font-extrabold uppercase text-amber-300 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-emerald-400" />
                <span>Delivery Address & Distance Verification</span>
              </label>
              <input
                type="text"
                value={deliveryLocation}
                onChange={(e) => setDeliveryLocation(e.target.value)}
                className="w-full p-3 bg-stone-900 border border-stone-800 rounded-xl text-xs font-bold text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
              
              {/* Distance Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-stone-400 font-bold">
                  <span>Cloud Kitchen Distance:</span>
                  <span className={isFarDelivery ? 'text-amber-400 font-black' : 'text-emerald-400 font-black'}>{deliveryDistanceKm} km</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="40"
                  value={deliveryDistanceKm}
                  onChange={(e) => setDeliveryDistanceKm(Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>

              {/* DISTANCE MESSAGE BANNER */}
              {isFarDelivery ? (
                <div className="p-3 bg-amber-500/20 border border-amber-500/40 rounded-xl text-amber-300 text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Free delivery not available (&gt; 20 km). Delivery available at Rs. 30 per delivery.</span>
                </div>
              ) : (
                <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Eligible for FREE Express Thermal Delivery (&lt; 20 km from Cloud Kitchen)</span>
                </div>
              )}
            </div>

          </div>

          {/* WALLET CREDIT REDEEM OPTION BEFORE PAYMENT */}
          <div className="p-5 bg-gradient-to-r from-emerald-950 via-stone-950 to-stone-900 rounded-2xl border-2 border-emerald-500/50 space-y-3 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                  <Sparkles className="w-5 h-5 text-emerald-300" />
                </div>
                <div>
                  <h4 className="font-extrabold text-white text-sm">ProteinBowl Referral & Cash Wallet</h4>
                  <p className="text-xs text-stone-300">
                    Available Wallet Balance: <strong className="text-emerald-400 font-extrabold">₹{referralWallet.toLocaleString()}</strong>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setApplyWalletCredit(!applyWalletCredit)}
                className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
                  applyWalletCredit
                    ? 'bg-emerald-500 text-stone-950 border border-emerald-400 shadow-lg scale-105'
                    : 'bg-stone-800 hover:bg-stone-700 text-emerald-300 border border-stone-700'
                }`}
              >
                <CheckCircle2 className={`w-4 h-4 ${applyWalletCredit ? 'text-stone-950' : 'text-emerald-400'}`} />
                <span>{applyWalletCredit ? 'Wallet Credit Applied ✓' : 'Redeem Wallet Credit'}</span>
              </button>
            </div>

            {applyWalletCredit && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 font-medium flex items-center justify-between">
                <span>✓ ₹{walletDeduction.toLocaleString()} deducted directly from your total bill!</span>
                <span className="font-bold text-white">Remaining Wallet Balance: ₹{(referralWallet - walletDeduction).toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Pricing Breakdown Summary */}
          <div className="p-6 bg-stone-950 rounded-2xl border border-stone-800 space-y-3">
            <h3 className="text-xs font-extrabold uppercase text-stone-400">Calculated Package Cost Breakdown</h3>
            <div className={`grid grid-cols-2 ${applyWalletCredit && walletDeduction > 0 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'} gap-3 text-xs`}>
              <div className="bg-stone-900 p-3 rounded-xl border border-stone-800">
                <span className="text-stone-400 text-[10px] uppercase font-bold block">Base Meal Rate</span>
                <strong className="text-white text-sm">₹{rawMealTotal.toLocaleString()}</strong>
              </div>
              <div className="bg-stone-900 p-3 rounded-xl border border-stone-800">
                <span className="text-stone-400 text-[10px] uppercase font-bold block">Duration Savings</span>
                <strong className="text-emerald-400 text-sm">-₹{discountAmount.toLocaleString()}</strong>
              </div>
              <div className="bg-stone-900 p-3 rounded-xl border border-stone-800">
                <span className="text-stone-400 text-[10px] uppercase font-bold block">Delivery Charges</span>
                <strong className={isFarDelivery ? 'text-amber-400 text-sm' : 'text-emerald-400 text-sm'}>
                  {isFarDelivery ? `+₹${deliveryChargeTotal}` : 'FREE (Rs. 0)'}
                </strong>
              </div>
              {applyWalletCredit && walletDeduction > 0 && (
                <div className="bg-stone-900 p-3 rounded-xl border border-emerald-500/50">
                  <span className="text-emerald-400 text-[10px] uppercase font-bold block">Wallet Redeemed</span>
                  <strong className="text-emerald-300 text-sm">-₹{walletDeduction.toLocaleString()}</strong>
                </div>
              )}
              <div className="bg-emerald-500 text-stone-950 p-3 rounded-xl flex flex-col justify-center">
                <span className="text-[10px] font-black uppercase">Total Payable</span>
                <strong className="text-lg font-black">₹{grandTotalPayable.toLocaleString()}</strong>
              </div>
            </div>
          </div>

          {/* Detailed T&C Agreement */}
          <div className="p-4 bg-stone-950 rounded-2xl border border-stone-800 flex items-start gap-3">
            <input
              type="checkbox"
              id="tc_check"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="mt-1 w-4 h-4 accent-emerald-500 rounded"
            />
            <label htmlFor="tc_check" className="text-xs text-stone-300 leading-relaxed cursor-pointer">
              I agree to the <strong>Detailed Terms & Conditions</strong>, daily thermal dispatch windows (12:00 PM - 1:30 PM), allergen disclosure policy, and the plan pause guidelines.
            </label>
          </div>

          {/* PROCEED TO PAYMENT BUTTON */}
          <div className="flex justify-end pt-2">
            <button
              type="button"
              disabled={!agreedToTerms}
              onClick={() => setShowPaymentGatewayModal(true)}
              className={`px-8 py-3.5 rounded-xl text-xs font-black shadow-lg flex items-center gap-2 transition-all ${
                agreedToTerms
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-stone-950 hover:scale-105'
                  : 'bg-stone-800 text-stone-500 cursor-not-allowed'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>Proceed to Pay & Confirm Order (₹{grandTotalPayable.toLocaleString()})</span>
            </button>
          </div>

          {/* PAYMENT GATEWAY MODAL SIMULATION */}
          {showPaymentGatewayModal && (
            <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-md flex items-center justify-center p-4">
              <div className="bg-stone-900 border border-stone-800 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-6 shadow-2xl animate-scaleUp">
                <div className="flex justify-between items-center border-b border-stone-800 pb-3">
                  <div>
                    <h3 className="font-extrabold text-white text-base">Secure Payment Gateway</h3>
                    <p className="text-xs text-stone-400">Order Total: ₹{grandTotalPayable.toLocaleString()}</p>
                  </div>
                  <button onClick={() => setShowPaymentGatewayModal(false)} className="text-stone-400 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <label className="block text-stone-400 font-bold uppercase">Select Payment Method</label>
                  {[
                    { id: 'upi', label: 'UPI / Google Pay / PhonePe' },
                    { id: 'card', label: 'Credit / Debit Card' },
                    { id: 'netbanking', label: 'Netbanking' },
                    { id: 'cod', label: 'Cash on Delivery (COD)' }
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id as any)}
                      className={`w-full p-3 rounded-xl border text-left font-bold flex items-center justify-between transition-all ${
                        paymentMethod === m.id
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500'
                          : 'bg-stone-950 text-stone-300 border-stone-800'
                      }`}
                    >
                      <span>{m.label}</span>
                      {paymentMethod === m.id && <Check className="w-4 h-4 text-emerald-400" />}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleCompletePayment}
                  className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black rounded-xl text-xs shadow-lg transition-all"
                >
                  Pay ₹{grandTotalPayable.toLocaleString()} & Confirm Order
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================== */}
      {/* 5th TAB: MY ACTIVE SUBSCRIPTION & STRICT PAUSE PLAN MANAGEMENT         */}
      {/* ====================================================================== */}
      {activeTab === 'active-subscription' && (
        <div className="bg-stone-900 rounded-3xl p-6 sm:p-8 border border-stone-800 shadow-xl space-y-6">
          <div className="border-b border-stone-800 pb-4">
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-emerald-400" />
              <span>5. My Active Subscription & Plan Pause Manager</span>
            </h2>
            <p className="text-xs text-stone-400 mt-1">
              View your active food plan schedule, receipt details, and pause/freeze days according to policy limits.
            </p>
          </div>

          {/* Active Subscriptions Cards */}
          {activeSubscriptions.map((sub) => (
            <div key={sub.id} className="p-6 bg-stone-950 rounded-2xl border border-stone-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-800 pb-3">
                <div>
                  <span className="text-[10px] font-black text-amber-300 uppercase tracking-wider">{sub.id}</span>
                  <h3 className="font-extrabold text-white text-base">{sub.planTitle}</h3>
                  <p className="text-xs text-stone-400">Duration: {sub.startDate} to {sub.endDate} • {sub.mealsPerDay} Meals/Day</p>
                </div>
                <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 text-xs font-bold rounded-full border border-emerald-500/30">
                  {sub.status} ✓
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-stone-900 p-3 rounded-xl border border-stone-800">
                  <span className="text-stone-400 text-[10px] uppercase font-bold block">Meals Per Day</span>
                  <strong className="text-white">{sub.mealsPerDay} Meals</strong>
                </div>
                <div className="bg-stone-900 p-3 rounded-xl border border-stone-800">
                  <span className="text-stone-400 text-[10px] uppercase font-bold block">Amount Paid</span>
                  <strong className="text-emerald-400">₹{sub.amountPaid.toLocaleString()}</strong>
                </div>
                <div className="bg-stone-900 p-3 rounded-xl border border-stone-800 col-span-2">
                  <span className="text-stone-400 text-[10px] uppercase font-bold block">Delivery Location</span>
                  <strong className="text-stone-200 text-xs truncate block">{sub.deliveryLocation}</strong>
                </div>
              </div>
            </div>
          ))}

          {/* STRICT PAUSE PLAN MANAGEMENT CARD */}
          <div className="p-6 bg-stone-950 rounded-2xl border border-stone-800 space-y-4">
            <div className="border-b border-stone-800 pb-3">
              <h3 className="text-sm font-extrabold text-amber-300 uppercase flex items-center gap-2">
                <PauseCircle className="w-4 h-4 text-amber-400" />
                <span>Pause Plan Request Manager & Entitlement Rules</span>
              </h3>
              <p className="text-xs text-stone-400 mt-0.5">
                {pauseEntitlement.label} (Requests must be submitted 24 hours prior).
              </p>
            </div>

            {pauseNotice && (
              <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs font-bold flex items-center justify-between">
                <span>{pauseNotice}</span>
                <button onClick={() => setPauseNotice(null)} className="text-xs text-emerald-400 hover:underline">Dismiss</button>
              </div>
            )}

            <form onSubmit={handleApplyPause} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-[10px] font-bold uppercase text-stone-400 mb-1">Select Pause Date (24h prior)</label>
                <input
                  type="date"
                  required
                  value={inputPauseDate}
                  onChange={(e) => setInputPauseDate(e.target.value)}
                  className="w-full p-2.5 bg-stone-900 border border-stone-800 rounded-xl text-xs text-white font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-stone-400 mb-1">Select Replacement Date</label>
                <input
                  type="date"
                  required
                  value={inputReplacementDate}
                  onChange={(e) => setInputReplacementDate(e.target.value)}
                  className="w-full p-2.5 bg-stone-900 border border-stone-800 rounded-xl text-xs text-white font-bold"
                />
              </div>

              <button
                type="submit"
                className="py-2.5 px-4 bg-amber-400 hover:bg-amber-300 text-stone-950 font-black rounded-xl text-xs transition-all shadow-md"
              >
                Request Pause Day
              </button>
            </form>

            {/* Pause Requests Log Table */}
            {pauseRequests.length > 0 && (
              <div className="pt-2">
                <span className="text-xs text-stone-400 font-bold block mb-2">Frozen Pause Schedule Log:</span>
                <div className="space-y-2 text-xs">
                  {pauseRequests.map((pr) => (
                    <div key={pr.id} className="p-3 bg-stone-900 rounded-xl border border-stone-800 flex items-center justify-between">
                      <div>
                        <span className="text-amber-300 font-bold">Paused: {pr.pauseDate}</span>
                        <span className="text-stone-400 ml-2">→ Replaced with: <strong className="text-emerald-400">{pr.replacementDate}</strong></span>
                      </div>
                      <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-bold rounded-md border border-emerald-500/30">
                        {pr.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* 6th TAB: ORDER TRACKING & LIVE DISPATCH STATUS                         */}
      {/* ====================================================================== */}
      {activeTab === 'tracking' && (
        <div className="bg-stone-900 rounded-3xl p-6 sm:p-8 border border-stone-800 shadow-xl space-y-6">
          <div className="border-b border-stone-800 pb-4">
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <Truck className="w-5 h-5 text-emerald-400" />
              <span>6. Live Order Tracking & Non-Delivery Escalation</span>
            </h2>
            <p className="text-xs text-stone-400 mt-1">
              Real-time delivery progress of today's fresh thermal food dispatch.
            </p>
          </div>

          {/* Status Progress Pipeline */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs font-extrabold">
            {[
              { stage: 'In Prep', label: '1. In Prep 🍳' },
              { stage: 'Packing', label: '2. Packing 📦' },
              { stage: 'Out for Delivery', label: '3. Out for Delivery 🚴' },
              { stage: 'Delivered', label: '4. Delivered ✅' },
            ].map((st) => {
              const isActive = orderTrackingStage === st.stage;
              return (
                <div
                  key={st.stage}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isActive
                      ? 'bg-emerald-500 text-stone-950 border-emerald-400 shadow-lg font-black'
                      : 'bg-stone-950 text-stone-400 border-stone-800'
                  }`}
                >
                  {st.label}
                </div>
              );
            })}
          </div>

          {/* Live Vehicle Tracking Representation */}
          <div className="bg-stone-950 p-6 rounded-2xl border border-stone-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black">
                  🚴
                </div>
                <div>
                  <h4 className="font-extrabold text-white text-sm">Delivery Agent: Ramesh Kumar (Rider #402)</h4>
                  <p className="text-xs text-stone-400">ETA: 18 Minutes • Dispatched in Thermal Eco-Box</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQueryModalOpen(true)}
                  className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-stone-950 text-xs font-black rounded-xl shadow-md"
                >
                  Raise Query Regarding Non-Delivery
                </button>
              </div>
            </div>

            {/* Simulated Live Route Progress */}
            <div className="bg-stone-900 p-4 rounded-xl border border-stone-800 text-xs space-y-2">
              <div className="flex justify-between text-stone-400 font-bold">
                <span>Cloud Kitchen (Kochi)</span>
                <span className="text-emerald-400 font-bold">En Route to Marine Drive</span>
                <span>Your Location</span>
              </div>
              <div className="w-full bg-stone-800 h-2.5 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full w-[70%] animate-pulse" />
              </div>
            </div>
          </div>

          {/* Non-Delivery Query Modal */}
          {queryModalOpen && (
            <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-md flex items-center justify-center p-4">
              <div className="bg-stone-900 border border-stone-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
                <div className="flex justify-between items-center border-b border-stone-800 pb-3">
                  <h3 className="font-bold text-white text-sm">Raise Non-Delivery Query</h3>
                  <button onClick={() => setQueryModalOpen(false)} className="text-stone-400 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <label className="block text-stone-400 font-bold uppercase">Reason for Query</label>
                  <select
                    value={nonDeliveryReason}
                    onChange={(e) => setNonDeliveryReason(e.target.value)}
                    className="w-full p-3 bg-stone-950 border border-stone-800 rounded-xl text-xs text-white"
                  >
                    <option value="Delayed beyond estimated slot">Delayed beyond estimated slot</option>
                    <option value="Rider unreachable">Rider unreachable</option>
                    <option value="Marked delivered but not received">Marked delivered but not received</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setQueryLogs([{ id: `Q-${Date.now()}`, date: 'Today', reason: nonDeliveryReason, status: 'Escalated to Kitchen Dispatch Team' }, ...queryLogs]);
                    setQueryModalOpen(false);
                    alert('Query raised! Dispatch Manager is contacting rider immediately.');
                  }}
                  className="w-full py-3 bg-amber-400 hover:bg-amber-300 text-stone-950 font-black rounded-xl text-xs"
                >
                  Submit Non-Delivery Ticket
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================== */}
      {/* 7th TAB: MEAL RATINGS & SUPPORT / ISSUE ESCALATION                     */}
      {/* ====================================================================== */}
      {activeTab === 'ratings-support' && (
        <div className="bg-stone-900 rounded-3xl p-6 sm:p-8 border border-stone-800 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-800 pb-4">
            <div>
              <h2 className="text-xl font-black text-white flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-400" />
                <span>7. Meal Ratings, Feedback & Issue Support</span>
              </h2>
              <p className="text-xs text-stone-400 mt-1">
                Rate your fresh meal bowls or raise quality issues for immediate credit / replacement.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIssueModalOpen(true)}
              className="px-4 py-2.5 bg-rose-500 hover:bg-rose-400 text-white font-extrabold text-xs rounded-xl shadow-md flex items-center gap-1.5"
            >
              <AlertCircle className="w-4 h-4" />
              <span>Raise Issue Regarding Meal</span>
            </button>
          </div>

          {/* Meal Rating Form */}
          <form onSubmit={handleAddFeedback} className="bg-stone-950 p-5 rounded-2xl border border-stone-800 space-y-3">
            <h3 className="text-xs font-extrabold uppercase text-amber-300">Rate Your Recent Meal</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-stone-400 mb-1 font-bold">Meal Name</label>
                <input
                  type="text"
                  value={newFeedbackMeal}
                  onChange={(e) => setNewFeedbackMeal(e.target.value)}
                  className="w-full p-2.5 bg-stone-900 border border-stone-800 rounded-xl text-xs font-bold text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-stone-400 mb-1 font-bold">Rating</label>
                <select
                  value={newFeedbackRating}
                  onChange={(e) => setNewFeedbackRating(Number(e.target.value))}
                  className="w-full p-2.5 bg-stone-900 border border-stone-800 rounded-xl text-xs font-bold text-white"
                >
                  <option value={5}>⭐⭐⭐⭐⭐ (5 - Outstanding)</option>
                  <option value={4}>⭐⭐⭐⭐ (4 - Very Good)</option>
                  <option value={3}>⭐⭐⭐ (3 - Average)</option>
                </select>
              </div>
            </div>

            <textarea
              rows={2}
              required
              placeholder="Tell chef & nutritionist how the meal tasted..."
              value={newFeedbackComment}
              onChange={(e) => setNewFeedbackComment(e.target.value)}
              className="w-full p-2.5 bg-stone-900 border border-stone-800 rounded-xl text-xs text-white outline-none focus:ring-2 focus:ring-emerald-500"
            />

            <button type="submit" className="bg-emerald-500 text-stone-950 font-bold px-5 py-2 rounded-xl text-xs hover:bg-emerald-400">
              Submit Rating & Comment
            </button>
          </form>

          {/* Past Feedbacks List */}
          <div className="space-y-3">
            <h3 className="text-xs font-extrabold uppercase text-stone-400">Your Submitted Meal Reviews</h3>
            {feedbacks.map((fb) => (
              <div key={fb.id} className="p-4 rounded-2xl border border-stone-800 bg-stone-950 text-xs">
                <div className="flex justify-between items-center">
                  <strong className="text-white">{fb.mealName}</strong>
                  <span className="text-amber-400 font-bold">{'★'.repeat(fb.rating)}</span>
                </div>
                <p className="text-stone-300 mt-1">{fb.comment}</p>
              </div>
            ))}
          </div>

          {/* Raise Issue Modal */}
          {issueModalOpen && (
            <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-md flex items-center justify-center p-4">
              <div className="bg-stone-900 border border-stone-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
                <div className="flex justify-between items-center border-b border-stone-800 pb-3">
                  <h3 className="font-bold text-white text-sm">Raise Quality / Meal Issue</h3>
                  <button onClick={() => setIssueModalOpen(false)} className="text-stone-400 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleRaiseIssue} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-stone-400 font-bold mb-1">Issue Category</label>
                    <select
                      value={issueCategory}
                      onChange={(e) => setIssueCategory(e.target.value)}
                      className="w-full p-2.5 bg-stone-950 border border-stone-800 rounded-xl text-xs text-white"
                    >
                      <option value="Portion Size Too Small">Portion Size Too Small</option>
                      <option value="Packaging Leak">Packaging Leak</option>
                      <option value="Food Temperature Cold">Food Temperature Cold</option>
                      <option value="Taste / Quality Issue">Taste / Quality Issue</option>
                      <option value="Missing Item">Missing Item</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-stone-400 font-bold mb-1">Details</label>
                    <textarea
                      rows={3}
                      required
                      placeholder="Describe the issue in detail..."
                      value={issueDetails}
                      onChange={(e) => setIssueDetails(e.target.value)}
                      className="w-full p-2.5 bg-stone-950 border border-stone-800 rounded-xl text-xs text-white"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 bg-rose-500 hover:bg-rose-400 text-white font-black rounded-xl text-xs"
                  >
                    Submit Issue Ticket
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================== */}
      {/* 8th TAB: REFER & EARN                                                  */}
      {/* ====================================================================== */}
      {activeTab === 'referral' && (
        <div className="bg-stone-900 rounded-3xl p-6 sm:p-8 border border-stone-800 shadow-xl space-y-6 max-w-2xl mx-auto text-center">
          <Award className="w-12 h-12 text-amber-400 mx-auto" />
          <div>
            <h2 className="text-2xl font-black text-white">Refer Friends & Earn Free Meals</h2>
            <p className="text-xs text-stone-300 mt-2 leading-relaxed">
              Share your unique referral code with friends. When they subscribe to any 15 or 30-day plan, you both receive <strong className="text-emerald-400">₹500 Wallet Credit</strong>!
            </p>
          </div>

          {/* Referral Code Box */}
          <div className="bg-stone-950 p-4 rounded-2xl border border-stone-800 flex items-center justify-between gap-3">
            <span className="font-mono text-sm font-black text-emerald-300 tracking-wider">PROTEINBOWL-ANJALI-2026</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText('PROTEINBOWL-ANJALI-2026');
                setCopiedCode(true);
                confetti({ particleCount: 30, spread: 40 });
                setTimeout(() => setCopiedCode(false), 2000);
              }}
              className="bg-emerald-500 hover:bg-emerald-400 text-stone-950 text-xs font-black px-4 py-2 rounded-xl transition-all"
            >
              {copiedCode ? 'Copied ✓' : 'Copy Code'}
            </button>
          </div>

          <div className="p-4 bg-stone-950 rounded-2xl border border-stone-800 text-left text-xs space-y-2">
            <span className="text-stone-400 font-bold uppercase block text-[10px]">Your Referral Wallet Balance</span>
            <div className="text-xl font-black text-amber-300">₹{referralWallet.toLocaleString()} Credit</div>
            <p className="text-stone-400">Credits will automatically apply at checkout on your next subscription renewal.</p>
          </div>
        </div>
      )}

    </div>
  );
};
