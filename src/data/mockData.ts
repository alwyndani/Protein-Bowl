import { RecipeItem, CustomerProfile, DietPlanRequest, Order, InventoryItem, ProductionBatch, ComboOffer } from '../types';
import { ALL_RECIPES } from './recipeDatabase';

export const INITIAL_RECIPES: RecipeItem[] = ALL_RECIPES;

export const INITIAL_COMBO_OFFERS: ComboOffer[] = [
  {
    id: 'c-1',
    title: '30-Day Ultimate Transformation Plan',
    subtitle: 'Complete 3 meals + protein snack/dessert per day with dietician check-ins',
    discountPct: 20,
    durationDays: 30,
    planType: 'complete',
    price: 14999,
    popularTag: 'Most Popular'
  },
  {
    id: 'c-2',
    title: '20-Day Office Power Lunch & Dinner Combo',
    subtitle: '2 high-protein macro-balanced meals delivered daily to home or office',
    discountPct: 15,
    durationDays: 20,
    planType: '2meal',
    price: 9999,
    popularTag: 'Best Value'
  },
  {
    id: 'c-3',
    title: '15-Day Fat Loss Jumpstart',
    subtitle: 'Focused caloric deficit meal plan designed for steady sustainable weight loss',
    discountPct: 10,
    durationDays: 15,
    planType: '1meal',
    price: 4499
  }
];

export const INITIAL_CUSTOMER_PROFILE: CustomerProfile = {
  id: 'cust-101',
  name: 'Anjali Ramesh',
  email: 'anjali@example.com',
  phone: '+91 98765 43210',
  dob: '1995-04-18',
  age: 29,
  gender: 'female',

  // Initial & Target Measurements
  heightCm: 165,
  weightKg: 68,
  targetWeightKg: 58,
  occupation: 'IT Professional',
  workSchedule: 'Flexible Hours',
  sleepDuration: 7,
  wakeUpTime: '06:30',
  bedTime: '23:00',

  // Tracking & Circumferences
  muscleMassKg: 24.5,
  circumferences: {
    waistCm: 81,
    hipCm: 98,
    chestCm: 88,
    neckCm: 34
  },
  limbCircumferences: {
    leftArmCm: 28,
    rightArmCm: 28.5,
    leftThighCm: 56,
    rightThighCm: 56.5,
    leftCalfCm: 36,
    rightCalfCm: 36
  },

  // Goals & Activity
  goal: 'weight_loss',
  primaryGoals: ['Weight Loss', 'Fat Loss', 'Improve Gut Health', 'Improve Energy Levels'],
  activityLevel: 'moderate',

  // Exercise Details
  hasExercise: true,
  workoutTypes: ['Strength Training', 'Yoga', 'Walking'],
  workoutFrequency: '3–4 Days',
  workoutDuration: 45,
  dailyStepCount: 8500,
  cardioSessions: 2,
  strengthSessions: 3,

  // Clinical & Medical
  medicalConditions: ['PCOS'],
  currentMedications: 'Metformin 500mg once daily',
  supplements: ['Multivitamin', 'Vitamin D', 'Omega-3', 'Inositol'],
  bloodTestResults: {
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
  },

  // Food & Allergies
  foodPreference: 'Non-Vegetarian',
  allergies: ['Peanuts'],
  foodDislikes: ['Mushroom', 'Bitter Gourd'],

  // Meal Structure
  mealsPerDay: 3,
  mealTimings: {
    breakfast: '08:30',
    morningSnack: '11:00',
    lunch: '13:30',
    eveningSnack: '16:30',
    dinner: '20:00',
    bedtimeSnack: '22:00'
  },
  waterIntakeL: 3.0,

  // Lifestyle
  digestiveHealth: ['Good'],
  smoking: 'Never',
  alcohol: 'Monthly',
  tobacco: 'Never',
  stressLevel: 4,
  sleepQuality: 'Good',

  // Women-Only Fields
  isPregnant: false,
  isBreastfeeding: false,
  menstrualCycle: 'Irregular',
  isMenopause: false,

  // Plan Selection
  planDurationDays: 30,
  planFrequency: 3,
  addonSlots: ['11:00 AM Snack/Salad'],

  // Auto-Calculated Fields
  bmi: 25.0,
  bmiCategory: 'Overweight',
  bmr: 1420,
  tdee: 2200,
  maintenanceCalories: 2200,
  targetCalories: 1700,
  macroTargets: {
    proteinGrams: 125,
    carbsGrams: 150,
    fatGrams: 45,
    fiberGrams: 30
  },
  waterRequirementL: 2.88,
  idealBodyWeightKg: 56.8,
  leanBodyMassKg: 49.5,
  calorieDeficitSurplus: -500
};

