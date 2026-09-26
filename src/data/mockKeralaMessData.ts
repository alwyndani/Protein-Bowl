import { 
  MessMenuItem, 
  MessDaySchedule, 
  MessSubscriptionPlan, 
  MessCustomerAccount, 
  MessDailyOrder, 
  MessKitchenBatchSummary, 
  AggregatorReservedInventory, 
  AggregatorLiveOrder 
} from '../types';

// ============================================================================
// 1. KERALA MESS WEEKLY REPERTOIRE (BREAKFAST, LUNCH, DINNER)
// ============================================================================

export const KERALA_MESS_MENU_ITEMS: MessMenuItem[] = [
  // --- BREAKFAST DISHES ---
  {
    id: 'mess-bf-01',
    name: 'Steamed Podi Puttu with Nadan Kadala Curry & Pappadam',
    malayalamName: 'പുട്ടും കടലക്കറിയും പപ്പടവും',
    mealSlot: 'breakfast',
    category: 'kerala_veg',
    description: 'Freshly steamed roasted rice puttu layered with fresh coconut shavings, served with slow-cooked spiced black chana curry and crunchy mini pappadam.',
    itemsIncluded: ['2 Cylinders Steamed Puttu', '1 Bowl Nadan Kadala Curry (180ml)', '1 Kerala Pappadam', 'Fresh Coconut Chutney'],
    price: 45,
    calories: 380,
    proteinGrams: 14,
    carbsGrams: 64,
    fatGrams: 7,
    isBudgetSpecial: true,
    image: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80',
    availableDays: ['Mon', 'Wed', 'Fri', 'Sun']
  },
  {
    id: 'mess-bf-02',
    name: 'Soft Palappam (3 pcs) with Creamy Veg / Egg Stew',
    malayalamName: 'പാലപ്പവും വെജ് / മുട്ട സ്റ്റൂവും',
    mealSlot: 'breakfast',
    category: 'kerala_egg',
    description: 'Fluffy lace-bordered fermented rice hoppers with soft spongy center, paired with mild coconut milk vegetable & egg potato stew.',
    itemsIncluded: ['3 Pcs Soft Palappam', '1 Bowl Kerala Stew (180ml)', '1 Boiled Egg / Veg potato cubes'],
    price: 50,
    calories: 360,
    proteinGrams: 12,
    carbsGrams: 58,
    fatGrams: 9,
    isBudgetSpecial: true,
    image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80',
    availableDays: ['Tue', 'Thu', 'Sat']
  },
  {
    id: 'mess-bf-03',
    name: 'Nool Puttu (Idiyappam 4 pcs) with Spicy Egg Roast',
    malayalamName: 'ഇടിയപ്പവും നാടൻ മുട്ട റോസ്റ്റും',
    mealSlot: 'breakfast',
    category: 'kerala_egg',
    description: 'Fresh steamed string hoppers served with onion-tomato roasted egg gravy and aromatic curry leaves.',
    itemsIncluded: ['4 Pcs Idiyappam', '1 Portion Nadan Egg Roast (1 Egg)', 'Thick Onion Gravy'],
    price: 50,
    calories: 370,
    proteinGrams: 13,
    carbsGrams: 56,
    fatGrams: 10,
    isBudgetSpecial: true,
    image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80',
    availableDays: ['Mon', 'Thu', 'Sun']
  },
  {
    id: 'mess-bf-04',
    name: 'Crispy Kerala Thatte Dosa (3 pcs) with Sambar & Red Chammanthi',
    malayalamName: 'തട്ടുകട ദോശയും സാമ്പാറും ചമ്മന്തിയും',
    mealSlot: 'breakfast',
    category: 'kerala_veg',
    description: 'Thattukada style soft & spongy rice-urad dosas served with hot vegetable lentil sambar and shallot roasted red chilly coconut chutney.',
    itemsIncluded: ['3 Pcs Soft Thatte Dosa', '1 Bowl Drumstick Sambar (150ml)', 'Spicy Red Thenga Chammanthi'],
    price: 40,
    calories: 340,
    proteinGrams: 9,
    carbsGrams: 62,
    fatGrams: 6,
    isBudgetSpecial: true,
    image: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=600&q=80',
    availableDays: ['Tue', 'Wed', 'Fri', 'Sat']
  },
  {
    id: 'mess-bf-05',
    name: 'Kerala Roasted Rava Upma with Kadala Curry & Small Nadan Banana',
    malayalamName: 'ഉപ്പുമാവും ചെറുപഴവും കടലക്കറിയും',
    mealSlot: 'breakfast',
    category: 'kerala_veg',
    description: 'Classic tempered semolina upma seasoned with mustard, ginger, green chillies, served with kadala curry and a ripe Palayamkodan banana.',
    itemsIncluded: ['1 Cup Tempered Rava Upma (200g)', '1 Small Kadala Curry Cup', '1 Ripe Nadan Banana'],
    price: 35,
    calories: 320,
    proteinGrams: 8,
    carbsGrams: 60,
    fatGrams: 5,
    isBudgetSpecial: true,
    image: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80',
    availableDays: ['Mon', 'Wed', 'Sat']
  },

  // --- LUNCH DISHES ---
  {
    id: 'mess-ln-01',
    name: 'Standard Kerala Matta Rice Meals (Full Oonu with 5 Sides)',
    malayalamName: 'കേരള നാടൻ ഊണ് (മട്ട ചോറും 5 കൂട്ടം കറികളും)',
    mealSlot: 'lunch',
    category: 'kerala_veg',
    description: 'Wholesome student budget lunch featuring hot Kerala Matta red rice or white Ponni rice, roasted coconut Sambar, Moru Curry / Pulissery, Cabbage Cherupayar Thoran, Aviyal, Lemon Pickle & crispy Pappadam.',
    itemsIncluded: [
      'Hot Kerala Matta Rice (Unlimited / 350g)',
      'Thick Nadan Sambar (150ml)',
      'Seasoned Moru Curry / Buttermilk Kalan (100ml)',
      'Vegetable Aviyal with Coconut Paste',
      'Cabbage & Green Gram Thoran',
      'Kerala Naranga Pickle & 1 Big Pappadam'
    ],
    price: 60,
    calories: 540,
    proteinGrams: 16,
    carbsGrams: 98,
    fatGrams: 9,
    isBudgetSpecial: true,
    image: 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?auto=format&fit=crop&w=600&q=80',
    availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  },
  {
    id: 'mess-ln-02',
    name: 'Kerala Meals with Fresh Nadan Fish Curry / Ayala Fry',
    malayalamName: 'കേരള മീൻ ഊണ് (അയല വറുത്തത് / മീൻ കറി)',
    mealSlot: 'lunch',
    category: 'kerala_fish',
    description: 'Full Kerala Meals with spicy claypot Kudampuli Fish Curry and 1 crispy Tawa Fried Mackerel (Ayala / Mathi) fish.',
    itemsIncluded: [
      'Kerala Matta Rice',
      'Kudampuli Fish Curry (Meen Mulakittathu)',
      '1 Pc Crispy Tawa Fried Ayala / Mathi',
      'Thoran of the Day',
      'Moru Curry & Pickle',
      '1 Kerala Pappadam'
    ],
    price: 85,
    calories: 620,
    proteinGrams: 34,
    carbsGrams: 85,
    fatGrams: 15,
    isBudgetSpecial: true,
    image: 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=600&q=80',
    availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  },
  {
    id: 'mess-ln-03',
    name: 'Kerala Meals with Tender Nadan Chicken Curry / Roast',
    malayalamName: 'കേരള ചിക്കൻ ഊണ് (നാടൻ കോഴിക്കറി)',
    mealSlot: 'lunch',
    category: 'kerala_nonveg',
    description: 'Steaming Kerala rice meals accompanied by homestyle chicken curry cooked with roasted shallots, fennel seeds, and coconut slices.',
    itemsIncluded: [
      'Kerala Matta Rice (350g)',
      'Nadan Chicken Curry (2 large chicken pieces + rich gravy)',
      'Vegetable Thoran',
      'Sambar or Moru Curry',
      'Pickle & Pappadam'
    ],
    price: 95,
    calories: 670,
    proteinGrams: 38,
    carbsGrams: 84,
    fatGrams: 18,
    isBudgetSpecial: true,
    image: 'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?auto=format&fit=crop&w=600&q=80',
    availableDays: ['Mon', 'Wed', 'Fri', 'Sun']
  },
  {
    id: 'mess-ln-04',
    name: 'Kerala Egg Biryani with Onion Raita, Pickle & Pappadam',
    malayalamName: 'കേരള എഗ്ഗ് ബിരിയാണി',
    mealSlot: 'lunch',
    category: 'kerala_egg',
    description: 'Fragrant Kaima/Jeerakasala rice layered with ghee-roasted whole spices, caramelised onions, 2 roasted eggs, and mint-coriander masala.',
    itemsIncluded: [
      'Kaima Rice Dum Biryani (350g)',
      '2 Spiced Roasted Eggs',
      'Fresh Onion Mint Raita (100ml)',
      'Dates-Lemon Sweet Chutney / Pickle',
      '1 Mini Pappadam'
    ],
    price: 75,
    calories: 590,
    proteinGrams: 22,
    carbsGrams: 82,
    fatGrams: 17,
    isBudgetSpecial: true,
    image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80',
    availableDays: ['Tue', 'Thu', 'Sat']
  },
  {
    id: 'mess-ln-05',
    name: 'Thalassery Chicken Dum Biryani Student Box',
    malayalamName: 'തലശ്ശേരി ചിക്കൻ ദം ബിരിയാണി',
    mealSlot: 'lunch',
    category: 'kerala_nonveg',
    description: 'Authentic Malabar style short-grain Kaima rice dum-cooked with tender marinated chicken, fried cashew nuts, kismis, and pure ghee aroma.',
    itemsIncluded: [
      'Thalassery Kaima Dum Biryani (400g)',
      '2 Big Succulent Chicken Pieces',
      'Thick Curd Onion Raita',
      'Nadan Lime Pickle',
      'Small Sweet Sulaimani or Payasam shot'
    ],
    price: 110,
    calories: 720,
    proteinGrams: 42,
    carbsGrams: 88,
    fatGrams: 21,
    isBudgetSpecial: false,
    image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80',
    availableDays: ['Wed', 'Sun']
  },

  // --- DINNER DISHES ---
  {
    id: 'mess-dn-01',
    name: '100% Whole Wheat Chappathi (3 pcs) with Rich Veg Kurma',
    malayalamName: 'ചപ്പാത്തിയും വെജ് കുറുമയും',
    mealSlot: 'dinner',
    category: 'kerala_veg',
    description: 'Soft tawa-puffed whole wheat chappathis served with mildly spiced mixed vegetable kurma in cashew-coconut gravy.',
    itemsIncluded: ['3 Pcs Soft Wheat Chappathi', '1 Bowl Kerala Veg Kurma (180ml)', 'Green Salad Slices (Cucumber & Carrot)'],
    price: 45,
    calories: 360,
    proteinGrams: 11,
    carbsGrams: 62,
    fatGrams: 7,
    isBudgetSpecial: true,
    image: 'https://images.unsplash.com/photo-1505253758473-96b3015f21c9?auto=format&fit=crop&w=600&q=80',
    availableDays: ['Mon', 'Wed', 'Fri', 'Sat']
  },
  {
    id: 'mess-dn-02',
    name: 'Whole Wheat Chappathi (3 pcs) with Nadan Chicken Curry',
    malayalamName: 'ചപ്പാത്തിയും കോഴിക്കറിയും',
    mealSlot: 'dinner',
    category: 'kerala_nonveg',
    description: 'Homestyle evening dinner with soft whole wheat flatbreads paired with succulent chicken in thick Kerala roasted spice gravy.',
    itemsIncluded: ['3 Pcs Wheat Chappathi', '1 Bowl Nadan Chicken Curry (2 Pcs Chicken)', 'Onion rings & Lemon'],
    price: 75,
    calories: 460,
    proteinGrams: 32,
    carbsGrams: 58,
    fatGrams: 12,
    isBudgetSpecial: true,
    image: 'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?auto=format&fit=crop&w=600&q=80',
    availableDays: ['Tue', 'Thu', 'Sun']
  },
  {
    id: 'mess-dn-03',
    name: 'Kerala Malabar Parotta (2 pcs) with Spicy Egg Roast / Veg Kurma',
    malayalamName: 'പൊറോട്ടയും മുട്ട റോസ്റ്റും',
    mealSlot: 'dinner',
    category: 'kerala_egg',
    description: 'Crispy layered soft Malabar parotta served with roasted onion-tomato egg masala gravy.',
    itemsIncluded: ['2 Pcs Layered Parotta', '1 Portion Nadan Egg Roast (1 Egg + rich gravy)', 'Sliced Onions'],
    price: 55,
    calories: 490,
    proteinGrams: 15,
    carbsGrams: 66,
    fatGrams: 19,
    isBudgetSpecial: true,
    image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80',
    availableDays: ['Mon', 'Thu', 'Sat']
  },
  {
    id: 'mess-dn-04',
    name: 'Comfort Rice Kanji with Cherupayar Thoran, Thenga Chammanthi & Pickle',
    malayalamName: 'നാടൻ കഞ്ഞിയും ചെറുപയറും ചമ്മന്തിയും പപ്പടവും',
    mealSlot: 'dinner',
    category: 'kerala_veg',
    description: 'The ultimate hostel comfort dinner: warm, soothing Kerala Matta rice kanji (porridge) with seasoned green gram thoran, roasted coconut chammanthi, pickle, and crisp pappadam.',
    itemsIncluded: [
      '1 Big Bowl Warm Matta Rice Kanji (400ml)',
      'Cherupayar (Green Gram) Coconut Thoran',
      'Spicy Roasted Coconut Chammanthi',
      'Nadan Mango/Lime Pickle',
      '1 Roasted Kerala Pappadam'
    ],
    price: 40,
    calories: 310,
    proteinGrams: 12,
    carbsGrams: 58,
    fatGrams: 4,
    isBudgetSpecial: true,
    image: 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?auto=format&fit=crop&w=600&q=80',
    availableDays: ['Tue', 'Fri', 'Sun']
  },
  {
    id: 'mess-dn-05',
    name: 'Nool Puttu (Idiyappam 4 pcs) with Nadan Chicken Curry / Egg Masala',
    malayalamName: 'ഇടിയപ്പവും ചിക്കൻ കറിയും',
    mealSlot: 'dinner',
    category: 'kerala_nonveg',
    description: 'Light steamed rice string noodles paired with fragrant roasted coconut pepper chicken gravy for an easy-digesting night meal.',
    itemsIncluded: ['4 Pcs Steamed Idiyappam', '1 Bowl Homestyle Chicken Curry', 'Curry leaf garnish'],
    price: 70,
    calories: 430,
    proteinGrams: 28,
    carbsGrams: 54,
    fatGrams: 11,
    isBudgetSpecial: true,
    image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80',
    availableDays: ['Wed', 'Sat']
  }
];

