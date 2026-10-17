import { INITIAL_FLOW_STATE, POLL_SCHEDULE_MS, WATCHDOG_FOREGROUND_GRACE_MS, WATCHDOG_NO_LAUNCH_MS, reduceFlow } from '../src/payments/paymentFlowMachine';
import type { FlowEvent, FlowState } from '../src/payments/paymentFlowMachine';
import { derivePresentation } from '../src/payments/paymentPresentation';
import type { CustomerOrder } from '../src/commerce/types';

const run = (events: FlowEvent[], from: FlowState = INITIAL_FLOW_STATE) => events.reduce(reduceFlow, from);
const ord = (payment: CustomerOrder['payment'], extra: Partial<CustomerOrder> = {}) => ({ status: 'PENDING', paymentStatus: 'PENDING', payment, ...extra }) as CustomerOrder;

describe('flow reducer (pure, local orchestration only)', () => {
  it('START only from IDLE and not while a native checkout is unsettled', () => {
    expect(run([{ type: 'START' }]).phase).toBe('CREATING_SESSION');
    expect(run([{ type: 'START' }, { type: 'START' }]).phase).toBe('CREATING_SESSION');
    expect(reduceFlow({ ...INITIAL_FLOW_STATE, nativeOpen: true }, { type: 'START' }).phase).toBe('IDLE');
    expect(reduceFlow({ ...INITIAL_FLOW_STATE, phase: 'CONFIRMING' }, { type: 'START' }).phase).toBe('CONFIRMING');
  });

  it('the watchdog only moves CHECKOUT_ACTIVE to CHECKING; no other phase and no failure state exists', () => {
    expect(run([{ type: 'START' }, { type: 'SESSION_READY', attemptId: 'a' }, { type: 'CHECKOUT_ACTIVE' }, { type: 'WATCHDOG_FIRED' }]).phase).toBe('CHECKING');
    for (const phase of ['IDLE', 'VERIFYING', 'CONFIRMING', 'PAID', 'BLOCKED'] as const) expect(reduceFlow({ ...INITIAL_FLOW_STATE, phase }, { type: 'WATCHDOG_FIRED' }).phase).toBe(phase);
  });

  it('PAID is reachable only through an OBSERVED PAID event', () => {
    const events: FlowEvent[] = [
      { type: 'START' },
      { type: 'SESSION_READY', attemptId: 'a' },
      { type: 'CHECKOUT_ACTIVE' },
      { type: 'NATIVE_SETTLED' },
      { type: 'VERIFY_STARTED' },
      { type: 'VERIFY_DONE' },
      { type: 'NOTICE', notice: 'NONE' },
      { type: 'POLLING_EXHAUSTED' },
      { type: 'WATCHDOG_FIRED' }
    ];
    expect(run(events).phase).not.toBe('PAID');
    expect(run([...events, { type: 'OBSERVED', observation: 'PAID', manual: false }]).phase).toBe('PAID');
  });

  it('an observation never interrupts an active operation (except PAID)', () => {
    const s = run([{ type: 'START' }]);
    expect(reduceFlow(s, { type: 'OBSERVED', observation: 'STARTABLE', manual: false }).phase).toBe('CREATING_SESSION');
    expect(reduceFlow(s, { type: 'OBSERVED', observation: 'BLOCKED', manual: false }).phase).toBe('CREATING_SESSION');
  });

  it('STARTABLE with an unsettled native promise never returns to IDLE', () => {
    expect(reduceFlow({ ...INITIAL_FLOW_STATE, phase: 'CHECKING', nativeOpen: true }, { type: 'OBSERVED', observation: 'STARTABLE', manual: true }).phase).toBe('CHECKING');
  });

  it('the polling cap changes only a flag, never the phase', () => {
    const s = reduceFlow({ ...INITIAL_FLOW_STATE, phase: 'CONFIRMING' }, { type: 'POLLING_EXHAUSTED' });
    expect(s.phase).toBe('CONFIRMING');
    expect(s.pollingExhausted).toBe(true);
  });

  it('cadence constants are UI-only, bounded and centralized', () => {
    expect(POLL_SCHEDULE_MS[0]).toBe(2_000);
    expect(POLL_SCHEDULE_MS.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(10 * 60_000);
    expect(WATCHDOG_NO_LAUNCH_MS).toBeGreaterThan(0);
    expect(WATCHDOG_FOREGROUND_GRACE_MS).toBeGreaterThan(0);
  });
});

describe('presentation model (derived, never a second truth)', () => {
  const idle = INITIAL_FLOW_STATE;

  it('READY_TO_PAY only when the backend says canStartPayment', () => {
    expect(derivePresentation(ord({ state: 'AWAITING_PAYMENT', canStartPayment: true }), idle, false)).toMatchObject({ kind: 'READY_TO_PAY', canStartPayment: true });
    expect(derivePresentation(ord({ state: 'AWAITING_PAYMENT', canStartPayment: false }), idle, false).canStartPayment).toBe(false);
    expect(derivePresentation(ord(undefined), idle, false).canStartPayment).toBe(false);
    expect(derivePresentation(null, idle, false).canStartPayment).toBe(false);
  });

  it('never turns a backend false into true, whatever the local phase and notice', () => {
    const o = ord({ state: 'CONFIRMING', canStartPayment: false });
    for (const phase of ['IDLE', 'CONFIRMING', 'CHECKING', 'BLOCKED'] as const)
      for (const notice of ['NONE', 'NOT_COMPLETED', 'CHECK_FAILED', 'VERIFY_UNCERTAIN'] as const) expect(derivePresentation(o, { ...idle, phase, notice }, true).canStartPayment).toBe(false);
  });

  it('the neutral wording is fixed and no provider text is carried', () => {
    const p = derivePresentation(ord({ state: 'AWAITING_PAYMENT', canStartPayment: true }), { ...idle, notice: 'NOT_COMPLETED' }, false);
    expect(p.message).toBe('Payment not completed');
  });

  it('PAYMENT_CONFIRMED only from an order that says PAID; a PAID phase alone is not confirmation', () => {
    expect(derivePresentation(ord({ state: 'PAID', canStartPayment: false }, { paymentStatus: 'PAID' }), { ...idle, phase: 'PAID' }, false).kind).toBe('PAYMENT_CONFIRMED');
    expect(derivePresentation(ord({ state: 'CONFIRMING', canStartPayment: false }), { ...idle, phase: 'PAID' }, false).kind).not.toBe('PAYMENT_CONFIRMED');
  });

  it('phases map to STARTING / CHECKOUT_OPEN / VERIFYING / CHECKING_PAYMENT / UNAVAILABLE', () => {
    const o = ord({ state: 'AWAITING_PAYMENT', canStartPayment: true });
    expect(derivePresentation(o, { ...idle, phase: 'CREATING_SESSION' }, false).kind).toBe('STARTING');
    expect(derivePresentation(o, { ...idle, phase: 'CHECKOUT_ACTIVE' }, false).kind).toBe('CHECKOUT_OPEN');
    expect(derivePresentation(o, { ...idle, phase: 'VERIFYING' }, false).kind).toBe('VERIFYING');
    expect(derivePresentation(o, { ...idle, phase: 'CHECKING' }, false).kind).toBe('CHECKING_PAYMENT');
    expect(derivePresentation(o, { ...idle, phase: 'BLOCKED' }, false).kind).toBe('UNAVAILABLE');
  });

  it('retryVerification is offered only with evidence and only while unresolved', () => {
    const o = ord({ state: 'CONFIRMING', canStartPayment: false });
    expect(derivePresentation(o, { ...idle, phase: 'CONFIRMING' }, true).canRetryVerification).toBe(true);
    expect(derivePresentation(o, { ...idle, phase: 'CONFIRMING' }, false).canRetryVerification).toBe(false);
  });
});
