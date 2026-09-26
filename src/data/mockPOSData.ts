import { POSItem, POSTransaction, POSCashDrawerShift } from '../types';

export const INITIAL_POS_ITEMS: POSItem[] = [
  // High Protein Bowls
  {
    id: 'pos-item-1',
    name: 'Grilled Herb Chicken & Quinoa Power Bowl',
    category: 'High Protein Bowls',
    price: 320,
    prepTimeMins: 8,
    calories: 460,
    proteinG: 42,
    carbsG: 38,
    fatG: 12,
    isVeg: false,
    isAvailable: true,
    sku: 'BOWL-CHK-01',
    barcode: '890123400101',
    taxRatePct: 5
  },
  {
    id: 'pos-item-2',
    name: 'Peri-Peri Paneer & Brown Rice Fitness Box',
    category: 'High Protein Bowls',
    price: 290,
    prepTimeMins: 7,
    calories: 430,
    proteinG: 28,
    carbsG: 45,
    fatG: 14,
    isVeg: true,
    isAvailable: true,
    sku: 'BOWL-PAN-02',
    barcode: '890123400102',
    taxRatePct: 5
  },
  {
    id: 'pos-item-3',
    name: 'Tofu Teriyaki & Edamame Soba Noodles',
    category: 'High Protein Bowls',
    price: 310,
    prepTimeMins: 9,
    calories: 390,
    proteinG: 26,
    carbsG: 48,
    fatG: 9,
    isVeg: true,
    isAvailable: true,
    sku: 'BOWL-TOF-03',
    barcode: '890123400103',
    taxRatePct: 5
  },
  {
    id: 'pos-item-4',
    name: 'Air-Fried Fish Fillet & Herbed Cauliflower Mash',
    category: 'High Protein Bowls',
    price: 360,
    prepTimeMins: 10,
    calories: 410,
    proteinG: 38,
    carbsG: 18,
    fatG: 14,
    isVeg: false,
    isAvailable: true,
    sku: 'BOWL-FSH-04',
    barcode: '890123400104',
    taxRatePct: 5
  },

  // Keto & Low Carb
  {
    id: 'pos-item-5',
    name: 'Keto Grilled Chicken Caesar Salad',
    category: 'Keto & Low Carb',
    price: 280,
    prepTimeMins: 5,
    calories: 340,
    proteinG: 34,
    carbsG: 6,
    fatG: 20,
    isVeg: false,
    isAvailable: true,
    sku: 'KETO-SAL-01',
    barcode: '890123400201',
    taxRatePct: 5
  },
  {
    id: 'pos-item-6',
    name: 'Mediterranean Avocado & Feta Greek Salad',
    category: 'Keto & Low Carb',
    price: 270,
    prepTimeMins: 5,
    calories: 310,
    proteinG: 14,
    carbsG: 10,
    fatG: 24,
    isVeg: true,
    isAvailable: true,
    sku: 'KETO-AVO-02',
    barcode: '890123400202',
    taxRatePct: 5
  },

  // Macro Sandwiches & Wraps
  {
    id: 'pos-item-7',
    name: 'Whole-Wheat Chicken Tikka Protein Wrap',
    category: 'Sandwiches & Wraps',
    price: 240,
    prepTimeMins: 6,
    calories: 380,
    proteinG: 32,
    carbsG: 35,
    fatG: 11,
    isVeg: false,
    isAvailable: true,
    sku: 'WRAP-CHK-01',
    barcode: '890123400301',
    taxRatePct: 5
  },
  {
    id: 'pos-item-8',
    name: 'Spiced Hummus & Grilled Veggie Sourdough Toast',
    category: 'Sandwiches & Wraps',
    price: 220,
    prepTimeMins: 6,
    calories: 320,
    proteinG: 16,
    carbsG: 42,
    fatG: 9,
    isVeg: true,
    isAvailable: true,
    sku: 'WRAP-HUM-02',
    barcode: '890123400302',
    taxRatePct: 5
  },

  // Cold-Pressed Juices & Protein Shakes
  {
    id: 'pos-item-9',
    name: 'Whey Isolate Belgian Dark Chocolate Shake (30g Protein)',
    category: 'Shakes & Beverages',
    price: 220,
    prepTimeMins: 3,
    calories: 230,
    proteinG: 30,
    carbsG: 12,
    fatG: 4,
    isVeg: true,
    isAvailable: true,
    sku: 'SHK-WHEY-01',
    barcode: '890123400401',
    taxRatePct: 5
  },
  {
    id: 'pos-item-10',
    name: 'Green Detox Cold Pressed Juice (Celery, Spinach, Apple, Ginger)',
    category: 'Shakes & Beverages',
    price: 160,
    prepTimeMins: 2,
    calories: 95,
    proteinG: 3,
    carbsG: 22,
    fatG: 0,
    isVeg: true,
    isAvailable: true,
    sku: 'JUC-DETOX-02',
    barcode: '890123400402',
    taxRatePct: 5
  },
  {
    id: 'pos-item-11',
    name: 'Electrolyte Tender Coconut & Chia Seed Cooler',
    category: 'Shakes & Beverages',
    price: 130,
    prepTimeMins: 2,
    calories: 80,
    proteinG: 2,
    carbsG: 16,
    fatG: 1,
    isVeg: true,
    isAvailable: true,
    sku: 'JUC-COCO-03',
    barcode: '890123400403',
    taxRatePct: 5
  },

  // Guilt-Free Macro Desserts
  {
    id: 'pos-item-12',
    name: 'Almond Flour Sugar-Free Dark Chocolate Brownie',
    category: 'Macro Desserts',
    price: 150,
    prepTimeMins: 1,
    calories: 180,
    proteinG: 8,
    carbsG: 9,
    fatG: 12,
    isVeg: true,
    isAvailable: true,
    sku: 'DST-BRW-01',
    barcode: '890123400501',
    taxRatePct: 5
  },
  {
    id: 'pos-item-13',
    name: 'Organic Chia Seed & Alphonso Mango Pudding',
    category: 'Macro Desserts',
    price: 160,
    prepTimeMins: 1,
    calories: 160,
    proteinG: 6,
    carbsG: 18,
    fatG: 7,
    isVeg: true,
    isAvailable: true,
    sku: 'DST-CHIA-02',
    barcode: '890123400502',
    taxRatePct: 5
  },

  // Probiotic Wild Tepache Drinks (330ml Chilled Glass Bottles)
  {
    id: 'pos-item-tep-1',
    name: 'Wild Fermented Classic Pineapple & Cinnamon Tepache (330ml)',
    category: 'Probiotic Tepache Drinks',
    price: 140,
    prepTimeMins: 1,
    calories: 34,
    proteinG: 1,
    carbsG: 8,
    fatG: 0,
    isVeg: true,
    isAvailable: true,
    sku: 'TEP-BTL-PINECIN-330',
    barcode: '8906098210014',
    taxRatePct: 5
  },
  {
    id: 'pos-item-tep-2',
    name: 'Zesty Ginger, Kaffir Lime & Lemongrass Tepache (330ml)',
    category: 'Probiotic Tepache Drinks',
    price: 150,
    prepTimeMins: 1,
    calories: 31,
    proteinG: 1,
    carbsG: 7,
    fatG: 0,
    isVeg: true,
    isAvailable: true,
    sku: 'TEP-BTL-GGLIME-330',
    barcode: '8906098210021',
    taxRatePct: 5
  },
  {
    id: 'pos-item-tep-3',
    name: 'Ruby Wild Hibiscus & Cranberry Tepache (330ml)',
    category: 'Probiotic Tepache Drinks',
    price: 160,
    prepTimeMins: 1,
    calories: 32,
    proteinG: 1,
    carbsG: 8,
    fatG: 0,
    isVeg: true,
    isAvailable: true,
    sku: 'TEP-BTL-HIBBER-330',
    barcode: '8906098210038',
    taxRatePct: 5
  },
  {
    id: 'pos-item-tep-4',
    name: 'Tropical Passionfruit, Turmeric & Pepper Tepache (330ml)',
    category: 'Probiotic Tepache Drinks',
    price: 165,
    prepTimeMins: 1,
    calories: 35,
    proteinG: 1,
    carbsG: 8,
    fatG: 0,
    isVeg: true,
    isAvailable: true,
    sku: 'TEP-BTL-PASSTURM-330',
    barcode: '8906098210045',
    taxRatePct: 5
  }
];

