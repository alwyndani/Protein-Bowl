import type { PaymentState, RefundState } from '../commerce/types';

/**
 * Strict DTOs for the Kerala Mess customer API (audited against server/src/modules/mess/messDto.ts). Allow-list only: nothing the
 * customer app does not render is modelled, and every figure is a server value shown verbatim (no arithmetic on the device).
 * Missing values stay null so the UI can say "Not provided" instead of inventing a default.
 */
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type SubscriptionStatus = 'PENDING_PAYMENT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface MessServicePoint {
  id: string;
  code: string;
  name: string;
  gateLabel: string | null;
  city: string;
}

export interface MessPrice {
  subtotal: number;
  taxAmount: number;
  total: number;
  currency: 'INR';
}

export interface MessPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  durationDays: number;
  mealsPerDay: number;
  mealSlots: string[];
  mealsIncluded: number;
  minStartLeadDays: number;
  slotTimes: Record<string, string> | null;
  validFrom: string | null;
  validUntil: string | null;
  price: MessPrice;
}

export interface MessAccount {
  id: string;
  approvalStatus: ApprovalStatus;
  rejectionReasonCode: string | null;
  roomNumber: string;
  studentIdCard: string | null;
  hostelName: string;
  servicePoint: (MessServicePoint & { status: string }) | null;
  reviewedAt: string | null;
}

export interface AccountInput {
  servicePointId: string;
  roomNumber: string;
  studentIdCard?: string;
}

export interface MessSubscription {
  id: string;
  status: SubscriptionStatus;
  plan: { code: string; name: string; durationDays: number; mealsPerDay: number; mealSlots: string[] };
  startDate: string;
  endDate: string;
  mealsIncluded: number;
  servicePoint: { id: string; name: string; gateLabel: string | null; city: string } | null;
  price: MessPrice | null;
  purchaseOrder: { id: string; orderNumber: string; paymentStatus: string } | null;
  payment: { state: PaymentState; canStartPayment: boolean } | null;
  refund: { state: RefundState };
  cancellation: { allowed: boolean };
  activatedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

export interface PurchaseResult {
  subscription: MessSubscription;
  replay: boolean;
}

export type MealStatus = 'SCHEDULED' | 'PAUSED' | 'CANCELLED' | 'FULFILLED' | 'NOT_DELIVERED' | string;
export type KitchenState = 'NOT_STARTED' | 'IN_PREPARATION' | 'READY' | 'OUT_FOR_DELIVERY' | string;

export interface MessMeal {
  id: string;
  date: string;
  slot: string;
  serviceAt: string;
  status: MealStatus;
  kitchenState: KitchenState;
  canPause: boolean;
  canResume: boolean;
  reason: string | null;
  forfeitIfPaused: boolean;
}

export interface MealCalendar {
  subscription: { status: SubscriptionStatus; pausesUsed: number; maxPauses: number | null; pauseCutoffHours: number | null; mealsReady: boolean };
  window?: { from: string; to: string };
  meals: MessMeal[];
}

export interface MealActionResult {
  changed: boolean;
  mealId: string;
  status: MealStatus;
  pausesUsed: number;
  maxPauses: number | null;
}

export type HandoverState = 'NOT_AVAILABLE' | 'NOT_ISSUED' | 'ISSUED_TO_YOU' | 'ISSUED_TO_ANOTHER' | 'LOCKED' | 'CODE_BLOCKED' | 'CODE_EXPIRED' | 'VERIFIED';

export interface HandoverStatus {
  state: HandoverState;
  expiresAt?: string;
  regenerationsLeft?: number;
  lockedUntil?: string;
}

/** The ONLY response that carries the plaintext code. It is held in component memory only and never cached, stored or logged. */
export interface HandoverIssued {
  state: 'ISSUED_TO_YOU';
  code: string;
  expiresAt: string;
  regenerationsLeft: number;
}

export const CANCEL_REASONS = [
  { code: 'CHANGED_MIND', label: 'I changed my mind' },
  { code: 'ORDERED_BY_MISTAKE', label: 'I ordered by mistake' },
  { code: 'WRONG_PLAN', label: 'I chose the wrong plan' },
  { code: 'WRONG_START_DATE', label: 'I chose the wrong start date' },
  { code: 'OTHER', label: 'Something else' }
] as const;
export type CancelReasonCode = (typeof CANCEL_REASONS)[number]['code'];

export interface CancelResult {
  subscriptionId: string;
  status: 'CANCELLED';
  alreadyCancelled: boolean;
  refund: { state: RefundState };
  payment: { state: PaymentState; canStartPayment: boolean } | null;
}