export const INITIAL_DIET_PLAN_REQUESTS: DietPlanRequest[] = [
  {
    id: 'req-201',
    customerId: 'cust-101',
    customerName: 'Anjali Ramesh',
    customerEmail: 'anjali@example.com',
    customerPhone: '+91 98765 43210',
    bmi: 25.0,
    goal: 'weight_loss',
    targetCalories: 1700,
    planType: 'complete',
    durationDays: 30,
    preferredCategories: ['Choice of Chicken – Air Fried', 'Choice of Salads – Non-Veg', 'Kerala Breakfast', 'Choice of Quinoa'],
    dietaryPreference: 'non-veg',
    cuisinePreference: 'Kerala Traditional',
    grainPreference: 'Kerala Matta Rice',
    spiceLevel: 'Medium',
    allergiesExclusions: 'Peanut allergy, PCOS sensitive, no mushrooms',
    status: 'plan_ready',
    createdAt: '2026-07-22',
    calculatedPrice: 14999,
    dieticianNotes: 'Customized for PCOS with low glycemic index Kerala Matta Rice, high protein chicken & avocado, and anti-inflammatory spices.',
    dayWisePlan: [
      {
        dayNumber: 1,
        totalCalories: 1680,
        totalProtein: 128,
        totalCarbs: 145,
        totalFat: 44,
        meals: [
          { mealType: 'breakfast', recipeId: 'eg-3', recipeName: 'Spinach and Feta Omelette', customPortionGrams: 180 },
          { mealType: 'lunch', recipeId: 'kl-2', recipeName: 'Kerala Matta Rice (Rosematta Red Rice)', customPortionGrams: 150 },
          { mealType: 'lunch', recipeId: 'cg-1', recipeName: 'Lemon Garlic Chicken Grill', customPortionGrams: 150 },
          { mealType: 'lunch', recipeId: 'kl-3', recipeName: 'Classic Kerala Thoran', customPortionGrams: 100 },
          { mealType: 'snack', recipeId: 'yo-12', recipeName: 'Mocha Protein Yogurt Bowl', customPortionGrams: 180 },
          { mealType: 'dinner', recipeId: 'sl-6', recipeName: 'High Protein Avocado Chicken Salad', customPortionGrams: 220 }
        ]
      },
      {
        dayNumber: 2,
        totalCalories: 1710,
        totalProtein: 130,
        totalCarbs: 148,
        totalFat: 42,
        meals: [
          { mealType: 'breakfast', recipeId: 'ob-1', recipeName: 'Biscoff Overnight Oats', customPortionGrams: 200 },
          { mealType: 'lunch', recipeId: 'qb-1', recipeName: 'Lemon Herb Grilled Chicken Quinoa Bowl', customPortionGrams: 250 },
          { mealType: 'snack', recipeId: 'ds-10', recipeName: 'Ferrero Rocher Protein Truffles', customPortionGrams: 60 },
          { mealType: 'dinner', recipeId: 'cg-1', recipeName: 'Lemon Garlic Chicken Grill with Greens', customPortionGrams: 350 }
        ]
      }
    ]
  },
  {
    id: 'req-202',
    kitchenBranchId: 'trivandrum',
    branchName: 'Trivandrum Cloud Kitchen',
    customerId: 'cust-102',
    customerName: 'Rahul Verma',
    customerEmail: 'rahul.v@gmail.com',
    customerPhone: '+91 91234 56789',
    bmi: 21.8,
    goal: 'muscle_gain',
    targetCalories: 2600,
    planType: 'complete',
    durationDays: 20,
    preferredCategories: ['Choice of Chicken – Air Fried', 'Choice of Quinoa', 'Yogurt Bowls', 'Dinner Bowls'],
    dietaryPreference: 'non-veg',
    cuisinePreference: 'Continental',
    grainPreference: 'Basmati Rice',
    spiceLevel: 'Medium',
    allergiesExclusions: 'None',
    status: 'pending_review',
    createdAt: '2026-07-23'
  },
  {
    id: 'req-203',
    kitchenBranchId: 'kozhikode',
    branchName: 'Kozhikode Cloud Kitchen',
    customerId: 'cust-103',
    customerName: 'Shabana K.',
    customerEmail: 'shabana.k@gmail.com',
    customerPhone: '+91 94960 33412',
    bmi: 27.4,
    goal: 'weight_loss',
    targetCalories: 1600,
    planType: '2meal',
    durationDays: 30,
    preferredCategories: ['Salads', 'Choice of Chicken – Air Fried', 'Desserts, Snacks & Bites'],
    dietaryPreference: 'non-veg',
    cuisinePreference: 'Malabar & Mediterranean Fusion',
    grainPreference: 'Quinoa',
    spiceLevel: 'Medium',
    allergiesExclusions: 'Lactose intolerance (almond milk only)',
    status: 'under_review',
    createdAt: '2026-08-12'
  }
];

