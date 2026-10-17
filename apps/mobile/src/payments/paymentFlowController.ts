import type { CustomerOrder } from '../commerce/types';
import { buildCheckoutOptions } from './checkoutMapping';
import { INITIAL_FLOW_STATE, POLL_SCHEDULE_MS, WATCHDOG_FOREGROUND_GRACE_MS, WATCHDOG_NO_LAUNCH_MS, isPollingPhase, reduceFlow } from './paymentFlowMachine';
import type { FlowEvent, FlowNotice, FlowState, Observation } from './paymentFlowMachine';
import { paymentErrorInfo } from './paymentErrors';
import type { PaymentEvidenceStore } from './paymentEvidenceStore';
import type { PaymentApi } from './paymentApi';
import type { CheckoutOptions, CheckoutResult } from './razorpayBridge';
import type { PaymentEvidence } from './paymentTypes';

/**
 * Production payment ORCHESTRATOR for ONE order (P11C-2 step 4). Framework-free so it is testable without React; the hook in
 * commerce/usePaymentFlow.ts only wires it to the app.
 *
 * FINANCIAL PRINCIPLE: this class never decides financial truth. Whether the order is paid, being confirmed, or safe to pay again comes
 * only from the backend (the refreshed order's `payment` summary, which D1 makes provider-checked, and the verify answer). SDK results,
 * errors, timers and app lifecycle events only decide what this device does next: they never establish retry safety, and nothing here
 * ever marks anything paid or failed locally. Payment is never started automatically: only an explicit startPayment().
 *
 * VERIFY DECISION MATRIX (from the current backend: PaymentSessionService.verifyCheckout):
 *   200 PAID ............................ refresh the order; PAID only when the refreshed order says PAID, else CONFIRMING (evidence kept)
 *   202 PENDING ......................... CONFIRMING, evidence kept (the provider fetch was unavailable, or the capture is not settled yet)
 *   400 PAYMENT_VERIFICATION_FAILED ..... DEFINITIVE for THIS evidence (wrong provider order, invalid signature, payment not found,
 *                                         provider reports failed): evidence cleared, "Payment not completed", backend decides retry
 *   422 PAYMENT_AMOUNT/CURRENCY_MISMATCH  DEFINITIVE: the backend recorded a flagged capture; evidence cleared; ACTION_REQUIRED (never pay again)
 *   409 ORDER_NOT_PAYABLE ............... DEFINITIVE (e.g. a capture after cancellation): evidence cleared; ACTION_REQUIRED
 *   404 PAYMENT_ATTEMPT_NOT_FOUND ....... DEFINITIVE for this attempt: evidence cleared; ACTION_REQUIRED
 *   network / timeout / 5xx (incl. 503) / 429 / any unrecognised answer ... UNCERTAIN: evidence kept, CONFIRMING, "verify again" offered
 * EVERY verify outcome is followed by an authoritative order refresh; no verify error alone ever offers another checkout.
 */

export interface AppStateSource {
  current: () => string;
  subscribe: (listener: (state: string) => void) => () => void;
}

export interface FlowDeps {
  orderId: string;
  api: Pick<PaymentApi, 'createAttempt' | 'verifyPayment'>;
  evidence: PaymentEvidenceStore;
  openCheckout: (options: CheckoutOptions) => Promise<CheckoutResult>;
  isNativeAvailable: () => boolean;
  /** A native checkout is unsettled somewhere in this process (it may belong to a screen that no longer exists). */
  isCheckoutOpen: () => boolean;
  /** One-shot style subscription to "the native checkout settled" (returns an unsubscribe function). */
  onCheckoutSettled: (listener: () => void) => () => void;
  /** Authoritative GET of the order (also refreshes the shared order query cache). */
  fetchOrder: () => Promise<CustomerOrder>;
  appState: AppStateSource;
}

const DEFINITIVE_VERIFY_NOT_COMPLETED = new Set(['PAYMENT_VERIFICATION_FAILED']);
const DEFINITIVE_VERIFY_ACTION_REQUIRED = new Set(['PAYMENT_AMOUNT_MISMATCH', 'PAYMENT_CURRENCY_MISMATCH', 'ORDER_NOT_PAYABLE', 'PAYMENT_ATTEMPT_NOT_FOUND', 'ORDER_NOT_FOUND']);