// ============================================================================
// 2. DAY-WISE ROTATING WEEKLY MESS SCHEDULE
// ============================================================================

export const KERALA_WEEKLY_MESS_SCHEDULE: MessDaySchedule[] = [
  {
    day: 'Mon',
    dayFull: 'Monday (തിങ്കൾ)',
    breakfast: [KERALA_MESS_MENU_ITEMS[0], KERALA_MESS_MENU_ITEMS[2]], // Puttu & Kadala / Idiyappam
    lunch: [KERALA_MESS_MENU_ITEMS[5], KERALA_MESS_MENU_ITEMS[6], KERALA_MESS_MENU_ITEMS[7]], // Veg Meals / Fish Meals / Chicken Meals
    dinner: [KERALA_MESS_MENU_ITEMS[10], KERALA_MESS_MENU_ITEMS[12]], // Chappathi Kurma / Parotta Egg
    specialTreat: '🍌 Monday Sweet: Fresh Kerala Banana with Breakfast'
  },
  {
    day: 'Tue',
    dayFull: 'Tuesday (ചൊവ്വ)',
    breakfast: [KERALA_MESS_MENU_ITEMS[1], KERALA_MESS_MENU_ITEMS[3]], // Palappam Stew / Thatte Dosa
    lunch: [KERALA_MESS_MENU_ITEMS[5], KERALA_MESS_MENU_ITEMS[6], KERALA_MESS_MENU_ITEMS[8]], // Veg Meals / Fish Meals / Egg Biryani
    dinner: [KERALA_MESS_MENU_ITEMS[11], KERALA_MESS_MENU_ITEMS[13]], // Chappathi Chicken / Nadan Kanji
    specialTreat: '🥥 Tuesday Special: Parippu Vada snack with evening tea'
  },
  {
    day: 'Wed',
    dayFull: 'Wednesday (ബുധൻ)',
    breakfast: [KERALA_MESS_MENU_ITEMS[0], KERALA_MESS_MENU_ITEMS[3]], // Puttu / Thatte Dosa
    lunch: [KERALA_MESS_MENU_ITEMS[5], KERALA_MESS_MENU_ITEMS[7], KERALA_MESS_MENU_ITEMS[9]], // Veg Meals / Chicken Meals / Thalassery Biryani
    dinner: [KERALA_MESS_MENU_ITEMS[10], KERALA_MESS_MENU_ITEMS[14]], // Chappathi Kurma / Idiyappam Chicken
    specialTreat: '🍗 Wednesday Feast: Thalassery Dum Biryani Special at Lunch'
  },
  {
    day: 'Thu',
    dayFull: 'Thursday (വ്യാഴം)',
    breakfast: [KERALA_MESS_MENU_ITEMS[1], KERALA_MESS_MENU_ITEMS[2]], // Palappam / Idiyappam
    lunch: [KERALA_MESS_MENU_ITEMS[5], KERALA_MESS_MENU_ITEMS[6], KERALA_MESS_MENU_ITEMS[8]], // Veg Meals / Fish Meals / Egg Biryani
    dinner: [KERALA_MESS_MENU_ITEMS[11], KERALA_MESS_MENU_ITEMS[12]], // Chappathi Chicken / Parotta Egg
    specialTreat: '🍛 Thursday Special: Mathan Erissery with Matta Rice'
  },
  {
    day: 'Fri',
    dayFull: 'Friday (വെള്ളി)',
    breakfast: [KERALA_MESS_MENU_ITEMS[0], KERALA_MESS_MENU_ITEMS[3]], // Puttu / Thatte Dosa
    lunch: [KERALA_MESS_MENU_ITEMS[5], KERALA_MESS_MENU_ITEMS[6], KERALA_MESS_MENU_ITEMS[7]], // Veg Meals / Fish Fry Meals / Chicken Meals
    dinner: [KERALA_MESS_MENU_ITEMS[10], KERALA_MESS_MENU_ITEMS[13]], // Chappathi Kurma / Nadan Kanji Payar
    specialTreat: '🐟 Friday Catch: Special Crispy Ayala Fry with Lunch Meals'
  },
  {
    day: 'Sat',
    dayFull: 'Saturday (ശനി)',
    breakfast: [KERALA_MESS_MENU_ITEMS[1], KERALA_MESS_MENU_ITEMS[4]], // Palappam / Rava Upma
    lunch: [KERALA_MESS_MENU_ITEMS[5], KERALA_MESS_MENU_ITEMS[6], KERALA_MESS_MENU_ITEMS[8]], // Veg Meals / Fish Meals / Egg Biryani
    dinner: [KERALA_MESS_MENU_ITEMS[10], KERALA_MESS_MENU_ITEMS[12]], // Chappathi / Parotta
    specialTreat: '🥗 Saturday Special: Mixed Sprouts Salad & Curd Moru'
  },
  {
    day: 'Sun',
    dayFull: 'Sunday (ഞായർ)',
    breakfast: [KERALA_MESS_MENU_ITEMS[0], KERALA_MESS_MENU_ITEMS[2]], // Puttu / Idiyappam
    lunch: [KERALA_MESS_MENU_ITEMS[5], KERALA_MESS_MENU_ITEMS[7], KERALA_MESS_MENU_ITEMS[9]], // Veg / Chicken Meals / Malabar Biryani
    dinner: [KERALA_MESS_MENU_ITEMS[11], KERALA_MESS_MENU_ITEMS[13]], // Chappathi Chicken / Warm Comfort Kanji
    specialTreat: '🍨 Sunday Dessert: Ada Pradhaman Payasam with Sunday Lunch'
  }
];

