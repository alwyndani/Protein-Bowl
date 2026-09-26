import { DirectGuestOrder, RetailCustomerAccount } from '../types';

export const INITIAL_RETAIL_ACCOUNTS: RetailCustomerAccount[] = [
  {
    id: 'retail-cust-01',
    phone: '+91 98470 12345',
    name: 'Ananya Varma',
    email: 'ananya.varma@gmail.com',
    defaultAddress: 'Flat 4B, Skyline Ivy, Jawahar Nagar, Kadavanthra',
    landmark: 'Near Regional Sports Centre',
    pincode: '682020',
    hubPreference: 'hub-koc',
    bottleDepositBalance: 30, // 3 bottles returnable credit
    totalOrdersCount: 3,
    orderIds: ['dir-ord-101', 'dir-ord-102'],
    createdAt: '2026-08-01 11:20'
  },
  {
    id: 'retail-cust-02',
    phone: '+91 94471 88990',
    name: 'Dr. Vivek Menon',
    email: 'vivek.menon@kimshealth.org',
    defaultAddress: 'Villa 12, Technopark Boulevard, Kazhakkoottam',
    landmark: 'Opposite UST Global Campus',
    pincode: '695581',
    hubPreference: 'hub-tvm',
    bottleDepositBalance: 20,
    totalOrdersCount: 2,
    orderIds: ['dir-ord-103'],
    createdAt: '2026-08-05 14:10'
  }
];

export const INITIAL_DIRECT_ORDERS: DirectGuestOrder[] = [
  {
    id: 'dir-ord-101',
    orderNumber: 'DIR-894210',
    orderType: 'mixed_wellness',
    customerName: 'Ananya Varma',
    customerPhone: '+91 98470 12345',
    customerEmail: 'ananya.varma@gmail.com',
    deliveryAddress: 'Flat 4B, Skyline Ivy, Jawahar Nagar, Kadavanthra',
    landmark: 'Near Regional Sports Centre',
    pincode: '682020',
    fulfillmentHub: 'Kochi Central Hub & Central Bakery (Kakkanad HQ)',
    fulfillmentMode: 'express_home_delivery',
    deliveryDate: '2026-08-17',
    deliverySlot: 'Morning (8:00 AM - 11:00 AM)',
    items: [
      {
        id: 'tep-prod-01',
        name: 'Wild Fermented Classic Pineapple & Ceylon Cinnamon Tepache',
        sku: 'TEP-BTL-PINECIN-330',
        category: 'Probiotic Tepache Drinks',
        quantity: 2,
        unitPrice: 140,
        lineTotal: 280,
        sizeOrWeight: '330ml',
        storageType: 'Keep Chilled (2°C - 6°C)'
      },
      {
        id: 'prod-ab-01',
        name: '100% Whole Wheat Artisan Country Sourdough Loaf',
        sku: 'BAK-SD-01',
        category: 'artisan_breads',
        quantity: 1,
        unitPrice: 120,
        lineTotal: 120,
        sizeOrWeight: '450g',
        storageType: 'Cool & Dry (20°C - 24°C)'
      }
    ],
    subtotal: 400,
    deliveryFee: 40,
    packagingFee: 25,
    gstAmount: 20,
    discountAmount: 0,
    bottleDepositTotal: 20, // 2 bottles
    grandTotal: 505,
    paymentMode: 'upi_instant',
    paymentStatus: 'paid',
    orderStatus: 'packing_in_hub',
    orderNotes: 'Please ring bell twice and leave with security if not home.',
    coldChainRequired: true,
    riderName: 'Cold Courier Rider Suresh M.',
    riderPhone: '+91 98470 22334',
    trackingUpdates: [
      {
        stage: 'Order Confirmed & Paid',
        time: '08:15 AM',
        description: 'UPI transaction verified & allocated to Kochi Central Hub.',
        completed: true
      },
      {
        stage: 'Central Bakery & Chilled Store Picked',
        time: '08:35 AM',
        description: 'Country Sourdough baked fresh today & 2x chilled Tepache bottles picked.',
        completed: true
      },
      {
        stage: 'Thermal Cold Box Insulation Packing',
        time: '08:50 AM',
        description: 'Packed with reusable freeze-gel chill packs in insulated eco-liner.',
        completed: true
      },
      {
        stage: 'Out for Delivery (Cold Van)',
        time: 'In Transit',
        description: 'Courier rider Suresh is en-route to Kadavanthra.',
        completed: false
      }
    ],
    createdAt: '2026-08-17 08:15'
  },
  {
    id: 'dir-ord-103',
    orderNumber: 'DIR-741289',
    orderType: 'tepache_drinks',
    customerName: 'Dr. Vivek Menon',
    customerPhone: '+91 94471 88990',
    customerEmail: 'vivek.menon@kimshealth.org',
    deliveryAddress: 'Villa 12, Technopark Boulevard, Kazhakkoottam',
    landmark: 'Opposite UST Global Campus',
    pincode: '695581',
    fulfillmentHub: 'Trivandrum South Coast Hub (Kowdiar & Technopark)',
    fulfillmentMode: 'express_home_delivery',
    deliveryDate: '2026-08-16',
    deliverySlot: 'Morning (8:00 AM - 11:00 AM)',
    items: [
      {
        id: 'tep-prod-02',
        name: 'Zesty Ginger, Kaffir Lime & Lemongrass Tepache',
        sku: 'TEP-BTL-GGLIME-330',
        category: 'Probiotic Tepache Drinks',
        quantity: 2,
        unitPrice: 150,
        lineTotal: 300,
        sizeOrWeight: '330ml',
        storageType: 'Keep Chilled (2°C - 6°C)'
      },
      {
        id: 'tep-prod-03',
        name: 'Ruby Wild Hibiscus & Cranberry Tepache Elixir',
        sku: 'TEP-BTL-HIBISC-330',
        category: 'Probiotic Tepache Drinks',
        quantity: 2,
        unitPrice: 160,
        lineTotal: 320,
        sizeOrWeight: '330ml',
        storageType: 'Keep Chilled (2°C - 6°C)'
      }
    ],
    subtotal: 620,
    deliveryFee: 0,
    packagingFee: 25,
    gstAmount: 31,
    discountAmount: 0,
    bottleDepositTotal: 40,
    grandTotal: 716,
    paymentMode: 'upi_instant',
    paymentStatus: 'paid',
    orderStatus: 'delivered',
    coldChainRequired: true,
    riderName: 'Logistics Rider Anil Kumar',
    riderPhone: '+91 94470 55441',
    trackingUpdates: [
      {
        stage: 'Order Confirmed',
        time: '09:00 AM',
        description: 'Verified at Trivandrum hub.',
        completed: true
      },
      {
        stage: 'Cold Packed',
        time: '09:30 AM',
        description: 'Packed at 3.5°C with gel pack.',
        completed: true
      },
      {
        stage: 'Delivered',
        time: '10:45 AM',
        description: 'Delivered to Dr. Vivek Menon at Kazhakkoottam.',
        completed: true
      }
    ],
    createdAt: '2026-08-16 09:00'
  }
];
