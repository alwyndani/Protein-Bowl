import { CloudKitchenBranch, StaffUserAccount, InterKitchenTransfer } from '../types';

export const CLOUD_KITCHEN_BRANCHES: CloudKitchenBranch[] = [
  {
    id: 'trivandrum',
    name: 'NutriFit Cloud Kitchen – Trivandrum Hub',
    city: 'Trivandrum',
    state: 'Kerala',
    hubName: 'Technopark & Kowdiar Express Kitchen',
    tagline: 'Serving South Kerala IT Corridors, Kowdiar & City Hubs',
    address: 'Building 4B, Technopark Campus, Kazhakkoottam, Thiruvananthapuram',
    pincode: '695581',
    phone: '+91 471 270 4880',
    email: 'trivandrum.ops@nutrifitkitchen.in',
    fssaiNumber: 'FSSAI-TVM-11322004000189',
    operatingHours: '06:00 AM - 11:30 PM (Daily)',
    status: 'active',
    
    // Key Personnel
    generalManager: 'Divya Krishnan',
    headChef: 'Chef Anand Nair',
    procurementLead: 'Akhil Raj',
    logisticsFleetLead: 'Vipin Chandran',
    leadDietician: 'Dr. Sneha Pillai',
    
    // Capacity & Load Telemetry
    dailyMealCapacity: 500,
    activeMealsToday: 390,
    capacityUtilizationPct: 78,
    activeStaffCount: 18,
    activeChefsCount: 4,
    activeRidersCount: 6,
    
    // Quality & Operations
    hygieneAuditScorePct: 99.1,
    avgPrepTimeMins: 14,
    deliveryOnTimeRatePct: 96.8,
    coldChainTempCelsius: 3.4,
    
    // Financial Snapshot
    monthlyRevenue: 345000,
    todayRevenue: 28450,
    avgOrderValue: 13800,
    todayOrdersCount: 48,
    
    // Geographical Coverage
    deliveryRadiusKm: 16,
    servicePincodes: ['695581', '695582', '695583', '695003', '695004', '695011', '695014'],
    zonesCovered: [
      'Technopark Phase 1, 2 & 3',
      'Kazhakkoottam IT Corridor',
      'Kowdiar & Golf Links',
      'Pattom & Marappalam',
      'Vellayambalam & Vazhuthacaud',
      'Sreekariyam & Pangappara',
      'Kariavattom University Campus'
    ],
    stations: [
      { id: 'tvm-st-1', name: 'Salad & Cold Pressed Line', stationType: 'salad_cold_prep', leadChef: 'Chef Vishnu', status: 'operational', activeItemsCount: 14 },
      { id: 'tvm-st-2', name: 'Air-Fry & Protein Grill Deck', stationType: 'hot_line', leadChef: 'Chef Anand Nair', status: 'busy', activeItemsCount: 26 },
      { id: 'tvm-st-3', name: 'Macro Bakery & Healthy Desserts', stationType: 'baking_dessert', leadChef: 'Chef Kavitha', status: 'operational', activeItemsCount: 8 },
      { id: 'tvm-st-4', name: 'Smart Weighing & Eco-Packaging', stationType: 'packing_dispatch', leadChef: 'Supervisor Rahul', status: 'busy', activeItemsCount: 32 }
    ]
  },
  {
    id: 'kochi',
    name: 'NutriFit Cloud Kitchen – Kochi Central Headquarters',
    city: 'Kochi',
    state: 'Kerala',
    hubName: 'Infopark & Vyttila Central Mega Kitchen',
    tagline: 'Statewide Master Kitchen, Innovation Hub & High-Volume Operations',
    address: 'Plot 12, Seaport-Airport Road, Kakkanad, Kochi, Ernakulam',
    pincode: '682030',
    phone: '+91 484 298 7120',
    email: 'kochi.hq@nutrifitkitchen.in',
    fssaiNumber: 'FSSAI-KOC-11322004000452',
    operatingHours: '05:30 AM - 12:00 AM (24x7 Night Shift Prep)',
    status: 'rush',
    
    // Key Personnel
    generalManager: 'Mathew Thomas (VP Ops)',
    headChef: 'Executive Chef Suresh Kumar',
    procurementLead: 'Rajesh V. (Central Buyer)',
    logisticsFleetLead: 'Kiran K. (Fleet Director)',
    leadDietician: 'Dr. Priya Nair (Chief Dietician)',
    
    // Capacity & Load Telemetry
    dailyMealCapacity: 800,
    activeMealsToday: 688,
    capacityUtilizationPct: 86,
    activeStaffCount: 26,
    activeChefsCount: 7,
    activeRidersCount: 10,
    
    // Quality & Operations
    hygieneAuditScorePct: 99.6,
    avgPrepTimeMins: 11,
    deliveryOnTimeRatePct: 98.2,
    coldChainTempCelsius: 3.2,
    
    // Financial Snapshot
    monthlyRevenue: 485000,
    todayRevenue: 42900,
    avgOrderValue: 14200,
    todayOrdersCount: 74,
    
    // Geographical Coverage
    deliveryRadiusKm: 22,
    servicePincodes: ['682030', '682042', '682036', '682024', '682025', '682011', '682019'],
    zonesCovered: [
      'Infopark Phase 1 & 2 (Kakkanad)',
      'SmartCity Kochi Hub',
      'Panampilly Nagar & Kadavanthra',
      'Palarivattom & Edappally Metro Zone',
      'Vyttila Mobility Hub & NH Bypass',
      'Marine Drive & MG Road Business District',
      'Kaloor & Jawaharlal Nehru Stadium'
    ],
    stations: [
      { id: 'koc-st-1', name: 'Master Hot Line & Air-Fry Grills', stationType: 'hot_line', leadChef: 'Chef Suresh Kumar', status: 'busy', activeItemsCount: 45 },
      { id: 'koc-st-2', name: 'Gourmet Salads & Cold Prep', stationType: 'salad_cold_prep', leadChef: 'Chef Biju Nair', status: 'operational', activeItemsCount: 28 },
      { id: 'koc-st-3', name: 'High-Protein Bakery & Truffles', stationType: 'baking_dessert', leadChef: 'Chef Ananya', status: 'operational', activeItemsCount: 19 },
      { id: 'koc-st-4', name: 'Automated Barcode Dispatch & QA', stationType: 'packing_dispatch', leadChef: 'Supervisor Manoj', status: 'busy', activeItemsCount: 52 }
    ]
  },
  {
    id: 'kozhikode',
    name: 'NutriFit Cloud Kitchen – Kozhikode Cyber Hub',
    city: 'Kozhikode',
    state: 'Kerala',
    hubName: 'Cyberpark & Mavoor Road Express Kitchen',
    tagline: 'North Kerala Hub Serving Cyberpark, Mavoor Road & Malabar Health Enclaves',
    address: 'Near Cyberpark Gateway, Nellikkode, Mavoor Road, Kozhikode',
    pincode: '673016',
    phone: '+91 495 243 1900',
    email: 'kozhikode.ops@nutrifitkitchen.in',
    fssaiNumber: 'FSSAI-CLT-11322004000881',
    operatingHours: '06:30 AM - 11:00 PM (Daily)',
    status: 'active',
    
    // Key Personnel
    generalManager: 'Farooq Ahmed',
    headChef: 'Chef Rasheed Khan',
    procurementLead: 'Anoop M.',
    logisticsFleetLead: 'Jaseem P.',
    leadDietician: 'Dr. Karthik Sundaram',
    
    // Capacity & Load Telemetry
    dailyMealCapacity: 450,
    activeMealsToday: 288,
    capacityUtilizationPct: 64,
    activeStaffCount: 15,
    activeChefsCount: 3,
    activeRidersCount: 5,
    
    // Quality & Operations
    hygieneAuditScorePct: 98.4,
    avgPrepTimeMins: 15,
    deliveryOnTimeRatePct: 95.9,
    coldChainTempCelsius: 3.8,
    
    // Financial Snapshot
    monthlyRevenue: 275000,
    todayRevenue: 21300,
    avgOrderValue: 12900,
    todayOrdersCount: 36,
    
    // Geographical Coverage
    deliveryRadiusKm: 15,
    servicePincodes: ['673016', '673004', '673001', '673008', '673002'],
    zonesCovered: [
      'Cyberpark & Hilite Mall Enclave',
      'Mavoor Road & Thondayad Junction',
      'Calicut Beach & Mananchira Square',
      'Palayam & Railway Station Hub',
      'Government Medical College & Chevayur'
    ],
    stations: [
      { id: 'clt-st-1', name: 'Charcoal Flame & Air-Fry Deck', stationType: 'hot_line', leadChef: 'Chef Rasheed Khan', status: 'operational', activeItemsCount: 18 },
      { id: 'clt-st-2', name: 'Fresh Greens & Microgreens Station', stationType: 'salad_cold_prep', leadChef: 'Chef Haris', status: 'operational', activeItemsCount: 12 },
      { id: 'clt-st-3', name: 'Cold Pressed Juices & Smoothies', stationType: 'baking_dessert', leadChef: 'Chef Zainab', status: 'operational', activeItemsCount: 9 },
      { id: 'clt-st-4', name: 'Multi-Zone Dispatch & Fleet QA', stationType: 'packing_dispatch', leadChef: 'Supervisor Shabeer', status: 'operational', activeItemsCount: 22 }
    ]
  }
];

