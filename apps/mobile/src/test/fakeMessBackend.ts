import React from 'react';
import { render } from '@testing-library/react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../auth/AuthProvider';
import { SessionManager } from '../auth/sessionManager';
import { secureSessionStorage } from '../auth/secureSession';
import { MessNavigator } from '../navigation/MessNavigator';
import type { MessStackParamList } from '../navigation/MessNavigator';
import { PaymentEvidenceProvider, PaymentEvidenceStore } from '../payments/paymentEvidenceStore';
import { FakeBackend } from './fakeBackend';

// Local copies of the harness constants: importing harness.tsx would pull in the whole app tree (AppRoot), which this suite does not need.
const BASE = 'https://api.test/api/v1';
const CLIENT = 'protein-bowl-mobile/1.0.0 (android)';

/** Put a valid credential into the (mock) keychain exactly as a previous run would have, then forget the traffic. */
async function seedDevice(backend: FakeBackend, email: string) {
  if (!backend.users.has(email)) backend.addUser({ email, fullName: 'Asha Rao' });
  const m = new SessionManager({ storage: secureSessionStorage, baseUrl: BASE, clientHeader: CLIENT, fetchImpl: backend.fetch as unknown as typeof fetch });
  await m.signIn(email, 'Password-123');
  backend.log.length = 0;
}

/**
 * Kerala Mess test double mirroring the AUDITED backend contract (server/src/modules/mess: routes, envelopes, DTO shapes, error codes,
 * idempotency, cancellation and pause rules) plus the order / payment-attempt endpoints the existing payment flow talks to. The real
 * behaviour is proven by the backend suites; this only lets the mobile tests drive the real screens. Test support only.
 */
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEX64 = 'a'.repeat(64);

export interface FakeMeal {
  id: string;
  date: string;
  slot: string;
  serviceAt: string;
  status: string;
  kitchenState: string;
  canPause: boolean;
  canResume: boolean;
  reason: string | null;
}

interface FakeSub {
  id: string;
  ownerId: string;
  status: 'PENDING_PAYMENT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  planId: string;
  startDate: string;
  endDate: string;
  orderId: string;
  /** ACTIVE subscriptions may be cancelled only while they have not started. */
  startsLater: boolean;
  refund: string;
  paid: boolean;
  cancelledAt: string | null;
}

export interface FakeHandover {
  state: string;
  code: string | null;
  left: number;
}

export class FakeMessBackend extends FakeBackend {
  servicePoints = [
    { id: 'sp-1', code: 'HOSTEL-A', name: 'Hostel A Gate', gateLabel: 'Main gate', city: 'Kochi' },
    { id: 'sp-2', code: 'HOSTEL-B', name: 'Hostel B Gate', gateLabel: null, city: 'Kochi' }
  ];
  plans = [
    {
      id: 'plan-1',
      code: 'LUNCH-30',
      name: 'Lunch 30 days',
      description: 'A home-style lunch every day',
      durationDays: 30,
      mealsPerDay: 1,
      mealSlots: ['LUNCH'],
      mealsIncluded: 30,
      minStartLeadDays: 2,
      slotTimes: { LUNCH: '13:00' } as Record<string, string> | null,
      validFrom: null,
      validUntil: null,
      price: { subtotal: 3000, taxRate: 0.05, taxAmount: 150, total: 3150, currency: 'INR' }
    }
  ];
  accounts = new Map<string, Record<string, any>>();
  subs: FakeSub[] = [];
  meals = new Map<string, FakeMeal[]>();
  handover = new Map<string, FakeHandover>();
  orderPayments = new Map<string, { attemptId: string | null }>();
  idempotent = new Map<string, { planId: string; startDate: string; subId: string }>();
  pausesUsed = 0;
  maxPauses: number | null = 3;
  mealsReady = true;
  /** Dates (YYYY-MM-DD) earlier than this are refused with 422 START_DATE_TOO_EARLY. */
  earliestStart = '2000-01-01';
  /** After the next POST /mess/subscriptions is COMMITTED the response is lost (network error). */
  loseNextPurchaseResponse = false;
  /** Whether an ACTIVE subscription created by payment starts in the future (cancellable). */
  newSubscriptionsStartLater = true;
  private seq = 0;

