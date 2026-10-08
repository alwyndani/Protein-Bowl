export type UserRole = 'customer' | 'mess_customer' | 'super_admin' | 'md' | 'nutritionist' | 'trainer' | 'chef' | 'procurement' | 'delivery' | 'pos' | 'bakery_fmcg' | 'tepache_erp' | 'swiggy_zomato';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'athlete';
export type HealthGoal = 'weight_loss' | 'muscle_gain' | 'maintenance' | 'wellness' | 'diabetic' | 'other';
export type PlanType = 'complete' | '1meal' | '2meal';
export type DietaryPreference = 'veg' | 'non-veg' | 'egg' | 'vegan' | 'keto' | 'high-protein';

export interface BloodTestResults {
  fastingBloodSugar?: number; // mg/dL
  hbA1c?: number; // %
  totalCholesterol?: number; // mg/dL
  hdl?: number; // mg/dL
  ldl?: number; // mg/dL
  triglycerides?: number; // mg/dL
  hemoglobin?: number; // g/dL
  vitaminD?: number; // ng/mL
  vitaminB12?: number; // pg/mL
  ferritin?: number; // ng/mL
  uricAcid?: number; // mg/dL
  creatinine?: number; // mg/dL
  tsh?: number; // mIU/L
  sgot?: number; // U/L
  sgpt?: number; // U/L
}

export interface CustomerProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  dob: string;
  age: number;
  gender?: 'female' | 'male' | 'other';

  // Initial & Target Body Measurements
  heightCm: number;
  weightKg: number;
  targetWeightKg?: number;
  occupation?: string;
  workSchedule?: string;
  sleepDuration?: number; // hours/day
  wakeUpTime?: string; // HH:MM
  bedTime?: string; // HH:MM

  // Tracking & Circumferences
  muscleMassKg?: number;
  circumferences?: {
    waistCm?: number;
    hipCm?: number;
    chestCm?: number;
    neckCm?: number;
  };
  limbCircumferences?: {
    leftArmCm?: number;
    rightArmCm?: number;
    leftThighCm?: number;
    rightThighCm?: number;
    leftCalfCm?: number;
    rightCalfCm?: number;
  };

  // Goals & Activity
  goal: HealthGoal;
  primaryGoals?: string[]; // multi-select
  activityLevel: ActivityLevel;

  // Exercise Details
  hasExercise?: boolean;
  workoutTypes?: string[];
  workoutFrequency?: string;
  workoutDuration?: number; // mins
  dailyStepCount?: number;
  cardioSessions?: number;
  strengthSessions?: number;

  // Clinical & Medical
  medicalConditions: string[];
  currentMedications?: string;
  supplements?: string[];
  bloodTestResults?: BloodTestResults;

  // Food & Allergies
  foodPreference?: 'Vegetarian' | 'Eggetarian' | 'Non-Vegetarian' | 'Vegan' | 'Keto' | 'High-Protein';
  allergies: string[];
  foodDislikes: string[];
  customQuery?: string;

  // Meal Structure
  mealsPerDay?: number;
  mealTimings?: {
    breakfast?: string;
    morningSnack?: string;
    lunch?: string;
    eveningSnack?: string;
    dinner?: string;
    bedtimeSnack?: string;
  };
  waterIntakeL?: number;

  // Lifestyle
  digestiveHealth?: string[];
  smoking?: 'Never' | 'Occasionally' | 'Daily' | 'Former Smoker';
  alcohol?: 'Never' | 'Monthly' | 'Weekly' | 'Daily';
  tobacco?: 'Never' | 'Occasionally' | 'Daily';
  stressLevel?: number; // 1-10
  sleepQuality?: 'Excellent' | 'Good' | 'Average' | 'Poor';

  // Women-Only Fields
  isPregnant?: boolean;
  isBreastfeeding?: boolean;
  menstrualCycle?: 'Regular' | 'Irregular';
  isMenopause?: boolean;

  // Plan Selection
  planDurationDays?: 3 | 7 | 20 | 30 | number;
  planFrequency?: 1 | 2 | 3; // 1, 2, or 3 meals/day
  preferredSlot?: 'Morning (Breakfast)' | 'Afternoon (Lunch)' | '4:00 PM (Snacks/Salads)' | 'Dinner' | '11:00 PM (Late-Night)';
  addonSlots?: string[]; // e.g. ['4:00 PM Snacks/Salads', '11:00 PM Late-Night']

  // Auto-Calculated Fields
  bmi: number;
  bmiCategory: 'Underweight' | 'Normal' | 'Overweight' | 'Obese';
  bmr: number; // kcal/day
  tdee?: number; // kcal/day (same as maintenanceCalories)
  maintenanceCalories: number;
  targetCalories: number;
  macroTargets: {
    proteinGrams: number;
    carbsGrams: number;
    fatGrams: number;
    fiberGrams: number;
  };
  waterRequirementL?: number;
  idealBodyWeightKg?: number;
  leanBodyMassKg?: number;
  calorieDeficitSurplus?: number; // kcal/day (+ or -)
}

export interface IngredientRequirement {
  name: string;
  quantity: number;
  unit: string;
}

export interface RecipeItem {
  id: string;
  category: string;
  name: string;
  servingSize: string;
  servingGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  dietaryTag: DietaryPreference;
  cuisine: string;
  flourGrainPreference?: string;
  spiceLevel?: 'Mild' | 'Medium' | 'Spicy';
  ingredientsList: IngredientRequirement[];
  prepSteps: string[];
  image: string;
  rating?: number;
}

export type TimingSlotKey = 'breakfast' | 'morning_snack' | 'lunch' | 'evening_snack' | 'dinner' | string;

