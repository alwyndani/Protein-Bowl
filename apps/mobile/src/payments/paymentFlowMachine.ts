/**
 * Pure LOCAL orchestration state for one order's payment flow (P11C-2 step 4). It is deliberately NOT financial state: whether the order
 * is paid, being confirmed, or safe to pay again is decided only by the backend (the order DTO's `payment` summary and the verify
 * answer). This reducer only tracks what THIS device is doing right now. No timer, and no SDK result, ever moves it to a "safe to retry"
 * or "failed" conclusion.
 */

export type FlowPhase =
  | 'IDLE' // nothing in progress; the backend summary decides whether an explicit start is offered
  | 'CREATING_SESSION' // POST create-attempt in flight
  | 'OPENING_CHECKOUT' // session validated, native checkout being opened
  | 'CHECKOUT_ACTIVE' // the native checkout is (believed) open
  | 'VERIFYING' // POST verify in flight
  | 'CONFIRMING' // the backend says the payment is unresolved: GET-only recovery
  | 'CHECKING' // an authoritative refresh is running, or the result of one is not yet conclusive
  | 'PAID' // set ONLY from a refreshed order that itself says PAID
  | 'BLOCKED'; // the backend says no payment can be started or is expected

export type FlowNotice =
  | 'NONE'
  | 'NOT_COMPLETED' // the checkout reported an error callback (dismissal and failure are indistinguishable)
  | 'AMBIGUOUS' // the checkout reported completion but the evidence was incomplete or mismatched
  | 'NATIVE_UNAVAILABLE' // the native checkout is not in this build (Expo Go)
  | 'SESSION_INVALID' // the backend session failed local structural validation: nothing was opened
  | 'VERIFY_UNCERTAIN' // the verify outcome is unknown (network / timeout / 5xx / unrecognised answer)
  | 'ACTION_REQUIRED' // the backend recorded a payment it could not apply: support / review, never pay again
  | 'CHECK_FAILED' // an authoritative refresh itself failed
  | 'CHECKOUT_PENDING'; // a native checkout opened earlier in this process (e.g. by a previous screen) has not settled: nothing new is started

export interface FlowState {
  phase: FlowPhase;
  notice: FlowNotice;
  /** The attempt this device is working on (from the backend session). null before any session. */
  attemptId: string | null;
  /** The native promise has not settled yet (it may still deliver evidence even after a watchdog moved the phase to CHECKING). */
  nativeOpen: boolean;
  /** Bounded polling reached its cap. Time alone never changes retry safety: the phase stays safe and a manual check is offered. */
  pollingExhausted: boolean;
  /** An AMBIGUOUS checkout result: no new checkout is offered until the backend shows the unresolved state cleared (or an explicit check). */
  ambiguousHold: boolean;
  /** The backend has reported CONFIRMING since the hold was set (needed to release it from automatic observations). */
  sawConfirmingSinceHold: boolean;
}

export const INITIAL_FLOW_STATE: FlowState = {
  phase: 'IDLE',
  notice: 'NONE',
  attemptId: null,
  nativeOpen: false,
  pollingExhausted: false,
  ambiguousHold: false,
  sawConfirmingSinceHold: false
};

/** What a refreshed ORDER says, reduced to the four conclusions the flow reacts to. Derived only from the order DTO. */
export type Observation = 'PAID' | 'CONFIRMING' | 'STARTABLE' | 'BLOCKED';

export type FlowEvent =
  | { type: 'START' }
  | { type: 'SESSION_READY'; attemptId: string }
  | { type: 'SESSION_REJECTED'; notice: FlowNotice }
  | { type: 'ATTEMPT_RECOVERED'; attemptId: string } // same-process recovery of the attempt that in-memory evidence belongs to
  | { type: 'CHECKOUT_OPENING' }
  | { type: 'CHECKOUT_ACTIVE' }
  | { type: 'NATIVE_SETTLED' }
  | { type: 'WATCHDOG_FIRED' }
  | { type: 'VERIFY_STARTED' }
  | { type: 'VERIFY_DONE' } // the verify request has an answer (or a failure); the authoritative refresh decides what happens next
  | { type: 'NOTICE'; notice: FlowNotice }
  | { type: 'HOLD' }
  | { type: 'CHECK_STARTED' }
  | { type: 'OBSERVED'; observation: Observation; manual: boolean }
  | { type: 'POLLING_EXHAUSTED' }
  | { type: 'POLLING_RESET' };