export const INITIAL_ORDERS: Order[] = [
  {
    id: 'PB-ORD-8821',
    kitchenBranchId: 'kochi',
    branchName: 'Kochi Central Headquarters',
    customerId: 'cust-101',
    customerName: 'Anjali Ramesh',
    planId: 'req-201',
    planTitle: '30-Day PCOS Weight Loss Plan',
    planType: 'complete',
    durationDays: 30,
    startDate: '2026-07-25',
    deliveryAddress: {
      street: 'Flat 402, Green Valley Heights, Panampilly Nagar',
      city: 'Kochi, Kerala',
      pincode: '682036',
      landmark: 'Near Avenue Center'
    },
    deliverySlot: '12:00 PM - 1:30 PM',
    paymentStatus: 'paid',
    orderStatus: 'in_production',
    totalAmount: 14999,
    fssaiLicense: 'FSSAI-KOC-11322004000452',
    batchNumber: 'PB-BATCH-KOC-01',
    createdAt: '2026-07-24'
  },
  {
    id: 'PB-ORD-8822',
    kitchenBranchId: 'trivandrum',
    branchName: 'Trivandrum Cloud Kitchen',
    customerId: 'cust-102',
    customerName: 'Arun V. Pillai',
    planId: 'req-202',
    planTitle: '20-Day Technopark High-Protein Muscle Plan',
    planType: 'complete',
    durationDays: 20,
    startDate: '2026-08-10',
    deliveryAddress: {
      street: 'Tower 4, Infosys Campus, Kazhakkoottam',
      city: 'Trivandrum, Kerala',
      pincode: '695581',
      landmark: 'Gate 2 Delivery Bay'
    },
    deliverySlot: '12:00 PM - 1:30 PM',
    paymentStatus: 'paid',
    orderStatus: 'in_production',
    totalAmount: 11999,
    fssaiLicense: 'FSSAI-TVM-11322004000189',
    batchNumber: 'PB-BATCH-TVM-01',
    createdAt: '2026-08-09'
  },
  {
    id: 'PB-ORD-8823',
    kitchenBranchId: 'kozhikode',
    branchName: 'Kozhikode Cloud Kitchen',
    customerId: 'cust-103',
    customerName: 'Dr. Nikhil K. Menon',
    planId: 'req-203',
    planTitle: '30-Day Executive Clean Eating Plan',
    planType: '2meal',
    durationDays: 30,
    startDate: '2026-08-12',
    deliveryAddress: {
      street: 'Doctors Quarters, Medical College Campus',
      city: 'Kozhikode, Kerala',
      pincode: '673008',
      landmark: 'Near Super Speciality Wing'
    },
    deliverySlot: '7:00 PM - 8:30 PM',
    paymentStatus: 'paid',
    orderStatus: 'in_production',
    totalAmount: 13499,
    fssaiLicense: 'FSSAI-CLT-11322004000881',
    batchNumber: 'PB-BATCH-CLT-01',
    createdAt: '2026-08-11'
  }
];

