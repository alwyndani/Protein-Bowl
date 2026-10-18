import { NativeModules, TurboModuleRegistry } from 'react-native';

/**
 * The ONLY file that names the Razorpay package. It loads the native module defensively and serialises access to it; it interprets
 * NOTHING. The raw callback payload it returns is UNTRUSTED and may hold identifiers, so only the production bridge (which reduces it to a
 * minimal typed result) and the development-only diagnostic module may import this file (a static guard enforces it).
 *
 * Expo Go cannot load the native module. Availability is detected BEFORE the package is required, so the app never crashes there and never
 * fakes a result.
 */

export type NativeOpenOptions = {
  /** PUBLIC key id from the backend payment session. Never a secret. */
  key: string;
  /** Provider order id from the backend session. Optional only so the dev-only harness can open an order-less test checkout. */
  order_id?: string;
  /** Minor units, exactly as the backend session reports. */
  amount: number;
  currency: string;
  name: string;
  description?: string;
};

export type NativeSettled =
  | { kind: 'UNAVAILABLE' }
  | { kind: 'IN_PROGRESS' }
  | { kind: 'RESOLVED'; payload: unknown }
  | { kind: 'REJECTED'; payload: unknown };

type RazorpayModule = { open: (options: NativeOpenOptions) => Promise<unknown> };

let inFlight = false;
const settledListeners = new Set<() => void>();
const stateListeners = new Set<() => void>();

function notifyState() {
  stateListeners.forEach((l) => {
    try {
      l();
    } catch {
      /* a listener must never break the checkout path */
    }
  });
}

/** True only in a build that actually contains the native module (a development / production build, never Expo Go). */
export function isRazorpayNativeAvailable(): boolean {
  try {
    if (NativeModules.RNRazorpayCheckout != null) return true; // legacy architecture (Expo SDK 52 default)
    return TurboModuleRegistry.get('RNRazorpayCheckout') != null; // New Architecture
  } catch {
    return false;
  }
}

function loadModule(): RazorpayModule | null {
  if (!isRazorpayNativeAvailable()) return null;
  try {
    const loaded = require('react-native-razorpay') as { default?: RazorpayModule } & Partial<RazorpayModule>;
    const mod = loaded.default ?? loaded;
    return typeof mod.open === 'function' ? (mod as RazorpayModule) : null;
  } catch {
    return null;
  }
}

/**
 * Whether a native checkout is currently unsettled. The lock is released ONLY when the native promise settles (resolve or reject): not by
 * navigation, not by a screen or controller being disposed, and not by any timer. If the promise never settles it stays set until the
 * process restarts, which is the only financially safe behaviour (a second checkout could create a second charge).
 */
export function isNativeCheckoutOpen(): boolean {
  return inFlight;
}

/** Read-only: notified whenever the lock is taken or released (so a screen can show the pending state). It can never change the lock. */
export function onNativeCheckoutStateChange(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

/** Notified (once per checkout) when the native promise settles and the lock is released. Returns an unsubscribe function. */
export function onNativeCheckoutSettled(listener: () => void): () => void {
  settledListeners.add(listener);
  return () => settledListeners.delete(listener);
}

/**
 * Opens the native checkout. At most ONE checkout exists at a time: a second caller gets IN_PROGRESS and never reaches the module. This is
 * UX protection only; the backend stays the financial authority. Never throws.
 */
export async function openNativeCheckout(options: NativeOpenOptions): Promise<NativeSettled> {
  const mod = loadModule();
  if (!mod) return { kind: 'UNAVAILABLE' };
  if (inFlight) return { kind: 'IN_PROGRESS' };
  inFlight = true;
  notifyState();
  try {
    return { kind: 'RESOLVED', payload: await mod.open(options) };
  } catch (e) {
    return { kind: 'REJECTED', payload: e };
  } finally {
    inFlight = false;
    notifyState();
    settledListeners.forEach((l) => {
      try {
        l();
      } catch {
        /* a listener must never break the checkout path */
      }
    });
  }
}