/** The four conclusions an order DTO supports. An order without a payment summary can prove nothing and is treated as blocked. */
export function observeOrder(order: Pick<CustomerOrder, 'status' | 'paymentStatus' | 'payment'>): Observation {
  if (order.payment?.state === 'PAID' || order.paymentStatus === 'PAID') return 'PAID';
  if (order.payment?.state === 'CONFIRMING') return 'CONFIRMING';
  if (order.payment?.canStartPayment === true && order.status === 'PENDING') return 'STARTABLE';
  return 'BLOCKED';
}

export class PaymentFlowController {
  private state: FlowState = INITIAL_FLOW_STATE;
  private readonly listeners = new Set<() => void>();
  private latestOrder: CustomerOrder | null = null;
  private disposed = false;
  private busy = false; // synchronous guard for startPayment
  private verifying = false;
  private verifyDoubt = false; // a verify answer is not yet reflected by the backend order
  private reconciling: Promise<void> | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private pollIndex = 0;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdogFired = false;
  private leftForeground = false; // the app left the foreground while a checkout was open
  private inBackground = false;
  private readonly unsubscribeAppState: () => void;

  private unsubscribeSettled: (() => void) | null = null;

  constructor(private readonly deps: FlowDeps) {
    this.inBackground = deps.appState.current() !== 'active';
    this.unsubscribeAppState = deps.appState.subscribe((s) => this.onAppState(s));
    // SAME-PROCESS recovery: evidence is process memory, not screen memory. A controller created for an order whose evidence still
    // exists (the screen was left and reopened) recovers the attempt that evidence belongs to. It creates nothing and opens nothing:
    // the evidence is only made available to retryVerification, and the backend order still decides everything else.
    this.adoptStoredEvidence();
    // A checkout opened by an earlier screen may still be unsettled: nothing new may start until it settles.
    if (deps.isCheckoutOpen()) this.markCheckoutPending();
  }

  /** Make in-memory evidence for THIS order (and its attempt) available. Never reads another order's evidence. */
  private adoptStoredEvidence(): { attemptId: string; evidence: PaymentEvidence } | null {
    const own = this.state.attemptId ? this.deps.evidence.getEvidence(this.deps.orderId, this.state.attemptId) : null;
    if (own && this.state.attemptId) return { attemptId: this.state.attemptId, evidence: own };
    const rec = this.deps.evidence.findForOrder(this.deps.orderId);
    if (!rec) return null;
    this.verifyDoubt = true; // unverified evidence exists: an automatic "startable" observation must not offer a new checkout
    if (this.state.attemptId !== rec.attemptId) {
      if (this.disposed) return rec;
      this.state = reduceFlow(this.state, { type: 'ATTEMPT_RECOVERED', attemptId: rec.attemptId });
      this.listeners.forEach((l) => l());
    }
    return rec;
  }

  private markCheckoutPending() {
    this.dispatch({ type: 'NOTICE', notice: 'CHECKOUT_PENDING' });
    if (this.unsubscribeSettled) return;
    this.unsubscribeSettled = this.deps.onCheckoutSettled(() => {
      this.unsubscribeSettled?.();
      this.unsubscribeSettled = null;
      if (this.disposed) return;
      if (this.state.notice === 'CHECKOUT_PENDING') this.dispatch({ type: 'NOTICE', notice: 'NONE' });
      void this.reconcile(false); // the settled checkout may have produced evidence / a payment: ask the backend (GET-only)
    });
  }

  // ------------------------------------------------------------------------------------------------ observable state
  getState = (): FlowState => this.state;

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getOrder = (): CustomerOrder | null => this.latestOrder;

  /** Pure read (safe during render): evidence for THIS order exists in process memory. */
  hasEvidence = (): boolean => {
    const id = this.state.attemptId;
    if (id && this.deps.evidence.getEvidence(this.deps.orderId, id)) return true;
    return this.deps.evidence.findForOrder(this.deps.orderId) !== null;
  };

  private dispatch(e: FlowEvent) {
    if (this.disposed) return;
    const next = reduceFlow(this.state, e);
    if (next === this.state) return;
    this.state = next;
    this.listeners.forEach((l) => l());
  }