export const STAFF_USER_ACCOUNTS: StaffUserAccount[] = [
  // MD Master C-Suite (All Kitchens Statewide)
  {
    id: 'staff-md-1',
    name: 'Vaisakh K. (MD & CEO)',
    email: 'md@nutrifitkitchen.in',
    phone: '+91 99950 01122',
    role: 'md',
    designation: 'Managing Director / Statewide C-Suite',
    assignedBranchId: 'all',
    branchName: 'Statewide Enterprise (All Kitchens)',
    avatarBg: 'bg-amber-600',
    shiftTiming: 'Executive 24x7',
    isOnline: true
  },

  // KOCHI CLOUD KITCHEN STAFF
  {
    id: 'staff-koc-chef',
    name: 'Chef Suresh Kumar',
    email: 'chef.kochi@nutrifitkitchen.in',
    phone: '+91 98470 12345',
    role: 'chef',
    designation: 'Executive Head Chef (Kochi Hub)',
    assignedBranchId: 'kochi',
    branchName: 'Kochi Central Headquarters',
    avatarBg: 'bg-orange-600',
    shiftTiming: 'Morning & Lunch Shift (06:00 - 15:00)',
    isOnline: true
  },
  {
    id: 'staff-koc-proc',
    name: 'Rajesh V.',
    email: 'procurement.kochi@nutrifitkitchen.in',
    phone: '+91 98470 54321',
    role: 'procurement',
    designation: 'Procurement & Warehouse Lead (Kochi Hub)',
    assignedBranchId: 'kochi',
    branchName: 'Kochi Central Headquarters',
    avatarBg: 'bg-blue-600',
    shiftTiming: 'Full Day Procurement (07:00 - 16:00)',
    isOnline: true
  },
  {
    id: 'staff-koc-log',
    name: 'Kiran K.',
    email: 'logistics.kochi@nutrifitkitchen.in',
    phone: '+91 98470 99887',
    role: 'delivery',
    designation: 'Fleet & Dispatch Lead (Kochi Hub)',
    assignedBranchId: 'kochi',
    branchName: 'Kochi Central Headquarters',
    avatarBg: 'bg-purple-600',
    shiftTiming: 'Dispatches & Evening (10:00 - 20:00)',
    isOnline: true
  },
  {
    id: 'staff-koc-nutri',
    name: 'Dr. Priya Nair',
    email: 'priya.diet@nutrifitkitchen.in',
    phone: '+91 98470 11223',
    role: 'nutritionist',
    designation: 'Senior Clinical Dietician (Kochi Hub)',
    assignedBranchId: 'kochi',
    branchName: 'Kochi Central Headquarters',
    avatarBg: 'bg-teal-600',
    shiftTiming: 'Clinical Consultations (09:00 - 18:00)',
    isOnline: true
  },
  {
    id: 'staff-koc-trn',
    name: 'Coach Roshan George',
    email: 'roshan.fitness@nutrifitkitchen.in',
    phone: '+91 98470 66778',
    role: 'trainer',
    designation: 'Head Fitness Coach (Kochi Hub)',
    assignedBranchId: 'kochi',
    branchName: 'Kochi Central Headquarters',
    avatarBg: 'bg-emerald-600',
    shiftTiming: 'Morning & Evening Training (06:00 - 12:00, 16:00 - 20:00)',
    isOnline: true
  },

  // TRIVANDRUM CLOUD KITCHEN STAFF
  {
    id: 'staff-tvm-chef',
    name: 'Chef Anand Nair',
    email: 'chef.trivandrum@nutrifitkitchen.in',
    phone: '+91 94470 33445',
    role: 'chef',
    designation: 'Head Kitchen Chef (Trivandrum Kitchen)',
    assignedBranchId: 'trivandrum',
    branchName: 'Trivandrum Cloud Kitchen',
    avatarBg: 'bg-orange-600',
    shiftTiming: 'Morning & Lunch Shift (06:30 - 15:30)',
    isOnline: true
  },
  {
    id: 'staff-tvm-proc',
    name: 'Akhil Raj',
    email: 'procurement.tvm@nutrifitkitchen.in',
    phone: '+91 94470 77889',
    role: 'procurement',
    designation: 'Stock & Vendor Officer (Trivandrum Kitchen)',
    assignedBranchId: 'trivandrum',
    branchName: 'Trivandrum Cloud Kitchen',
    avatarBg: 'bg-blue-600',
    shiftTiming: 'Morning Shift (07:30 - 16:30)',
    isOnline: true
  },
  {
    id: 'staff-tvm-log',
    name: 'Vipin Chandran',
    email: 'logistics.tvm@nutrifitkitchen.in',
    phone: '+91 94470 99001',
    role: 'delivery',
    designation: 'Technopark Delivery Lead (Trivandrum Kitchen)',
    assignedBranchId: 'trivandrum',
    branchName: 'Trivandrum Cloud Kitchen',
    avatarBg: 'bg-purple-600',
    shiftTiming: 'Lunch & Dinner Dispatches (10:30 - 20:30)',
    isOnline: true
  },
  {
    id: 'staff-tvm-nutri',
    name: 'Dr. Sneha Pillai',
    email: 'sneha.diet@nutrifitkitchen.in',
    phone: '+91 94470 22334',
    role: 'nutritionist',
    designation: 'Consultant Nutritionist (Trivandrum Kitchen)',
    assignedBranchId: 'trivandrum',
    branchName: 'Trivandrum Cloud Kitchen',
    avatarBg: 'bg-teal-600',
    shiftTiming: 'Consultations (09:00 - 17:00)',
    isOnline: true
  },

  // KOZHIKODE CLOUD KITCHEN STAFF
  {
    id: 'staff-clt-chef',
    name: 'Chef Rasheed Khan',
    email: 'chef.kozhikode@nutrifitkitchen.in',
    phone: '+91 94960 11223',
    role: 'chef',
    designation: 'Head Kitchen Chef (Kozhikode Kitchen)',
    assignedBranchId: 'kozhikode',
    branchName: 'Kozhikode Cloud Kitchen',
    avatarBg: 'bg-orange-600',
    shiftTiming: 'Full Day Prep (06:30 - 15:30)',
    isOnline: true
  },
  {
    id: 'staff-clt-proc',
    name: 'Anoop M.',
    email: 'procurement.clt@nutrifitkitchen.in',
    phone: '+91 94960 44556',
    role: 'procurement',
    designation: 'Inventory & Sourcing Lead (Kozhikode Kitchen)',
    assignedBranchId: 'kozhikode',
    branchName: 'Kozhikode Cloud Kitchen',
    avatarBg: 'bg-blue-600',
    shiftTiming: 'Morning Shift (07:00 - 16:00)',
    isOnline: true
  },
  {
    id: 'staff-clt-log',
    name: 'Jaseem P.',
    email: 'logistics.clt@nutrifitkitchen.in',
    phone: '+91 94960 88990',
    role: 'delivery',
    designation: 'Cyberpark Logistics Supervisor (Kozhikode Kitchen)',
    assignedBranchId: 'kozhikode',
    branchName: 'Kozhikode Cloud Kitchen',
    avatarBg: 'bg-purple-600',
    shiftTiming: 'Dispatches & Logistics (11:00 - 21:00)',
    isOnline: true
  },
  {
    id: 'staff-clt-nutri',
    name: 'Dr. Karthik Sundaram',
    email: 'karthik.diet@nutrifitkitchen.in',
    phone: '+91 94960 66778',
    role: 'nutritionist',
    designation: 'Sports & Clinical Nutritionist (Kozhikode Kitchen)',
    assignedBranchId: 'kozhikode',
    branchName: 'Kozhikode Cloud Kitchen',
    avatarBg: 'bg-teal-600',
    shiftTiming: 'Diet Reviews & Consults (09:30 - 18:00)',
    isOnline: true
  },

  // POS BILLING & OUTLET COUNTER CASHIERS
  {
    id: 'staff-koc-pos',
    name: 'Anjana Ramesh',
    email: 'pos.kochi@nutrifitkitchen.in',
    phone: '+91 98470 77112',
    role: 'pos',
    designation: 'Lead POS Cashier & Counter Manager (Kochi HQ)',
    assignedBranchId: 'kochi',
    branchName: 'Kochi Central Headquarters',
    avatarBg: 'bg-indigo-600',
    shiftTiming: 'Full Day Counter Billing (08:00 - 20:00)',
    isOnline: true
  },
  {
    id: 'staff-tvm-pos',
    name: 'Gautham Menon',
    email: 'pos.trivandrum@nutrifitkitchen.in',
    phone: '+91 94470 88223',
    role: 'pos',
    designation: 'Technopark Express POS Cashier (Trivandrum)',
    assignedBranchId: 'trivandrum',
    branchName: 'Trivandrum Cloud Kitchen',
    avatarBg: 'bg-indigo-600',
    shiftTiming: 'Peak Hour Counter & Takeaway (08:30 - 19:30)',
    isOnline: true
  },
  {
    id: 'staff-clt-pos',
    name: 'Najeeb P.',
    email: 'pos.kozhikode@nutrifitkitchen.in',
    phone: '+91 94960 99334',
    role: 'pos',
    designation: 'Cyberpark Counter Cashier (Kozhikode Hub)',
    assignedBranchId: 'kozhikode',
    branchName: 'Kozhikode Cloud Kitchen',
    avatarBg: 'bg-indigo-600',
    shiftTiming: 'Cyberpark Walk-In & Billing (09:00 - 21:00)',
    isOnline: true
  },
  {
    id: 'staff-state-pos',
    name: 'Meenakshi Warrier',
    email: 'pos.statewide@nutrifitkitchen.in',
    phone: '+91 99950 44556',
    role: 'pos',
    designation: 'Statewide POS Float & Audit Cashier',
    assignedBranchId: 'all',
    branchName: 'Statewide Enterprise (All Outlets)',
    avatarBg: 'bg-indigo-700',
    shiftTiming: 'Multi-Outlet Roaming Cashier',
    isOnline: true
  },
  {
    id: 'staff-fmcg-head',
    name: 'Vikram Menon',
    email: 'fmcg.distribution@nutrifitkitchen.in',
    phone: '+91 98470 12345',
    role: 'bakery_fmcg',
    designation: 'VP FMCG & Retail Distribution Network',
    assignedBranchId: 'all',
    branchName: 'Central Bakery & Packaged Foods Division',
    avatarBg: 'bg-amber-600',
    shiftTiming: 'Production, Dispatch & Shop Network Ops (06:00 - 18:00)',
    isOnline: true
  },
  {
    id: 'staff-fmcg-baker',
    name: 'Chef Kavitha Nair',
    email: 'bakery.production@nutrifitkitchen.in',
    phone: '+91 98470 54321',
    role: 'bakery_fmcg',
    designation: 'Master Baker & Central Batch QC Lead',
    assignedBranchId: 'kochi',
    branchName: 'Kochi Central Bakery Production Unit',
    avatarBg: 'bg-orange-600',
    shiftTiming: 'Morning Artisan Baking Shift (04:30 - 13:30)',
    isOnline: true
  },

  // KERALA HOMESTYLE MESS & STUDENT HOSTEL OPERATIONS STAFF
  {
    id: 'staff-kerala-mess-lead',
    name: 'Chef Murugan K.',
    email: 'murugan.mess@proteinbowl.in',
    phone: '+91 94470 66778',
    role: 'chef',
    designation: 'Kerala Mess Lead Chef (Kettles & Traditional Kitchen)',
    assignedBranchId: 'all',
    branchName: 'Statewide Kerala Mess Central Kitchens',
    avatarBg: 'bg-amber-600',
    shiftTiming: 'Early Morning & Kettle Production (05:00 - 14:00)',
    isOnline: true
  },
  {
    id: 'staff-kerala-mess-log',
    name: 'Ananthan V. Menon',
    email: 'ananthan.mess@proteinbowl.in',
    phone: '+91 98950 44332',
    role: 'mess_customer',
    designation: 'Kerala Mess Logistics & Hostel Distribution Manager',
    assignedBranchId: 'all',
    branchName: 'Student Hostels & PG Logistics Terminal',
    avatarBg: 'bg-emerald-700',
    shiftTiming: 'Hostel Crates & Hot-Pack Dispatch (06:00 - 20:00)',
    isOnline: true
  },
  {
    id: 'staff-kerala-mess-nutri',
    name: 'Lekshmi Devi R.',
    email: 'lekshmi@proteinbowl.in',
    phone: '+91 97440 88991',
    role: 'nutritionist',
    designation: 'Kerala Mess Nutritional Auditor & Recipe Coordinator',
    assignedBranchId: 'kochi',
    branchName: 'Kochi Central Mess Unit',
    avatarBg: 'bg-teal-600',
    shiftTiming: 'Dietary Audits & Traditional Recipes (08:30 - 17:00)',
    isOnline: true
  }
];

