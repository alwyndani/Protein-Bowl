import fs from 'fs';
import path from 'path';
import { ApiError } from '../src/api/ApiError';
import { MessApi } from '../src/mess/api';
import { formatDay, hhmm, isValidDay, refundCopy, slotsLabel, subscriptionPaymentBadge, suggestedStartDay } from '../src/mess/labels';
import { isAuthFailure, messMessage } from '../src/mess/messErrors';

describe('MessApi: the exact endpoint set', () => {
  const calls: Array<{ path: string; opts?: any }> = [];
  const api = new MessApi({ request: async (p: string, opts?: unknown) => (calls.push({ path: p, opts }), { servicePoints: [], account: null, subscriptions: [], subscription: {} }) } as never);

  it('uses only the backend customer routes, sends no price / status / payment method, and encodes ids', async () => {
    await api.plans();
    await api.plans('sp 1');
    await api.servicePoints();
    await api.account();
    await api.saveAccount({ servicePointId: 'sp-1', roomNumber: 'B-1' });
    await api.subscriptions();
    await api.subscription('s/1');
    await api.purchase({ planId: 'p1', startDate: '2026-12-01', idempotencyKey: 'IK-12345678' });
    await api.calendar('s1');
    await api.calendar('s1', { from: '2026-12-01', to: '2026-12-31' });
    await api.pauseMeal('s1', 'm1');
    await api.resumeMeal('s1', 'm1');
    await api.handoverState('s1', 'm1');
    await api.issueHandoverCode('s1', 'm1');
    await api.regenerateHandoverCode('s1', 'm1');
    await api.cancelSubscription('s1', { reasonCode: 'OTHER', note: 'x' });
    expect(calls.map((c) => `${c.opts?.method ?? 'GET'} ${c.path}`)).toEqual([
      'GET /mess/plans',
      'GET /mess/plans?servicePointId=sp%201',
      'GET /mess/service-points',
      'GET /mess/account',
      'PUT /mess/account',
      'GET /mess/subscriptions',
      'GET /mess/subscriptions/s%2F1',
      'POST /mess/subscriptions',
      'GET /mess/subscriptions/s1/meals',
      'GET /mess/subscriptions/s1/meals?from=2026-12-01&to=2026-12-31',
      'POST /mess/subscriptions/s1/meals/m1/pause',
      'POST /mess/subscriptions/s1/meals/m1/resume',
      'GET /mess/subscriptions/s1/meals/m1/handover-code',
      'POST /mess/subscriptions/s1/meals/m1/handover-code',
      'POST /mess/subscriptions/s1/meals/m1/handover-code/regenerate',
      'POST /mess/subscriptions/s1/cancel'
    ]);
    expect(calls[7].opts).toEqual({ method: 'POST', headers: { 'x-idempotency-key': 'IK-12345678' }, body: { planId: 'p1', startDate: '2026-12-01' } });
    expect(calls[15].opts.body).toEqual({ reasonCode: 'OTHER', note: 'x' });
  });
});