const ACTIVE: readonly FlowPhase[] = ['CREATING_SESSION', 'OPENING_CHECKOUT', 'CHECKOUT_ACTIVE', 'VERIFYING'];
export const isActivePhase = (p: FlowPhase) => ACTIVE.includes(p);
/** Phases in which GET-only recovery polling is meaningful. */
export const isPollingPhase = (p: FlowPhase) => p === 'CONFIRMING' || p === 'CHECKING';

export function reduceFlow(s: FlowState, e: FlowEvent): FlowState {
  switch (e.type) {
    case 'START':
      if (s.phase !== 'IDLE' || s.nativeOpen) return s;
      return { ...s, phase: 'CREATING_SESSION', notice: 'NONE', pollingExhausted: false };
    case 'SESSION_READY':
      return { ...s, attemptId: e.attemptId, phase: 'OPENING_CHECKOUT' };
    case 'ATTEMPT_RECOVERED':
      return s.attemptId === e.attemptId ? s : { ...s, attemptId: e.attemptId };
    case 'SESSION_REJECTED':
      return { ...s, notice: e.notice, phase: 'CHECKING' };
    case 'CHECKOUT_OPENING':
      return { ...s, phase: 'OPENING_CHECKOUT' };
    case 'CHECKOUT_ACTIVE':
      return { ...s, phase: 'CHECKOUT_ACTIVE', nativeOpen: true };
    case 'NATIVE_SETTLED':
      return { ...s, nativeOpen: false };
    case 'WATCHDOG_FIRED':
      // The watchdog only ever moves an open checkout to CHECKING; it never concludes anything about the payment.
      return s.phase === 'CHECKOUT_ACTIVE' ? { ...s, phase: 'CHECKING' } : s;
    case 'VERIFY_STARTED':
      return { ...s, phase: 'VERIFYING' };
    case 'VERIFY_DONE':
      return s.phase === 'VERIFYING' ? { ...s, phase: 'CHECKING' } : s;
    case 'NOTICE':
      return { ...s, notice: e.notice };
    case 'HOLD':
      return { ...s, ambiguousHold: true, sawConfirmingSinceHold: false };
    case 'CHECK_STARTED':
      return s.phase === 'PAID' || s.phase === 'CREATING_SESSION' || s.phase === 'VERIFYING' || s.phase === 'CHECKOUT_ACTIVE' || s.phase === 'OPENING_CHECKOUT' ? s : { ...s, phase: 'CHECKING' };
    case 'POLLING_EXHAUSTED':
      return { ...s, pollingExhausted: true };
    case 'POLLING_RESET':
      return { ...s, pollingExhausted: false };
    case 'OBSERVED': {
      // While this device is mid-operation the operation itself decides what happens next.
      if (isActivePhase(s.phase)) {
        return e.observation === 'PAID' ? { ...s, phase: 'PAID', ambiguousHold: false } : s;
      }
      switch (e.observation) {
        case 'PAID':
          return { ...s, phase: 'PAID', ambiguousHold: false, sawConfirmingSinceHold: false, notice: 'NONE' };
        case 'CONFIRMING':
          return { ...s, phase: 'CONFIRMING', sawConfirmingSinceHold: s.ambiguousHold ? true : s.sawConfirmingSinceHold };
        case 'BLOCKED':
          return { ...s, phase: 'BLOCKED', ambiguousHold: false, sawConfirmingSinceHold: false };
        case 'STARTABLE': {
          // A checkout whose native promise has not settled might still deliver evidence: do not offer another one.
          if (s.nativeOpen) return { ...s, phase: 'CHECKING' };
          if (s.ambiguousHold && !(s.sawConfirmingSinceHold || e.manual)) return { ...s, phase: 'CONFIRMING' };
          return { ...s, phase: 'IDLE', ambiguousHold: false, sawConfirmingSinceHold: false };
        }
      }
    }
  }
}

// ----------------------------------------------------------------------------------------------------------------------------
// UI / lifecycle cadence values. They are NOT financial timeouts and they never make a payment safe to retry.
// ----------------------------------------------------------------------------------------------------------------------------

/** Delays between GET-only status checks while a payment is being confirmed: 2 s, then 4 s x10, then 10 s x25 (about 5 minutes). */
export const POLL_SCHEDULE_MS: readonly number[] = Object.freeze([2_000, ...Array<number>(10).fill(4_000), ...Array<number>(25).fill(10_000)]);

/** Watchdog W1: the checkout was requested but the app never left the foreground state for this long. Moves to CHECKING only. */
export const WATCHDOG_NO_LAUNCH_MS = 20_000;

/** Watchdog W2: the app returned to the foreground and the checkout callback still has not arrived after this grace period. Moves to CHECKING only. */
export const WATCHDOG_FOREGROUND_GRACE_MS = 8_000;