// ============================================================================
// 3. BUDGET-FRIENDLY HOSTEL & STUDENT MESS SUBSCRIPTION PLANS
// ============================================================================

export const KERALA_MESS_SUBSCRIPTION_PLANS: MessSubscriptionPlan[] = [
  // --- DAILY FLEX PASS ---
  {
    id: 'mess-plan-daily',
    name: 'Daily Flex Pass (Day-to-Day)',
    planType: 'daily_flex',
    mealCoverage: 'lunch_dinner',
    dietPreference: 'kerala_veg',
    basePrice: 130,
    discountedPrice: 110,
    perMealPrice: 55,
    description: 'Perfect for students or bachelors needing meals on select days with zero long-term commitment.',
    features: [
      'Order breakfast, lunch, or dinner on demand',
      'Pay via UPI or Wallet per meal',
      'Direct hostel gate drop within 30 mins of slot time',
      'Insulated thermal tiffin pouch'
    ],
    savingsPercent: 15,
    isPopular: false,
    isHostelStudentDiscounted: false
  },

  // --- 7-DAY WEEKLY HOSTEL SAVER ---
  {
    id: 'mess-plan-weekly-all3',
    name: '7-Day Hostel Weekly Pass (All 3 Meals)',
    planType: 'weekly_7day',
    mealCoverage: 'all_3_meals',
    dietPreference: 'kerala_nonveg',
    basePrice: 1260,
    discountedPrice: 999,
    perMealPrice: 47,
    description: 'Complete 21 meals coverage (Breakfast + Lunch + Dinner) for 1 full week. Includes 3x Non-Veg & 2x Fish meals.',
    features: [
      'All 21 meals delivered to your PG / Hostel gate',
      'Daily menu rotation (Puttu, Appam, Matta Meals, Biryani, Chappathi)',
      'Free 1-Day Pause rollover if going home for weekend',
      'Includes Sunday Payasam / special treat'
    ],
    savingsPercent: 21,
    isPopular: true,
    isHostelStudentDiscounted: true
  },
  {
    id: 'mess-plan-weekly-ld',
    name: '7-Day Weekly Lunch + Dinner Pass',
    planType: 'weekly_7day',
    mealCoverage: 'lunch_dinner',
    dietPreference: 'kerala_veg',
    basePrice: 910,
    discountedPrice: 749,
    perMealPrice: 53,
    description: '14 meals (Lunch & Dinner) for students who prepare their own quick breakfast or eat in college canteen.',
    features: [
      '14 hearty homestyle meals delivered hot',
      'Lunch at 12:45 PM & Dinner at 8:00 PM',
      '1-click Pause with wallet refund',
      'Custom spice level preferences'
    ],
    savingsPercent: 18,
    isPopular: false,
    isHostelStudentDiscounted: true
  },

  // --- 30-DAY MONTHLY STUDENT SUPER SAVER ---
  {
    id: 'mess-plan-monthly-student-ld',
    name: '30-Day Student Super Saver (Lunch + Dinner)',
    planType: 'monthly_30day',
    mealCoverage: 'lunch_dinner',
    dietPreference: 'kerala_nonveg',
    basePrice: 3900,
    discountedPrice: 2999, // ₹99/day for 2 meals (₹49.9 per meal)
    perMealPrice: 50,
    description: 'The most popular budget saver for college hostelers & PG residents. 60 meals delivered right to your gate.',
    features: [
      '60 hot meals across 30 days (₹50/meal)',
      'Up to 5 Days Pause Rollover (weekend home trips preserved!)',
      'Student Monthly Split: Pay in 2 easy installments',
      'Includes weekly Thalassery Biryani & Fish Fry upgrades',
      'Zero delivery fee to all listed college hostels & PGs'
    ],
    savingsPercent: 23,
    isPopular: true,
    isHostelStudentDiscounted: true
  },
  {
    id: 'mess-plan-monthly-all3',
    name: '30-Day Complete Kerala Mess Pass (All 3 Meals)',
    planType: 'monthly_30day',
    mealCoverage: 'all_3_meals',
    dietPreference: 'kerala_nonveg',
    basePrice: 5400,
    discountedPrice: 3899, // ₹129/day for all 3 meals (₹43 per meal!)
    perMealPrice: 43,
    description: 'Full food security for the entire month: 90 wholesome meals covering Breakfast, Lunch, and Dinner.',
    features: [
      '90 complete meals (Breakfast + Lunch + Dinner)',
      'Up to 7 Days Flexible Pause dates with automated wallet rollover',
      'Dedicated Stainless Steel Insulated Tiffin Box with security seal',
      'Priority delivery route directly to your hostel room / security desk',
      '24x7 WhatsApp support for instant address or slot change'
    ],
    savingsPercent: 28,
    isPopular: false,
    isHostelStudentDiscounted: true
  },
  {
    id: 'mess-plan-monthly-lunch-only',
    name: '30-Day Executive / College Lunch Pass',
    planType: 'monthly_30day',
    mealCoverage: 'only_lunch',
    dietPreference: 'kerala_veg',
    basePrice: 2250,
    discountedPrice: 1699, // ₹56.6 per meal
    perMealPrice: 56,
    description: '30 heavy Kerala Matta Rice meals delivered to your college department or office desk at 12:30 PM.',
    features: [
      '30 full Kerala Oonu lunches with 5 sides + pappadam',
      'Delivered hot in eco-leaf meal trays',
      '4 Days Pause credit allowance',
      'Free buttermilk (Pacha Moru) pouch with every lunch'
    ],
    savingsPercent: 24,
    isPopular: false,
    isHostelStudentDiscounted: false
  }
];