  dispose() {
    this.disposed = true;
    this.clearPollTimer();
    this.clearWatchdog();
    this.unsubscribeAppState();
    this.unsubscribeSettled?.();
    this.unsubscribeSettled = null;
    this.listeners.clear();
  }

  // ------------------------------------------------------------------------------------------------ authoritative order in
  /** Feed the latest order from the query cache. Never starts a payment; on a CONFIRMING order it starts GET-only recovery. */
  observe(order: CustomerOrder): void {
    if (this.disposed || order.id !== this.deps.orderId) return;
    this.latestOrder = order;
    this.apply(order, false);
  }

  private apply(order: CustomerOrder, manual: boolean) {
    let obs = observeOrder(order);
    if (obs === 'STARTABLE' && this.verifyDoubt && !manual) obs = 'CONFIRMING'; // a verify answer the backend order does not yet reflect
    if (obs === 'PAID' || obs === 'BLOCKED') this.verifyDoubt = false;
    if (this.state.notice === 'CHECK_FAILED') this.dispatch({ type: 'NOTICE', notice: 'NONE' });
    this.dispatch({ type: 'OBSERVED', observation: obs, manual });
    if (this.state.phase === 'PAID') {
      this.clearOrderEvidence();
      this.clearPollTimer();
      return;
    }
    if (isPollingPhase(this.state.phase)) this.ensurePolling();
    else this.clearPollTimer();
  }

  private clearOrderEvidence() {
    for (let rec = this.deps.evidence.findForOrder(this.deps.orderId); rec; rec = this.deps.evidence.findForOrder(this.deps.orderId)) {
      this.deps.evidence.clearEvidence(this.deps.orderId, rec.attemptId);
    }
  }