export interface MealSlotItem {
  id: string;
  recipeId: string;
  recipeName: string;
  portionSize: string; // e.g., "1 Portion (200g)", "2 Slices"
  portionGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  customizationNote?: string; // e.g., "Less oil/salt for BP", "Stevia instead of sugar"
}

export interface DayMealSlot {
  mealType: TimingSlotKey;
  timingLabel?: string; // e.g., "08:00 AM - Breakfast"
  items?: MealSlotItem[]; // 2-3 menu items per timing
  slotRemarks?: string; // e.g., "Drink 1 glass of warm lemon water 15 mins before"
  
  // Backward compatibility fields:
  recipeId?: string;
  recipeName?: string;
  customPortionGrams?: number;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

export interface DayPlan {
  dayNumber: number; // 1 to 7
  dayName?: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday' | string;
  meals: DayMealSlot[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
}

export interface DietPlanRequest {
  id: string;
  kitchenBranchId?: KitchenBranchId;
  branchName?: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  bmi: number;
  goal: HealthGoal;
  targetCalories: number;
  planType: PlanType;
  durationDays: 3 | 7 | 20 | 30 | number;
  preferredCategories: string[];
  dietaryPreference: DietaryPreference;
  cuisinePreference: string;
  grainPreference: string;
  spiceLevel: 'Mild' | 'Medium' | 'Spicy';
  allergiesExclusions: string;
  customQuery?: string;
  addonSlots?: string[];
  status: 'pending_review' | 'under_review' | 'plan_ready' | 'approved' | 'revision_requested' | 'rejected' | 'active' | 'completed';
  dayWisePlan?: DayPlan[];
  dieticianNotes?: string;
  revisionNotes?: string;
  calculatedPrice?: number;
  pricingBreakdown?: {
    baseMealCost: number;
    addonCost: number;
    durationDiscount: number;
    gstAmount: number;
    totalPayable: number;
  };
  createdAt: string;
}

export interface Order {
  id: string;
  kitchenBranchId?: KitchenBranchId;
  branchName?: string;
  customerId: string;
  customerName: string;
  planId: string;
  planTitle: string;
  planType: PlanType;
  durationDays: number;
  startDate: string;
  deliveryAddress: {
    street: string;
    city: string;
    pincode: string;
    landmark?: string;
  };
  deliverySlot: 'Morning (Breakfast)' | 'Afternoon (Lunch)' | '4:00 PM (Snacks/Salads)' | 'Dinner' | '11:00 PM (Late-Night)' | string;
  paymentStatus: 'paid' | 'pending';
  orderStatus: 'confirmed' | 'in_production' | 'out_for_delivery' | 'delivered';
  totalAmount: number;
  fssaiLicense: string;
  batchNumber: string;
  createdAt: string;
}

export interface WeightLog {
  id: string;
  date: string;
  weightKg: number;
  bmi: number;
  notes?: string;
}

export interface MealFeedback {
  id: string;
  date: string;
  mealName: string;
  rating: number;
  comment: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: 'Grains & Flours' | 'Proteins' | 'Vegetables' | 'Dairy' | 'Spices & Condiments' | 'Packaging';
  currentStock: number;
  unit: 'kg' | 'g' | 'liters' | 'units';
  minThreshold: number;
  reorderQty: number;
  unitCost: number;
  lastRestocked: string;
  supplier: string;
}

export interface ProductionBatch {
  id: string;
  date: string;
  timeSlot: string;
  recipeId: string;
  recipeName: string;
  totalPortions: number;
  status: 'scheduled' | 'in_prep' | 'cooking' | 'quality_check' | 'packed' | 'dispatched';
  chefAssigned: string;
  qualitySignoffBy?: string;
  qualityPassed: boolean;
}

export interface ComboOffer {
  id: string;
  title: string;
  subtitle: string;
  discountPct: number;
  durationDays: number;
  planType: PlanType;
  price: number;
  popularTag?: string;
}

// Human Resource Management (HRM) Interfaces
export interface StaffEmployee {
  id: string; // e.g. "EMP-101"
  name: string;
  role: string;
  department: 'Kitchen & Culinary' | 'Clinical Nutrition' | 'Logistics & Delivery' | 'Procurement & Inventory' | 'Administration' | 'Kerala Mess & Hostel Ops' | 'Brewery & FMCG';
  email: string;
  phone: string;
  dateOfJoining: string;
  status: 'Active' | 'On Leave' | 'In Notice Period' | 'Resigned' | 'Terminated';
  bankDetails: {
    bankName: string;
    accountNumber: string;
    ifscCode: string;
    panNumber: string;
    upiId?: string;
  };
  payrollSetup: {
    baseSalary: number;
    travelAllowance: number;
    medicalAllowance: number;
    phoneAllowance: number;
    specialBonus: number;
    pfDeduction: number;
    esiDeduction: number;
    ptDeduction: number;
    tdsDeduction: number;
  };
  leaveBalance: {
    casualLeaveRemaining: number;
    sickLeaveRemaining: number;
    earnedLeaveRemaining: number;
  };
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  status: 'Present' | 'Absent' | 'Half Day' | 'On Leave';
  checkInTime?: string;
  checkOutTime?: string;
  notes?: string;
}

export interface LeaveApplication {
  id: string;
  employeeId: string;
  employeeName: string;
  role: string;
  leaveType: 'Casual' | 'Sick' | 'Earned' | 'Unpaid';
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  appliedOn: string;
  reviewedBy?: string;
}

export interface PayslipRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  role: string;
  month: string; // e.g. "July 2026"
  workingDays: number;
  daysPresent: number;
  daysLeave: number;
  baseSalary: number;
  allowances: {
    travel: number;
    medical: number;
    phone: number;
    bonus: number;
  };
  grossEarnings: number;
  deductions: {
    pf: number;
    esi: number;
    pt: number;
    tds: number;
  };
  totalDeductions: number;
  netPayable: number;
  paymentStatus: 'Paid' | 'Processing' | 'Pending';
  generatedOn: string;
}

export interface AppointmentLetter {
  id: string;
  employeeId?: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
  candidateAddress: string;
  designation: string;
  department: string;
  joiningDate: string;
  probationPeriodMonths: number;
  workLocation: string;
  reportingManager: string;
  employmentType: 'Full-time Probationary' | 'Permanent Executive' | 'Consultant Contract' | 'Part-Time';
  annualCtc: number;
  monthlyBaseSalary: number;
  monthlyAllowances: number;
  monthlyGrossSalary: number;
  monthlyNetSalary: number;
  offerValidityDate: string;
  issuedDate: string;
  issuedBy: string;
  status: 'Issued' | 'Accepted' | 'Signed Copy Uploaded' | 'Draft';
  specialTerms?: string;
  referenceNumber: string;
}

export interface SeparationRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  role: string;
  department: string;
  type: 'Resignation' | 'Termination' | 'Mutual Separation';
  initiationDate: string;
  noticePeriodDays: number;
  lastWorkingDay: string;
  reason: string;
  status: 'Initiated' | 'Notice Period Active' | 'Clearance In Progress' | 'Exit Completed' | 'Rejected';
  clearanceChecklist: {
    kitchenAssetsHandover: boolean;
    idBadgeAndKeys: boolean;
    accountsNoDues: boolean;
    itAccessRevoked: boolean;
  };
  fnfSettlement: {
    unpaidSalaryDays: number;
    unpaidSalaryAmount: number;
    leaveEncashmentDays: number;
    leaveEncashmentAmount: number;
    noticePayAdjustment: number;
    netFnfAmount: number;
    paymentStatus: 'Pending' | 'Processed' | 'Settled';
    settledOn?: string;
  };
  relievingLetterIssued: boolean;
  notes?: string;
}