// ============================================================================
// 4. SAMPLE RETAIL & HOSTEL STUDENT MESS ACCOUNTS
// ============================================================================

export const INITIAL_MESS_ACCOUNTS: MessCustomerAccount[] = [
  {
    id: 'mess-cust-001',
    phone: '+91 98471 22334',
    name: 'Rahul Nair',
    email: 'rahul.nair.btech@cusat.ac.in',
    hostelOrPgName: 'CUSAT Sahara Boys Hostel',
    roomNumber: 'Room 204 (2nd Floor)',
    instituteOrWorkplace: 'Cochin University of Science & Technology (CUSAT)',
    areaLocation: 'Kalamassery, South Kalamassery',
    landmark: 'Behind CUSAT Library Block',
    pincode: '682022',
    activePlan: KERALA_MESS_SUBSCRIPTION_PLANS[3], // 30-Day Student Saver (Lunch+Dinner)
    subscriptionStatus: 'active',
    validUntil: '2026-09-15',
    walletBalance: 240, // 2 paused meals credited back
    remainingMeals: {
      breakfast: 0,
      lunch: 22,
      dinner: 22
    },
    pausedDates: ['2026-08-22', '2026-08-23'], // Paused for weekend home trip
    dietaryPreference: 'kerala_nonveg',
    tiffinBoxDeposit: 150,
    tiffinContainersHeld: 2,
    orderHistoryIds: ['mess-ord-801', 'mess-ord-802', 'mess-ord-803'],
    preferredSlotTimes: {
      breakfast: '07:45 AM (Hostel Gate)',
      lunch: '12:45 PM (Room Drop / Security Table)',
      dinner: '08:15 PM (Hostel Gate)'
    }
  },
  {
    id: 'mess-cust-002',
    phone: '+91 94470 55667',
    name: 'Sneha Varghese',
    email: 'sneha.v@ust.com',
    hostelOrPgName: 'Greenwood Ladies Executive PG',
    roomNumber: 'Room B-12',
    instituteOrWorkplace: 'UST Global, Infopark Phase 2',
    areaLocation: 'Kakkanad, Edachira Road',
    landmark: 'Opposite Infopark South Gate',
    pincode: '682042',
    activePlan: KERALA_MESS_SUBSCRIPTION_PLANS[4], // 30-Day All 3 Meals
    subscriptionStatus: 'active',
    validUntil: '2026-09-08',
    walletBalance: 120,
    remainingMeals: {
      breakfast: 18,
      lunch: 18,
      dinner: 18
    },
    pausedDates: [],
    dietaryPreference: 'kerala_fish',
    tiffinBoxDeposit: 150,
    tiffinContainersHeld: 1,
    orderHistoryIds: ['mess-ord-804'],
    preferredSlotTimes: {
      breakfast: '07:30 AM (PG Reception)',
      lunch: '01:00 PM (Infopark Delivery Point 4)',
      dinner: '08:00 PM (PG Reception)'
    }
  },
  {
    id: 'mess-cust-003',
    phone: '+91 97455 99881',
    name: 'Muhammed Basil',
    email: 'basil.m@mec.ac.in',
    hostelOrPgName: 'Model Engineering College Mens Hostel',
    roomNumber: 'Room 312',
    instituteOrWorkplace: 'Govt. Model Engineering College (MEC)',
    areaLocation: 'Thrikkakara, Kochi',
    landmark: 'Near Thrikkakara Temple',
    pincode: '682021',
    activePlan: KERALA_MESS_SUBSCRIPTION_PLANS[1], // 7-Day Weekly
    subscriptionStatus: 'active',
    validUntil: '2026-08-23',
    walletBalance: 0,
    remainingMeals: {
      breakfast: 5,
      lunch: 5,
      dinner: 5
    },
    pausedDates: [],
    dietaryPreference: 'kerala_nonveg',
    tiffinBoxDeposit: 150,
    tiffinContainersHeld: 1,
    orderHistoryIds: ['mess-ord-805'],
    preferredSlotTimes: {
      breakfast: '08:00 AM (Hostel Gate)',
      lunch: '12:30 PM (MEC Canteen Gate)',
      dinner: '08:30 PM (Hostel Gate)'
    }
  }
];

