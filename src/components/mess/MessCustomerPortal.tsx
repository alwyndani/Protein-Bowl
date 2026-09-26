import React, { useState } from 'react';
import { 
  MessMenuItem, 
  MessSubscriptionPlan, 
  MessCustomerAccount, 
  MessDailyOrder, 
  MessDietCategory, 
  MessMealSlot,
  KitchenBranchId
} from '../../types';
import { 
  KERALA_MESS_MENU_ITEMS, 
  KERALA_WEEKLY_MESS_SCHEDULE, 
  KERALA_MESS_SUBSCRIPTION_PLANS 
} from '../../data/mockKeralaMessData';
import { 
  Utensils, 
  Calendar, 
  Clock, 
  MapPin, 
  Phone, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Truck, 
  Wallet, 
  CreditCard, 
  Flame, 
  PauseCircle, 
  PlayCircle, 
  Layers, 
  ChevronRight, 
  Check, 
  Plus, 
  ShoppingBag, 
  Building2, 
  GraduationCap, 
  Coffee, 
  Sun, 
  Moon, 
  QrCode, 
  RefreshCw,
  Share2,
  X
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface MessCustomerPortalProps {
  accounts: MessCustomerAccount[];
  activeAccount: MessCustomerAccount;
  onUpdateAccount: (acc: MessCustomerAccount) => void;
  orders: MessDailyOrder[];
  onPlaceMessOrder: (newOrder: MessDailyOrder) => void;
  onPauseMeal: (orderId: string, mealSlot: MessMealSlot, date: string) => void;
  selectedBranchId?: KitchenBranchId;
  onSelectBranch?: (b: KitchenBranchId) => void;
  onSwitchToChef?: () => void;
  onSwitchToAggregator?: () => void;
}

export const MessCustomerPortal: React.FC<MessCustomerPortalProps> = ({
  accounts,
  activeAccount,
  onUpdateAccount,
  orders,
  onPlaceMessOrder,
  onPauseMeal,
  selectedBranchId = 'all',
  onSelectBranch,
  onSwitchToChef,
  onSwitchToAggregator
}) => {
  const [activeTab, setActiveTab] = useState<'today_menu' | 'weekly_schedule' | 'plans' | 'tracking' | 'profile'>('today_menu');
  const [selectedMealSlot, setSelectedMealSlot] = useState<MessMealSlot>('lunch');
  const [selectedDietFilter, setSelectedDietFilter] = useState<'all' | MessDietCategory>('all');
  
  // Checkout Modal State
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [selectedPlanToSubscribe, setSelectedPlanToSubscribe] = useState<MessSubscriptionPlan | null>(null);
  const [selectedSingleItemToOrder, setSelectedSingleItemToOrder] = useState<MessMenuItem | null>(null);
  const [checkoutStep, setCheckoutStep] = useState<'details' | 'payment' | 'success'>('details');
  const [paymentMode, setPaymentMode] = useState<'upi_instant' | 'student_wallet' | 'monthly_subscription_pass' | 'cash_at_gate'>('upi_instant');
  const [placedOrderRef, setPlacedOrderRef] = useState<MessDailyOrder | null>(null);

  // Form details for checkout
  const [hostelNameInput, setHostelNameInput] = useState(activeAccount.hostelOrPgName);
  const [roomNumberInput, setRoomNumberInput] = useState(activeAccount.roomNumber);
  const [studentPhoneInput, setStudentPhoneInput] = useState(activeAccount.phone);
  const [studentNameInput, setStudentNameInput] = useState(activeAccount.name);
  const [landmarkInput, setLandmarkInput] = useState(activeAccount.landmark);
  const [specialNoteInput, setSpecialNoteInput] = useState('');

  // Pause / Skip Modal State
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [selectedOrderToPause, setSelectedOrderToPause] = useState<MessDailyOrder | null>(null);
  const [pauseDateInput, setPauseDateInput] = useState('2026-08-18');
  const [pauseReasonInput, setPauseReasonInput] = useState('Going home for the weekend');

  // Filtered menu items for today
  const filteredTodayItems = KERALA_MESS_MENU_ITEMS.filter(item => {
    const slotMatch = item.mealSlot === selectedMealSlot;
    const dietMatch = selectedDietFilter === 'all' || item.category === selectedDietFilter;
    return slotMatch && dietMatch;
  });

  // Current Day of Week
  const todaySchedule = KERALA_WEEKLY_MESS_SCHEDULE[0]; // Monday mock today

  // Active customer orders
  const customerOrders = orders.filter(o => o.customerId === activeAccount.id || o.customerPhone === activeAccount.phone);

  const handleStartSubscribe = (plan: MessSubscriptionPlan) => {
    setSelectedPlanToSubscribe(plan);
    setSelectedSingleItemToOrder(null);
    setCheckoutStep('details');
    setShowCheckoutModal(true);
  };

  const handleStartSingleOrder = (item: MessMenuItem) => {
    setSelectedSingleItemToOrder(item);
    setSelectedPlanToSubscribe(null);
    setCheckoutStep('details');
    setShowCheckoutModal(true);
  };

  const handleConfirmPurchase = () => {
    const orderNum = `MESS-${Math.floor(100000 + Math.random() * 900000)}`;
    
    if (selectedPlanToSubscribe) {
      // Subscribing to a plan
      const updatedAcc: MessCustomerAccount = {
        ...activeAccount,
        name: studentNameInput,
        phone: studentPhoneInput,
        hostelOrPgName: hostelNameInput,
        roomNumber: roomNumberInput,
        landmark: landmarkInput,
        activePlan: selectedPlanToSubscribe,
        subscriptionStatus: 'active',
        validUntil: selectedPlanToSubscribe.planType === 'monthly_30day' ? '2026-09-17' : '2026-08-24',
        remainingMeals: {
          breakfast: selectedPlanToSubscribe.mealCoverage.includes('breakfast') || selectedPlanToSubscribe.mealCoverage === 'all_3_meals' ? (selectedPlanToSubscribe.planType === 'monthly_30day' ? 30 : 7) : 0,
          lunch: selectedPlanToSubscribe.mealCoverage.includes('lunch') || selectedPlanToSubscribe.mealCoverage === 'all_3_meals' ? (selectedPlanToSubscribe.planType === 'monthly_30day' ? 30 : 7) : 0,
          dinner: selectedPlanToSubscribe.mealCoverage.includes('dinner') || selectedPlanToSubscribe.mealCoverage === 'all_3_meals' ? (selectedPlanToSubscribe.planType === 'monthly_30day' ? 30 : 7) : 0
        }
      };
      onUpdateAccount(updatedAcc);

      // Create an immediate order for next upcoming meal
      const newOrder: MessDailyOrder = {
        id: `mess-ord-${Date.now()}`,
        orderNumber: orderNum,
        customerId: activeAccount.id,
        customerName: studentNameInput,
        customerPhone: studentPhoneInput,
        hostelOrPgName: hostelNameInput,
        roomNumber: roomNumberInput,
        landmark: landmarkInput,
        pincode: activeAccount.pincode,
        date: '2026-08-17',
        mealSlot: 'lunch',
        dishName: `${selectedPlanToSubscribe.name} - Today's Kerala Lunch Oonu`,
        itemsIncluded: ['Matta Rice', 'Nadan Sambar', 'Aviyal', 'Moru Curry', 'Thoran', 'Pappadam'],
        dietCategory: selectedPlanToSubscribe.dietPreference,
        quantity: 1,
        amount: selectedPlanToSubscribe.discountedPrice,
        paymentMode: paymentMode,
        paymentStatus: 'paid',
        orderStatus: 'kds_batch_queued',
        deliveryRiderName: 'Manoj Kumar (Hostel Route 2)',
        hostelGatePassCode: `PIN-${Math.floor(1000 + Math.random() * 9000)}`,
        deliveryEstimatedTime: '12:45 PM',
        trackingSteps: [
          { stage: 'Subscription Activated', time: 'Just now', description: 'Plan linked to student room ID.', completed: true },
          { stage: 'Batch Queued in Kitchen KDS', time: 'Pending', description: 'Portion allocated in lunch steam kettle.', completed: true },
          { stage: 'Insulated Hostel Crate Packed', time: '12:00 PM', description: 'Packed with tamper evident tag.', completed: false },
          { stage: 'Hostel Gate Drop', time: '12:45 PM', description: 'Delivered to hostel security desk.', completed: false }
        ],
        createdAt: new Date().toISOString()
      };
      onPlaceMessOrder(newOrder);
      setPlacedOrderRef(newOrder);
    } else if (selectedSingleItemToOrder) {
      // Single meal booking
      const newOrder: MessDailyOrder = {
        id: `mess-ord-${Date.now()}`,
        orderNumber: orderNum,
        customerId: activeAccount.id,
        customerName: studentNameInput,
        customerPhone: studentPhoneInput,
        hostelOrPgName: hostelNameInput,
        roomNumber: roomNumberInput,
        landmark: landmarkInput,
        pincode: activeAccount.pincode,
        date: '2026-08-17',
        mealSlot: selectedSingleItemToOrder.mealSlot,
        dishName: selectedSingleItemToOrder.name,
        itemsIncluded: selectedSingleItemToOrder.itemsIncluded,
        dietCategory: selectedSingleItemToOrder.category,
        quantity: 1,
        amount: selectedSingleItemToOrder.price,
        paymentMode: paymentMode,
        paymentStatus: 'paid',
        orderStatus: 'kds_batch_queued',
        deliveryRiderName: 'Manoj Kumar (Hostel Route 2)',
        hostelGatePassCode: `PIN-${Math.floor(1000 + Math.random() * 9000)}`,
        deliveryEstimatedTime: selectedSingleItemToOrder.mealSlot === 'breakfast' ? '07:45 AM' : selectedSingleItemToOrder.mealSlot === 'lunch' ? '12:45 PM' : '08:15 PM',
        dietaryNote: specialNoteInput,
        trackingSteps: [
          { stage: 'Order Placed & Confirmed', time: 'Just now', description: 'Payment verified via UPI/Wallet.', completed: true },
          { stage: 'Queued in Chef Batch Preparation', time: 'Pending', description: 'Added to live central kitchen vessel counters.', completed: true },
          { stage: 'Insulated Thermal Box Packed', time: 'Slot dispatch time', description: 'Sealed for hostel transit.', completed: false },
          { stage: 'Hostel Gate Handover', time: 'Slot arrival', description: 'Show code at security / room drop.', completed: false }
        ],
        createdAt: new Date().toISOString()
      };
      onPlaceMessOrder(newOrder);
      setPlacedOrderRef(newOrder);
    }

    try {
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
    } catch {
      // ignore
    }
    setCheckoutStep('success');
  };

  const handleConfirmPause = () => {
    if (!selectedOrderToPause) return;
    onPauseMeal(selectedOrderToPause.id, selectedOrderToPause.mealSlot, pauseDateInput);
    
    // Credit wallet with ₹50 per meal
    const refundAmount = selectedOrderToPause.amount > 0 ? selectedOrderToPause.amount : 50;
    const updatedAcc: MessCustomerAccount = {
      ...activeAccount,
      walletBalance: activeAccount.walletBalance + refundAmount,
      pausedDates: [...activeAccount.pausedDates, pauseDateInput]
    };
    onUpdateAccount(updatedAcc);

    setShowPauseModal(false);
    setSelectedOrderToPause(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      {/* TOP PROMOTIONAL HOSTEL BANNER */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-950 via-stone-900 to-amber-950 border border-emerald-500/30 p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-bold">
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Dedicated Kerala Mess for Hostel, PG & Student Residents</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              Kerala Homestyle Mess & Daily Tiffin Service
            </h1>
            <p className="text-stone-300 text-sm sm:text-base leading-relaxed">
              Wholesome Kerala Breakfast, Matta Rice Meals & Dinner delivered hot to your college hostel, PG room, or workspace. Budget meals starting at just <strong className="text-emerald-400">₹45</strong>, with automated 1-click pause & wallet rollover!
            </p>
            
            <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-stone-300">
              <span className="flex items-center gap-1.5 bg-stone-900/80 px-3 py-1.5 rounded-lg border border-stone-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                No Minimum Commitment
              </span>
              <span className="flex items-center gap-1.5 bg-stone-900/80 px-3 py-1.5 rounded-lg border border-stone-800">
                <PauseCircle className="w-4 h-4 text-amber-400" />
                Pause When Going Home (₹ Refund)
              </span>
              <span className="flex items-center gap-1.5 bg-stone-900/80 px-3 py-1.5 rounded-lg border border-stone-800">
                <Truck className="w-4 h-4 text-cyan-400" />
                Free Hostel Gate Drop
              </span>
            </div>
          </div>

          {/* Quick Profile / Wallet Status Widget */}
          <div className="w-full md:w-auto bg-stone-900/90 border border-stone-800 rounded-2xl p-5 shadow-xl backdrop-blur-md flex flex-col gap-3 min-w-[280px]">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <div>
                <div className="text-xs text-stone-400 font-medium">Logged in Hosteler</div>
                <div className="text-sm font-bold text-white flex items-center gap-1.5">
                  <span>{activeAccount.name}</span>
                </div>
                <div className="text-[11px] text-emerald-400 truncate max-w-[200px]">
                  {activeAccount.hostelOrPgName} ({activeAccount.roomNumber})
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black">
                <Utensils className="w-5 h-5" />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div>
                <div className="text-[11px] text-stone-400">Student Mess Wallet</div>
                <div className="text-lg font-black text-amber-400">₹{activeAccount.walletBalance}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-stone-400">Active Plan</div>
                <div className="text-xs font-bold text-emerald-400">
                  {activeAccount.activePlan ? activeAccount.activePlan.name.split(' ')[0] : 'Daily Flex'}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <div className="flex items-center justify-between border-b border-stone-800 pb-4 overflow-x-auto gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('today_menu')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-2 ${
              activeTab === 'today_menu'
                ? 'bg-emerald-500 text-stone-950 shadow-lg shadow-emerald-500/20 scale-105'
                : 'bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-800'
            }`}
          >
            <Utensils className="w-4 h-4" />
            <span>Today's Kerala Menu</span>
          </button>

          <button
            onClick={() => setActiveTab('weekly_schedule')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-2 ${
              activeTab === 'weekly_schedule'
                ? 'bg-emerald-500 text-stone-950 shadow-lg shadow-emerald-500/20 scale-105'
                : 'bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-800'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>7-Day Weekly Calendar</span>
          </button>

          <button
            onClick={() => setActiveTab('plans')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-2 ${
              activeTab === 'plans'
                ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-stone-950 shadow-lg shadow-amber-500/20 scale-105'
                : 'bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-800'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Hostel Monthly Passes (₹99/day)</span>
          </button>

          <button
            onClick={() => setActiveTab('tracking')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-2 relative ${
              activeTab === 'tracking'
                ? 'bg-emerald-500 text-stone-950 shadow-lg shadow-emerald-500/20 scale-105'
                : 'bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-800'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>Live Delivery Tracking</span>
            {customerOrders.length > 0 && (
              <span className="bg-amber-400 text-stone-950 text-[10px] font-black px-1.5 py-0.5 rounded-full">
                {customerOrders.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-2 ${
              activeTab === 'profile'
                ? 'bg-emerald-500 text-stone-950 shadow-lg shadow-emerald-500/20 scale-105'
                : 'bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-800'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Hostel & Wallet</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: TODAY'S KERALA MESS MENU & SINGLE MEAL BOOKING */}
      {/* ========================================================================= */}
      {activeTab === 'today_menu' && (
        <div className="space-y-6">
          
          {/* Meal Slot Selectors (Breakfast, Lunch, Dinner) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-stone-900 p-4 rounded-2xl border border-stone-800">
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-400 font-bold uppercase tracking-wider mr-1">Meal Slot:</span>
              <button
                onClick={() => setSelectedMealSlot('breakfast')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  selectedMealSlot === 'breakfast'
                    ? 'bg-amber-500 text-stone-950 shadow-md font-black'
                    : 'bg-stone-800 hover:bg-stone-700 text-stone-300'
                }`}
              >
                <Coffee className="w-3.5 h-3.5" />
                <span>Breakfast (7:00 - 9:30 AM)</span>
              </button>

              <button
                onClick={() => setSelectedMealSlot('lunch')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  selectedMealSlot === 'lunch'
                    ? 'bg-amber-500 text-stone-950 shadow-md font-black'
                    : 'bg-stone-800 hover:bg-stone-700 text-stone-300'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>Lunch (12:00 - 2:30 PM)</span>
              </button>

              <button
                onClick={() => setSelectedMealSlot('dinner')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  selectedMealSlot === 'dinner'
                    ? 'bg-amber-500 text-stone-950 shadow-md font-black'
                    : 'bg-stone-800 hover:bg-stone-700 text-stone-300'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                <span>Dinner (7:00 - 9:45 PM)</span>
              </button>
            </div>

            {/* Diet Category Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-stone-400 font-bold uppercase tracking-wider mr-1">Diet:</span>
              <button
                onClick={() => setSelectedDietFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${selectedDietFilter === 'all' ? 'bg-stone-700 text-white' : 'text-stone-400 hover:text-white'}`}
              >
                All
              </button>
              <button
                onClick={() => setSelectedDietFilter('kerala_veg')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${selectedDietFilter === 'kerala_veg' ? 'bg-emerald-500 text-stone-950 font-black' : 'text-emerald-400 hover:bg-emerald-950/40'}`}
              >
                Veg
              </button>
              <button
                onClick={() => setSelectedDietFilter('kerala_nonveg')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${selectedDietFilter === 'kerala_nonveg' ? 'bg-rose-500 text-white font-black' : 'text-rose-400 hover:bg-rose-950/40'}`}
              >
                Chicken
              </button>
              <button
                onClick={() => setSelectedDietFilter('kerala_fish')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${selectedDietFilter === 'kerala_fish' ? 'bg-cyan-500 text-stone-950 font-black' : 'text-cyan-400 hover:bg-cyan-950/40'}`}
              >
                Fish
              </button>
              <button
                onClick={() => setSelectedDietFilter('kerala_egg')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${selectedDietFilter === 'kerala_egg' ? 'bg-amber-500 text-stone-950 font-black' : 'text-amber-400 hover:bg-amber-950/40'}`}
              >
                Egg
              </button>
            </div>
          </div>

          {/* Menu Items Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTodayItems.map(dish => (
              <div 
                key={dish.id} 
                className="bg-stone-900 border border-stone-800 rounded-3xl overflow-hidden shadow-xl hover:border-emerald-500/50 transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="relative h-48 w-full overflow-hidden bg-stone-950">
                    <img 
                      src={dish.image} 
                      alt={dish.name} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-stone-900 via-transparent to-transparent" />
                    
                    {/* Badge */}
                    <div className="absolute top-3 left-3 flex items-center gap-1.5">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ${
                        dish.category === 'kerala_veg' ? 'bg-emerald-500 text-stone-950' :
                        dish.category === 'kerala_nonveg' ? 'bg-rose-500 text-white' :
                        dish.category === 'kerala_fish' ? 'bg-cyan-500 text-stone-950' : 'bg-amber-500 text-stone-950'
                      }`}>
                        {dish.category.replace('kerala_', '').toUpperCase()}
                      </span>
                      {dish.isBudgetSpecial && (
                        <span className="bg-amber-400 text-stone-950 px-2 py-0.5 rounded-full text-[10px] font-black">
                          HOSTEL SPECIAL
                        </span>
                      )}
                    </div>

                    <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between">
                      <div>
                        <div className="text-[11px] text-amber-300 font-bold">{dish.malayalamName}</div>
                      </div>
                      <div className="bg-stone-950/80 backdrop-blur-md px-2.5 py-1 rounded-xl text-xs font-black text-white">
                        {dish.calories} kcal
                      </div>
                    </div>
                  </div>

                  <div className="p-5 space-y-3">
                    <h3 className="text-base font-bold text-white leading-tight group-hover:text-emerald-400 transition-colors">
                      {dish.name}
                    </h3>
                    <p className="text-xs text-stone-400 line-clamp-2">
                      {dish.description}
                    </p>

                    {/* Items list */}
                    <div className="bg-stone-950/60 rounded-xl p-3 border border-stone-800/80 space-y-1.5">
                      <div className="text-[10px] uppercase font-bold text-stone-500 tracking-wider">Homestyle Inclusions:</div>
                      <ul className="text-xs text-stone-300 space-y-1">
                        {dish.itemsIncluded.map((inc, i) => (
                          <li key={i} className="flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>{inc}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Macro pill summary */}
                    <div className="flex items-center justify-between text-[11px] text-stone-400 bg-stone-900 px-3 py-1.5 rounded-lg border border-stone-800">
                      <span>Protein: <strong className="text-white">{dish.proteinGrams}g</strong></span>
                      <span>Carbs: <strong className="text-white">{dish.carbsGrams}g</strong></span>
                      <span>Fat: <strong className="text-white">{dish.fatGrams}g</strong></span>
                    </div>
                  </div>
                </div>

                <div className="p-5 pt-0 flex items-center justify-between border-t border-stone-800/60 mt-2">
                  <div>
                    <div className="text-[10px] text-stone-500 font-medium">Single Meal Price</div>
                    <div className="text-xl font-black text-amber-400">₹{dish.price}</div>
                  </div>

                  <button
                    onClick={() => handleStartSingleOrder(dish)}
                    className="bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black px-4 py-2.5 rounded-xl text-xs transition-all shadow-md flex items-center gap-1.5 hover:scale-105"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>Order for {selectedMealSlot.toUpperCase()}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Subscribe Callout Card */}
          <div className="bg-gradient-to-r from-amber-500/10 via-stone-900 to-emerald-500/10 border border-amber-500/30 rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500 text-stone-950 flex items-center justify-center font-black shrink-0">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white">Save Up to 28% with a Monthly Hostel Pass!</h4>
                <p className="text-xs text-stone-400">Get Lunch + Dinner daily delivered to your hostel gate for just ₹2,999/month (₹49.9/meal). Pause anytime when going home!</p>
              </div>
            </div>

            <button
              onClick={() => setActiveTab('plans')}
              className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-black px-5 py-2.5 rounded-xl text-xs transition-all shrink-0 shadow-lg hover:scale-105 flex items-center gap-2"
            >
              <span>View All Hostel Passes</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: 7-DAY ROTATING KERALA MESS WEEKLY SCHEDULE */}
      {/* ========================================================================= */}
      {activeTab === 'weekly_schedule' && (
        <div className="space-y-6">
          <div className="bg-stone-900 p-5 rounded-2xl border border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">7-Day Kerala Mess Menu Rotation</h2>
              <p className="text-xs text-stone-400">Every day features authentic homestyle preparation with zero artificial coloring, genuine Kerala spices, and balanced nutrition.</p>
            </div>
            <div className="text-xs font-bold text-emerald-400 bg-emerald-950/60 px-3.5 py-2 rounded-xl border border-emerald-500/30 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              <span>Sunday Special Payasam Included Free!</span>
            </div>
          </div>

          <div className="space-y-4">
            {KERALA_WEEKLY_MESS_SCHEDULE.map((dayPlan, idx) => (
              <div 
                key={dayPlan.day} 
                className={`bg-stone-900 rounded-2xl border transition-all p-5 ${
                  idx === 0 ? 'border-emerald-500/80 shadow-lg shadow-emerald-950/40 bg-stone-900/90' : 'border-stone-800 hover:border-stone-700'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-800 pb-3 mb-4">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black text-xs">
                      {dayPlan.day}
                    </span>
                    <h3 className="text-base font-black text-white">{dayPlan.dayFull}</h3>
                    {idx === 0 && (
                      <span className="bg-emerald-500 text-stone-950 text-[10px] font-black px-2 py-0.5 rounded-full">
                        TODAY
                      </span>
                    )}
                  </div>

                  {dayPlan.specialTreat && (
                    <span className="text-xs font-bold text-amber-400 bg-amber-950/50 px-3 py-1 rounded-lg border border-amber-500/30">
                      {dayPlan.specialTreat}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Breakfast */}
                  <div className="bg-stone-950/80 p-3.5 rounded-xl border border-stone-800/80 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                      <Coffee className="w-3.5 h-3.5" />
                      <span>Breakfast (7:00 - 9:30 AM)</span>
                    </div>
                    <div className="space-y-1">
                      {dayPlan.breakfast.map((bf) => (
                        <div key={bf.id} className="text-xs text-stone-300 flex items-start gap-1.5">
                          <span className="text-emerald-400 mt-0.5">•</span>
                          <div>
                            <span className="font-semibold">{bf.name}</span>
                            <span className="text-[10px] text-stone-500 ml-1">(₹{bf.price})</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Lunch */}
                  <div className="bg-stone-950/80 p-3.5 rounded-xl border border-stone-800/80 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                      <Sun className="w-3.5 h-3.5" />
                      <span>Lunch (12:00 - 2:30 PM)</span>
                    </div>
                    <div className="space-y-1">
                      {dayPlan.lunch.map((ln) => (
                        <div key={ln.id} className="text-xs text-stone-300 flex items-start gap-1.5">
                          <span className="text-emerald-400 mt-0.5">•</span>
                          <div>
                            <span className="font-semibold">{ln.name}</span>
                            <span className="text-[10px] text-stone-500 ml-1">(₹{ln.price})</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Dinner */}
                  <div className="bg-stone-950/80 p-3.5 rounded-xl border border-stone-800/80 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                      <Moon className="w-3.5 h-3.5" />
                      <span>Dinner (7:00 - 9:45 PM)</span>
                    </div>
                    <div className="space-y-1">
                      {dayPlan.dinner.map((dn) => (
                        <div key={dn.id} className="text-xs text-stone-300 flex items-start gap-1.5">
                          <span className="text-emerald-400 mt-0.5">•</span>
                          <div>
                            <span className="font-semibold">{dn.name}</span>
                            <span className="text-[10px] text-stone-500 ml-1">(₹{dn.price})</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: BUDGET HOSTEL SUBSCRIPTION PLANS */}
      {/* ========================================================================= */}
      {activeTab === 'plans' && (
        <div className="space-y-6">
          <div className="text-center max-w-3xl mx-auto space-y-2">
            <h2 className="text-2xl sm:text-3xl font-black text-white">
              Student & Hostel Budget Mess Subscriptions
            </h2>
            <p className="text-stone-400 text-sm">
              Save big on daily meals. Guaranteed on-time delivery to all college hostels & PGs in Kochi, Trivandrum, Kozhikode, and Thrissur with flexible pause when you travel.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
            {KERALA_MESS_SUBSCRIPTION_PLANS.map(plan => (
              <div 
                key={plan.id}
                className={`bg-stone-900 rounded-3xl p-6 border transition-all flex flex-col justify-between relative ${
                  plan.isPopular 
                    ? 'border-amber-500 shadow-2xl shadow-amber-500/10 scale-105 bg-gradient-to-b from-stone-900 to-amber-950/20' 
                    : 'border-stone-800 hover:border-stone-700'
                }`}
              >
                {plan.isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-stone-950 text-[11px] font-black px-3 py-1 rounded-full uppercase tracking-wider shadow-md">
                    MOST POPULAR FOR HOSTELERS
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                      {plan.planType === 'monthly_30day' ? '30-DAY MONTHLY PASS' : plan.planType === 'weekly_7day' ? '7-DAY WEEKLY PASS' : 'DAY PASS'}
                    </span>
                    <h3 className="text-xl font-bold text-white mt-1">{plan.name}</h3>
                    <p className="text-xs text-stone-400 mt-1.5">{plan.description}</p>
                  </div>

                  {/* Pricing */}
                  <div className="bg-stone-950/80 p-4 rounded-2xl border border-stone-800/80 flex items-baseline justify-between">
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl sm:text-3xl font-black text-amber-400">₹{plan.discountedPrice}</span>
                        <span className="text-xs text-stone-500 line-through">₹{plan.basePrice}</span>
                      </div>
                      <div className="text-[11px] text-emerald-400 font-semibold">
                        Just ~₹{plan.perMealPrice} per meal
                      </div>
                    </div>

                    <div className="bg-emerald-500/20 text-emerald-400 text-xs font-black px-2.5 py-1 rounded-lg border border-emerald-500/40">
                      Save {plan.savingsPercent}%
                    </div>
                  </div>

                  {/* Features list */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">Pass Benefits:</div>
                    <ul className="text-xs text-stone-300 space-y-2">
                      {plan.features.map((feat, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-6 border-t border-stone-800 mt-6">
                  <button
                    onClick={() => handleStartSubscribe(plan)}
                    className={`w-full py-3 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-lg hover:scale-105 ${
                      plan.isPopular
                        ? 'bg-amber-500 hover:bg-amber-400 text-stone-950'
                        : 'bg-emerald-500 hover:bg-emerald-400 text-stone-950'
                    }`}
                  >
                    <span>Subscribe Now (₹{plan.discountedPrice})</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: LIVE DELIVERY TRACKING & PAUSE / SKIP MEAL */}
      {/* ========================================================================= */}
      {activeTab === 'tracking' && (
        <div className="space-y-6">
          <div className="bg-stone-900 p-5 rounded-2xl border border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">Live Hostel Mess Delivery Tracker</h2>
              <p className="text-xs text-stone-400">Track food preparation in the central cloud kitchen, thermal crate packing, and rider arrival at your hostel gate.</p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-400">Hostel:</span>
              <span className="text-xs font-bold text-emerald-400 bg-emerald-950 px-3 py-1.5 rounded-lg border border-emerald-500/30">
                {activeAccount.hostelOrPgName}
              </span>
            </div>
          </div>

          {customerOrders.length === 0 ? (
            <div className="bg-stone-900 border border-stone-800 rounded-3xl p-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-stone-800 text-stone-400 mx-auto flex items-center justify-center">
                <Truck className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-white">No active orders today yet</h3>
              <p className="text-xs text-stone-400 max-w-md mx-auto">
                Select your preferred meal from today's menu or activate a monthly student mess pass to start automated daily deliveries.
              </p>
              <button
                onClick={() => setActiveTab('today_menu')}
                className="bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black px-6 py-2.5 rounded-xl text-xs transition-all inline-flex items-center gap-2"
              >
                <Utensils className="w-4 h-4" />
                <span>Order Today's Meal</span>
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {customerOrders.map(order => (
                <div 
                  key={order.id}
                  className="bg-stone-900 border border-stone-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-800 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="bg-amber-400 text-stone-950 font-black text-xs px-2.5 py-0.5 rounded-full">
                          {order.mealSlot.toUpperCase()}
                        </span>
                        <span className="text-xs text-stone-400 font-mono">Ref: {order.orderNumber}</span>
                      </div>
                      <h3 className="text-lg font-bold text-white mt-1">{order.dishName}</h3>
                      <div className="text-xs text-stone-400 flex items-center gap-2 mt-0.5">
                        <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{order.hostelOrPgName}, {order.roomNumber}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {order.hostelGatePassCode && (
                        <div className="bg-stone-950 border border-amber-500/40 p-3 rounded-2xl text-center">
                          <div className="text-[10px] uppercase text-stone-400 font-bold">Hostel Gate Code</div>
                          <div className="text-sm font-mono font-black text-amber-400 tracking-wider">
                            {order.hostelGatePassCode}
                          </div>
                        </div>
                      )}

                      {/* Pause / Skip Meal button */}
                      {order.orderStatus !== 'delivered' && order.orderStatus !== 'paused_refunded' && (
                        <button
                          onClick={() => {
                            setSelectedOrderToPause(order);
                            setShowPauseModal(true);
                          }}
                          className="bg-stone-800 hover:bg-stone-700 text-amber-300 border border-amber-500/40 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                          title="Pause this meal & get wallet credit refund"
                        >
                          <PauseCircle className="w-4 h-4 text-amber-400" />
                          <span>Pause Meal</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Tracking Timeline */}
                  <div className="space-y-4">
                    <div className="text-xs font-bold text-stone-400 uppercase tracking-wider">
                      Live Delivery Progress:
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      {order.trackingSteps.map((step, idx) => (
                        <div 
                          key={idx}
                          className={`p-4 rounded-2xl border transition-all ${
                            step.completed 
                              ? 'bg-emerald-950/30 border-emerald-500/50 text-white' 
                              : 'bg-stone-950/40 border-stone-800 text-stone-500'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider">Stage {idx + 1}</span>
                            {step.completed ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <Clock className="w-4 h-4 text-stone-600" />
                            )}
                          </div>
                          <div className={`text-xs font-bold ${step.completed ? 'text-white' : 'text-stone-400'}`}>
                            {step.stage}
                          </div>
                          <div className="text-[11px] text-stone-400 mt-1 leading-snug">
                            {step.description}
                          </div>
                          <div className="text-[10px] font-mono text-emerald-400 mt-2">
                            {step.time}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Rider Contact Card */}
                  {order.deliveryRiderName && (
                    <div className="bg-stone-950/80 p-4 rounded-2xl border border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">
                          <Truck className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-stone-400 text-[11px]">Hostel Route Delivery Rider</div>
                          <div className="text-white font-bold">{order.deliveryRiderName}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {order.deliveryEstimatedTime && (
                          <div className="text-stone-300 font-bold bg-stone-900 px-3 py-1.5 rounded-lg border border-stone-800">
                            ETA: <span className="text-emerald-400">{order.deliveryEstimatedTime}</span>
                          </div>
                        )}
                        {order.deliveryRiderPhone && (
                          <a
                            href={`tel:${order.deliveryRiderPhone}`}
                            className="bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-bold px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>Call Rider</span>
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: STUDENT PROFILE, HOSTEL INFO & WALLET */}
      {/* ========================================================================= */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-stone-900 border border-stone-800 rounded-3xl p-6 sm:p-8 space-y-6">
              <div className="flex items-center justify-between border-b border-stone-800 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-white">Hostel & Student Delivery Profile</h3>
                  <p className="text-xs text-stone-400">Your registered hostel room and gate drop details for seamless daily meal drops.</p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                  <Building2 className="w-5 h-5" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <label className="text-stone-400 font-semibold">Student Name</label>
                  <input
                    type="text"
                    value={studentNameInput}
                    onChange={e => setStudentNameInput(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white font-medium focus:border-emerald-500 outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-stone-400 font-semibold">Phone Number</label>
                  <input
                    type="text"
                    value={studentPhoneInput}
                    onChange={e => setStudentPhoneInput(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white font-medium focus:border-emerald-500 outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-stone-400 font-semibold">Hostel / PG / Residence Name</label>
                  <input
                    type="text"
                    value={hostelNameInput}
                    onChange={e => setHostelNameInput(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white font-medium focus:border-emerald-500 outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-stone-400 font-semibold">Room No / Floor / Block</label>
                  <input
                    type="text"
                    value={roomNumberInput}
                    onChange={e => setRoomNumberInput(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white font-medium focus:border-emerald-500 outline-none"
                  />
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="text-stone-400 font-semibold">Landmark / Delivery Drop Instructions</label>
                  <input
                    type="text"
                    value={landmarkInput}
                    onChange={e => setLandmarkInput(e.target.value)}
                    placeholder="e.g. Leave with security guard at South Gate desk"
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white font-medium focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>

              <button
                onClick={() => {
                  const updated: MessCustomerAccount = {
                    ...activeAccount,
                    name: studentNameInput,
                    phone: studentPhoneInput,
                    hostelOrPgName: hostelNameInput,
                    roomNumber: roomNumberInput,
                    landmark: landmarkInput
                  };
                  onUpdateAccount(updated);
                  alert('Hostel delivery address updated successfully!');
                }}
                className="bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black px-6 py-2.5 rounded-xl text-xs transition-all shadow-md"
              >
                Save Profile Changes
              </button>
            </div>
          </div>

          {/* Wallet & Deposit Ledger */}
          <div className="space-y-6">
            <div className="bg-stone-900 border border-stone-800 rounded-3xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white">Student Mess Wallet</h3>
                <Wallet className="w-5 h-5 text-amber-400" />
              </div>

              <div className="bg-stone-950 p-4 rounded-2xl border border-stone-800 text-center">
                <div className="text-xs text-stone-400">Available Balance</div>
                <div className="text-3xl font-black text-amber-400 my-1">₹{activeAccount.walletBalance}</div>
                <div className="text-[11px] text-emerald-400">
                  Instant credit from meal pauses & rollover
                </div>
              </div>

              <div className="space-y-2 text-xs text-stone-300">
                <div className="flex items-center justify-between bg-stone-950/60 p-2.5 rounded-xl border border-stone-800">
                  <span className="text-stone-400">Tiffin Deposit Credit:</span>
                  <span className="font-bold text-white">₹{activeAccount.tiffinBoxDeposit} (Refundable)</span>
                </div>
                <div className="flex items-center justify-between bg-stone-950/60 p-2.5 rounded-xl border border-stone-800">
                  <span className="text-stone-400">Tiffin Boxes Held:</span>
                  <span className="font-bold text-white">{activeAccount.tiffinContainersHeld} Boxes</span>
                </div>
              </div>
            </div>

            {/* Paused Dates Summary */}
            <div className="bg-stone-900 border border-stone-800 rounded-3xl p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Paused Home Trip Dates</h3>
                <PauseCircle className="w-4 h-4 text-amber-400" />
              </div>

              {activeAccount.pausedDates.length === 0 ? (
                <p className="text-xs text-stone-400">No upcoming paused dates. Your daily meals will be delivered as scheduled.</p>
              ) : (
                <div className="space-y-1.5">
                  {activeAccount.pausedDates.map((date, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs bg-stone-950 p-2.5 rounded-xl border border-stone-800">
                      <span className="text-white font-mono">{date}</span>
                      <span className="text-emerald-400 font-bold">₹50 Credited to Wallet</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CHECKOUT / SUBSCRIPTION MODAL */}
      {/* ========================================================================= */}
      {showCheckoutModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-stone-900 border border-stone-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl relative text-white">
            <button
              onClick={() => setShowCheckoutModal(false)}
              className="absolute top-5 right-5 text-stone-400 hover:text-white p-1 rounded-xl hover:bg-stone-800"
            >
              <X className="w-5 h-5" />
            </button>

            {checkoutStep === 'details' && (
              <div className="space-y-5">
                <div>
                  <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                    {selectedPlanToSubscribe ? 'Hostel Mess Subscription' : 'Single Meal Order'}
                  </span>
                  <h3 className="text-xl font-bold text-white mt-1">
                    {selectedPlanToSubscribe ? selectedPlanToSubscribe.name : selectedSingleItemToOrder?.name}
                  </h3>
                  <p className="text-xs text-stone-400 mt-1">
                    Please verify your hostel delivery drop location and student phone number.
                  </p>
                </div>

                {/* Amount Summary */}
                <div className="bg-stone-950 p-4 rounded-2xl border border-stone-800 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-stone-400">Total Payable Amount</div>
                    <div className="text-2xl font-black text-amber-400">
                      ₹{selectedPlanToSubscribe ? selectedPlanToSubscribe.discountedPrice : selectedSingleItemToOrder?.price}
                    </div>
                  </div>
                  <span className="text-xs font-bold text-emerald-400 bg-emerald-950 px-3 py-1 rounded-lg border border-emerald-500/30">
                    Free Hostel Delivery
                  </span>
                </div>

                {/* Delivery Input Fields */}
                <div className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <label className="text-stone-400 font-semibold">Your Name</label>
                    <input
                      type="text"
                      value={studentNameInput}
                      onChange={e => setStudentNameInput(e.target.value)}
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-stone-400 font-semibold">Hostel / PG Name</label>
                      <input
                        type="text"
                        value={hostelNameInput}
                        onChange={e => setHostelNameInput(e.target.value)}
                        className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-stone-400 font-semibold">Room No.</label>
                      <input
                        type="text"
                        value={roomNumberInput}
                        onChange={e => setRoomNumberInput(e.target.value)}
                        className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-stone-400 font-semibold">Contact Phone Number</label>
                    <input
                      type="text"
                      value={studentPhoneInput}
                      onChange={e => setStudentPhoneInput(e.target.value)}
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white outline-none focus:border-emerald-500"
                    />
                  </div>

                  {selectedSingleItemToOrder && (
                    <div className="space-y-1">
                      <label className="text-stone-400 font-semibold">Dietary / Spice Note (Optional)</label>
                      <input
                        type="text"
                        value={specialNoteInput}
                        onChange={e => setSpecialNoteInput(e.target.value)}
                        placeholder="e.g. Mild spicy, extra moru curry"
                        className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white outline-none focus:border-emerald-500"
                      />
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setCheckoutStep('payment')}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black py-3 rounded-2xl text-xs transition-all shadow-lg flex items-center justify-center gap-2"
                >
                  <span>Proceed to Payment</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {checkoutStep === 'payment' && (
              <div className="space-y-5">
                <div>
                  <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Step 2 of 2</span>
                  <h3 className="text-xl font-bold text-white mt-1">Select Payment Method</h3>
                  <p className="text-xs text-stone-400">Choose your preferred mode of payment.</p>
                </div>

                <div className="space-y-2 text-xs">
                  {/* UPI */}
                  <label 
                    onClick={() => setPaymentMode('upi_instant')}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition-all ${
                      paymentMode === 'upi_instant' ? 'bg-emerald-950/40 border-emerald-500' : 'bg-stone-950 border-stone-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold">
                        <QrCode className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-white">UPI Instant (GPay / PhonePe / Paytm)</div>
                        <div className="text-[11px] text-stone-400">Zero transaction fees</div>
                      </div>
                    </div>
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${paymentMode === 'upi_instant' ? 'border-emerald-400 bg-emerald-400' : 'border-stone-600'}`}>
                      {paymentMode === 'upi_instant' && <div className="w-1.5 h-1.5 bg-stone-950 rounded-full" />}
                    </div>
                  </label>

                  {/* Wallet */}
                  <label 
                    onClick={() => setPaymentMode('student_wallet')}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition-all ${
                      paymentMode === 'student_wallet' ? 'bg-emerald-950/40 border-emerald-500' : 'bg-stone-950 border-stone-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                        <Wallet className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-white">Student Mess Wallet (Balance: ₹{activeAccount.walletBalance})</div>
                        <div className="text-[11px] text-stone-400">1-Click instant payment</div>
                      </div>
                    </div>
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${paymentMode === 'student_wallet' ? 'border-emerald-400 bg-emerald-400' : 'border-stone-600'}`}>
                      {paymentMode === 'student_wallet' && <div className="w-1.5 h-1.5 bg-stone-950 rounded-full" />}
                    </div>
                  </label>

                  {/* Cash on delivery */}
                  <label 
                    onClick={() => setPaymentMode('cash_at_gate')}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition-all ${
                      paymentMode === 'cash_at_gate' ? 'bg-emerald-950/40 border-emerald-500' : 'bg-stone-950 border-stone-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">
                        <CreditCard className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-white">Cash / UPI at Hostel Gate Drop</div>
                        <div className="text-[11px] text-stone-400">Pay directly upon meal arrival</div>
                      </div>
                    </div>
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${paymentMode === 'cash_at_gate' ? 'border-emerald-400 bg-emerald-400' : 'border-stone-600'}`}>
                      {paymentMode === 'cash_at_gate' && <div className="w-1.5 h-1.5 bg-stone-950 rounded-full" />}
                    </div>
                  </label>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => setCheckoutStep('details')}
                    className="w-1/3 bg-stone-800 hover:bg-stone-700 text-stone-300 py-3 rounded-2xl text-xs font-bold transition-all"
                  >
                    Back
                  </button>

                  <button
                    onClick={handleConfirmPurchase}
                    className="w-2/3 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black py-3 rounded-2xl text-xs transition-all shadow-lg flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirm & Activate</span>
                  </button>
                </div>
              </div>
            )}

            {checkoutStep === 'success' && (
              <div className="text-center space-y-4 py-4">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-black text-white">Order Confirmed & Queued!</h3>
                <p className="text-xs text-stone-300 max-w-sm mx-auto">
                  Your food is queued in the central kitchen batch preparation. The rider will drop it off at <strong className="text-emerald-400">{hostelNameInput}</strong>.
                </p>

                {placedOrderRef && (
                  <div className="bg-stone-950 p-4 rounded-2xl border border-stone-800 text-left text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-stone-400">Order Ref:</span>
                      <span className="font-mono font-bold text-white">{placedOrderRef.orderNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-400">Gate Pass Code:</span>
                      <span className="font-mono font-bold text-amber-400">{placedOrderRef.hostelGatePassCode}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-400">Estimated Arrival:</span>
                      <span className="font-bold text-emerald-400">{placedOrderRef.deliveryEstimatedTime}</span>
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    onClick={() => {
                      setShowCheckoutModal(false);
                      setActiveTab('tracking');
                    }}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black py-3 rounded-2xl text-xs transition-all shadow-lg"
                  >
                    View Live Delivery Tracker
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PAUSE / SKIP MEAL MODAL */}
      {/* ========================================================================= */}
      {showPauseModal && selectedOrderToPause && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-5 shadow-2xl relative text-white">
            <button
              onClick={() => setShowPauseModal(false)}
              className="absolute top-5 right-5 text-stone-400 hover:text-white p-1 rounded-xl"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">Hostel Student Pause & Rollover</span>
              <h3 className="text-lg font-bold text-white mt-1">Pause Upcoming Meal</h3>
              <p className="text-xs text-stone-400 mt-1">
                Going home for the weekend or have a college event? Pausing will refund <strong>₹50</strong> directly into your Student Mess Wallet!
              </p>
            </div>

            <div className="bg-stone-950 p-3.5 rounded-2xl border border-stone-800 text-xs space-y-1">
              <div className="font-bold text-white">{selectedOrderToPause.dishName}</div>
              <div className="text-stone-400">Slot: <span className="text-amber-400 capitalize">{selectedOrderToPause.mealSlot}</span></div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-stone-400 font-semibold">Date to Pause</label>
                <input
                  type="date"
                  value={pauseDateInput}
                  onChange={e => setPauseDateInput(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white outline-none focus:border-amber-400"
                />
              </div>

              <div className="space-y-1">
                <label className="text-stone-400 font-semibold">Reason (Optional)</label>
                <input
                  type="text"
                  value={pauseReasonInput}
                  onChange={e => setPauseReasonInput(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setShowPauseModal(false)}
                className="flex-1 bg-stone-800 hover:bg-stone-700 text-stone-300 py-2.5 rounded-xl text-xs font-bold transition-all"
              >
                Cancel
              </button>

              <button
                onClick={handleConfirmPause}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black py-2.5 rounded-xl text-xs transition-all shadow-md flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Confirm & Credit Wallet</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