export interface AgreedVendorItem {
  id?: string;
  itemName: string;
  category?: string;
  agreedRate: number; // ₹ per unit
  unit: string;
  contractType: 'Rate Contract' | 'Market Variable';
}

export interface VendorMasterItem {
  id: string;
  name: string;
  category: string; // e.g. 'Proteins & Poultry', 'Grains & Flours', 'Kitchen Equipment & Hardware', 'Non-Food Consumables'
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  paymentTerms: 'Immediate Cash' | 'Net 15 Days' | 'Net 30 Days' | '50% Advance' | 'Weekly Ledger';
  loginUsername: string;
  status: 'Active Supplier' | 'Pending Review' | 'Inactive';
  leadTimeHours: number;
  itemsSupplied: string[]; // List of ingredient or asset names
  agreedItems?: AgreedVendorItem[];
  bankDetails?: {
    accountNo: string;
    bankName?: string;
    ifsc: string;
    upiId: string;
  };
}

export interface VendorPurchaseBill {
  id: string;
  vendorId: string;
  vendorName: string;
  invoiceNo: string;
  invoiceDate: string; // YYYY-MM-DD
  totalAmount: number;
  amountPaid: number;
  pendingAmount: number;
  paymentStatus: 'Paid' | 'Pending' | 'Partially Paid';
  paymentTerms: string;
  itemsList: {
    itemName: string;
    category: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
  }[];
  scannedBillUrl?: string;
  isAiProcessed?: boolean;
}

export interface AssetPurchaseHistory {
  id: string;
  date: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  supplier: string;
  invoiceNo?: string;
  notes?: string;
}

export interface KitchenAssetItem {
  id: string;
  name: string;
  category: 'Capital Equipment' | 'Non-Food Consumable' | 'Furniture & Desk' | 'Kitchen Hardware & Utensils';
  quantity: number;
  unit: string; // e.g. 'units', 'cylinders', 'rolls', 'sets', 'boxes'
  unitCost: number;
  totalCost: number;
  purchaseDate: string;
  supplier: string;
  location: string; // e.g. 'Main Prep Kitchen', 'Packaging Terminal', 'Office Admin Desk'
  warrantyPeriod?: string;
  serialNumber?: string;
  condition?: 'Excellent' | 'Good' | 'Needs Maintenance' | 'Active';
  notes?: string;
  purchaseHistory?: AssetPurchaseHistory[];
}

export interface FinancialTransaction {
  id: string;
  date: string;
  type: 'Income' | 'Expense' | 'Asset Purchase' | 'Loan / Capital' | 'Tax / Statutory';
  category: string;
  description: string;
  amount: number;
  paymentMode: 'Bank Transfer / UPI' | 'Credit Card' | 'Cash' | 'Cheque / NEFT';
  voucherNo: string;
  accountType: 'Debit' | 'Credit';
  status: 'Completed' | 'Pending Audit' | 'Reconciled';
  counterparty?: string;
}

export interface KitchenYieldWastageRecord {
  id: string;
  date: string;
  recipeDishName: string;
  ingredientName: string;
  purchasedQtyUsed: number;
  unit: string;
  expectedPortions: number;
  actualPortionsProduced: number;
  yieldVariancePortions: number;
  yieldVariancePct: number; // e.g. -10%
  wastageCostLoss: number;
  rootCause: string;
  recordedBy: string;
}

// --------------------------------------------------------------------------
// FITNESS & WORKOUT MODULE INTERFACES
// --------------------------------------------------------------------------

export interface ProgressPhoto {
  id: string;
  date: string;
  type: 'Front Progress' | 'Side Progress' | 'Back Progress';
  imageUrl: string;
  isFaceMasked: boolean;
  notes?: string;
}

export interface SetDetail {
  setNumber: number;
  weightKg: string | number;
  reps: string | number;
}