// ============================================================================
// 5. LIVE DAILY MESS ORDERS (END-TO-END TRACKING)
// ============================================================================

export const INITIAL_MESS_DAILY_ORDERS: MessDailyOrder[] = [
  {
    id: 'mess-ord-801',
    orderNumber: 'MESS-KOC-9921',
    customerId: 'mess-cust-001',
    customerName: 'Rahul Nair',
    customerPhone: '+91 98471 22334',
    hostelOrPgName: 'CUSAT Sahara Boys Hostel',
    roomNumber: 'Room 204',
    landmark: 'Behind CUSAT Library Block',
    pincode: '682022',
    date: '2026-08-17',
    mealSlot: 'lunch',
    dishName: 'Kerala Meals with Tender Nadan Chicken Curry',
    itemsIncluded: [
      'Kerala Matta Red Rice (350g)',
      'Nadan Chicken Curry (2 Pcs)',
      'Cabbage Thoran',
      'Moru Curry',
      'Lemon Pickle & 1 Pappadam'
    ],
    dietCategory: 'kerala_nonveg',
    quantity: 1,
    amount: 0, // covered by active 30-day monthly pass
    paymentMode: 'monthly_subscription_pass',
    paymentStatus: 'paid',
    orderStatus: 'out_for_hostel_drop',
    deliveryRiderName: 'Manoj Kumar (Route: Kalamassery Hostels)',
    deliveryRiderPhone: '+91 98470 77881',
    hostelGatePassCode: 'HOSTEL-PIN-4482',
    deliveryEstimatedTime: '12:45 PM',
    dietaryNote: 'Medium spicy, extra sambar gravy preferred',
    trackingSteps: [
      {
        stage: 'Daily Mess Plan Batch Queued',
        time: '09:00 AM',
        description: 'Auto-queued in Cloud Kitchen Central KDS from Monthly Pass.',
        completed: true
      },
      {
        stage: 'Kettle Mass Cooking & Temperature Check',
        time: '11:15 AM',
        description: 'Cooked fresh at 82°C in Steam Kettle #3 by Lead Chef Sasi.',
        completed: true
      },
      {
        stage: 'Insulated Thermal Hostel Crate Packed',
        time: '11:55 AM',
        description: 'Tiffin packed in stainless steel tray with tamper-evident seal.',
        completed: true
      },
      {
        stage: 'Out for Hostel Delivery (Electric Van Route 2)',
        time: '12:15 PM',
        description: 'Rider Manoj is en-route to CUSAT Sahara Hostel.',
        completed: true
      },
      {
        stage: 'Hostel Gate Drop / Room Handover',
        time: 'Expected 12:45 PM',
        description: 'Show gate pass code HOSTEL-PIN-4482 to collect from security desk.',
        completed: false
      }
    ],
    createdAt: '2026-08-17 07:00'
  },
  {
    id: 'mess-ord-802',
    orderNumber: 'MESS-KOC-9922',
    customerId: 'mess-cust-002',
    customerName: 'Sneha Varghese',
    customerPhone: '+91 94470 55667',
    hostelOrPgName: 'Greenwood Ladies Executive PG',
    roomNumber: 'Room B-12',
    landmark: 'Opposite Infopark South Gate',
    pincode: '682042',
    date: '2026-08-17',
    mealSlot: 'lunch',
    dishName: 'Kerala Meals with Fresh Nadan Fish Curry (Ayala)',
    itemsIncluded: [
      'Kerala Matta Rice',
      'Kudampuli Fish Curry',
      '1 Pc Tawa Fried Ayala',
      'Aviyal',
      'Moru Curry & Pappadam'
    ],
    dietCategory: 'kerala_fish',
    quantity: 1,
    amount: 0,
    paymentMode: 'monthly_subscription_pass',
    paymentStatus: 'paid',
    orderStatus: 'packed_in_crate',
    deliveryRiderName: 'Anil Babu (Route: Kakkanad Infopark PG Circuit)',
    deliveryRiderPhone: '+91 94471 33442',
    hostelGatePassCode: 'PG-PIN-8109',
    deliveryEstimatedTime: '01:00 PM',
    trackingSteps: [
      {
        stage: 'Batch Queued',
        time: '09:00 AM',
        description: 'Queued under Kakkanad Sub-Hub Fish Batch.',
        completed: true
      },
      {
        stage: 'Batch Cooked & Fried',
        time: '11:30 AM',
        description: 'Ayala fish pan-fried fresh and curry portioned.',
        completed: true
      },
      {
        stage: 'Packed in Insulated Crate',
        time: '12:05 PM',
        description: 'Sealed with tamper proof clip for Greenwood PG drop.',
        completed: true
      },
      {
        stage: 'Dispatched to Infopark Route',
        time: 'Departing 12:20 PM',
        description: 'Van en route to Kakkanad.',
        completed: false
      },
      {
        stage: 'Delivered at PG Reception',
        time: '01:00 PM',
        description: 'Drop with PG warden / security.',
        completed: false
      }
    ],
    createdAt: '2026-08-17 07:00'
  },
  {
    id: 'mess-ord-803',
    orderNumber: 'MESS-KOC-9923',
    customerId: 'mess-cust-001',
    customerName: 'Rahul Nair',
    customerPhone: '+91 98471 22334',
    hostelOrPgName: 'CUSAT Sahara Boys Hostel',
    roomNumber: 'Room 204',
    landmark: 'Behind CUSAT Library Block',
    pincode: '682022',
    date: '2026-08-17',
    mealSlot: 'dinner',
    dishName: 'Whole Wheat Chappathi (3 pcs) with Nadan Chicken Curry',
    itemsIncluded: ['3 Pcs Soft Chappathi', 'Nadan Chicken Curry (2 Pcs)', 'Onion slices'],
    dietCategory: 'kerala_nonveg',
    quantity: 1,
    amount: 0,
    paymentMode: 'monthly_subscription_pass',
    paymentStatus: 'paid',
    orderStatus: 'kds_batch_queued',
    deliveryRiderName: 'Manoj Kumar',
    deliveryEstimatedTime: '08:15 PM',
    trackingSteps: [
      {
        stage: 'Dinner Batch Scheduled',
        time: '07:00 AM',
        description: 'Queued for Evening Chappathi Tawa Line.',
        completed: true
      },
      {
        stage: 'Evening Hot Tawa Batching (Starts 6:30 PM)',
        time: 'Pending',
        description: 'Chappathis puffed fresh on high-capacity gas tawa.',
        completed: false
      },
      {
        stage: 'Crate Packaging',
        time: 'Pending',
        description: 'Packed hot in foil insulated box.',
        completed: false
      },
      {
        stage: 'Hostel Gate Drop',
        time: 'Expected 08:15 PM',
        description: 'Delivered to Sahara Hostel gate desk.',
        completed: false
      }
    ],
    createdAt: '2026-08-17 07:00'
  }
];