  constructor() {
    super();
    const base = this.fetch;
    this.fetch = (url: string, init: RequestInit = {}): Promise<Response> => {
      const path = url.replace(/^https?:\/\/[^/]+\/api\/v1/, '');
      if (this.loseNextPurchaseResponse && path === '/mess/subscriptions' && (init.method ?? 'GET') === 'POST') {
        this.loseNextPurchaseResponse = false;
        return base(url, init).then(() => {
          throw new TypeError('Network request failed');
        });
      }
      return base(url, init);
    };
  }

  // ------------------------------------------------------------------ test helpers
  userId(email = 'cust@b.test'): string {
    return this.users.get(email)!.id;
  }

  approveAccount(userId: string) {
    const a = this.accounts.get(userId)!;
    a.approvalStatus = 'APPROVED';
    a.reviewedAt = '2026-11-02T10:00:00.000Z';
  }

  seedAccount(userId: string, approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' = 'APPROVED', extra: Record<string, unknown> = {}) {
    const sp = this.servicePoints[0];
    this.accounts.set(userId, {
      id: `acc-${userId}`,
      approvalStatus,
      rejectionReasonCode: approvalStatus === 'REJECTED' ? 'INCOMPLETE_DETAILS' : null,
      roomNumber: 'B-204',
      studentIdCard: null,
      hostelName: sp.name,
      servicePoint: { ...sp, status: 'ACTIVE' },
      reviewedAt: null,
      ...extra
    });
  }

  seedSubscription(userId: string, status: FakeSub['status'] = 'ACTIVE', extra: Partial<FakeSub> = {}): FakeSub {
    const n = ++this.seq;
    const orderId = `ord-m${n}`;
    const sub: FakeSub = {
      id: `sub-${n}`,
      ownerId: userId,
      status,
      planId: 'plan-1',
      startDate: '2026-12-01',
      endDate: '2026-12-30',
      orderId,
      startsLater: true,
      refund: 'NO_REFUND',
      paid: status === 'ACTIVE' || status === 'COMPLETED',
      cancelledAt: null,
      ...extra
    };
    this.subs.unshift(sub);
    this.orderPayments.set(orderId, { attemptId: null });
    return sub;
  }

  seedMeals(subId: string, meals: Array<Partial<FakeMeal> & { id: string }>) {
    this.meals.set(
      subId,
      meals.map((m) => ({
        date: '2026-12-01',
        slot: 'LUNCH',
        serviceAt: '2026-12-01T07:30:00.000Z',
        status: 'SCHEDULED',
        kitchenState: 'NOT_STARTED',
        canPause: true,
        canResume: false,
        reason: null,
        ...m
      }))
    );
  }

  // ------------------------------------------------------------------ DTOs
  private plan(id: string) {
    return this.plans.find((p) => p.id === id)!;
  }

  private order(sub: FakeSub) {
    const plan = this.plan(sub.planId);
    const cancelled = sub.status === 'CANCELLED';
    return {
      id: sub.orderId,
      orderNumber: `PB-261104-M${sub.id.replace(/\D/g, '').padStart(5, '0')}`,
      status: sub.paid ? 'CONFIRMED' : cancelled ? 'CANCELLED' : 'PENDING',
      orderType: 'MESS_SUBSCRIPTION',
      paymentStatus: sub.paid ? 'PAID' : 'PENDING',
      paymentMethod: 'ONLINE',
      totalAmount: String(plan.price.subtotal),
      discountAmount: '0',
      taxAmount: String(plan.price.taxAmount),
      deliveryFee: '0',
      packagingFee: '0',
      containerDepositTotal: '0',
      netAmount: String(plan.price.total),
      deliveryAddress: null,
      deliveryAddressSnapshot: null,
      confirmedAt: null,
      cancelledAt: null,
      createdAt: '2026-11-04T10:00:00.000Z',
      updatedAt: '2026-11-04T10:00:00.000Z',
      items: [],
      cancellation: { state: cancelled ? 'CANCELLED' : 'CANCELLATION_NOT_ALLOWED', allowed: false },
      refund: { state: sub.refund },
      payment: sub.paid
        ? { state: 'PAID', canStartPayment: false }
        : cancelled
          ? { state: 'NOT_STARTED', canStartPayment: false }
          : { state: this.orderPayments.get(sub.orderId)?.attemptId ? 'AWAITING_PAYMENT' : 'NOT_STARTED', canStartPayment: true }
    };
  }