export interface WorkoutExercise {
  id: string;
  name: string;
  targetMuscle: string;
  weightKg: number | string;
  sets: number;
  reps: string;
  restSeconds: number;
  description?: string;
  videoUrl?: string;
  tips?: string;
  setDetails?: SetDetail[];
}

export interface WorkoutDaySchedule {
  dayNumber: number;
  dayName: string; // e.g. "Day 1: Chest & Triceps"
  isRestDay: boolean;
  exercises: WorkoutExercise[];
}

export interface ClientWorkoutPlan {
  id: string;
  customerId: string;
  splitType: '3_day' | '5_day' | '6_day';
  fitnessLevel: 'Beginner' | 'Intermediate' | 'Advanced';
  specificRequirements: string;
  assignedTrainerName: string;
  updatedAt: string;
  schedule: WorkoutDaySchedule[];
}

export interface OneOnOneVideoSession {
  id: string;
  customerId: string;
  customerName: string;
  date: string;
  timeSlot: string; // e.g., "06:00 AM - 07:00 AM"
  period: 'Morning (5 AM - 9 AM)' | 'Evening (5 PM - 9 PM)';
  trainerName: string;
  isFreeSession: boolean;
  priceAmount: number;
  status: 'Booked' | 'Completed' | 'Cancelled';
  meetLink?: string;
}

// --------------------------------------------------------------------------
// OMNICHANNEL & PARTY ORDERS DAILY LOGGING INTERFACES
// --------------------------------------------------------------------------

export type ExternalChannelType = 
  | 'swiggy' 
  | 'zomato' 
  | 'party_order' 
  | 'walk_in_pos' 
  | 'direct_phone_whatsapp' 
  | 'website_direct';

export interface ChannelOrderItem {
  id: string;
  recipeId?: string;
  dishName: string;
  category?: string;
  portionSize: string; // e.g. "Single Bowl (350g)", "Bulk 2.5kg Tray", "Per Person Plate"
  standardWebsitePrice?: number; // Base catalog price reference
  unitPrice: number; // Channel-specific price (e.g. Swiggy price with markup or Party bulk discount price)
  quantity: number;
  lineTotal: number;
  specialInstructions?: string; // e.g. "Extra dressing on side", "Sugar-free dessert"
}

export interface PartyEventDetails {
  occasion: string; // e.g. "Corporate Wellness Lunch", "Gym Anniversary Party", "Birthday Celebration", "Yoga Retreat"
  guestCount: number;
  eventDate: string;
  eventTimeSlot: string; // e.g. "1:00 PM - 3:00 PM"
  venueAddress: string;
  contactPerson: string;
  contactPhone: string;
  cateringStyle: 'Individual Bento Boxes' | 'Buffet / Bulk Chafing Trays' | 'Live Salad Counter' | 'Finger Food & Smoothies';
  setupRequired: boolean;
  dietarySplit?: {
    vegCount: number;
    nonVegCount: number;
    veganOrKetoCount: number;
  };
  advancePaid: number;
  balanceDue: number;
  specialNotes?: string;
}

export type KitchenBranchId = 'all' | 'trivandrum' | 'kochi' | 'kozhikode' | string;

export interface CloudKitchenStation {
  id: string;
  name: string;
  stationType: 'hot_line' | 'salad_cold_prep' | 'baking_dessert' | 'packing_dispatch' | 'wash_sanitation';
  leadChef: string;
  status: 'operational' | 'busy' | 'sanitizing';
  activeItemsCount: number;
}

export interface CloudKitchenBranch {
  id: 'trivandrum' | 'kochi' | 'kozhikode' | string;
  name: string;
  city: string;
  state: string;
  hubName: string;
  tagline: string;
  address: string;
  pincode: string;
  phone: string;
  email: string;
  fssaiNumber: string;
  operatingHours: string;
  status: 'active' | 'rush' | 'maintenance' | 'closed';
  
  // Key Personnel
  generalManager: string;
  headChef: string;
  procurementLead: string;
  logisticsFleetLead: string;
  leadDietician: string;
  
  // Capacity & Load Telemetry
  dailyMealCapacity: number;
  activeMealsToday: number;
  capacityUtilizationPct: number;
  activeStaffCount: number;
  activeChefsCount: number;
  activeRidersCount: number;
  
  // Quality & Operations
  hygieneAuditScorePct: number; // e.g. 98.5%
  avgPrepTimeMins: number;
  deliveryOnTimeRatePct: number;
  coldChainTempCelsius: number; // e.g. 3.8°C
  
  // Financial Snapshot
  monthlyRevenue: number;
  todayRevenue: number;
  avgOrderValue: number;
  todayOrdersCount: number;
  
  // Geographical Coverage
  deliveryRadiusKm: number;
  servicePincodes: string[];
  zonesCovered: string[];
  stations: CloudKitchenStation[];
}

export interface StaffUserAccount {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  designation: string;
  assignedBranchId: 'all' | 'trivandrum' | 'kochi' | 'kozhikode' | string;
  branchName: string;
  avatarBg: string;
  shiftTiming: string;
  isOnline: boolean;
}

export interface InterKitchenTransfer {
  id: string;
  transferDate: string;
  sourceBranchId: string;
  sourceBranchName: string;
  destinationBranchId: string;
  destinationBranchName: string;
  itemName: string;
  category: string;
  quantity: number;
  unit: string;
  estimatedValue: number;
  status: 'requested' | 'in_transit' | 'received' | 'rejected';
  requestedBy: string;
  approvedBy?: string;
  dispatchVehicleNo?: string;
  driverPhone?: string;
  transitTemperature?: string;
  notes?: string;
}