export const INITIAL_POS_TRANSACTIONS: POSTransaction[] = [
  {
    id: 'pos-tx-101',
    receiptNumber: 'POS-KOC-10492',
    kotNumber: 'KOT-042',
    outletId: 'kochi',
    outletName: 'NutriFit Cloud Kitchen – Kochi Central HQ',
    orderType: 'takeaway',
    customerName: 'Rohit Balakrishnan',
    customerPhone: '+91 98471 22334',
    items: [
      {
        item: INITIAL_POS_ITEMS[0],
        quantity: 1,
        unitPrice: 320,
        lineTotal: 320,
        customization: 'Extra spicy, olive oil dressing on side'
      },
      {
        item: INITIAL_POS_ITEMS[8],
        quantity: 1,
        unitPrice: 220,
        lineTotal: 220
      }
    ],
    subtotal: 540,
    taxGst: 27,
    discount: 0,
    packagingCharge: 20,
    totalAmount: 587,
    paymentMode: 'upi',
    paymentDetails: {
      upiRef: 'UPI-9821892182@okhdfcbank'
    },
    status: 'completed',
    cashierName: 'Anjana Ramesh (Kochi POS Lead)',
    cashierId: 'staff-koc-pos',
    timestamp: '2026-08-15 12:45',
    notes: 'Walk-in IT Customer from Infopark Phase 1'
  },
  {
    id: 'pos-tx-102',
    receiptNumber: 'POS-TVM-08912',
    kotNumber: 'KOT-028',
    outletId: 'trivandrum',
    outletName: 'NutriFit Cloud Kitchen – Trivandrum Hub',
    orderType: 'counter_express',
    customerName: 'Dr. Meera Nambiar',
    customerPhone: '+91 94470 55667',
    items: [
      {
        item: INITIAL_POS_ITEMS[1],
        quantity: 2,
        unitPrice: 290,
        lineTotal: 580
      },
      {
        item: INITIAL_POS_ITEMS[9],
        quantity: 2,
        unitPrice: 160,
        lineTotal: 320
      }
    ],
    subtotal: 900,
    taxGst: 45,
    discount: 50,
    packagingCharge: 20,
    totalAmount: 915,
    paymentMode: 'card',
    paymentDetails: {
      cardLast4: '4489'
    },
    status: 'completed',
    cashierName: 'Gautham Menon (TVM Counter Lead)',
    cashierId: 'staff-tvm-pos',
    timestamp: '2026-08-15 13:10',
    notes: 'Technopark VIP member 50 INR discount applied'
  },
  {
    id: 'pos-tx-103',
    receiptNumber: 'POS-CLT-04312',
    kotNumber: 'KOT-019',
    outletId: 'kozhikode',
    outletName: 'NutriFit Cloud Kitchen – Kozhikode Cyber Hub',
    orderType: 'takeaway',
    customerName: 'Shabeer Rahman',
    customerPhone: '+91 94960 33441',
    items: [
      {
        item: INITIAL_POS_ITEMS[3],
        quantity: 1,
        unitPrice: 360,
        lineTotal: 360
      },
      {
        item: INITIAL_POS_ITEMS[11],
        quantity: 1,
        unitPrice: 150,
        lineTotal: 150
      }
    ],
    subtotal: 510,
    taxGst: 25.5,
    discount: 0,
    packagingCharge: 20,
    totalAmount: 555.5,
    paymentMode: 'cash',
    paymentDetails: {
      cashTendered: 600,
      changeReturned: 44.5
    },
    status: 'completed',
    cashierName: 'Najeeb P. (CLT Counter Lead)',
    cashierId: 'staff-clt-pos',
    timestamp: '2026-08-15 13:30',
    notes: 'Cyberpark employee cash walk-in'
  },
  {
    id: 'pos-tx-104',
    receiptNumber: 'POS-KOC-10493',
    kotNumber: 'KOT-043',
    outletId: 'kochi',
    outletName: 'NutriFit Cloud Kitchen – Kochi Central HQ',
    orderType: 'dine_in',
    customerName: 'Sneha & Arun',
    customerPhone: '+91 98470 88776',
    tableNumber: 'Table T-03',
    items: [
      {
        item: INITIAL_POS_ITEMS[0],
        quantity: 1,
        unitPrice: 320,
        lineTotal: 320
      },
      {
        item: INITIAL_POS_ITEMS[4],
        quantity: 1,
        unitPrice: 280,
        lineTotal: 280
      },
      {
        item: INITIAL_POS_ITEMS[10],
        quantity: 2,
        unitPrice: 130,
        lineTotal: 260
      }
    ],
    subtotal: 860,
    taxGst: 43,
    discount: 0,
    packagingCharge: 0,
    totalAmount: 903,
    paymentMode: 'split',
    paymentDetails: {
      splitCashAmount: 400,
      splitUpiAmount: 503,
      upiRef: 'UPI-SPLIT-992144'
    },
    status: 'completed',
    cashierName: 'Anjana Ramesh (Kochi POS Lead)',
    cashierId: 'staff-koc-pos',
    timestamp: '2026-08-15 13:42',
    notes: 'In-store health cafe dine in'
  }
];