  private subDto(sub: FakeSub) {
    const plan = this.plan(sub.planId);
    const o = this.order(sub);
    return {
      id: sub.id,
      status: sub.status,
      plan: { code: plan.code, name: plan.name, durationDays: plan.durationDays, mealsPerDay: plan.mealsPerDay, mealSlots: plan.mealSlots },
      startDate: sub.startDate,
      endDate: sub.endDate,
      mealsIncluded: plan.mealsIncluded,
      servicePoint: { id: 'sp-1', name: 'Hostel A Gate', gateLabel: 'Main gate', city: 'Kochi' },
      price: { subtotal: plan.price.subtotal, taxRate: plan.price.taxRate, taxAmount: plan.price.taxAmount, total: plan.price.total, currency: 'INR' },
      purchaseOrder: { id: sub.orderId, orderNumber: o.orderNumber, paymentStatus: o.paymentStatus },
      payment: o.payment,
      refund: { state: sub.refund },
      cancellation: { allowed: this.cancellable(sub) },
      activatedAt: sub.status === 'ACTIVE' ? '2026-11-04T10:05:00.000Z' : null,
      cancelledAt: sub.cancelledAt,
      createdAt: '2026-11-04T10:00:00.000Z'
    };
  }

  private cancellable(sub: FakeSub): boolean {
    return sub.status === 'PENDING_PAYMENT' || (sub.status === 'ACTIVE' && sub.startsLater);
  }

  private ownSub(uid: string, id: string): FakeSub | undefined {
    return this.subs.find((s) => s.id === id && s.ownerId === uid);
  }