export interface OmnichannelOrder {
  id: string;
  kitchenBranchId?: KitchenBranchId;
  branchName?: string;
  channel: ExternalChannelType;
  channelOrderId: string; // e.g. "SWIG-9428", "ZOM-3190", "PTY-2026-0815", "POS-1044", "WA-8831"
  orderDate: string; // YYYY-MM-DD
  orderTime: string; // HH:MM
  
  // Customer / Contact Info
  customerName: string;
  customerPhone: string;
  deliveryAddress?: string;
  landmarkPincode?: string;
  
  // Rider / Logistics details (especially for Swiggy/Zomato/Delivery)
  riderName?: string;
  riderPhone?: string;
  vehicleNo?: string;
  
  // Items & Pricing
  items: ChannelOrderItem[];
  itemsSubtotal: number;
  packagingCharge: number;
  deliveryCharge: number;
  gstAmount: number;
  discountAmount: number;
  grossAmount: number; // Total billed to customer or aggregator
  
  // Channel Economics & Margins
  aggregatorCommissionPct: number; // e.g. 20% for Swiggy, 18% for Zomato, 0% for Direct/Party
  aggregatorCommissionAmount: number;
  platformFeeDeducted: number;
  netPayoutRevenue: number; // Cash/Bank amount realized by kitchen after platform cuts
  
  // Party Order Specific Info (if channel === 'party_order')
  partyDetails?: PartyEventDetails;
  
  // Status Tracking
  kitchenStatus: 'received' | 'in_prep' | 'ready_packed' | 'dispatched' | 'completed' | 'cancelled';
  paymentStatus: 'paid_online' | 'paid_cash' | 'advance_paid' | 'pending' | 'settled';
  paymentMethod: 'Swiggy Pay' | 'Zomato Pay' | 'UPI / GPay / PhonePe' | 'Cash on Delivery' | 'Bank Transfer / NEFT' | 'Credit Card POS';
  
  // Audit / Notes
  loggedByStaff: string; // e.g. "Cashier Rahul", "MD Portal", "Front Desk"
  internalNotes?: string;
  createdAt: string;
}

// -------------------------------------------------------------
// POINT OF SALE (POS) & OUTLET COUNTER BILLING TYPES
// -------------------------------------------------------------

export interface POSItem {
  id: string;
  name: string;
  category: string;
  price: number;
  prepTimeMins: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  isVeg: boolean;
  isAvailable: boolean;
  sku: string;
  barcode?: string;
  taxRatePct?: number; // 5% GST
}

export interface POSCartItem {
  item: POSItem;
  quantity: number;
  customization?: string;
  unitPrice: number;
  lineTotal: number;
}

export interface POSTransaction {
  id: string;
  receiptNumber: string; // e.g. "POS-KOC-10492"
  kotNumber: string; // e.g. "KOT-082"
  outletId: string;
  outletName: string;
  orderType: 'takeaway' | 'dine_in' | 'counter_express';
  customerName: string;
  customerPhone: string;
  tableNumber?: string;
  items: POSCartItem[];
  subtotal: number;
  taxGst: number;
  discount: number;
  packagingCharge: number;
  totalAmount: number;
  paymentMode: 'cash' | 'upi' | 'card' | 'split';
  paymentDetails: {
    cashTendered?: number;
    changeReturned?: number;
    upiRef?: string;
    cardLast4?: string;
    splitCashAmount?: number;
    splitUpiAmount?: number;
  };
  status: 'completed' | 'hold' | 'refunded' | 'cancelled';
  cashierName: string;
  cashierId: string;
  timestamp: string; // e.g. "2026-08-15 13:24"
  notes?: string;
}

export interface POSCashDrawerShift {
  id: string;
  outletId: string;
  outletName: string;
  cashierId: string;
  cashierName: string;
  shiftStartTime: string;
  shiftEndTime?: string;
  openingCashFloat: number;
  cashSalesTotal: number;
  upiSalesTotal: number;
  cardSalesTotal: number;
  cashDropOut: number;
  expectedCashInDrawer: number;
  actualCashCounted?: number;
  cashDifference?: number;
  status: 'open' | 'closed';
}

// ==========================================
// FMCG & BAKERY PACKAGED FOODS DATA SCHEMAS
// ==========================================

export type PackagedProductCategory = 
  | 'granola_bars' 
  | 'granola_pouches' 
  | 'protein_bars' 
  | 'artisan_breads' 
  | 'healthy_cookies' 
  | 'protein_cakes_brownies';

export interface PackagedProductItem {
  id: string;
  sku: string;
  name: string;
  category: PackagedProductCategory;
  description: string;
  netWeight: string; // e.g. "45g", "250g", "400g"
  servingSize: string;
  mrp: number; // Maximum Retail Price (₹)
  wholesalePrice: number; // B2B Supply Price to Shops/Outlets (₹)
  costToProduce: number; // Production Cost (₹)
  shelfLifeDays: number; // Standard Shelf Life
  storageCondition: 'Ambient (Dry & Cool)' | 'Air Conditioned (18-22°C)' | 'Cold Chilled (2-6°C)';
  fssaiLicNumber: string;
  barcode: string; // EAN-13 / Code-128
  nutritionPer100g: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sugarAdded: number;
  };
  keyIngredients: string[];
  allergenWarning: string;
  dietaryTags: ('High-Protein' | 'Zero-Added-Sugar' | 'Gluten-Free' | '100% Vegan' | 'Keto-Friendly' | 'Whole-Grain')[];
  image?: string;
  active: boolean;
}

export type BatchProductionStatus = 
  | 'planned' 
  | 'in_production' 
  | 'baking_curing' 
  | 'quality_passed' 
  | 'packed_labeled' 
  | 'dispatched_completed';