export const INITIAL_INVENTORY: InventoryItem[] = [
  {
    id: 'inv-1',
    name: 'Fresh Boneless Chicken Breast',
    category: 'Proteins',
    currentStock: 45,
    unit: 'kg',
    minThreshold: 15,
    reorderQty: 50,
    unitCost: 280,
    lastRestocked: '2026-07-23',
    supplier: 'Kochi Fresh Meats Co.'
  },
  {
    id: 'inv-2',
    name: 'Organic Kerala Matta Rice',
    category: 'Grains & Flours',
    currentStock: 80,
    unit: 'kg',
    minThreshold: 20,
    reorderQty: 100,
    unitCost: 65,
    lastRestocked: '2026-07-20',
    supplier: 'Palakkad Farmer Producer Group'
  },
  {
    id: 'inv-3',
    name: 'Organic Basmati Rice',
    category: 'Grains & Flours',
    currentStock: 60,
    unit: 'kg',
    minThreshold: 15,
    reorderQty: 50,
    unitCost: 110,
    lastRestocked: '2026-07-21',
    supplier: 'Royal Grain Distributors'
  },
  {
    id: 'inv-4',
    name: 'Hass Avocados',
    category: 'Vegetables',
    currentStock: 8,
    unit: 'kg',
    minThreshold: 10,
    reorderQty: 25,
    unitCost: 350,
    lastRestocked: '2026-07-22',
    supplier: 'Nilgiri Produce Co.'
  },
  {
    id: 'inv-5',
    name: 'Low Fat Cottage Cheese / Paneer',
    category: 'Dairy',
    currentStock: 18,
    unit: 'kg',
    minThreshold: 8,
    reorderQty: 30,
    unitCost: 240,
    lastRestocked: '2026-07-23',
    supplier: 'Milma Dairy'
  },
  {
    id: 'inv-6',
    name: 'Hung Greek Yogurt',
    category: 'Dairy',
    currentStock: 25,
    unit: 'kg',
    minThreshold: 10,
    reorderQty: 40,
    unitCost: 180,
    lastRestocked: '2026-07-23',
    supplier: 'Milma Dairy'
  },
  {
    id: 'inv-7',
    name: 'Eco Meal Bowls & Containers',
    category: 'Packaging',
    currentStock: 450,
    unit: 'units',
    minThreshold: 200,
    reorderQty: 1000,
    unitCost: 12,
    lastRestocked: '2026-07-18',
    supplier: 'GreenPack Eco Solutions'
  }
];

export const INITIAL_PRODUCTION_BATCHES: ProductionBatch[] = [
  {
    id: 'pb-101',
    date: '2026-07-24',
    timeSlot: 'Lunch Slot (12:00 PM)',
    recipeId: 'cg-1',
    recipeName: 'Lemon Garlic Chicken Grill',
    totalPortions: 38,
    status: 'in_prep',
    chefAssigned: 'Chef Suresh Kumar',
    qualityPassed: true
  },
  {
    id: 'pb-102',
    date: '2026-07-24',
    timeSlot: 'Lunch Slot (12:00 PM)',
    recipeId: 'kl-2',
    recipeName: 'Kerala Matta Rice (Rosematta Red Rice)',
    totalPortions: 42,
    status: 'cooking',
    chefAssigned: 'Chef Biju Nair',
    qualityPassed: true
  },
  {
    id: 'pb-103',
    date: '2026-07-24',
    timeSlot: 'Lunch Slot (12:00 PM)',
    recipeId: 'kl-3',
    recipeName: 'Classic Kerala Thoran',
    totalPortions: 35,
    status: 'quality_check',
    chefAssigned: 'Chef Biju Nair',
    qualitySignoffBy: 'Head Chef Suresh',
    qualityPassed: true
  }
];
