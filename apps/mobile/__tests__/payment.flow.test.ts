import { ApiError } from '../src/api/ApiError';
import type { CustomerOrder } from '../src/commerce/types';
import { PaymentEvidenceStore } from '../src/payments/paymentEvidenceStore';
import { PaymentFlowController, observeOrder } from '../src/payments/paymentFlowController';
import type { FlowDeps } from '../src/payments/paymentFlowController';
import { POLL_SCHEDULE_MS, WATCHDOG_FOREGROUND_GRACE_MS, WATCHDOG_NO_LAUNCH_MS } from '../src/payments/paymentFlowMachine';
import { derivePresentation } from '../src/payments/paymentPresentation';
import type { CheckoutResult } from '../src/payments/razorpayBridge';
import type { CheckoutSession, VerifyOutcome } from '../src/payments/paymentTypes';

/**
 * P11C-2 step 4: the orchestrator, driven entirely with fakes (no native module, no network). The "backend" is a mutable order the fake
 * fetchOrder returns, so every test shows that decisions follow ONLY backend state.
 */
const ORDER_ID = 'ord-1';
const SESSION: CheckoutSession = { attemptId: 'att-1', provider: 'razorpay', keyId: 'public_key_id_1', providerOrderId: 'order_ABC123', amountMinor: 33900, currency: 'INR', orderNumber: 'PB-261017-ABC123', expiresAt: '2026-10-17T10:00:00.000Z', status: 'PENDING' };
const EVIDENCE = { providerPaymentId: 'pay_ABC123', providerOrderId: 'order_ABC123', signature: 'a'.repeat(64) };
const http = (status: number, code: string) => new ApiError('http', status, code);
const NETWORK = new ApiError('network', 0, 'NETWORK_ERROR');
const TIMEOUT = new ApiError('timeout', 0, 'TIMEOUT');

type Mode = 'startable' | 'confirming' | 'paid' | 'blocked';
function order(mode: Mode): CustomerOrder {
  const base = { id: ORDER_ID, orderNumber: 'PB-261017-ABC123', status: 'PENDING', paymentStatus: 'PENDING' } as unknown as CustomerOrder;
  switch (mode) {
    case 'startable':
      return { ...base, payment: { state: 'AWAITING_PAYMENT', canStartPayment: true } };
    case 'confirming':
      return { ...base, payment: { state: 'CONFIRMING', canStartPayment: false } };
    case 'paid':
      return { ...base, status: 'CONFIRMED', paymentStatus: 'PAID', payment: { state: 'PAID', canStartPayment: false } };
    case 'blocked':
      return { ...base, status: 'CANCELLED', payment: { state: 'NOT_STARTED', canStartPayment: false } };
  }
}

/** One shared "process": the evidence store and the native lock outlive any single controller, like in the real app. */
function makeProcess() {
  const settled = new Set<() => void>();
  return {
    evidence: new PaymentEvidenceStore(),
    checkoutOpen: false,
    settled,
    isCheckoutOpen() {
      return this.checkoutOpen;
    },
    onCheckoutSettled(l: () => void) {
      settled.add(l);
      return () => settled.delete(l);
    },
    settleNative() {
      this.checkoutOpen = false;
      [...settled].forEach((l) => l());
    }
  };
}

function setup(initial: Mode = 'startable', overrides: Partial<FlowDeps> = {}, proc = makeProcess()) {
  const backend = { mode: initial as Mode, fail: false };
  const evidence = proc.evidence;
  const app = { state: 'active', listeners: new Set<(s: string) => void>() };
  const api = {
    createAttempt: jest.fn(async (_id: string): Promise<CheckoutSession> => SESSION),
    verifyPayment: jest.fn(async (..._a: unknown[]): Promise<VerifyOutcome> => ({ result: 'PAID', orderStatus: 'CONFIRMED', orderPaymentStatus: 'PAID' }))
  };
  let finish!: (r: CheckoutResult) => void;
  const openCheckout = jest.fn(() => {
    proc.checkoutOpen = true;
    return new Promise<CheckoutResult>((r) => {
      finish = (res) => {
        proc.checkoutOpen = false;
        r(res);
      };
    });
  });
  const fetchOrder = jest.fn(async () => {
    if (backend.fail) throw NETWORK;
    return order(backend.mode);
  });
  const deps: FlowDeps = {
    orderId: ORDER_ID,
    api,
    evidence,
    openCheckout,
    isNativeAvailable: () => true,
    isCheckoutOpen: () => proc.isCheckoutOpen(),
    onCheckoutSettled: (l) => proc.onCheckoutSettled(l),
    fetchOrder,
    appState: {
      current: () => app.state,
      subscribe: (l) => {
        app.listeners.add(l);
        return () => app.listeners.delete(l);
      }
    },
    ...overrides
  };
  const c = new PaymentFlowController(deps);
  const setApp = (s: string) => {
    app.state = s;
    app.listeners.forEach((l) => l(s));
  };
  return { c, backend, evidence, api, openCheckout, fetchOrder, finish: (r: CheckoutResult) => finish(r), setApp, app, proc, deps };
}

const tick = (ms = 0) => jest.advanceTimersByTimeAsync(ms);
const phase = (c: PaymentFlowController) => c.getState().phase;

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

/** Run a start up to the point where the native checkout is open. */
async function startToCheckout(t: ReturnType<typeof setup>) {
  t.c.observe(order('startable'));
  void t.c.startPayment();
  await tick();
  expect(phase(t.c)).toBe('CHECKOUT_ACTIVE');
}

describe('order observation (backend DTO only)', () => {
  it.each([
    ['startable', 'STARTABLE'],
    ['confirming', 'CONFIRMING'],
    ['paid', 'PAID'],
    ['blocked', 'BLOCKED']
  ] as const)('%s order -> %s', (mode, obs) => expect(observeOrder(order(mode))).toBe(obs));

  it('an order without a payment summary can prove nothing: BLOCKED', () => {
    expect(observeOrder({ status: 'PENDING', paymentStatus: 'PENDING' } as CustomerOrder)).toBe('BLOCKED');
  });
});