  // ------------------------------------------------------------------ routing
  protected route(path: string, headers: Record<string, string>, body: any): Response {
    const method = (this.log[this.log.length - 1]?.method ?? 'GET').toUpperCase();
    const clean = path.split('?')[0];
    const query = path.includes('?') ? new URLSearchParams(path.split('?')[1]) : new URLSearchParams();
    if (!/^\/(mess|orders)(\/|$)/.test(clean)) return super.route(path, headers, body);

    // /mess/plans is public on the server; every other route needs the CUSTOMER role.
    if (clean === '/mess/plans' && method === 'GET') {
      const sp = query.get('servicePointId');
      return this.respond(200, { success: true, data: sp && sp !== 'sp-1' && sp !== 'sp-2' ? [] : this.plans });
    }

    const user = this.bearer(headers);
    if (!user) return this.err(401, 'UNAUTHORIZED');
    if (!user.roles.includes('CUSTOMER')) return this.err(403, 'FORBIDDEN');
    const uid = user.id;
    const ok = (data: unknown, status = 200) => this.respond(status, { success: true, data });

    // ---- orders used by the existing payment flow
    if (clean === '/orders/my-orders') return ok(this.subs.filter((s) => s.ownerId === uid).map((s) => this.order(s)));
    const ordMatch = clean.match(/^\/orders\/([^/]+)$/);
    if (ordMatch && method === 'GET') {
      const sub = this.subs.find((s) => s.orderId === ordMatch[1] && s.ownerId === uid);
      return sub ? ok({ ...this.order(sub), timeline: [] }) : this.err(404, 'NOT_FOUND');
    }
    const attemptCreate = clean.match(/^\/orders\/([^/]+)\/payment-attempts$/);
    if (attemptCreate && method === 'POST') {
      const sub = this.subs.find((s) => s.orderId === attemptCreate[1] && s.ownerId === uid);
      if (!sub) return this.err(404, 'NOT_FOUND');
      if (sub.paid || sub.status !== 'PENDING_PAYMENT') return this.err(409, 'ORDER_NOT_PAYABLE');
      this.orderPayments.set(sub.orderId, { attemptId: 'att-1' });
      return ok({ attemptId: 'att-1', provider: 'razorpay', keyId: 'public_key_id_1', providerOrderId: 'order_MESS1', amountMinor: this.plan(sub.planId).price.total * 100, currency: 'INR', orderNumber: this.order(sub).orderNumber, expiresAt: '2026-11-04T11:00:00.000Z', status: 'PENDING' }, 201);
    }
    const attemptVerify = clean.match(/^\/orders\/([^/]+)\/payment-attempts\/([^/]+)\/verify$/);
    if (attemptVerify && method === 'POST') {
      const sub = this.subs.find((s) => s.orderId === attemptVerify[1] && s.ownerId === uid);
      if (!sub) return this.err(404, 'NOT_FOUND');
      sub.paid = true; // verified settlement: the server marks the order paid AND activates the subscription
      sub.status = 'ACTIVE';
      sub.startsLater = this.newSubscriptionsStartLater;
      return ok({ result: 'PAID', orderStatus: 'CONFIRMED', orderPaymentStatus: 'PAID' });
    }
    const attemptGet = clean.match(/^\/orders\/([^/]+)\/payment-attempts\/([^/]+)$/);
    if (attemptGet && method === 'GET') {
      const sub = this.subs.find((s) => s.orderId === attemptGet[1] && s.ownerId === uid);
      if (!sub) return this.err(404, 'NOT_FOUND');
      return ok({ attemptId: attemptGet[2], status: sub.paid ? 'SUCCESS' : 'PENDING', expiresAt: null, lastError: null, orderStatus: this.order(sub).status, orderPaymentStatus: this.order(sub).paymentStatus });
    }

    // ---- service points / account
    if (clean === '/mess/service-points') return ok({ servicePoints: this.servicePoints });
    if (clean === '/mess/account' && method === 'GET') return ok({ account: this.accounts.get(uid) ?? null });
    if (clean === '/mess/account' && method === 'PUT') {
      const keys = Object.keys(body ?? {});
      if (keys.some((k) => !['servicePointId', 'roomNumber', 'studentIdCard'].includes(k))) return this.err(422, 'VALIDATION_ERROR');
      const sp = this.servicePoints.find((p) => p.id === body.servicePointId);
      if (!sp) return this.err(422, 'SERVICE_POINT_UNAVAILABLE');
      if (!body.roomNumber || String(body.roomNumber).length > 20) return this.err(422, 'VALIDATION_ERROR');
      const prior = this.accounts.get(uid);
      const next = { id: `acc-${uid}`, approvalStatus: 'PENDING', rejectionReasonCode: null, roomNumber: String(body.roomNumber), studentIdCard: body.studentIdCard ?? null, hostelName: sp.name, servicePoint: { ...sp, status: 'ACTIVE' }, reviewedAt: null };
      if (prior && prior.roomNumber === next.roomNumber && prior.servicePoint?.id === sp.id && (prior.studentIdCard ?? null) === next.studentIdCard) return ok({ changed: false, account: prior });
      this.accounts.set(uid, next);
      return ok({ changed: true, account: next });
    }

    // ---- subscriptions
    if (clean === '/mess/subscriptions' && method === 'GET') return ok({ subscriptions: this.subs.filter((s) => s.ownerId === uid).map((s) => this.subDto(s)) });
    if (clean === '/mess/subscriptions' && method === 'POST') {
      const key = headers['x-idempotency-key'];
      if (!key) return this.err(400, 'IDEMPOTENCY_KEY_REQUIRED');
      if (!IDEMPOTENCY.test(key)) return this.err(400, 'INVALID_IDEMPOTENCY_KEY');
      if (Object.keys(body ?? {}).some((k) => !['planId', 'startDate'].includes(k))) return this.err(422, 'VALIDATION_ERROR'); // strict body: no price, status or payment method
      const scoped = `${uid}:${key}`;
      const prior = this.idempotent.get(scoped);
      if (prior) {
        if (prior.planId !== body.planId || prior.startDate !== body.startDate) return this.err(409, 'IDEMPOTENCY_KEY_REUSED');
        return ok({ subscription: this.subDto(this.subs.find((s) => s.id === prior.subId)!), replay: true });
      }
      if (!DATE.test(String(body.startDate ?? ''))) return this.err(422, 'VALIDATION_ERROR');
      const account = this.accounts.get(uid);
      if (!account) return this.err(409, 'MESS_ACCOUNT_REQUIRED');
      if (account.approvalStatus !== 'APPROVED') return this.err(409, 'MESS_ACCOUNT_NOT_APPROVED');
      if (!this.plans.find((p) => p.id === body.planId)) return this.err(404, 'PLAN_NOT_AVAILABLE');
      if (body.startDate < this.earliestStart) return this.err(422, 'START_DATE_TOO_EARLY');
      if (this.subs.some((s) => s.ownerId === uid && s.status === 'PENDING_PAYMENT')) return this.err(409, 'OPEN_PURCHASE_EXISTS');
      const sub = this.seedSubscription(uid, 'PENDING_PAYMENT', { planId: body.planId, startDate: body.startDate, endDate: body.startDate, paid: false });
      this.idempotent.set(scoped, { planId: body.planId, startDate: body.startDate, subId: sub.id });
      return ok({ subscription: this.subDto(sub), replay: false }, 201);
    }
    const subMatch = clean.match(/^\/mess\/subscriptions\/([^/]+)$/);
    if (subMatch && method === 'GET') {
      const s = this.ownSub(uid, subMatch[1]);
      return s ? ok({ subscription: this.subDto(s) }) : this.err(404, 'NOT_FOUND');
    }
    const cancelMatch = clean.match(/^\/mess\/subscriptions\/([^/]+)\/cancel$/);
    if (cancelMatch && method === 'POST') {
      const s = this.ownSub(uid, cancelMatch[1]);
      if (!s) return this.err(404, 'NOT_FOUND');
      if (Object.keys(body ?? {}).some((k) => !['reasonCode', 'note'].includes(k)) || !['CHANGED_MIND', 'ORDERED_BY_MISTAKE', 'WRONG_PLAN', 'WRONG_START_DATE', 'OTHER'].includes(body.reasonCode)) return this.err(422, 'VALIDATION_ERROR');
      if (s.status === 'CANCELLED') return ok({ subscriptionId: s.id, status: 'CANCELLED', alreadyCancelled: true, refund: { state: s.refund }, payment: null });
      if (!this.cancellable(s)) return this.err(409, 'MESS_CANCELLATION_NOT_ALLOWED');
      const wasPaid = s.paid;
      s.status = 'CANCELLED';
      s.cancelledAt = '2026-11-04T12:00:00.000Z';
      s.refund = wasPaid ? 'REFUND_PENDING' : 'NO_REFUND';
      return ok({ subscriptionId: s.id, status: 'CANCELLED', alreadyCancelled: false, refund: { state: s.refund }, payment: null });
    }

    // ---- meals
    const mealsMatch = clean.match(/^\/mess\/subscriptions\/([^/]+)\/meals$/);
    if (mealsMatch && method === 'GET') {
      const s = this.ownSub(uid, mealsMatch[1]);
      if (!s) return this.err(404, 'NOT_FOUND');
      return ok({
        subscription: { status: s.status, pausesUsed: this.pausesUsed, maxPauses: this.maxPauses, pauseCutoffHours: 12, mealsReady: this.mealsReady },
        window: { from: s.startDate, to: s.endDate },
        meals: (this.meals.get(s.id) ?? []).map((m) => ({ ...m, forfeitIfPaused: true }))
      });
    }
    const actionMatch = clean.match(/^\/mess\/subscriptions\/([^/]+)\/meals\/([^/]+)\/(pause|resume)$/);
    if (actionMatch && method === 'POST') {
      const s = this.ownSub(uid, actionMatch[1]);
      const meal = s ? (this.meals.get(s.id) ?? []).find((m) => m.id === actionMatch[2]) : undefined;
      if (!s || !meal) return this.err(404, 'NOT_FOUND');
      if (Object.keys(body ?? {}).length) return this.err(422, 'VALIDATION_ERROR'); // strict empty body
      if (actionMatch[3] === 'pause') {
        if (!meal.canPause) return this.err(409, meal.reason === 'PAUSE_LIMIT_REACHED' ? 'PAUSE_LIMIT_REACHED' : 'PAUSE_CUTOFF_PASSED');
        meal.status = 'PAUSED';
        meal.canPause = false;
        meal.canResume = true;
        this.pausesUsed += 1;
      } else {
        if (!meal.canResume) return this.err(409, 'MEAL_NOT_PAUSED');
        meal.status = 'SCHEDULED';
        meal.canPause = true;
        meal.canResume = false;
      }
      return ok({ changed: true, mealId: meal.id, status: meal.status, pausesUsed: this.pausesUsed, maxPauses: this.maxPauses });
    }

    // ---- handover code
    const hoMatch = clean.match(/^\/mess\/subscriptions\/([^/]+)\/meals\/([^/]+)\/handover-code(\/regenerate)?$/);
    if (hoMatch) {
      const s = this.ownSub(uid, hoMatch[1]);
      if (!s) return this.err(404, 'NOT_FOUND');
      const h = this.handover.get(hoMatch[2]) ?? { state: 'NOT_AVAILABLE', code: null, left: 3 };
      if (method === 'GET') {
        const view: Record<string, unknown> = { state: h.state };
        if (['ISSUED_TO_YOU', 'CODE_EXPIRED', 'CODE_BLOCKED', 'LOCKED'].includes(h.state)) view.regenerationsLeft = h.left;
        if (h.state === 'ISSUED_TO_YOU') view.expiresAt = '2026-12-01T09:30:00.000Z'; // note: the code itself is never part of the state
        return ok(view);
      }
      if (h.state === 'NOT_AVAILABLE') return this.err(409, 'HANDOVER_NOT_AVAILABLE');
      if (!hoMatch[3]) {
        if (h.state !== 'NOT_ISSUED') return this.err(409, h.state === 'ISSUED_TO_ANOTHER' ? 'HANDOVER_CODE_ISSUED_TO_ANOTHER' : 'HANDOVER_CODE_ALREADY_ISSUED');
        h.state = 'ISSUED_TO_YOU';
        h.code = '482915';
      } else {
        if (h.state === 'ISSUED_TO_ANOTHER' || h.state === 'NOT_ISSUED') return this.err(409, 'HANDOVER_CODE_NOT_ISSUED');
        if (h.left <= 0) return this.err(409, 'HANDOVER_REGENERATION_LIMIT');
        h.left -= 1;
        h.state = 'ISSUED_TO_YOU';
        h.code = '731846';
      }
      this.handover.set(hoMatch[2], h);
      return this.respond(method === 'POST' && !hoMatch[3] ? 201 : 200, { success: true, data: { state: 'ISSUED_TO_YOU', code: h.code, expiresAt: '2026-12-01T09:30:00.000Z', regenerationsLeft: h.left } });
    }
    return this.err(404, 'NOT_FOUND');
  }
}

