import { dateToString } from './messPolicy.js';
import { MessPricingService } from './messPricing.service.js';

/** Explicit projections only: nothing here is a raw Prisma row. No provider ids, wallet data, health data, planSnapshot internals or other customers' data. */

type BranchRef = { id: string; code: string; name: string };
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

// ---------------------------------------------------------------------------------------------------- service points
export function toAdminServicePointDto(sp: {
  id: string; code: string; name: string; gateLabel: string | null; deliveryInstructions?: string | null; addressLine: string; city: string; postalCode: string; status: string; version: number; createdAt: Date; updatedAt: Date;
  branch: BranchRef;
}) {
  return {
    id: sp.id, code: sp.code, name: sp.name, gateLabel: sp.gateLabel, deliveryInstructions: sp.deliveryInstructions ?? null, addressLine: sp.addressLine, city: sp.city, postalCode: sp.postalCode,
    status: sp.status, version: sp.version, branch: { id: sp.branch.id, code: sp.branch.code, name: sp.branch.name }, createdAt: sp.createdAt.toISOString(), updatedAt: sp.updatedAt.toISOString()
  };
}

/** What a customer may see when choosing where to receive meals: no branch, no internal ids beyond the service point id. */
export function toCustomerServicePointDto(sp: { id: string; code: string; name: string; gateLabel: string | null; city: string }) {
  return { id: sp.id, code: sp.code, name: sp.name, gateLabel: sp.gateLabel, city: sp.city };
}

// ---------------------------------------------------------------------------------------------------- plans
type PlanRow = {
  id: string; code: string; name: string; description: string | null; durationDays: number; mealsPerDay: number; basePrice: unknown; taxRate: unknown;
  status: string; mealSlots: string[]; validFrom: Date | null; validUntil: Date | null; pauseCutoffHours: number | null; maxPauses: number | null; minStartLeadDays: number | null;
  version: number; createdAt: Date; updatedAt: Date; branchId: string | null; branch?: BranchRef | null; slotTimes?: unknown;
};

export function toAdminPlanDto(p: PlanRow) {
  return {
    id: p.id, code: p.code, name: p.name, description: p.description, status: p.status, version: p.version,
    durationDays: p.durationDays, mealsPerDay: p.mealsPerDay, mealSlots: p.mealSlots,
    basePrice: num(p.basePrice), taxRate: num(p.taxRate),
    pauseCutoffHours: p.pauseCutoffHours, maxPauses: p.maxPauses, minStartLeadDays: p.minStartLeadDays, slotTimes: p.slotTimes ?? null,
    validFrom: p.validFrom ? dateToString(p.validFrom) : null, validUntil: p.validUntil ? dateToString(p.validUntil) : null,
    branch: p.branch ? { id: p.branch.id, code: p.branch.code, name: p.branch.name } : null,
    createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString()
  };
}

/** Customer-facing ACTIVE plan: the price shown is computed by the SAME pricing service the purchase uses. No branch, no pause policy. */
export function toPublicPlanDto(p: PlanRow) {
  const pricing = MessPricingService.calculate({ basePrice: p.basePrice as never, taxRate: p.taxRate as never });
  return {
    id: p.id, code: p.code, name: p.name, description: p.description,
    durationDays: p.durationDays, mealsPerDay: p.mealsPerDay, mealSlots: p.mealSlots,
    mealsIncluded: p.durationDays * p.mealsPerDay,
    minStartLeadDays: p.minStartLeadDays ?? 0,
    slotTimes: p.slotTimes ?? null,
    validFrom: p.validFrom ? dateToString(p.validFrom) : null, validUntil: p.validUntil ? dateToString(p.validUntil) : null,
    price: { subtotal: pricing.subtotal, taxRate: pricing.taxRate, taxAmount: pricing.taxAmount, total: pricing.total, currency: 'INR' as const }
  };
}

// ---------------------------------------------------------------------------------------------------- accounts
type AccountRow = {
  id: string; roomNumber: string; studentIdCard: string | null; collegeHostelName: string; approvalStatus: string; rejectionReasonCode: string | null;
  reviewedAt: Date | null; createdAt: Date; updatedAt: Date; servicePointId: string | null;
  servicePoint?: { id: string; code: string; name: string; gateLabel: string | null; city: string; status: string } | null;
};