export interface BakeryProductionBatch {
  id: string;
  batchNumber: string; // e.g. "BATCH-GB-2026-0815-A"
  productId: string;
  productName: string;
  category: PackagedProductCategory;
  plannedQuantity: number; // Units
  actualYield: number; // Final acceptable units packed
  wastageOrRejects: number; // Units rejected during QC
  productionFacility: string; // e.g. "Central Bakery Unit, Kochi Hub"
  leadBakerChef: string;
  mfgDate: string; // "YYYY-MM-DD"
  mfgTime: string; // "HH:MM"
  expDate: string; // "YYYY-MM-DD"
  shelfLifeDays: number;
  status: BatchProductionStatus;
  qcPassed: boolean;
  qcSignoffBy?: string;
  qcNotes?: string;
  costPerUnit: number;
  totalBatchCost: number;
  labelsPrintedCount: number;
  createdAt: string;
  notes?: string;
}

export type DestinationChannelType = 'our_outlet' | 'supermarket' | 'gym_fitness' | 'cafe_store' | 'corporate_kiosk';

export interface RetailShopDestination {
  id: string;
  code: string; // e.g. "SHP-LULU-EDP"
  name: string;
  channelType: DestinationChannelType;
  outletType: 'Our Own Outlet' | 'External Retail Partner';
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  paymentTerms: 'Immediate COD' | 'Weekly Consignment' | 'Net 15 Days' | 'Net 30 Days' | 'Monthly Billing';
  creditLimit: number; // ₹
  discountMarginPct: number; // Retail margin percentage, e.g. 20%
  totalSuppliedUnits: number;
  totalSoldUnits: number;
  totalReturnedUnits: number;
  currentShelfStockUnits: number;
  totalGrossSuppliedValue: number;
  totalReturnsValue: number;
  totalPaidAmount: number;
  outstandingBalance: number;
  status: 'active' | 'on_hold' | 'inactive';
}

export interface DispatchLineItem {
  id: string;
  batchId: string;
  batchNumber: string;
  productId: string;
  productName: string;
  sku: string;
  category: PackagedProductCategory;
  quantitySupplied: number;
  unitWholesaleRate: number;
  unitMrp: number;
  lineTotal: number;
  mfgDate: string;
  expDate: string;
  returnedQuantity?: number;
}

export type DispatchChallanStatus = 'draft' | 'dispatched' | 'in_transit' | 'delivered_acknowledged' | 'cancelled';

export interface FMCGDispatchChallan {
  id: string;
  challanNumber: string; // e.g. "DC-2026-0815-01"
  shopId: string;
  shopName: string;
  channelType: DestinationChannelType;
  dispatchDate: string;
  dispatchTime: string;
  deliveryExpectedDate: string;
  vehicleNumber: string;
  driverName: string;
  driverPhone: string;
  transitTemperature: string; // e.g. "Ambient 22°C" or "Refrigerated 4°C"
  items: DispatchLineItem[];
  totalQuantity: number;
  totalValue: number;
  status: DispatchChallanStatus;
  acknowledgedBy?: string;
  acknowledgementTimestamp?: string;
  receiverNotes?: string;
  paymentTerms: string;
  invoiceGenerated: boolean;
}

export type ReturnReasonCode = 
  | 'expired_shelf_life' 
  | 'near_expiry_unsold' 
  | 'transit_damage' 
  | 'packaging_seal_defect' 
  | 'customer_return_opened';

export interface FMCGReturnTicket {
  id: string;
  returnRef: string; // e.g. "RET-2026-0815-01"
  shopId: string;
  shopName: string;
  challanRef?: string;
  batchNumber: string;
  productId: string;
  productName: string;
  category: PackagedProductCategory;
  quantityReturned: number;
  unitRate: number;
  totalCreditAmount: number;
  mfgDate: string;
  expDate: string;
  daysExpiredOrRemaining: number; // positive = days past expiry, negative = days remaining
  reason: ReturnReasonCode;
  reasonDescription: string;
  dispositionAction: 'safe_bio_compost' | 'salvage_discount' | 'vendor_claim' | 'destruction_record';
  verifiedBy: string;
  returnDate: string;
  creditNoteIssued: boolean;
  creditNoteNumber?: string;
  status: 'pending_verification' | 'credit_approved' | 'settled' | 'rejected';
}

export interface FMCGPaymentRecord {
  id: string;
  receiptNumber: string; // e.g. "REC-FMCG-2026-089"
  shopId: string;
  shopName: string;
  paymentDate: string;
  amount: number;
  paymentMode: 'upi' | 'neft_bank_transfer' | 'cheque' | 'cash';
  transactionRef: string;
  invoiceRefs: string[];
  recordedBy: string;
  notes?: string;
}

export interface FMCGExpiryAlert {
  id: string;
  batchNumber: string;
  productId: string;
  productName: string;
  shopId: string;
  shopName: string;
  unitsOnShelf: number;
  expDate: string;
  daysRemaining: number;
  riskLevel: 'critical_expired' | 'high_expiring_soon' | 'moderate' | 'healthy';
  recommendedAction: 'immediate_recall' | 'markdown_50_pct' | 'relocate_high_footfall' | 'bundle_bogo';
  status: 'active' | 'action_taken' | 'resolved';
}

// ==========================================
// TEPACHE PROBIOTIC BREWERY & FERMENTATION SCHEMAS
// ==========================================

export type TepacheFlavorType = 
  | 'classic_pineapple_cinnamon'
  | 'ginger_lime_lemongrass'
  | 'hibiscus_berry_jamaica'
  | 'passionfruit_turmeric_pepper';