// ============================================================================
// 6. CHEF MASS PRODUCTION BATCH SUMMARY (MESS VOLUME + SWIGGY/ZOMATO BUFFER)
// ============================================================================

export const INITIAL_MESS_KITCHEN_BATCHES: MessKitchenBatchSummary[] = [
  // BREAKFAST BATCHES
  {
    id: 'kds-batch-bf-01',
    mealSlot: 'breakfast',
    dishName: 'Steamed Podi Puttu with Nadan Kadala Curry',
    malayalamName: 'പുട്ടും കടലക്കറിയും',
    category: 'kerala_veg',
    totalPortionsRequired: 220,
    messSubscriberPortions: 175,
    dailyDirectPortions: 15,
    swiggyZomatoReservedPortions: 30, // 30 portions buffered for Swiggy/Zomato orders
    preparedCount: 220,
    vesselScale: '4x 40-Cylinder Commercial Steam Puttu Towers + 1x 80L Kadala Curry Kettle',
    status: 'dispatched',
    cookStartTime: '05:30 AM',
    leadChef: 'Chef Vijayan K.',
    temperatureCheckCelsius: 86
  },
  {
    id: 'kds-batch-bf-02',
    mealSlot: 'breakfast',
    dishName: 'Palappam (3 pcs) with Veg Stew / Egg Roast',
    malayalamName: 'പാലപ്പവും വെജ് സ്റ്റൂവും',
    category: 'kerala_egg',
    totalPortionsRequired: 160,
    messSubscriberPortions: 125,
    dailyDirectPortions: 10,
    swiggyZomatoReservedPortions: 25,
    preparedCount: 160,
    vesselScale: '6x Curved Cast Iron Appa Chatty Line',
    status: 'dispatched',
    cookStartTime: '06:00 AM',
    leadChef: 'Chef Ancy Mathew',
    temperatureCheckCelsius: 82
  },

  // LUNCH BATCHES
  {
    id: 'kds-batch-ln-01',
    mealSlot: 'lunch',
    dishName: 'Kerala Matta Rice (Steamed Oonu Rice)',
    malayalamName: 'കേരള മട്ട ചോറ്',
    category: 'kerala_veg',
    totalPortionsRequired: 450,
    messSubscriberPortions: 360,
    dailyDirectPortions: 30,
    swiggyZomatoReservedPortions: 60, // Reserved for aggregator lunchtime orders
    preparedCount: 450,
    vesselScale: '2x 150L Commercial Tilting Steam Rice Boilers',
    status: 'ready_for_packing',
    cookStartTime: '10:00 AM',
    leadChef: 'Chef Sasi Kumar',
    temperatureCheckCelsius: 88
  },
  {
    id: 'kds-batch-ln-02',
    mealSlot: 'lunch',
    dishName: 'Nadan Chicken Curry (Shallots & Roasted Coconut Gravy)',
    malayalamName: 'നാടൻ കോഴിക്കറി',
    category: 'kerala_nonveg',
    totalPortionsRequired: 240,
    messSubscriberPortions: 185,
    dailyDirectPortions: 15,
    swiggyZomatoReservedPortions: 40,
    preparedCount: 240,
    vesselScale: '1x 120L Stainless Steel Steam Jacketed Kettle',
    status: 'ready_for_packing',
    cookStartTime: '10:30 AM',
    leadChef: 'Chef Manoj V.',
    temperatureCheckCelsius: 84
  },
  {
    id: 'kds-batch-ln-03',
    mealSlot: 'lunch',
    dishName: 'Kudampuli Fish Curry & Tawa Ayala Fry',
    malayalamName: 'മീൻ കറിയും വറുത്തതും',
    category: 'kerala_fish',
    totalPortionsRequired: 140,
    messSubscriberPortions: 105,
    dailyDirectPortions: 10,
    swiggyZomatoReservedPortions: 25,
    preparedCount: 120, // 20 frying now
    vesselScale: '2x Large Clay Chatti + Heavy Iron Flat Griddle',
    status: 'cooking',
    cookStartTime: '11:00 AM',
    leadChef: 'Chef Pradeep K.',
    temperatureCheckCelsius: 81
  },
  {
    id: 'kds-batch-ln-04',
    mealSlot: 'lunch',
    dishName: 'Nadan Sambar, Aviyal & Cabbage Cherupayar Thoran',
    malayalamName: 'സാമ്പാർ, അവിയൽ, തോരൻ',
    category: 'kerala_veg',
    totalPortionsRequired: 380,
    messSubscriberPortions: 310,
    dailyDirectPortions: 20,
    swiggyZomatoReservedPortions: 50,
    preparedCount: 380,
    vesselScale: '1x 100L Sambar Kettle + 2x 50L Vegetable Braising Pans',
    status: 'ready_for_packing',
    cookStartTime: '09:45 AM',
    leadChef: 'Chef Rajamma P.',
    temperatureCheckCelsius: 85
  },

  // DINNER BATCHES
  {
    id: 'kds-batch-dn-01',
    mealSlot: 'dinner',
    dishName: '100% Whole Wheat Chappathi',
    malayalamName: 'നാടൻ ഗോതമ്പ് ചപ്പാത്തി',
    category: 'kerala_veg',
    totalPortionsRequired: 680, // count of pieces (e.g. 220 portions x 3)
    messSubscriberPortions: 550,
    dailyDirectPortions: 30,
    swiggyZomatoReservedPortions: 100,
    preparedCount: 200,
    vesselScale: 'Semi-Automatic Dough Divider + 2x 6-Burner Rotating Tawa',
    status: 'pending',
    cookStartTime: '06:00 PM (Scheduled)',
    leadChef: 'Chef Vijayan K.'
  },
  {
    id: 'kds-batch-dn-02',
    mealSlot: 'dinner',
    dishName: 'Kerala Mixed Veg Kurma & Egg Roast Gravy',
    malayalamName: 'വെജ് കുറുമയും മുട്ട റോസ്റ്റും',
    category: 'kerala_egg',
    totalPortionsRequired: 220,
    messSubscriberPortions: 175,
    dailyDirectPortions: 15,
    swiggyZomatoReservedPortions: 30,
    preparedCount: 0,
    vesselScale: '1x 80L Steam Kettle',
    status: 'pending',
    cookStartTime: '06:30 PM (Scheduled)',
    leadChef: 'Chef Manoj V.'
  },
  {
    id: 'kds-batch-dn-03',
    mealSlot: 'dinner',
    dishName: 'Nadan Rice Kanji with Cherupayar Thoran & Chammanthi',
    malayalamName: 'നാടൻ കഞ്ഞിയും ചെറുപയറും',
    category: 'kerala_veg',
    totalPortionsRequired: 90,
    messSubscriberPortions: 80,
    dailyDirectPortions: 5,
    swiggyZomatoReservedPortions: 5,
    preparedCount: 0,
    vesselScale: '1x 60L Kanji Vessel with Slow Simmer',
    status: 'pending',
    cookStartTime: '06:45 PM (Scheduled)',
    leadChef: 'Chef Sasi Kumar'
  }
];

