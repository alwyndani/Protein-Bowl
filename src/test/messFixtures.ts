import type {
  MessCalendarMeal,
  MessKitchenBatch,
  MessKitchenDemand,
  MessMealCalendar,
  MessAccount,
  MessAdminAccount,
  MessAdminPlan,
  MessAdminServicePoint,
  MessAdminSubscription,
  MessPublicPlan,
  MessRun,
  MessStop,
  MessServicePointOption,
  MessSubscription
} from '../services/messTypes';

export const SP_A: MessServicePointOption = { id: 'a1111111-1111-4111-8111-111111111111', code: 'CUSAT-LH-B', name: 'CUSAT Ladies Hostel Block B', gateLabel: 'Main gate', city: 'Kochi' };
export const SP_B: MessServicePointOption = { id: 'b2222222-2222-4222-8222-222222222222', code: 'NIT-H1', name: 'NIT Hostel 1', gateLabel: null, city: 'Kozhikode' };

export function account(over: Partial<MessAccount> = {}): MessAccount {
  return {
    id: 'acc-1',
    approvalStatus: 'APPROVED',
    rejectionReasonCode: null,
    roomNumber: '204',
    studentIdCard: null,
    hostelName: SP_A.name,
    servicePoint: { ...SP_A, status: 'ACTIVE' },
    reviewedAt: '2026-10-12T08:00:00.000Z',
    createdAt: '2026-10-12T07:00:00.000Z',
    updatedAt: '2026-10-12T08:00:00.000Z',
    ...over
  };
}

export function publicPlan(over: Partial<MessPublicPlan> = {}): MessPublicPlan {
  return {
    id: 'plan-1',
    code: 'MONTHLY-LB',
    name: 'Monthly Lunch + Breakfast',
    description: 'Thirty days of home-style meals',
    durationDays: 30,
    mealsPerDay: 2,
    mealSlots: ['BREAKFAST', 'LUNCH'],
    mealsIncluded: 60,
    minStartLeadDays: 1,
    validFrom: null,
    validUntil: null,
    // deliberately odd numbers: the screen must render what the SERVER computed, never recompute
    price: { subtotal: 333.33, taxRate: 0.05, taxAmount: 16.67, total: 350, currency: 'INR' },
    ...over
  };
}

export function subscription(over: Partial<MessSubscription> = {}): MessSubscription {
  return {
    id: 'sub-1',
    status: 'PENDING_PAYMENT',
    plan: { code: 'MONTHLY-LB', name: 'Monthly Lunch + Breakfast', durationDays: 30, mealsPerDay: 2, mealSlots: ['BREAKFAST', 'LUNCH'] },
    startDate: '2026-10-20',
    endDate: '2026-11-18',
    mealsIncluded: 60,
    servicePoint: { id: SP_A.id, name: SP_A.name, gateLabel: 'Main gate', city: 'Kochi' },
    price: { subtotal: 333.33, taxRate: 0.05, taxAmount: 16.67, total: 350, currency: 'INR' },
    purchaseOrder: { id: 'order-mess-1', orderNumber: 'PB-261012-MESS01', paymentStatus: 'PENDING' },
    payment: { state: 'NOT_STARTED', canStartPayment: true },
    refund: { state: 'NO_REFUND' },
    cancellation: { allowed: true },
    activatedAt: null,
    cancelledAt: null,
    createdAt: '2026-10-12T09:00:00.000Z',
    ...over
  };
}

export const adminAccount = (over: Partial<MessAdminAccount> = {}): MessAdminAccount => ({
  id: 'acc-9',
  approvalStatus: 'PENDING',
  rejectionReasonCode: null,
  customerName: 'Sneha Joseph',
  phone: '+91 98950 44556',
  email: 'sneha@example.com',
  studentIdCard: 'STU-2026-88',
  roomNumber: '304',
  hostelName: SP_A.name,
  servicePoint: { id: SP_A.id, code: SP_A.code, name: SP_A.name, status: 'ACTIVE' },
  reviewedAt: null,
  createdAt: '2026-10-12T07:00:00.000Z',
  updatedAt: '2026-10-12T07:00:00.000Z',
  ...over
});

export const adminServicePoint = (over: Partial<MessAdminServicePoint> = {}): MessAdminServicePoint => ({
  id: SP_A.id,
  code: SP_A.code,
  name: SP_A.name,
  gateLabel: 'Main gate',
  addressLine: 'CUSAT Campus',
  city: 'Kochi',
  postalCode: '682022',
  status: 'ACTIVE',
  version: 3,
  branch: { id: '11111111-1111-4111-8111-111111111111', code: 'kochi', name: 'Kochi Central' },
  ...over
});