describe('start payment', () => {
  it('a mounted flow never starts a payment by itself', async () => {
    const t = setup();
    t.c.observe(order('startable'));
    await tick(60_000);
    expect(t.api.createAttempt).not.toHaveBeenCalled();
    expect(t.openCheckout).not.toHaveBeenCalled();
    expect(phase(t.c)).toBe('IDLE');
  });

  it('an eligible order creates ONE attempt and opens the native checkout with the BACKEND session values', async () => {
    const t = setup();
    await startToCheckout(t);
    expect(t.api.createAttempt).toHaveBeenCalledTimes(1);
    expect(t.api.createAttempt).toHaveBeenCalledWith(ORDER_ID);
    expect(t.openCheckout).toHaveBeenCalledWith({ key: 'public_key_id_1', order_id: 'order_ABC123', amount: 33900, currency: 'INR', name: 'Protein Bowl', description: 'Order PB-261017-ABC123' });
    expect(t.c.getState().attemptId).toBe('att-1');
  });

  it.each([
    ['canStartPayment false (confirming)', 'confirming'],
    ['paid', 'paid'],
    ['blocked', 'blocked']
  ] as const)('%s: no API call and no checkout', async (_n, mode) => {
    const t = setup(mode);
    t.c.observe(order(mode));
    await t.c.startPayment();
    expect(t.api.createAttempt).not.toHaveBeenCalled();
    expect(t.openCheckout).not.toHaveBeenCalled();
  });

  it('a STALE cached startable order is re-checked against the backend before anything is created', async () => {
    const t = setup('confirming');
    t.c.observe(order('startable')); // cache says startable, backend says confirming
    await t.c.startPayment();
    expect(t.api.createAttempt).not.toHaveBeenCalled();
    expect(phase(t.c)).toBe('CONFIRMING');
  });

  it('double tap: exactly one create and one open', async () => {
    const t = setup();
    t.c.observe(order('startable'));
    const a = t.c.startPayment();
    const b = t.c.startPayment();
    await tick();
    await Promise.all([a, b].map((p) => Promise.race([p, tick()])));
    expect(t.api.createAttempt).toHaveBeenCalledTimes(1);
    expect(t.openCheckout).toHaveBeenCalledTimes(1);
  });

  it('a start while the checkout is open is ignored', async () => {
    const t = setup();
    await startToCheckout(t);
    await t.c.startPayment();
    expect(t.api.createAttempt).toHaveBeenCalledTimes(1);
    expect(t.openCheckout).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['wrong provider', { provider: 'mock' }],
    ['bad amount', { amountMinor: 0 }],
    ['bad currency', { currency: 'USD' }],
    ['missing provider order', { providerOrderId: '' }],
    ['expired session', { status: 'EXPIRED' as const }]
  ])('a malformed or non-PENDING session (%s) fails closed: no native checkout, backend refreshed', async (_n, patch) => {
    const t = setup();
    t.api.createAttempt.mockResolvedValue({ ...SESSION, ...patch });
    t.c.observe(order('startable'));
    await t.c.startPayment();
    expect(t.openCheckout).not.toHaveBeenCalled();
    expect(t.c.getState().notice).toBe('SESSION_INVALID');
    expect(t.fetchOrder.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('a missing attempt id fails closed', async () => {
    const t = setup();
    t.api.createAttempt.mockResolvedValue({ ...SESSION, attemptId: '' });
    t.c.observe(order('startable'));
    await t.c.startPayment();
    expect(t.openCheckout).not.toHaveBeenCalled();
  });

  it('a build without the native checkout creates NOTHING and reports unavailable', async () => {
    const t = setup('startable', { isNativeAvailable: () => false });
    t.c.observe(order('startable'));
    await t.c.startPayment();
    expect(t.api.createAttempt).not.toHaveBeenCalled();
    expect(t.c.getState().notice).toBe('NATIVE_UNAVAILABLE');
    expect(derivePresentation(order('startable'), t.c.getState(), false).kind).toBe('UNAVAILABLE');
  });
});

describe('create-attempt failures are never financial conclusions', () => {
  it.each([
    ['PAYMENT_ALREADY_COMPLETED', http(409, 'PAYMENT_ALREADY_COMPLETED'), 'paid', 'PAID'],
    ['ORDER_NOT_PAYABLE', http(409, 'ORDER_NOT_PAYABLE'), 'blocked', 'BLOCKED'],
    ['PAYMENT_ATTEMPT_IN_PROGRESS', http(409, 'PAYMENT_ATTEMPT_IN_PROGRESS'), 'confirming', 'CONFIRMING'],
    ['PAYMENT_PROVIDER_UNAVAILABLE', http(503, 'PAYMENT_PROVIDER_UNAVAILABLE'), 'confirming', 'CONFIRMING'],
    ['PAYMENT_AMOUNT_TOO_SMALL', http(422, 'PAYMENT_AMOUNT_TOO_SMALL'), 'blocked', 'BLOCKED'],
    ['timeout', TIMEOUT, 'confirming', 'CONFIRMING'],
    ['network', NETWORK, 'confirming', 'CONFIRMING'],
    ['malformed response', new ApiError('malformed', 200, 'MALFORMED_RESPONSE'), 'confirming', 'CONFIRMING']
  ] as const)('%s: no checkout, ONE create only, converges to what the backend says (%s)', async (_n, err, mode, expected) => {
    const t = setup();
    t.c.observe(order('startable'));
    t.api.createAttempt.mockImplementation(async () => {
      t.backend.mode = mode; // the backend state after the failed call
      throw err;
    });
    await t.c.startPayment();
    await tick();
    expect(t.openCheckout).not.toHaveBeenCalled();
    expect(t.api.createAttempt).toHaveBeenCalledTimes(1);
    expect(phase(t.c)).toBe(expected);
  });

  it('an ambiguous create with the backend still saying "startable" offers an explicit start again but never starts by itself', async () => {
    const t = setup();
    t.c.observe(order('startable'));
    t.api.createAttempt.mockRejectedValue(TIMEOUT);
    await t.c.startPayment();
    await tick(60_000);
    expect(phase(t.c)).toBe('IDLE');
    expect(t.api.createAttempt).toHaveBeenCalledTimes(1);
  });
});

describe('native checkout results', () => {
  it('NOT_COMPLETED: neutral wording, backend refreshed, retry offered only because the BACKEND says startable', async () => {
    const t = setup();
    await startToCheckout(t);
    t.finish({ kind: 'NOT_COMPLETED' });
    await tick();
    expect(t.api.verifyPayment).not.toHaveBeenCalled();
    expect(t.c.getState().notice).toBe('NOT_COMPLETED');
    const p = derivePresentation(order('startable'), t.c.getState(), t.c.hasEvidence());
    expect(p).toMatchObject({ kind: 'PAYMENT_NOT_COMPLETED', message: 'Payment not completed', canStartPayment: true });
  });

  it('NOT_COMPLETED while the backend says CONFIRMING: no pay again', async () => {
    const t = setup();
    await startToCheckout(t);
    t.backend.mode = 'confirming';
    t.finish({ kind: 'NOT_COMPLETED' });
    await tick();
    expect(phase(t.c)).toBe('CONFIRMING');
    expect(derivePresentation(order('confirming'), t.c.getState(), false).canStartPayment).toBe(false);
  });

  it('AMBIGUOUS: held (no pay again) even though the backend still says startable; polling continues', async () => {
    const t = setup();
    await startToCheckout(t);
    t.finish({ kind: 'AMBIGUOUS' });
    await tick();
    expect(phase(t.c)).toBe('CONFIRMING');
    expect(t.c.getState().ambiguousHold).toBe(true);
    expect(derivePresentation(order('startable'), t.c.getState(), false).canStartPayment).toBe(false);
    await t.c.startPayment();
    expect(t.api.createAttempt).toHaveBeenCalledTimes(1);
    await tick(POLL_SCHEDULE_MS[0]);
    expect(phase(t.c)).toBe('CONFIRMING'); // automatic observation of "startable" alone does not release the hold
  });

  it('AMBIGUOUS hold is released by an explicit check showing the backend is startable, or by the backend moving through CONFIRMING', async () => {
    const t = setup();
    await startToCheckout(t);
    t.finish({ kind: 'AMBIGUOUS' });
    await tick();
    await t.c.checkPaymentStatus();
    expect(phase(t.c)).toBe('IDLE');
    expect(t.c.getState().ambiguousHold).toBe(false);

    const u = setup();
    await startToCheckout(u);
    u.finish({ kind: 'AMBIGUOUS' });
    await tick();
    u.backend.mode = 'confirming';
    await tick(POLL_SCHEDULE_MS[0]);
    u.backend.mode = 'startable';
    await tick(POLL_SCHEDULE_MS[1]);
    expect(phase(u.c)).toBe('IDLE');
  });

  it('UNAVAILABLE from the bridge: nothing invented; backend refreshed', async () => {
    const t = setup();
    await startToCheckout(t);
    t.finish({ kind: 'UNAVAILABLE' });
    await tick();
    expect(t.c.getState().notice).toBe('NATIVE_UNAVAILABLE');
    expect(t.api.verifyPayment).not.toHaveBeenCalled();
  });

  it('ALREADY_OPEN from the bridge: no second checkout and no verify', async () => {
    const t = setup();
    await startToCheckout(t);
    t.finish({ kind: 'ALREADY_OPEN' });
    await tick();
    expect(t.openCheckout).toHaveBeenCalledTimes(1);
    expect(t.api.verifyPayment).not.toHaveBeenCalled();
  });

  it('evidence for a different provider order is held as AMBIGUOUS and never forwarded', async () => {
    const t = setup();
    await startToCheckout(t);
    t.finish({ kind: 'EVIDENCE', evidence: { ...EVIDENCE, providerOrderId: 'order_OTHER9' } });
    await tick();
    expect(t.api.verifyPayment).not.toHaveBeenCalled();
    expect(t.evidence.getEvidence(ORDER_ID, 'att-1')).toBeNull();
    expect(t.c.getState().ambiguousHold).toBe(true);
  });
});

describe('verify and evidence lifecycle', () => {
  it('EVIDENCE: stored in memory, verify gets exactly the evidence, PAID only when the REFRESHED ORDER says PAID, then evidence cleared', async () => {
    const t = setup();
    await startToCheckout(t);
    t.api.verifyPayment.mockImplementation(async () => {
      t.backend.mode = 'paid';
      return { result: 'PAID', orderStatus: 'CONFIRMED', orderPaymentStatus: 'PAID' };
    });
    t.finish({ kind: 'EVIDENCE', evidence: EVIDENCE });
    await tick();
    expect(t.api.verifyPayment).toHaveBeenCalledWith(ORDER_ID, 'att-1', EVIDENCE);
    expect(phase(t.c)).toBe('PAID');
    expect(t.evidence.getEvidence(ORDER_ID, 'att-1')).toBeNull();
    expect(derivePresentation(order('paid'), t.c.getState(), false).kind).toBe('PAYMENT_CONFIRMED');
  });

  it('a PAID verify answer whose refreshed order is NOT yet paid stays CONFIRMING with the evidence kept (never locally paid)', async () => {
    const t = setup();
    await startToCheckout(t);
    t.finish({ kind: 'EVIDENCE', evidence: EVIDENCE });
    await tick();
    expect(phase(t.c)).toBe('CONFIRMING');
    expect(t.evidence.getEvidence(ORDER_ID, 'att-1')).toEqual(EVIDENCE);
    expect(derivePresentation(order('startable'), t.c.getState(), true).kind).not.toBe('PAYMENT_CONFIRMED');
    expect(derivePresentation(order('startable'), t.c.getState(), true).canStartPayment).toBe(false);
    // the webhook lands: polling converges
    t.backend.mode = 'paid';
    await tick(POLL_SCHEDULE_MS[0]);
    expect(phase(t.c)).toBe('PAID');
    expect(t.evidence.getEvidence(ORDER_ID, 'att-1')).toBeNull();
  });

  it('PENDING: CONFIRMING, evidence kept, polling; never a new checkout', async () => {
    const t = setup();
    await startToCheckout(t);
    t.api.verifyPayment.mockResolvedValue({ result: 'PENDING', orderStatus: 'PENDING', orderPaymentStatus: 'PENDING' });
    t.backend.mode = 'confirming';
    t.finish({ kind: 'EVIDENCE', evidence: EVIDENCE });
    await tick();
    expect(phase(t.c)).toBe('CONFIRMING');
    expect(t.evidence.getEvidence(ORDER_ID, 'att-1')).toEqual(EVIDENCE);
    expect(t.openCheckout).toHaveBeenCalledTimes(1);
    expect(derivePresentation(order('confirming'), t.c.getState(), t.c.hasEvidence())).toMatchObject({ kind: 'CHECKING_PAYMENT', canRetryVerification: true, canStartPayment: false });
  });

  it.each([
    ['PAYMENT_VERIFICATION_FAILED', http(400, 'PAYMENT_VERIFICATION_FAILED'), 'NOT_COMPLETED', true],
    ['PAYMENT_AMOUNT_MISMATCH', http(422, 'PAYMENT_AMOUNT_MISMATCH'), 'ACTION_REQUIRED', true],
    ['PAYMENT_CURRENCY_MISMATCH', http(422, 'PAYMENT_CURRENCY_MISMATCH'), 'ACTION_REQUIRED', true],
    ['ORDER_NOT_PAYABLE', http(409, 'ORDER_NOT_PAYABLE'), 'ACTION_REQUIRED', true],
    ['PAYMENT_ATTEMPT_NOT_FOUND', http(404, 'PAYMENT_ATTEMPT_NOT_FOUND'), 'ACTION_REQUIRED', true],
    ['timeout', TIMEOUT, 'VERIFY_UNCERTAIN', false],
    ['network', NETWORK, 'VERIFY_UNCERTAIN', false],
    ['503', http(503, 'PAYMENT_PROVIDER_UNAVAILABLE'), 'VERIFY_UNCERTAIN', false],
    ['500', http(500, 'INTERNAL_SERVER_ERROR'), 'VERIFY_UNCERTAIN', false],
    ['429', http(429, 'RATE_LIMITED'), 'VERIFY_UNCERTAIN', false],
    ['unknown 4xx', http(418, 'SOMETHING'), 'VERIFY_UNCERTAIN', false]
  ] as const)('verify error %s: notice %s, evidence cleared=%s, backend refreshed, no checkout', async (_n, err, notice, cleared) => {
    const t = setup();
    await startToCheckout(t);
    t.api.verifyPayment.mockRejectedValue(err);
    t.backend.mode = 'confirming';
    t.finish({ kind: 'EVIDENCE', evidence: EVIDENCE });
    await tick();
    expect(t.c.getState().notice).toBe(notice);
    expect(t.evidence.getEvidence(ORDER_ID, 'att-1') === null).toBe(cleared);
    expect(t.openCheckout).toHaveBeenCalledTimes(1);
    expect(t.api.createAttempt).toHaveBeenCalledTimes(1);
    expect(phase(t.c)).toBe('CONFIRMING');
  });

  it('a definitive verify rejection never offers a new checkout by itself: only the backend "startable" does', async () => {
    const t = setup();
    await startToCheckout(t);
    t.api.verifyPayment.mockRejectedValue(http(400, 'PAYMENT_VERIFICATION_FAILED'));
    t.backend.mode = 'confirming';
    t.finish({ kind: 'EVIDENCE', evidence: EVIDENCE });
    await tick();
    expect(derivePresentation(order('confirming'), t.c.getState(), false).canStartPayment).toBe(false);
    t.backend.mode = 'startable';
    await tick(POLL_SCHEDULE_MS[0]);
    expect(derivePresentation(order('startable'), t.c.getState(), false)).toMatchObject({ kind: 'PAYMENT_NOT_COMPLETED', canStartPayment: true });
  });

  it('ACTION_REQUIRED presentation: never pay again', async () => {
    const t = setup();
    await startToCheckout(t);
    t.api.verifyPayment.mockRejectedValue(http(422, 'PAYMENT_AMOUNT_MISMATCH'));
    t.backend.mode = 'confirming';
    t.finish({ kind: 'EVIDENCE', evidence: EVIDENCE });
    await tick();
    expect(derivePresentation(order('confirming'), t.c.getState(), false)).toMatchObject({ kind: 'ACTION_REQUIRED', canStartPayment: false });
  });
});

describe('retryVerification (same evidence, never a new payment)', () => {
  async function pendingWithEvidence() {
    const t = setup();
    await startToCheckout(t);
    t.api.verifyPayment.mockRejectedValueOnce(TIMEOUT);
    t.backend.mode = 'confirming';
    t.finish({ kind: 'EVIDENCE', evidence: EVIDENCE });
    await tick();
    expect(t.api.verifyPayment).toHaveBeenCalledTimes(1);
    return t;
  }

  it('re-sends the SAME evidence for the SAME order and attempt; no create, no checkout', async () => {
    const t = await pendingWithEvidence();
    t.api.verifyPayment.mockImplementation(async () => {
      t.backend.mode = 'paid';
      return { result: 'PAID', orderStatus: 'CONFIRMED', orderPaymentStatus: 'PAID' };
    });
    await t.c.retryVerification();
    await tick();
    expect(t.api.verifyPayment).toHaveBeenLastCalledWith(ORDER_ID, 'att-1', EVIDENCE);
    expect(t.api.createAttempt).toHaveBeenCalledTimes(1);
    expect(t.openCheckout).toHaveBeenCalledTimes(1);
    expect(phase(t.c)).toBe('PAID');
    expect(t.evidence.getEvidence(ORDER_ID, 'att-1')).toBeNull();
  });

  it('is unavailable (a no-op) once the evidence is gone, e.g. after process death', async () => {
    const t = await pendingWithEvidence();
    t.evidence.clearAllEvidence(); // simulated restart / sign-out
    expect(t.c.hasEvidence()).toBe(false);
    await t.c.retryVerification();
    expect(t.api.verifyPayment).toHaveBeenCalledTimes(1);
    expect(t.api.createAttempt).toHaveBeenCalledTimes(1);
  });

  it('a duplicate retry while a verify is in flight sends one request', async () => {
    const t = await pendingWithEvidence();
    let release!: () => void;
    t.api.verifyPayment.mockImplementation(() => new Promise((r) => (release = () => r({ result: 'PENDING', orderStatus: 'PENDING', orderPaymentStatus: 'PENDING' }))));
    const a = t.c.retryVerification();
    const b = t.c.retryVerification();
    await tick();
    expect(t.api.verifyPayment).toHaveBeenCalledTimes(2); // 1 original + exactly 1 retry
    release();
    await Promise.all([a, b]);
  });

  it('with no evidence ever stored it does nothing', async () => {
    const t = setup('confirming');
    t.c.observe(order('confirming'));
    await t.c.retryVerification();
    expect(t.api.verifyPayment).not.toHaveBeenCalled();
  });
});

describe('restart / mount recovery (no evidence, no payment on mount)', () => {
  it('AWAITING_PAYMENT / startable -> IDLE, eligible to start explicitly only', async () => {
    const t = setup();
    t.c.observe(order('startable'));
    await tick(60_000);
    expect(phase(t.c)).toBe('IDLE');
    expect(t.api.createAttempt).not.toHaveBeenCalled();
    expect(derivePresentation(order('startable'), t.c.getState(), false)).toMatchObject({ kind: 'READY_TO_PAY', canStartPayment: true });
  });

  it('CONFIRMING -> GET-only recovery, no checkout, no POST', async () => {
    const t = setup('confirming');
    t.c.observe(order('confirming'));
    expect(phase(t.c)).toBe('CONFIRMING');
    await tick(POLL_SCHEDULE_MS[0]);
    expect(t.fetchOrder).toHaveBeenCalled();
    expect(t.api.createAttempt).not.toHaveBeenCalled();
    expect(t.api.verifyPayment).not.toHaveBeenCalled();
    expect(t.openCheckout).not.toHaveBeenCalled();
  });

  it('PAID -> PAID with no polling and no calls', async () => {
    const t = setup('paid');
    t.c.observe(order('paid'));
    await tick(60_000);
    expect(phase(t.c)).toBe('PAID');
    expect(t.fetchOrder).not.toHaveBeenCalled();
  });

  it('canStartPayment false for another reason -> BLOCKED, no polling', async () => {
    const t = setup('blocked');
    t.c.observe(order('blocked'));
    await tick(60_000);
    expect(phase(t.c)).toBe('BLOCKED');
    expect(t.fetchOrder).not.toHaveBeenCalled();
    expect(derivePresentation(order('blocked'), t.c.getState(), false).kind).toBe('UNAVAILABLE');
  });
});

describe('bounded GET-only polling', () => {
  it('follows the schedule exactly and converges to PAID (webhook-first convergence)', async () => {
    const t = setup('confirming');
    t.c.observe(order('confirming'));
    await tick(POLL_SCHEDULE_MS[0] - 1);
    expect(t.fetchOrder).toHaveBeenCalledTimes(0);
    await tick(1);
    expect(t.fetchOrder).toHaveBeenCalledTimes(1);
    await tick(POLL_SCHEDULE_MS[1] - 1);
    expect(t.fetchOrder).toHaveBeenCalledTimes(1);
    t.backend.mode = 'paid';
    await tick(1);
    expect(phase(t.c)).toBe('PAID');
    await tick(120_000);
    expect(t.fetchOrder).toHaveBeenCalledTimes(2); // stops when authoritative PAID
  });

  it('later becomes startable only because the backend says so', async () => {
    const t = setup('confirming');
    t.c.observe(order('confirming'));
    t.backend.mode = 'startable';
    await tick(POLL_SCHEDULE_MS[0]);
    expect(phase(t.c)).toBe('IDLE');
    expect(derivePresentation(order('startable'), t.c.getState(), false).canStartPayment).toBe(true);
  });

  it('the cap is a cadence limit: still CONFIRMING, never failed, never pay again; a manual check restarts polling', async () => {
    const t = setup('confirming');
    t.c.observe(order('confirming'));
    const total = POLL_SCHEDULE_MS.reduce((a, b) => a + b, 0);
    await tick(total + 60_000);
    const calls = t.fetchOrder.mock.calls.length;
    expect(calls).toBe(POLL_SCHEDULE_MS.length);
    expect(t.c.getState().pollingExhausted).toBe(true);
    expect(phase(t.c)).toBe('CONFIRMING');
    const p = derivePresentation(order('confirming'), t.c.getState(), false);
    expect(p).toMatchObject({ kind: 'CHECKING_PAYMENT', canStartPayment: false, canCheckStatus: true });
    await tick(600_000);
    expect(t.fetchOrder.mock.calls.length).toBe(calls); // no more automatic checks
    // manual "check payment status"
    await t.c.checkPaymentStatus();
    expect(t.fetchOrder.mock.calls.length).toBe(calls + 1);
    expect(t.c.getState().pollingExhausted).toBe(false);
    await tick(POLL_SCHEDULE_MS[0]);
    expect(t.fetchOrder.mock.calls.length).toBe(calls + 2);
  });

  it('only one polling loop exists even if the order is observed repeatedly', async () => {
    const t = setup('confirming');
    for (let i = 0; i < 5; i++) t.c.observe(order('confirming'));
    await tick(POLL_SCHEDULE_MS[0]);
    expect(t.fetchOrder).toHaveBeenCalledTimes(1);
  });

  it('a failed refresh keeps polling (bounded) and never concludes anything', async () => {
    const t = setup('confirming');
    t.c.observe(order('confirming'));
    t.backend.fail = true;
    await tick(POLL_SCHEDULE_MS[0]);
    expect(t.c.getState().notice).toBe('CHECK_FAILED');
    expect(['CONFIRMING', 'CHECKING']).toContain(phase(t.c)); // unresolved, never startable
    expect(derivePresentation(order('startable'), t.c.getState(), false).canStartPayment).toBe(false);
    t.backend.fail = false;
    t.backend.mode = 'paid';
    await tick(POLL_SCHEDULE_MS[1]);
    expect(phase(t.c)).toBe('PAID');
  });

  it('manual status check is GET-only: no create, no verify, no checkout', async () => {
    const t = setup('confirming');
    t.c.observe(order('confirming'));
    await t.c.checkPaymentStatus();
    expect(t.api.createAttempt).not.toHaveBeenCalled();
    expect(t.api.verifyPayment).not.toHaveBeenCalled();
    expect(t.openCheckout).not.toHaveBeenCalled();
    expect(t.fetchOrder).toHaveBeenCalledTimes(1);
  });

  it('an UNKNOWN provider outcome (summary CONFIRMING) stays under recovery with no pay again', async () => {
    const t = setup('confirming');
    t.c.observe(order('confirming'));
    await tick(POLL_SCHEDULE_MS[0] + POLL_SCHEDULE_MS[1]);
    expect(phase(t.c)).toBe('CONFIRMING');
    expect(derivePresentation(order('confirming'), t.c.getState(), false).canStartPayment).toBe(false);
  });
});

describe('watchdog and lifecycle (never a financial timeout)', () => {
  it('W1: a checkout that never launches moves to CHECKING + a backend refresh; nothing else, no new checkout', async () => {
    const t = setup();
    await startToCheckout(t);
    const before = t.fetchOrder.mock.calls.length;
    await tick(WATCHDOG_NO_LAUNCH_MS);
    expect(phase(t.c)).toBe('CHECKING');
    expect(t.fetchOrder.mock.calls.length).toBeGreaterThan(before);
    expect(t.c.getState().nativeOpen).toBe(true);
    // the backend says startable, but the native promise is unsettled: no second checkout
    expect(derivePresentation(order('startable'), t.c.getState(), false).canStartPayment).toBe(false);
    await t.c.startPayment();
    expect(t.api.createAttempt).toHaveBeenCalledTimes(1);
    expect(t.openCheckout).toHaveBeenCalledTimes(1);
  });

  it('the watchdog never produces a failure or retry-safe state, however long the promise hangs', async () => {
    const t = setup();
    await startToCheckout(t);
    await tick(WATCHDOG_NO_LAUNCH_MS + 3_600_000);
    expect(['CHECKING', 'CONFIRMING']).toContain(phase(t.c));
    expect(derivePresentation(order('startable'), t.c.getState(), false).canStartPayment).toBe(false);
  });

  it('a callback that arrives AFTER the watchdog fired is still handled (evidence verified)', async () => {
    const t = setup();
    await startToCheckout(t);
    await tick(WATCHDOG_NO_LAUNCH_MS);
    t.api.verifyPayment.mockImplementation(async () => {
      t.backend.mode = 'paid';
      return { result: 'PAID', orderStatus: 'CONFIRMED', orderPaymentStatus: 'PAID' };
    });
    t.finish({ kind: 'EVIDENCE', evidence: EVIDENCE });
    await tick();
    expect(phase(t.c)).toBe('PAID');
  });

  it('background then foreground with the callback arriving: no watchdog, normal handling', async () => {
    const t = setup();
    await startToCheckout(t);
    t.setApp('background');
    await tick(WATCHDOG_NO_LAUNCH_MS * 3);
    expect(phase(t.c)).toBe('CHECKOUT_ACTIVE'); // W1 does not apply once the app left the foreground
    t.setApp('active');
    await tick(1_000);
    t.api.verifyPayment.mockImplementation(async () => {
      t.backend.mode = 'paid';
      return { result: 'PAID', orderStatus: 'CONFIRMED', orderPaymentStatus: 'PAID' };
    });
    t.finish({ kind: 'EVIDENCE', evidence: EVIDENCE });
    await tick();
    expect(phase(t.c)).toBe('PAID');
    expect(t.api.createAttempt).toHaveBeenCalledTimes(1);
    expect(t.openCheckout).toHaveBeenCalledTimes(1);
  });

  it('W2: foreground without a callback -> CHECKING after the grace period; never reopens the checkout', async () => {
    const t = setup();
    await startToCheckout(t);
    t.setApp('background');
    await tick(5_000);
    t.setApp('active');
    await tick(WATCHDOG_FOREGROUND_GRACE_MS - 1);
    expect(phase(t.c)).toBe('CHECKOUT_ACTIVE');
    await tick(1);
    expect(phase(t.c)).toBe('CHECKING');
    expect(t.openCheckout).toHaveBeenCalledTimes(1);
    expect(t.api.createAttempt).toHaveBeenCalledTimes(1);
  });

  it('foregrounding during a verify does not start a duplicate verify or poll loop', async () => {
    const t = setup();
    await startToCheckout(t);
    let release!: () => void;
    t.api.verifyPayment.mockImplementation(() => new Promise((r) => (release = () => r({ result: 'PENDING', orderStatus: 'PENDING', orderPaymentStatus: 'PENDING' }))));
    t.finish({ kind: 'EVIDENCE', evidence: EVIDENCE });
    await tick();
    expect(phase(t.c)).toBe('VERIFYING');
    t.setApp('background');
    t.setApp('active');
    await tick(1_000);
    expect(t.api.verifyPayment).toHaveBeenCalledTimes(1);
    t.backend.mode = 'confirming';
    release();
    await tick();
    expect(phase(t.c)).toBe('CONFIRMING');
  });

  it('polling pauses in the background and resumes once on foreground', async () => {
    const t = setup('confirming');
    t.c.observe(order('confirming'));
    t.setApp('background');
    await tick(120_000);
    expect(t.fetchOrder).not.toHaveBeenCalled();
    t.setApp('active');
    await tick(0);
    expect(t.fetchOrder).toHaveBeenCalledTimes(1);
  });

  it('dispose (unmount / order change / sign-out) cancels polling and stale async work cannot write state', async () => {
    const t = setup('confirming');
    t.c.observe(order('confirming'));
    const stateBefore = t.c.getState();
    t.c.dispose();
    await tick(600_000);
    expect(t.fetchOrder).not.toHaveBeenCalled();
    expect(t.c.getState()).toBe(stateBefore);
    t.c.observe(order('paid'));
    expect(t.c.getState()).toBe(stateBefore);
  });

  it('a late native result after dispose writes no state and sends nothing; valid evidence is kept in MEMORY for a new screen', async () => {
    const t = setup();
    await startToCheckout(t);
    const s = t.c.getState();
    t.c.dispose();
    t.finish({ kind: 'EVIDENCE', evidence: EVIDENCE });
    await tick();
    expect(t.c.getState()).toBe(s);
    expect(t.api.verifyPayment).not.toHaveBeenCalled();
    expect(t.api.createAttempt).toHaveBeenCalledTimes(1);
    expect(t.evidence.getEvidence(ORDER_ID, 'att-1')).toEqual(EVIDENCE);
  });

  it('late evidence is NOT stored if the store was cleared meanwhile (sign-out) or it is for another provider order', async () => {
    const t = setup();
    await startToCheckout(t);
    t.c.dispose();
    t.evidence.clearAllEvidence(); // sign-out while the checkout was still open
    t.finish({ kind: 'EVIDENCE', evidence: EVIDENCE });
    await tick();
    expect(t.evidence.findForOrder(ORDER_ID)).toBeNull();

    const u = setup();
    await startToCheckout(u);
    u.c.dispose();
    u.finish({ kind: 'EVIDENCE', evidence: { ...EVIDENCE, providerOrderId: 'order_OTHER9' } });
    await tick();
    expect(u.evidence.findForOrder(ORDER_ID)).toBeNull();
  });

  it('an order for another id is ignored (order switch)', () => {
    const t = setup();
    t.c.observe({ ...order('paid'), id: 'other-order' });
    expect(phase(t.c)).toBe('IDLE');
  });
});

describe('same-process evidence recovery (memory-only, not screen-only)', () => {
  /** Leaves a flow with unverified evidence (verify timed out), then drops the screen. Returns the shared process. */
  async function leaveWithEvidence() {
    const proc = makeProcess();
    const first = setup('startable', {}, proc);
    await startToCheckout(first);
    first.api.verifyPayment.mockRejectedValueOnce(TIMEOUT);
    first.backend.mode = 'confirming';
    first.finish({ kind: 'EVIDENCE', evidence: EVIDENCE });
    await tick();
    expect(first.evidence.getEvidence(ORDER_ID, 'att-1')).toEqual(EVIDENCE);
    first.c.dispose(); // the screen is destroyed; the JS process lives on
    return proc;
  }

  it('evidence survives controller / screen recreation and the new controller recovers the attempt AND the evidence', async () => {
    const proc = await leaveWithEvidence();
    const second = setup('confirming', {}, proc);
    second.c.observe(order('confirming'));
    expect(second.c.getState().attemptId).toBe('att-1');
    expect(second.c.hasEvidence()).toBe(true);
    expect(second.evidence.findForOrder(ORDER_ID)).toEqual({ attemptId: 'att-1', evidence: EVIDENCE });
    expect(derivePresentation(order('confirming'), second.c.getState(), second.c.hasEvidence()).canRetryVerification).toBe(true);
  });

  it('retryVerification after recreation uses the SAME attempt and evidence; no create, no checkout reopen', async () => {
    const proc = await leaveWithEvidence();
    const second = setup('confirming', {}, proc);
    second.c.observe(order('confirming'));
    second.api.verifyPayment.mockImplementation(async () => {
      second.backend.mode = 'paid';
      return { result: 'PAID', orderStatus: 'CONFIRMED', orderPaymentStatus: 'PAID' };
    });
    await second.c.retryVerification();
    await tick();
    expect(second.api.verifyPayment).toHaveBeenCalledTimes(1);
    expect(second.api.verifyPayment).toHaveBeenCalledWith(ORDER_ID, 'att-1', EVIDENCE);
    expect(second.api.createAttempt).not.toHaveBeenCalled();
    expect(second.openCheckout).not.toHaveBeenCalled();
    expect(phase(second.c)).toBe('PAID');
    expect(second.evidence.findForOrder(ORDER_ID)).toBeNull(); // authoritative PAID clears it
  });

  it('recovery alone never creates an attempt or opens a checkout, even over a long time', async () => {
    const proc = await leaveWithEvidence();
    const second = setup('confirming', {}, proc);
    second.c.observe(order('confirming'));
    await tick(600_000);
    expect(second.api.createAttempt).not.toHaveBeenCalled();
    expect(second.api.verifyPayment).not.toHaveBeenCalled();
    expect(second.openCheckout).not.toHaveBeenCalled();
  });

  it('recovered evidence is not retry authority: the order is never offered "pay again" from an automatic observation', async () => {
    const proc = await leaveWithEvidence();
    const second = setup('startable', {}, proc);
    second.c.observe(order('startable'));
    expect(phase(second.c)).toBe('CONFIRMING');
    expect(derivePresentation(order('startable'), second.c.getState(), true).canStartPayment).toBe(false);
    await second.c.startPayment();
    expect(second.api.createAttempt).not.toHaveBeenCalled();
  });

  it('a refreshed PAID order clears recovered evidence without any verify call', async () => {
    const proc = await leaveWithEvidence();
    const second = setup('paid', {}, proc);
    second.c.observe(order('paid'));
    expect(phase(second.c)).toBe('PAID');
    expect(second.evidence.findForOrder(ORDER_ID)).toBeNull();
    expect(second.api.verifyPayment).not.toHaveBeenCalled();
  });

  it('a different order cannot reach this order\'s evidence', async () => {
    const proc = await leaveWithEvidence();
    expect(proc.evidence.findForOrder('ord-OTHER')).toBeNull();
    expect(proc.evidence.getEvidence('ord-OTHER', 'att-1')).toBeNull();
    const other = setup('confirming', { orderId: 'ord-OTHER' }, proc);
    other.c.observe({ ...order('confirming'), id: 'ord-OTHER' });
    expect(other.c.getState().attemptId).toBeNull();
    expect(other.c.hasEvidence()).toBe(false);
    await other.c.retryVerification();
    expect(other.api.verifyPayment).not.toHaveBeenCalled();
  });

  it('true process death: the store is gone, so there is no recovery capability and GET-only recovery remains', async () => {
    await leaveWithEvidence();
    const restarted = setup('confirming'); // a brand-new process: new store, new native state
    restarted.c.observe(order('confirming'));
    expect(restarted.c.hasEvidence()).toBe(false);
    expect(restarted.c.getState().attemptId).toBeNull();
    await restarted.c.retryVerification();
    expect(restarted.api.verifyPayment).not.toHaveBeenCalled();
    await tick(POLL_SCHEDULE_MS[0]);
    expect(restarted.fetchOrder).toHaveBeenCalled(); // GET-only recovery continues
    expect(restarted.api.createAttempt).not.toHaveBeenCalled();
  });

  it('a sign-out clear removes the recovery capability', async () => {
    const proc = await leaveWithEvidence();
    proc.evidence.clearAllEvidence();
    const second = setup('confirming', {}, proc);
    second.c.observe(order('confirming'));
    expect(second.c.hasEvidence()).toBe(false);
  });
});

describe('native checkout lock (a stuck promise fails closed; nothing but settling releases it)', () => {
  it('a new controller (screen navigated away and back) sees the unsettled checkout, creates NOTHING and offers no payment', async () => {
    const proc = makeProcess();
    const first = setup('startable', {}, proc);
    await startToCheckout(first);
    first.c.dispose(); // navigation: the controller dies, the native promise does NOT settle
    expect(proc.checkoutOpen).toBe(true);

    const second = setup('startable', {}, proc);
    second.c.observe(order('startable'));
    expect(second.c.getState().notice).toBe('CHECKOUT_PENDING');
    await second.c.startPayment();
    expect(second.api.createAttempt).not.toHaveBeenCalled();
    expect(second.openCheckout).not.toHaveBeenCalled();
    const p = derivePresentation(order('startable'), second.c.getState(), false);
    expect(p).toMatchObject({ kind: 'CHECKING_PAYMENT', canStartPayment: false });
    expect(p.message).toMatch(/payment window may still be open/);
  });

  it('time never releases it: hours later the checkout is still blocked', async () => {
    const proc = makeProcess();
    const first = setup('startable', {}, proc);
    await startToCheckout(first);
    first.c.dispose();
    await tick(WATCHDOG_NO_LAUNCH_MS + 24 * 3_600_000);
    const second = setup('startable', {}, proc);
    second.c.observe(order('startable'));
    await second.c.startPayment();
    expect(proc.checkoutOpen).toBe(true);
    expect(second.api.createAttempt).not.toHaveBeenCalled();
  });

  it('the same controller with a watchdog-fired, still-unsettled checkout also cannot start another', async () => {
    const t = setup();
    await startToCheckout(t);
    await tick(WATCHDOG_NO_LAUNCH_MS + 3_600_000);
    await t.c.startPayment();
    expect(t.api.createAttempt).toHaveBeenCalledTimes(1);
    expect(t.openCheckout).toHaveBeenCalledTimes(1);
  });

  it('when the native promise finally settles, the lock is released, the pending notice clears and the backend is asked (GET-only)', async () => {
    const proc = makeProcess();
    const first = setup('startable', {}, proc);
    await startToCheckout(first);
    first.c.dispose();
    const second = setup('startable', {}, proc);
    second.c.observe(order('startable'));
    expect(second.c.getState().notice).toBe('CHECKOUT_PENDING');
    const before = second.fetchOrder.mock.calls.length;
    first.finish({ kind: 'NOT_COMPLETED' }); // the abandoned checkout finally settles
    proc.settleNative();
    await tick();
    expect(second.c.getState().notice).not.toBe('CHECKOUT_PENDING');
    expect(second.fetchOrder.mock.calls.length).toBeGreaterThan(before);
    expect(second.api.createAttempt).not.toHaveBeenCalled();
    // only now may an explicit start proceed
    second.backend.mode = 'startable';
    await second.c.checkPaymentStatus();
    expect(derivePresentation(order('startable'), second.c.getState(), false).canStartPayment).toBe(true);
  });

  it('late evidence from the abandoned checkout becomes recoverable by the new controller (same process)', async () => {
    const proc = makeProcess();
    const first = setup('startable', {}, proc);
    await startToCheckout(first);
    first.c.dispose();
    const second = setup('confirming', {}, proc);
    second.c.observe(order('confirming'));
    first.finish({ kind: 'EVIDENCE', evidence: EVIDENCE });
    proc.settleNative();
    await tick();
    expect(second.c.hasEvidence()).toBe(true);
    second.api.verifyPayment.mockImplementation(async () => {
      second.backend.mode = 'paid';
      return { result: 'PAID', orderStatus: 'CONFIRMED', orderPaymentStatus: 'PAID' };
    });
    await second.c.retryVerification();
    await tick();
    expect(second.api.verifyPayment).toHaveBeenCalledWith(ORDER_ID, 'att-1', EVIDENCE);
    expect(phase(second.c)).toBe('PAID');
  });
});