export const INITIAL_INTER_KITCHEN_TRANSFERS: InterKitchenTransfer[] = [
  {
    id: 'TRF-2026-081',
    transferDate: '2026-08-15',
    sourceBranchId: 'kochi',
    sourceBranchName: 'Kochi Central Headquarters',
    destinationBranchId: 'trivandrum',
    destinationBranchName: 'Trivandrum Cloud Kitchen',
    itemName: 'Organic Royal White Quinoa (Bulk Sack)',
    category: 'Grains & Superfoods',
    quantity: 40,
    unit: 'kg',
    estimatedValue: 14000,
    status: 'in_transit',
    requestedBy: 'Akhil Raj (Trivandrum Procurement)',
    approvedBy: 'Rajesh V. (Kochi Central Buyer)',
    dispatchVehicleNo: 'KL-07-CD-8812 (Refrigerated Logistics Van)',
    driverPhone: '+91 98460 77123',
    transitTemperature: '18°C Controlled Dry Logistics',
    notes: 'Urgent transfer for Technopark corporate party catering order tomorrow.'
  },
  {
    id: 'TRF-2026-082',
    transferDate: '2026-08-14',
    sourceBranchId: 'kochi',
    sourceBranchName: 'Kochi Central Headquarters',
    destinationBranchId: 'kozhikode',
    destinationBranchName: 'Kozhikode Cloud Kitchen',
    itemName: 'Eco-Degradable Bento Meal Bowls (1000ml)',
    category: 'Packaging Supplies',
    quantity: 500,
    unit: 'units',
    estimatedValue: 6000,
    status: 'received',
    requestedBy: 'Anoop M. (Kozhikode Procurement)',
    approvedBy: 'Rajesh V. (Kochi Central Buyer)',
    dispatchVehicleNo: 'KL-07-CD-4421',
    driverPhone: '+91 98460 55123',
    notes: 'Delivered and verified into Kozhikode warehouse rack #B3.'
  },
  {
    id: 'TRF-2026-083',
    transferDate: '2026-08-15',
    sourceBranchId: 'kozhikode',
    sourceBranchName: 'Kozhikode Cloud Kitchen',
    destinationBranchId: 'kochi',
    destinationBranchName: 'Kochi Central Headquarters',
    itemName: 'Malabar Organic Wild Honey & Spices',
    category: 'Condiments & Superfoods',
    quantity: 15,
    unit: 'kg',
    estimatedValue: 8250,
    status: 'requested',
    requestedBy: 'Executive Chef Suresh Kumar',
    notes: 'Direct farm sourced honey from Wayanad partner for artisan breakfast bowls.'
  }
];