// ============================================================================
// 7. SWIGGY / ZOMATO AGGREGATOR RESERVED INVENTORY & BUFFER
// ============================================================================

export const INITIAL_AGGREGATOR_INVENTORY: AggregatorReservedInventory[] = [
  {
    id: 'agg-inv-01',
    dishName: 'Kerala Matta Rice Full Meals (Oonu) Box',
    malayalamName: 'കേരള നാടൻ ഊണ് ബോക്സ്',
    mealSlot: 'lunch',
    category: 'kerala_veg',
    totalCookedPortions: 450,
    reservedForMess: 390,
    reservedForSwiggyZomato: 60, // 60 portions reserved
    swiggyLiveStock: 24,
    zomatoLiveStock: 18,
    swiggyPrice: 119, // aggregator retail price (higher than hostel mess ₹60)
    zomatoPrice: 119,
    messPrice: 60,
    channelStatus: 'live',
    swiggyActive: true,
    zomatoActive: true
  },
  {
    id: 'agg-inv-02',
    dishName: 'Nadan Chicken Curry with Matta Rice Combo',
    malayalamName: 'നാടൻ ചിക്കൻ കറി ഊണ്',
    mealSlot: 'lunch',
    category: 'kerala_nonveg',
    totalCookedPortions: 240,
    reservedForMess: 200,
    reservedForSwiggyZomato: 40,
    swiggyLiveStock: 14,
    zomatoLiveStock: 12,
    swiggyPrice: 169,
    zomatoPrice: 169,
    messPrice: 95,
    channelStatus: 'live',
    swiggyActive: true,
    zomatoActive: true
  },
  {
    id: 'agg-inv-03',
    dishName: 'Crispy Ayala Fish Fry & Kudampuli Meen Curry Meals',
    malayalamName: 'അയല വറുത്ത മീൻ ഊണ്',
    mealSlot: 'lunch',
    category: 'kerala_fish',
    totalCookedPortions: 140,
    reservedForMess: 115,
    reservedForSwiggyZomato: 25,
    swiggyLiveStock: 6,
    zomatoLiveStock: 5,
    swiggyPrice: 159,
    zomatoPrice: 159,
    messPrice: 85,
    channelStatus: 'low_buffer',
    swiggyActive: true,
    zomatoActive: true
  },
  {
    id: 'agg-inv-04',
    dishName: 'Steamed Podi Puttu with Nadan Kadala Curry (Breakfast Box)',
    malayalamName: 'പുട്ടും കടലയും ബോക്സ്',
    mealSlot: 'breakfast',
    category: 'kerala_veg',
    totalCookedPortions: 220,
    reservedForMess: 190,
    reservedForSwiggyZomato: 30,
    swiggyLiveStock: 0,
    zomatoLiveStock: 0,
    swiggyPrice: 89,
    zomatoPrice: 89,
    messPrice: 45,
    channelStatus: 'sold_out',
    swiggyActive: false,
    zomatoActive: false
  },
  {
    id: 'agg-inv-05',
    dishName: 'Whole Wheat Chappathi (3 pcs) + Chicken Curry Dinner Box',
    malayalamName: 'ചപ്പാത്തിയും ചിക്കൻ കറിയും',
    mealSlot: 'dinner',
    category: 'kerala_nonveg',
    totalCookedPortions: 220,
    reservedForMess: 190,
    reservedForSwiggyZomato: 30,
    swiggyLiveStock: 18,
    zomatoLiveStock: 12,
    swiggyPrice: 149,
    zomatoPrice: 149,
    messPrice: 75,
    channelStatus: 'live',
    swiggyActive: true,
    zomatoActive: true
  }
];

