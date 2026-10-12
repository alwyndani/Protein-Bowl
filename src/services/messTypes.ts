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
}
