import React, { createContext, useContext, useSyncExternalStore } from 'react';
import { newIdempotencyKey } from './idempotencyKey';

/**
 * ONE checkout attempt = one idempotency key + the address and delivery instructions it was created for. Held in MEMORY only (never
 * persisted), at provider level - NOT in a screen - so it survives screen recreation / navigation while the app process lives.
 *
 * Rules (from the audited backend contract):
 *  - the key is reused for every retry of the SAME request (same address + same instructions);
 *  - after an AMBIGUOUS order-create result (timeout / lost connection / unreadable answer / 5xx) the attempt is frozen: the very same key,
 *    address and instructions are kept and the UI offers "Retry the same order" - a new key is never generated automatically;
 *  - the attempt is cleared only on authoritative success, explicit abandonment, or when the session ends.
 * If the app process dies after a lost answer the key is gone, but the server consumed the cart in the same transaction as the order, so a
 * fresh-key retry can only hit EMPTY_CART (and the order is in My orders): it cannot create a duplicate.
 */
export interface CheckoutAttempt {
  key: string;
  addressId: string;
  deliveryInstructions: string;
  /** The outcome of the order request is unknown: the request may have created the order. */
  ambiguous: boolean;
}

export class CheckoutAttemptStore {
  private attempt: CheckoutAttempt | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly newKey: () => string;

  constructor(newKey: () => string = newIdempotencyKey) {
    this.newKey = newKey;
  }

  get = (): CheckoutAttempt | null => this.attempt;

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private set(next: CheckoutAttempt | null) {
    this.attempt = next;
    this.listeners.forEach((l) => l());
  }

  /** The attempt to use for this request. A frozen (ambiguous) attempt is returned as-is, whatever is passed in. */
  prepare(addressId: string, deliveryInstructions: string): CheckoutAttempt {
    const cur = this.attempt;
    if (cur && (cur.ambiguous || (cur.addressId === addressId && cur.deliveryInstructions === deliveryInstructions))) return cur;
    const created: CheckoutAttempt = { key: this.newKey(), addressId, deliveryInstructions, ambiguous: false };
    this.set(created);
    return created;
  }

  markAmbiguous() {
    if (this.attempt && !this.attempt.ambiguous) this.set({ ...this.attempt, ambiguous: true });
  }

  /** Authoritative success, explicit abandonment or the end of the session. */
  clear() {
    if (this.attempt) this.set(null);
  }
}

const Ctx = createContext<CheckoutAttemptStore | null>(null);

export function CheckoutAttemptProvider({ store, children }: { store: CheckoutAttemptStore; children: React.ReactNode }) {
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useCheckoutAttemptStore(): CheckoutAttemptStore {
  const s = useContext(Ctx);
  if (!s) throw new Error('useCheckoutAttemptStore must be used inside CheckoutAttemptProvider');
  return s;
}

export function useCheckoutAttempt(): CheckoutAttempt | null {
  const store = useCheckoutAttemptStore();
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