describe('Mess copy and labels', () => {
  it('maps backend codes to customer copy and never leaks the code or server text', () => {
    expect(messMessage(new ApiError('http', 409, 'OPEN_PURCHASE_EXISTS'))).toMatch(/unpaid Kerala Mess purchase/);
    expect(messMessage(new ApiError('http', 422, 'START_DATE_TOO_EARLY'))).toMatch(/too soon/);
    expect(messMessage(new ApiError('http', 409, 'SOMETHING_NEW'))).toBe('That conflicts with the current state. Please refresh and try again.');
    expect(messMessage(new ApiError('http', 401, 'OPEN_PURCHASE_EXISTS'))).toBe('Your session has ended. Please sign in again.');
    expect(messMessage(new ApiError('http', 403, 'FORBIDDEN'))).toBe('This is not available for your account.');
    expect(messMessage(new ApiError('network', 0, 'NETWORK_ERROR'))).toMatch(/offline/);
    expect(messMessage(new ApiError('http', 500, 'MESS_CANCELLATION_NOT_ALLOWED'))).toMatch(/having trouble/);
    expect(messMessage(new Error('boom'))).toBe('Something went wrong. Please try again.');
    expect(isAuthFailure(new ApiError('http', 403, 'X'))).toBe(true);
    expect(isAuthFailure(new ApiError('network', 0, 'X'))).toBe(false);
  });

  it('formats dates without a time zone and shows "Not provided" for missing values', () => {
    expect(formatDay('2026-12-01')).toBe('1 Dec 2026');
    expect(formatDay(null)).toBe('—');
    expect(formatDay('2026-13-01')).toBe('—');
    expect(isValidDay('2026-02-30')).toBe(false);
    expect(isValidDay('2026-02-28')).toBe(true);
    expect(hhmm('13:05')).toBe('1:05 pm');
    expect(hhmm(undefined)).toBe('Not provided');
    expect(slotsLabel([])).toBe('Not provided');
    expect(slotsLabel(['DINNER', 'BREAKFAST'])).toBe('Breakfast, Dinner');
    expect(refundCopy(undefined)).toBe('Not provided');
    expect(refundCopy('REFUNDED')).toBe('Your full refund has been issued.');
  });

  it('the suggested start date is the Indian date plus the lead days (a hint; the server decides)', () => {
    // 2026-11-04 20:00 UTC is already 5 Nov in India
    expect(suggestedStartDay(0, Date.parse('2026-11-04T20:00:00Z'))).toBe('2026-11-05');
    expect(suggestedStartDay(2, Date.parse('2026-11-04T20:00:00Z'))).toBe('2026-11-07');
  });

  it('payment pill follows the server summary and never says paid without it', () => {
    const base = { status: 'PENDING_PAYMENT', payment: { state: 'NOT_STARTED', canStartPayment: true }, purchaseOrder: { id: 'o', orderNumber: 'n', paymentStatus: 'PENDING' }, refund: { state: 'NO_REFUND' } } as never;
    expect(subscriptionPaymentBadge(base)?.label).toBe('Payment required');
    expect(subscriptionPaymentBadge({ ...(base as object), payment: { state: 'CONFIRMING', canStartPayment: false } } as never)?.label).toBe('Payment being confirmed');
    expect(subscriptionPaymentBadge({ ...(base as object), status: 'CANCELLED' } as never)).toBeNull();
    expect(subscriptionPaymentBadge({ ...(base as object), status: 'ACTIVE', payment: { state: 'PAID', canStartPayment: false } } as never)?.label).toBe('Paid');
  });
});

describe('Static properties of the Mess source', () => {
  const ROOT = path.resolve(__dirname, '..', 'src');
  const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const mine = [...files(path.join(ROOT, 'mess')), ...files(path.join(ROOT, 'screens', 'mess')), path.join(ROOT, 'navigation', 'MessNavigator.tsx')].map((p) => ({ p: path.relative(ROOT, p).replace(/\\/g, '/'), s: strip(fs.readFileSync(p, 'utf8')) }));

  it('has files to scan', () => {
    expect(mine.length).toBeGreaterThan(10);
  });

  it('endpoint strings live only in src/mess/api.ts; nothing else in the Mess code names a /mess route', () => {
    expect(mine.filter((f) => /[`'"]\/mess\b|handover-code/.test(f.s)).map((f) => f.p)).toEqual(['mess/api.ts']);
  });

  it('no logging, no storage, no raw fetch, no randomness, no env reads', () => {
    for (const f of mine) {
      expect(f.s).not.toMatch(/console\.|\bfetch\(|AsyncStorage|SecureStore|setItem|localStorage|Math\.random|process\.env|Linking|Clipboard/);
    }
  });

  it('no cash / COD / pay-at-door / wallet / settlement concept and no payment method on the wire', () => {
    for (const f of mine) {
      expect(f.s).not.toMatch(/\bCOD\b|\bcash\b|pay[\s_-]*at[\s_-]*(hostel|gate|door)|wallet|settlement|paymentMethod|payment_method/i);
    }
  });

  it('the handover code is not part of any query key, route param or cache write', () => {
    const keys = mine.find((f) => f.p === 'mess/queryKeys.ts')!.s;
    expect(keys).not.toMatch(/\bcode\b/i);
    const nav = mine.find((f) => f.p === 'navigation/MessNavigator.tsx')!.s;
    expect(nav).not.toMatch(/code/i);
    const hooks = mine.find((f) => f.p === 'mess/hooks.ts')!.s;
    expect(hooks).not.toMatch(/setQueryData\([^)]*[hH]andover/);
  });
});