export const adminPlan = (over: Partial<MessAdminPlan> = {}): MessAdminPlan => ({
  id: 'plan-1',
  code: 'MONTHLY-LB',
  name: 'Monthly Lunch + Breakfast',
  description: null,
  status: 'DRAFT',
  version: 2,
  durationDays: 30,
  mealsPerDay: 2,
  mealSlots: ['BREAKFAST', 'LUNCH'],
  basePrice: 1000,
  taxRate: 0.05,
  pauseCutoffHours: 12,
  maxPauses: 4,
  minStartLeadDays: 1,
  slotTimes: { BREAKFAST: '08:00', LUNCH: '13:00' },
  validFrom: null,
  validUntil: null,
  branch: null,
  ...over
});

export const adminSubscription = (over: Partial<MessAdminSubscription> = {}): MessAdminSubscription => ({
  ...subscription(),
  customerName: 'Sneha Joseph',
  roomNumber: '304',
  branch: { id: '11111111-1111-4111-8111-111111111111', code: 'kochi', name: 'Kochi Central' },
  ...over
});

// ---------------------------------------------------------------------------------------------------- P10B
export const meal = (over: Partial<MessCalendarMeal> = {}): MessCalendarMeal => ({
  id: 'meal-1',
  date: '2026-10-20',
  slot: 'LUNCH',
  serviceAt: '2026-10-20T07:30:00.000Z', // 13:00 in Asia/Kolkata
  status: 'SCHEDULED',
  kitchenState: 'NOT_STARTED',
  canPause: true,
  canResume: false,
  reason: null,
  forfeitIfPaused: true,
  ...over
});

export const calendar = (meals: MessCalendarMeal[], over: Partial<MessMealCalendar['subscription']> = {}): MessMealCalendar => ({
  subscription: { status: 'ACTIVE', pausesUsed: 1, maxPauses: 3, pauseCutoffHours: 2, mealsReady: true, ...over },
  window: { from: '2026-10-20', to: '2026-10-22' },
  meals
});

const BR = { id: '11111111-1111-4111-8111-111111111111', code: 'kochi', name: 'Kochi Central' };
const SP1 = { id: 'sp-1', name: 'Hostel A1', gateLabel: 'Main gate' };
const SP2 = { id: 'sp-2', name: 'Hostel A2', gateLabel: null };
export const demand = (over: Partial<MessKitchenDemand> = {}): MessKitchenDemand => ({
  today: '2026-10-20',
  from: '2026-10-20',
  to: '2026-10-27',
  branchIds: [BR.id],
  groups: [
    { branch: BR, mealDate: '2026-10-20', slot: 'LUNCH', batchStatus: null, canStart: true, total: 3, servicePoints: [{ servicePoint: SP1, mealCount: 2 }, { servicePoint: SP2, mealCount: 1 }] },
    { branch: BR, mealDate: '2026-10-21', slot: 'LUNCH', batchStatus: null, canStart: false, total: 5, servicePoints: [{ servicePoint: SP1, mealCount: 5 }] }
  ],
  ...over
});

export const batch = (over: Partial<MessKitchenBatch> = {}): MessKitchenBatch => ({
  id: 'batch-1',
  branch: BR,
  mealDate: '2026-10-19',
  slot: 'BREAKFAST',
  status: 'PREPARING',
  mealCount: 4,
  startedAt: '2026-10-19T02:00:00.000Z',
  readyAt: null,
  servicePoints: [{ servicePoint: { id: 'sp-1', name: 'Hostel A1', gateLabel: null }, mealCount: 4 }],
  delivery: null,
  canRelease: false,
  ...over
});

// ---------------------------------------------------------------------------------------------------- P10C: bulk delivery
export const stop = (over: Partial<MessStop> = {}): MessStop => ({
  id: 'stop-1',
  servicePoint: { name: 'Hostel A1', gateLabel: 'Main gate', addressLine: 'CUSAT Campus', city: 'Kochi', postalCode: '682022', deliveryInstructions: 'Ring the bell twice' },
  expectedQuantity: 3,
  status: 'PENDING',
  attempt: { number: 1, max: 3 },
  failureCode: null,
  proof: { state: 'READY_FOR_VERIFICATION', lockedUntil: null },
  handedOverAt: null,
  handoverMethod: null,
  closedAt: null,
  ...over
});

export const messRun = (over: Partial<MessRun> = {}): MessRun => ({
  id: 'run-1',
  branch: BR,
  mealDate: '2026-10-20',
  slot: 'LUNCH',
  status: 'IN_TRANSIT',
  mealCount: 4,
  stopCount: 2,
  releasedAt: '2026-10-20T05:00:00.000Z',
  claimedAt: '2026-10-20T05:10:00.000Z',
  dispatchedAt: '2026-10-20T05:20:00.000Z',
  completedAt: null,
  closedAt: null,
  stops: [stop(), stop({ id: 'stop-2', servicePoint: { name: 'Hostel B2', gateLabel: null, addressLine: 'NIT Road', city: 'Kozhikode', postalCode: '673601', deliveryInstructions: null }, expectedQuantity: 1 })],
  ...over
});