  // ------------------------------------------------------------------------------------------------ GET-only reconciliation
  /** One authoritative GET at a time. Never a financial POST. */
  private reconcile(manual: boolean): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.reconciling) return this.reconciling;
    this.clearPollTimer();
    if (manual) {
      this.pollIndex = 0;
      this.dispatch({ type: 'POLLING_RESET' });
    }
    this.dispatch({ type: 'CHECK_STARTED' });
    const run = (async () => {
      let order: CustomerOrder | null = null;
      try {
        order = await this.deps.fetchOrder();
      } catch {
        order = null;
      }
      this.reconciling = null;
      if (this.disposed) return;
      if (!order || order.id !== this.deps.orderId) {
        this.dispatch({ type: 'NOTICE', notice: 'CHECK_FAILED' });
        if (isPollingPhase(this.state.phase)) this.ensurePolling();
        return;
      }
      this.latestOrder = order;
      this.apply(order, manual);
    })();
    this.reconciling = run;
    return run;
  }

  private ensurePolling() {
    if (this.disposed || this.pollTimer || this.reconciling || this.inBackground) return;
    if (this.state.pollingExhausted) return;
    if (this.pollIndex >= POLL_SCHEDULE_MS.length) {
      // The cap is a cadence limit only: the phase stays CONFIRMING / CHECKING and nothing becomes retry-safe. A manual check restarts it.
      this.dispatch({ type: 'POLLING_EXHAUSTED' });
      return;
    }
    const delay = POLL_SCHEDULE_MS[this.pollIndex++];
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      void this.reconcile(false);
    }, delay);
  }

  private clearPollTimer() {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  /** Manual, GET-only "check payment status". Never creates an attempt, verifies, or opens a checkout. */
  async checkPaymentStatus(): Promise<void> {
    if (this.disposed) return;
    const p = this.state.phase;
    if (p === 'CREATING_SESSION' || p === 'OPENING_CHECKOUT' || p === 'CHECKOUT_ACTIVE' || p === 'VERIFYING') return;
    await this.reconcile(true);
  }

  // ------------------------------------------------------------------------------------------------ start payment
  /** The ONLY way a payment begins: an explicit user action. */
  async startPayment(): Promise<void> {
    if (this.disposed || this.busy) return;
    if (this.state.phase !== 'IDLE' || this.state.nativeOpen || this.state.ambiguousHold) return;
    this.busy = true;
    try {
      // A checkout that has not settled (even one opened by a screen that no longer exists) blocks any new start BEFORE anything is created.
      // This lock is released only by the native promise settling; no timer or navigation releases it.
      if (this.deps.isCheckoutOpen()) {
        this.markCheckoutPending();
        return;
      }
      // Nothing is created for a build that cannot open the checkout.
      if (!this.deps.isNativeAvailable()) {
        this.dispatch({ type: 'NOTICE', notice: 'NATIVE_UNAVAILABLE' });
        return;
      }
      // Re-check the AUTHORITATIVE order: the cached one may be stale.
      let order: CustomerOrder;
      try {
        order = await this.deps.fetchOrder();
      } catch {
        this.dispatch({ type: 'NOTICE', notice: 'CHECK_FAILED' });
        return;
      }
      if (this.disposed || order.id !== this.deps.orderId) return;
      this.latestOrder = order;
      if (observeOrder(order) !== 'STARTABLE' || this.verifyDoubt) {
        this.apply(order, false);
        return;
      }

      this.dispatch({ type: 'START' });
      if (this.getState().phase !== 'CREATING_SESSION') return;

      let session;
      try {
        session = await this.deps.api.createAttempt(this.deps.orderId);
      } catch {
        // already completed / not payable / in progress / provider unavailable / timeout / network / 5xx: none is a financial conclusion and
        // none is retried here. The authoritative refresh decides what is shown or offered next.
        if (this.disposed) return;
        await this.recover('NONE');
        return;
      }
      if (this.disposed) return;

      const attemptId = session && typeof session === 'object' && typeof session.attemptId === 'string' && session.attemptId.length > 0 ? session.attemptId : null;
      const mapping = attemptId ? buildCheckoutOptions(session) : null;
      if (!attemptId || !mapping || !mapping.ok) {
        await this.recover('SESSION_INVALID'); // fail closed: nothing is opened
        return;
      }
      this.dispatch({ type: 'SESSION_READY', attemptId });
      await this.runCheckout(attemptId, session.providerOrderId, mapping.options);
    } finally {
      this.busy = false;
    }
  }

  /** Leave the current operation and let the backend decide. */
  private async recover(notice: FlowNotice) {
    this.dispatch({ type: 'SESSION_REJECTED', notice });
    await this.reconcile(false);
  }

  // ------------------------------------------------------------------------------------------------ native checkout
  private async runCheckout(attemptId: string, providerOrderId: string, options: CheckoutOptions) {
    const epoch = this.deps.evidence.epoch();
    this.watchdogFired = false;
    this.leftForeground = this.deps.appState.current() !== 'active';
    this.dispatch({ type: 'CHECKOUT_ACTIVE' });
    this.armWatchdog(WATCHDOG_NO_LAUNCH_MS, !this.leftForeground);
    let result: CheckoutResult;
    try {
      result = await this.deps.openCheckout(options);
    } catch {
      result = { kind: 'NOT_COMPLETED' };
    }
    this.clearWatchdog();
    this.dispatch({ type: 'NATIVE_SETTLED' });
    if (this.disposed) {
      // The screen is gone but the process lives: keep valid evidence in MEMORY so a new screen can verify it. No state is written and
      // nothing is sent. If everything was cleared meanwhile (sign-out) it is NOT stored.
      if (result.kind === 'EVIDENCE' && result.evidence.providerOrderId === providerOrderId && this.deps.evidence.epoch() === epoch) {
        this.deps.evidence.setEvidence(this.deps.orderId, attemptId, result.evidence);
      }
      return;
    }

    switch (result.kind) {
      case 'EVIDENCE': {
        if (result.evidence.providerOrderId !== providerOrderId) {
          // Evidence for another provider order than the session's: never forwarded, never discarded as a failure.
          this.dispatch({ type: 'NOTICE', notice: 'AMBIGUOUS' });
          this.dispatch({ type: 'HOLD' });
          await this.recover('AMBIGUOUS');
          return;
        }
        this.deps.evidence.setEvidence(this.deps.orderId, attemptId, result.evidence);
        await this.verify();
        return;
      }
      case 'NOT_COMPLETED':
        await this.recover('NOT_COMPLETED');
        return;
      case 'AMBIGUOUS':
        this.dispatch({ type: 'HOLD' });
        await this.recover('AMBIGUOUS');
        return;
      case 'UNAVAILABLE':
        await this.recover('NATIVE_UNAVAILABLE');
        return;
      case 'ALREADY_OPEN':
        // Another checkout exists: this call did not open one. Do not start anything else.
        await this.recover('NONE');
        return;
    }
  }

  // ------------------------------------------------------------------------------------------------ verify
  /** Re-send the SAME in-memory evidence for the SAME order and attempt. Never creates an attempt, never opens a checkout. */
  async retryVerification(): Promise<void> {
    if (this.disposed || this.verifying || this.busy) return;
    const p = this.state.phase;
    if (p === 'CREATING_SESSION' || p === 'OPENING_CHECKOUT' || p === 'CHECKOUT_ACTIVE' || p === 'VERIFYING') return;
    if (!this.hasEvidence()) return;
    await this.verify();
  }

  private async verify(): Promise<void> {
    const rec = this.adoptStoredEvidence();
    if (!rec || this.verifying) return;
    const attemptId = rec.attemptId;
    const evidence = rec.evidence;
    this.verifying = true;
    this.dispatch({ type: 'VERIFY_STARTED' });
    try {
      try {
        await this.deps.api.verifyPayment(this.deps.orderId, attemptId, evidence);
      } catch (e) {
        if (this.disposed) return;
        const info = paymentErrorInfo(e);
        const code = info && !info.ambiguous ? info.code : null;
        if (code && DEFINITIVE_VERIFY_NOT_COMPLETED.has(code)) {
          this.deps.evidence.clearEvidence(this.deps.orderId, attemptId);
          this.verifyDoubt = false;
          this.dispatch({ type: 'NOTICE', notice: 'NOT_COMPLETED' });
        } else if (code && DEFINITIVE_VERIFY_ACTION_REQUIRED.has(code)) {
          this.deps.evidence.clearEvidence(this.deps.orderId, attemptId);
          this.verifyDoubt = false;
          this.dispatch({ type: 'NOTICE', notice: 'ACTION_REQUIRED' });
        } else {
          this.verifyDoubt = true; // evidence kept; the outcome is unknown
          this.dispatch({ type: 'NOTICE', notice: 'VERIFY_UNCERTAIN' });
        }
        this.dispatch({ type: 'VERIFY_DONE' });
        this.verifying = false;
        await this.reconcile(false);
        return;
      }
      if (this.disposed) return;
      // PAID or PENDING: either way the REFRESHED ORDER decides. Until it says PAID the flow stays in CONFIRMING with the evidence kept.
      this.verifyDoubt = true;
      this.dispatch({ type: 'NOTICE', notice: 'NONE' });
      this.dispatch({ type: 'VERIFY_DONE' });
      this.verifying = false;
      await this.reconcile(false);
    } finally {
      this.verifying = false;
    }
  }

  // ------------------------------------------------------------------------------------------------ lifecycle / watchdog
  /**
   * The watchdog exists only so the UI cannot hang forever on a native promise that never settles. It moves an open checkout to CHECKING
   * and triggers an authoritative refresh; it NEVER concludes anything about the payment and never enables a new checkout. If the native
   * promise settles later, its result is still handled normally.
   */
  private armWatchdog(ms: number, enabled: boolean) {
    this.clearWatchdog();
    if (!enabled || this.watchdogFired) return;
    this.watchdogTimer = setTimeout(() => {
      this.watchdogTimer = null;
      if (this.disposed || !this.state.nativeOpen || this.watchdogFired) return;
      this.watchdogFired = true;
      this.dispatch({ type: 'WATCHDOG_FIRED' });
      void this.reconcile(false);
    }, ms);
  }

  private clearWatchdog() {
    if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
    this.watchdogTimer = null;
  }

  private onAppState(s: string) {
    if (this.disposed) return;
    const foreground = s === 'active';
    this.inBackground = !foreground;
    if (this.state.nativeOpen) {
      if (!foreground) {
        this.leftForeground = true;
        this.clearWatchdog(); // W1 only applies while the app never left the foreground
      } else if (this.leftForeground) {
        this.armWatchdog(WATCHDOG_FOREGROUND_GRACE_MS, true); // W2: back in the foreground, callback still missing after the grace period
      }
      return;
    }
    if (!foreground) {
      this.clearPollTimer(); // no polling in the background
      return;
    }
    // Back in the foreground: resume GET-only recovery once, without duplicating a running loop.
    if (isPollingPhase(this.state.phase) && !this.state.pollingExhausted && !this.verifying) void this.reconcile(false);
  }
}