// ---------------------------------------------------------------------------------------------- mounting
export const messNavRef = createNavigationContainerRef<MessStackParamList>();

/** Mount the REAL MessNavigator (real screens, real hooks, real ApiClient) against the fake backend and optionally open a route. */
export async function mountMess(backend: FakeMessBackend, opts: { email?: string } = {}) {
  const email = opts.email ?? 'cust@b.test';
  await seedDevice(backend, email);
  const manager = new SessionManager({ storage: secureSessionStorage, baseUrl: BASE, clientHeader: CLIENT, timeoutMs: 200, fetchImpl: backend.fetch as unknown as typeof fetch });
  await manager.restore();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, networkMode: 'always' }, mutations: { retry: false, networkMode: 'always' } } });
  const evidence = new PaymentEvidenceStore();
  // createElement with loosely typed providers (this file has no JSX); the props are exactly the real providers' props.
  const h = React.createElement as unknown as (type: unknown, props: object | null, ...children: unknown[]) => React.ReactElement;
  const view = render(
    h(
      QueryClientProvider,
      { client: qc },
      h(AuthProvider, { manager }, h(PaymentEvidenceProvider, { store: evidence }, h(NavigationContainer, { ref: messNavRef }, h(MessNavigator, {}))))
    )
  );
  const navigate = (name: keyof MessStackParamList, params?: object) => (messNavRef.navigate as unknown as (n: string, p?: object) => void)(name, params);
  return { ...view, qc, manager, navigate };
}