export interface TepacheBottleProduct {
  id: string;
  sku: string;
  name: string;
  flavor: TepacheFlavorType;
  volumeSize: '330ml' | '500ml' | '1000ml Growler';
  tagline: string;
  description: string;
  mrp: number; // ₹ Maximum Retail Price
  b2bWholesalePrice: number; // ₹ Wholesale B2B supply price
  costPerBottle: number; // ₹ Production & Fermentation Cost
  bottleDepositValue: number; // ₹10 refundable glass deposit
  probioticCfu: string; // e.g. "2.5 Billion Live LAB CFU"
  bromelainActivity: string; // "High Natural Proteolytic Enzyme"
  sugarGramsPerServing: number;
  caloriesPerServing: number;
  phRange: string; // "3.4 - 3.7 pH"
  alcoholByVolume: string; // "< 0.5% (Non-Alcoholic Wild Ferment)"
  shelfLifeDays: number; // 45 days cold-stored
  storageTemp: string; // "Keep Chilled (2°C - 6°C)"
  ingredients: string[];
  tastingNotes: string[];
  fssaiLicense: string;
  barcode: string;
  image: string;
  inStockCount: number;
  featured: boolean;
}

export interface TepacheRawMaterial {
  id: string;
  name: string;
  category: 'fruit_botanical' | 'natural_sweetener' | 'spices_herbs' | 'glass_packaging' | 'lab_culture';
  currentStock: number;
  unit: 'kg' | 'units' | 'liters' | 'crates';
  reorderThreshold: number;
  costPerUnit: number;
  vendorName: string;
  vendorPhone: string;
  lotNumber: string;
  expiryOrHarvestDate: string;
  organicCertified: boolean;
  status: 'adequate' | 'low_stock' | 'reorder_placed';
}

export type FermentationTankStage = 
  | 'primary_wild_ferment' 
  | 'secondary_conditioning' 
  | 'cold_crash_4c' 
  | 'bottling_packaging' 
  | 'quality_released';

export interface TepacheBrewBatch {
  id: string;
  batchCode: string; // e.g. "TEP-BATCH-2026-F04"
  tankId: string; // "Tank F-01", "Tank F-02", etc.
  flavor: TepacheFlavorType;
  flavorTitle: string;
  totalLiters: number; // e.g. 400 L
  startDate: string;
  targetHarvestDate: string;
  currentPh: number; // e.g. 3.55
  targetPhMin: number;
  targetPhMax: number;
  currentBrix: number; // e.g. 4.2
  tempCelsius: number; // e.g. 26.8°C
  stage: FermentationTankStage;
  liveCfuCount: string;
  wildCultureSource: string; // "Organic Queen Pineapple Rinds + Native LAB"
  headBrewer: string;
  qcStatus: 'in_fermentation' | 'lab_approved' | 'quarantine' | 'bottled_dispatched';
  expectedYield330ml: number;
  actualBottlesProduced?: number;
  sensoryNotes: string;
}

export interface TepacheB2BClientOrder {
  id: string;
  orderNumber: string; // e.g. "B2B-TEP-2026-081"
  clientName: string; // e.g. "CrossFit Arena Kochi Cafe", "Soul Kitchen Beach Shack"
  clientCategory: 'crossfit_gym' | 'organic_cafe' | 'boutique_hotel' | 'gourmet_retail';
  contactPerson: string;
  contactPhone: string;
  outletLocation: string;
  orderDate: string;
  deliveryDate: string;
  crates12Pack: number;
  totalBottles: number;
  flavorsBreakdown: { flavorName: string; bottles: number }[];
  grossAmount: number;
  wholesaleDiscountPct: number;
  netPayable: number;
  bottleDepositCollected: number;
  paymentTerms: 'advance_paid' | 'net_15_days' | 'net_30_days' | 'cod';
  paymentStatus: 'paid' | 'pending' | 'overdue';
  fulfillmentStatus: 'order_received' | 'cold_packed' | 'out_for_delivery' | 'delivered';
  dispatchChallan: string;
}

export interface TepacheReverseLogisticsRecord {
  id: string;
  logNumber: string; // e.g. "REV-BOTTLE-1042"
  partyName: string;
  partyType: 'b2b_cafe' | 'pos_walkin' | 'direct_customer';
  date: string;
  bottles330mlReturned: number;
  bottles500mlReturned: number;
  totalRefundCredited: number; // ₹10 per sound bottle
  cratesReturned: number;
  condition: 'sterilized_ready' | 'washed_inspection' | 'chipped_recycled';
  inspectorStaff: string;
  status: 'credited' | 'inspected_restocked';
}

export interface RetailCustomerAccount {
  id: string;
  phone: string;
  name: string;
  email: string;
  defaultAddress?: string;
  landmark?: string;
  pincode?: string;
  hubPreference?: string;
  bottleDepositBalance: number; // accumulated ₹10 deposit credit balance
  totalOrdersCount: number;
  orderIds: string[];
  createdAt: string;
}

export interface DirectCartItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  quantity: number;
  weightOrVolume: string;
  storageType: string;
  image?: string;
  isTepacheBottle?: boolean;
}

export interface DirectGuestOrder {
  id: string;
  orderNumber: string; // e.g. "DIR-GUEST-8842"
  orderType: 'packaged_bakery' | 'tepache_drinks' | 'mixed_wellness';
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  deliveryAddress: string;
  landmark?: string;
  pincode: string;
  fulfillmentHub: string; // "Kochi Central Hub", "Trivandrum Beach Hub", etc.
  fulfillmentMode: 'express_home_delivery' | 'hub_counter_pickup';
  deliveryDate: string;
  deliverySlot: 'Morning (8:00 AM - 11:00 AM)' | 'Afternoon (1:00 PM - 4:00 PM)' | 'Evening (5:00 PM - 8:00 PM)' | string;
  items: {
    id: string;
    name: string;
    sku: string;
    category: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    sizeOrWeight: string;
    storageType: string;
  }[];
  subtotal: number;
  deliveryFee: number;
  packagingFee: number;
  gstAmount: number;
  discountAmount: number;
  bottleDepositTotal: number;
  grandTotal: number;
  paymentMode: 'upi_instant' | 'cash_on_delivery' | 'card_online' | 'net_banking';
  paymentStatus: 'paid' | 'pending_cod';
  orderStatus: 'confirmed' | 'packing_in_hub' | 'cold_dispatched' | 'delivered';
  orderNotes?: string;
  coldChainRequired: boolean;
  riderName?: string;
  riderPhone?: string;
  trackingUpdates?: {
    stage: string;
    time: string;
    description: string;
    completed: boolean;
  }[];
  createdAt: string;
}