// ============================================================================
// 8. LIVE AGGREGATOR ORDERS (SWIGGY & ZOMATO ON-DEMAND DISPATCH)
// ============================================================================

export const INITIAL_AGGREGATOR_ORDERS: AggregatorLiveOrder[] = [
  {
    id: 'agg-ord-01',
    orderNumber: 'SWIGGY-948102',
    platform: 'swiggy',
    customerName: 'Gopakumar R.',
    customerArea: 'Kakkanad, Rajagiri Valley Road',
    items: [
      { name: 'Nadan Chicken Curry with Matta Rice Combo', quantity: 2, price: 169 },
      { name: 'Extra Kerala Sambar Cup', quantity: 1, price: 29 }
    ],
    subtotal: 367,
    platformCommission: 73.4, // 20% commission
    netPayout: 293.6,
    status: 'ready_for_pickup',
    riderName: 'Swiggy Rider Shinto George',
    riderPhone: '+91 98471 00291',
    pickupOtp: '8491',
    placedTime: '12:05 PM',
    estimatedPickupTime: '12:18 PM (2 mins)'
  },
  {
    id: 'agg-ord-02',
    orderNumber: 'ZOMATO-339108',
    platform: 'zomato',
    customerName: 'Meera Krishnan',
    customerArea: 'Palarivattom Bypass, Padivattom',
    items: [
      { name: 'Kerala Matta Rice Full Meals (Oonu) Box', quantity: 1, price: 119 },
      { name: 'Crispy Ayala Fish Fry & Kudampuli Meen Curry Meals', quantity: 1, price: 159 }
    ],
    subtotal: 278,
    platformCommission: 55.6,
    netPayout: 222.4,
    status: 'kitchen_preparing',
    riderName: 'Zomato Rider Jithin Roy',
    riderPhone: '+91 94470 11928',
    pickupOtp: '3312',
    placedTime: '12:10 PM',
    estimatedPickupTime: '12:25 PM (9 mins)'
  },
  {
    id: 'agg-ord-03',
    orderNumber: 'SWIGGY-948103',
    platform: 'swiggy',
    customerName: 'Arjun Das',
    customerArea: 'Edappally Toll, Metro Pillar 380',
    items: [
      { name: 'Kerala Matta Rice Full Meals (Oonu) Box', quantity: 3, price: 119 }
    ],
    subtotal: 357,
    platformCommission: 71.4,
    netPayout: 285.6,
    status: 'rider_picked_up',
    riderName: 'Swiggy Rider Praveen K.',
    riderPhone: '+91 98765 22001',
    pickupOtp: '9102',
    placedTime: '11:45 AM',
    estimatedPickupTime: 'Picked up at 12:02 PM'
  }
];