export function toCustomerAccountDto(a: AccountRow) {
  return {
    id: a.id,
    approvalStatus: a.approvalStatus,
    rejectionReasonCode: a.approvalStatus === 'REJECTED' ? a.rejectionReasonCode : null,
    roomNumber: a.roomNumber,
    studentIdCard: a.studentIdCard,
    hostelName: a.collegeHostelName,
    servicePoint: a.servicePoint ? { id: a.servicePoint.id, code: a.servicePoint.code, name: a.servicePoint.name, gateLabel: a.servicePoint.gateLabel, city: a.servicePoint.city, status: a.servicePoint.status } : null,
    reviewedAt: iso(a.reviewedAt),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString()
  };
}

/** Staff view of an account. MD (viewer 'MD') never receives the student id card or the customer's phone. */
export function toAdminAccountDto(
  a: AccountRow & { customerProfile: { fullName: string; user: { phone: string | null; email: string } | null } },
  viewer: 'ADMIN' | 'MD'
) {
  return {
    id: a.id,
    approvalStatus: a.approvalStatus,
    rejectionReasonCode: a.rejectionReasonCode,
    customerName: a.customerProfile.fullName,
    ...(viewer === 'ADMIN' ? { phone: a.customerProfile.user?.phone ?? null, email: a.customerProfile.user?.email ?? null, studentIdCard: a.studentIdCard } : {}),
    roomNumber: a.roomNumber,
    hostelName: a.collegeHostelName,
    servicePoint: a.servicePoint ? { id: a.servicePoint.id, code: a.servicePoint.code, name: a.servicePoint.name, status: a.servicePoint.status } : null,
    reviewedAt: iso(a.reviewedAt),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString()
  };
}

// ---------------------------------------------------------------------------------------------------- subscriptions
interface SubscriptionRow {
  id: string; status: string; startDate: Date; endDate: Date; mealSlots: string[]; totalMealsAllowed: number; activatedAt: Date | null; cancelledAt: Date | null; cancellationReasonCode: string | null; createdAt: Date;
  planSnapshot: unknown;
  plan: { code: string; name: string; durationDays: number; mealsPerDay: number };
  servicePoint: { id: string; name: string; gateLabel: string | null; city: string } | null;
  purchaseOrder: { id: string; orderNumber: string; netAmount: unknown; totalAmount: unknown; taxAmount: unknown; paymentStatus: string; status: string } | null;
}

interface Derived {
  payment?: { state: string; canStartPayment: boolean };
  refund?: { state: string };
}

/** The customer's own subscription. `cancellable` is computed by the server (never by the web). */
export function toCustomerSubscriptionDto(s: SubscriptionRow, derived: Derived | undefined, cancellable: boolean) {
  const snap = (s.planSnapshot ?? {}) as { pricing?: { taxRate?: number } };
  return {
    id: s.id,
    status: s.status,
    plan: { code: s.plan.code, name: s.plan.name, durationDays: s.plan.durationDays, mealsPerDay: s.plan.mealsPerDay, mealSlots: s.mealSlots },
    startDate: dateToString(s.startDate),
    endDate: dateToString(s.endDate),
    mealsIncluded: s.totalMealsAllowed,
    servicePoint: s.servicePoint ? { id: s.servicePoint.id, name: s.servicePoint.name, gateLabel: s.servicePoint.gateLabel, city: s.servicePoint.city } : null,
    price: s.purchaseOrder
      ? { subtotal: Number(s.purchaseOrder.totalAmount), taxRate: snap.pricing?.taxRate ?? null, taxAmount: Number(s.purchaseOrder.taxAmount), total: Number(s.purchaseOrder.netAmount), currency: 'INR' as const }
      : null,
    purchaseOrder: s.purchaseOrder ? { id: s.purchaseOrder.id, orderNumber: s.purchaseOrder.orderNumber, paymentStatus: s.purchaseOrder.paymentStatus } : null,
    payment: derived?.payment ?? null,
    refund: derived?.refund ?? { state: 'NO_REFUND' },
    cancellation: { allowed: cancellable },
    activatedAt: iso(s.activatedAt),
    cancelledAt: iso(s.cancelledAt),
    createdAt: s.createdAt.toISOString()
  };
}

export function toAdminSubscriptionDto(
  s: SubscriptionRow & { messAccount: { roomNumber: string; customerProfile: { fullName: string } }; branch: BranchRef | null },
  derived: Derived | undefined,
  cancellable: boolean
) {
  return {
    ...toCustomerSubscriptionDto(s, derived, cancellable),
    customerName: s.messAccount.customerProfile.fullName,
    roomNumber: s.messAccount.roomNumber,
    branch: s.branch ? { id: s.branch.id, code: s.branch.code, name: s.branch.name } : null
  };
}
