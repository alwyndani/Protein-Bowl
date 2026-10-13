/** Kerala Mess API types (P10A). Mirrors the server's explicit DTOs; money is formatted by the UI only, never computed. */

export type MessApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type MessSubscriptionStatus = 'PENDING_PAYMENT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type MessPlanStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type MealSlot = 'BREAKFAST' | 'LUNCH' | 'DINNER';

export interface MessServicePointOption {
  id: string;
  code: string;
  name: string;
  gateLabel: string | null;
  city: string;
}

export interface MessAccount {
  id: string;
  approvalStatus: MessApprovalStatus;
  rejectionReasonCode: string | null;
  roomNumber: string;
  studentIdCard: string | null;
  hostelName: string;
  servicePoint: (MessServicePointOption & { status: string }) | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessPlanPrice {
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency: 'INR';
}

export interface MessPublicPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  durationDays: number;
  mealsPerDay: number;
  mealSlots: MealSlot[];
  mealsIncluded: number;
  minStartLeadDays: number;
  slotTimes?: SlotTimes | null;
  validFrom: string | null;
  validUntil: string | null;
  price: MessPlanPrice;
}

export type MessPaymentState = 'NOT_STARTED' | 'AWAITING_PAYMENT' | 'CONFIRMING' | 'PAID';

export interface MessSubscription {
  id: string;
  status: MessSubscriptionStatus;
  plan: { code: string; name: string; durationDays: number; mealsPerDay: number; mealSlots: MealSlot[] };
  startDate: string;
  endDate: string;
  mealsIncluded: number;
  servicePoint: { id: string; name: string; gateLabel: string | null; city: string } | null;
  price: { subtotal: number; taxRate: number | null; taxAmount: number; total: number; currency: 'INR' } | null;
  purchaseOrder: { id: string; orderNumber: string; paymentStatus: string } | null;
  payment: { state: MessPaymentState; canStartPayment: boolean } | null;
  refund: { state: string };
  cancellation: { allowed: boolean };
  activatedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

export interface MessAdminSubscription extends MessSubscription {
  customerName: string;
  roomNumber: string;
  branch: { id: string; code: string; name: string } | null;
}

export interface MessAdminAccount {
  id: string;
  approvalStatus: MessApprovalStatus;
  rejectionReasonCode: string | null;
  customerName: string;
  phone?: string | null;
  email?: string | null;
  studentIdCard?: string | null;
  roomNumber: string;
  hostelName: string;
  servicePoint: { id: string; code: string; name: string; status: string } | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessAdminServicePoint {
  id: string;
  code: string;
  name: string;
  gateLabel: string | null;
  addressLine: string;
  city: string;
  postalCode: string;
  status: 'ACTIVE' | 'INACTIVE';
  version: number;
  branch: { id: string; code: string; name: string };
}

export interface MessAdminPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: MessPlanStatus;
  version: number;
  durationDays: number;
  mealsPerDay: number;
  mealSlots: MealSlot[];
  basePrice: number | null;
  taxRate: number | null;
  pauseCutoffHours: number | null;
  maxPauses: number | null;
  minStartLeadDays: number | null;
  slotTimes: SlotTimes | null;
  validFrom: string | null;
  validUntil: string | null;
  branch: { id: string; code: string; name: string } | null;
}

export interface MessAccountInput {
  servicePointId: string;
  roomNumber: string;
  studentIdCard?: string | null;
}

export interface MessCancelResult {
  subscriptionId: string;
  status: 'CANCELLED';
  alreadyCancelled: boolean;
  refund: { state: string };
  payment: { state: MessPaymentState; canStartPayment: boolean } | null;
}

export interface MessServicePointInput {
  code: string;
  name: string;
  gateLabel?: string | null;
  addressLine: string;
  city: string;
  postalCode: string;
  branchId: string;
}

export interface MessPlanInput {
  code?: string;
  name?: string;
  description?: string | null;
  durationDays?: number;
  basePrice?: string;
  taxRate?: string | null;
  mealSlots?: MealSlot[];
  pauseCutoffHours?: number | null;
  maxPauses?: number | null;
  minStartLeadDays?: number | null;
  validFrom?: string | null;
  validUntil?: string | null;
  branchId?: string | null;
  slotTimes?: SlotTimes | null;
}

// ---------------------------------------------------------------------------------------------------- P10B: meals, calendar, kitchen
export type MessMealStatus = 'SCHEDULED' | 'PAUSED' | 'CANCELLED' | 'FULFILLED';
export type MessKitchenState = 'NOT_STARTED' | 'IN_PREPARATION' | 'READY';
export type MealUnavailableReason = 'SUBSCRIPTION_NOT_ACTIVE' | 'MEAL_FROZEN' | 'PAUSE_CUTOFF_PASSED' | 'PAUSE_LIMIT_REACHED' | 'NOT_SCHEDULED' | 'NOT_PAUSED' | 'MEAL_CANCELLED';

export interface MessCalendarMeal {
  id: string;
  date: string;
  slot: MealSlot;
  serviceAt: string;
  status: MessMealStatus;
  kitchenState: MessKitchenState;
  canPause: boolean;
  canResume: boolean;
  reason: MealUnavailableReason | null;
  forfeitIfPaused: boolean;
}

export interface MessMealCalendar {
  subscription: { status: string; pausesUsed: number; maxPauses: number | null; pauseCutoffHours: number | null; mealsReady: boolean };
  window?: { from: string; to: string };
  meals: MessCalendarMeal[];
}

export interface MessMealChange {
  changed: boolean;
  mealId: string;
  status: string;
  pausesUsed: number;
  maxPauses: number | null;
}

export interface MessServicePointCount {
  servicePoint: { id: string; name: string; gateLabel: string | null };
  mealCount: number;
}

export interface MessKitchenDemandGroup {
  branch: { id: string; code: string; name: string };
  mealDate: string;
  slot: MealSlot;
  batchStatus: 'PREPARING' | 'READY' | null;
  canStart: boolean;
  total: number;
  servicePoints: MessServicePointCount[];
}

export interface MessKitchenDemand {
  today: string;
  from: string;
  to: string;
  branchIds: string[];
  groups: MessKitchenDemandGroup[];
}

export interface MessKitchenBatch {
  id: string;
  branch: { id: string; code: string; name: string };
  mealDate: string;
  slot: MealSlot;
  status: 'PREPARING' | 'READY';
  mealCount: number;
  startedAt: string;
  readyAt: string | null;
  servicePoints: MessServicePointCount[];
}

export type SlotTimes = Partial<Record<MealSlot, string>>;