// ==========================================
// KERALA MESS FOOD SYSTEM & HOSTEL SUBSCRIPTIONS
// ==========================================

export type MessMealSlot = 'breakfast' | 'lunch' | 'dinner';
export type MessDietCategory = 'kerala_veg' | 'kerala_nonveg' | 'kerala_fish' | 'kerala_egg';
export type MessSubscriptionPlanType = 'daily_flex' | 'weekly_7day' | 'monthly_30day';
export type MessMealCoverage = 'all_3_meals' | 'lunch_dinner' | 'breakfast_lunch' | 'only_lunch' | 'only_dinner' | 'only_breakfast';

export interface MessMenuItem {
  id: string;
  name: string;
  malayalamName: string;
  mealSlot: MessMealSlot;
  category: MessDietCategory;
  description: string;
  itemsIncluded: string[];
  price: number;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  isBudgetSpecial?: boolean;
  image: string;
  availableDays: ('Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun')[];
}

export interface MessDaySchedule {
  day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  dayFull: string;
  breakfast: MessMenuItem[];
  lunch: MessMenuItem[];
  dinner: MessMenuItem[];
  specialTreat?: string;
}

export interface MessSubscriptionPlan {
  id: string;
  name: string;
  planType: MessSubscriptionPlanType;
  mealCoverage: MessMealCoverage;
  dietPreference: MessDietCategory;
  basePrice: number;
  discountedPrice: number;
  perMealPrice: number;
  description: string;
  features: string[];
  savingsPercent: number;
  isPopular?: boolean;
  isHostelStudentDiscounted?: boolean;
}

export interface MessCustomerAccount {
  id: string;
  phone: string;
  name: string;
  email: string;
  hostelOrPgName: string;
  roomNumber: string;
  instituteOrWorkplace: string;
  areaLocation: string;
  landmark: string;
  pincode: string;
  activePlan?: MessSubscriptionPlan;
  subscriptionStatus: 'active' | 'paused' | 'expired' | 'none';
  validUntil?: string;
  walletBalance: number;
  remainingMeals: {
    breakfast: number;
    lunch: number;
    dinner: number;
  };
  pausedDates: string[];
  dietaryPreference: MessDietCategory;
  tiffinBoxDeposit: number;
  tiffinContainersHeld: number;
  orderHistoryIds: string[];
  preferredSlotTimes: {
    breakfast: string;
    lunch: string;
    dinner: string;
  };
}

export interface MessDailyOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  hostelOrPgName: string;
  roomNumber: string;
  landmark: string;
  pincode: string;
  date: string;
  mealSlot: MessMealSlot;
  dishName: string;
  itemsIncluded: string[];
  dietCategory: MessDietCategory;
  quantity: number;
  amount: number;
  paymentMode: 'monthly_subscription_pass' | 'student_wallet' | 'upi_instant' | 'cash_at_gate';
  paymentStatus: 'paid' | 'pending_cod';
  orderStatus: 'placed' | 'kds_batch_queued' | 'cooking_in_batch' | 'packed_in_crate' | 'out_for_hostel_drop' | 'delivered' | 'paused_refunded';
  deliveryRiderName?: string;
  deliveryRiderPhone?: string;
  hostelGatePassCode?: string;
  deliveryEstimatedTime?: string;
  dietaryNote?: string;
  trackingSteps: {
    stage: string;
    time: string;
    description: string;
    completed: boolean;
  }[];
  createdAt: string;
}

export interface MessKitchenBatchSummary {
  id: string;
  mealSlot: MessMealSlot;
  dishName: string;
  malayalamName: string;
  category: MessDietCategory;
  totalPortionsRequired: number;
  messSubscriberPortions: number;
  dailyDirectPortions: number;
  swiggyZomatoReservedPortions: number;
  preparedCount: number;
  vesselScale: string;
  status: 'pending' | 'cooking' | 'ready_for_packing' | 'dispatched';
  cookStartTime?: string;
  leadChef: string;
  temperatureCheckCelsius?: number;
}

export interface AggregatorReservedInventory {
  id: string;
  dishName: string;
  malayalamName: string;
  mealSlot: MessMealSlot;
  category: MessDietCategory;
  totalCookedPortions: number;
  reservedForMess: number;
  reservedForSwiggyZomato: number;
  swiggyLiveStock: number;
  zomatoLiveStock: number;
  swiggyPrice: number;
  zomatoPrice: number;
  messPrice: number;
  channelStatus: 'live' | 'low_buffer' | 'sold_out' | 'paused';
  swiggyActive: boolean;
  zomatoActive: boolean;
}

export interface AggregatorLiveOrder {
  id: string;
  orderNumber: string;
  platform: 'swiggy' | 'zomato';
  customerName: string;
  customerArea: string;
  items: {
    name: string;
    quantity: number;
    price: number;
  }[];
  subtotal: number;
  platformCommission: number;
  netPayout: number;
  status: 'order_received' | 'kitchen_preparing' | 'ready_for_pickup' | 'rider_picked_up' | 'delivered';
  riderName: string;
  riderPhone: string;
  pickupOtp: string;
  placedTime: string;
  estimatedPickupTime: string;
}