export const INITIAL_POS_SHIFTS: POSCashDrawerShift[] = [
  {
    id: 'shift-koc-20260815-1',
    outletId: 'kochi',
    outletName: 'NutriFit Cloud Kitchen – Kochi Central HQ',
    cashierId: 'staff-koc-pos',
    cashierName: 'Anjana Ramesh',
    shiftStartTime: '2026-08-15 08:00',
    openingCashFloat: 2000,
    cashSalesTotal: 3840,
    upiSalesTotal: 18450,
    cardSalesTotal: 6200,
    cashDropOut: 0,
    expectedCashInDrawer: 5840,
    status: 'open'
  },
  {
    id: 'shift-tvm-20260815-1',
    outletId: 'trivandrum',
    outletName: 'NutriFit Cloud Kitchen – Trivandrum Hub',
    cashierId: 'staff-tvm-pos',
    cashierName: 'Gautham Menon',
    shiftStartTime: '2026-08-15 08:30',
    openingCashFloat: 1500,
    cashSalesTotal: 2450,
    upiSalesTotal: 12800,
    cardSalesTotal: 4100,
    cashDropOut: 0,
    expectedCashInDrawer: 3950,
    status: 'open'
  },
  {
    id: 'shift-clt-20260815-1',
    outletId: 'kozhikode',
    outletName: 'NutriFit Cloud Kitchen – Kozhikode Cyber Hub',
    cashierId: 'staff-clt-pos',
    cashierName: 'Najeeb P.',
    shiftStartTime: '2026-08-15 09:00',
    openingCashFloat: 1500,
    cashSalesTotal: 1980,
    upiSalesTotal: 9600,
    cardSalesTotal: 2800,
    cashDropOut: 0,
    expectedCashInDrawer: 3480,
    status: 'open'
  }
];
