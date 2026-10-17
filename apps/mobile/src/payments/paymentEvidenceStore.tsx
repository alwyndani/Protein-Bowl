import React, { createContext, useContext } from 'react';
import type { PaymentEvidence } from './paymentTypes';

/**
 * Payment EVIDENCE (what the provider checkout returned) held in PROCESS MEMORY ONLY, so a verify request that failed ambiguously can be
 * retried with the very same evidence while the app lives. It is never persisted (no SecureStore, no storage, no filesystem), never put
 * in the Query cache, navigation params, logs or analytics, and never rendered. It is not reactive on purpose: nothing re-renders from
 * evidence, and no accessor lists it. A process restart clears it naturally; sign-out, a confirmed PAID or a definitive rejection clear it
 * explicitly. Evidence proves nothing by itself: only the backend verify endpoint can.
 */
export class PaymentEvidenceStore {
  private readonly entries = new Map<string, { orderId: string; attemptId: string; evidence: PaymentEvidence }>();
  private generation = 0;

  private static key(orderId: string, attemptId: string): string {
    return JSON.stringify([orderId, attemptId]);
  }

  /** Keeps a private frozen copy, so later mutation of the caller's object cannot change what will be sent. */
  setEvidence(orderId: string, attemptId: string, evidence: PaymentEvidence): void {
    const key = PaymentEvidenceStore.key(orderId, attemptId);
    this.entries.delete(key); // re-insert so the most recent attempt of an order is the last one
    this.entries.set(key, {
      orderId,
      attemptId,
      evidence: Object.freeze({ providerOrderId: evidence.providerOrderId, providerPaymentId: evidence.providerPaymentId, signature: evidence.signature })
    });
  }

  getEvidence(orderId: string, attemptId: string): PaymentEvidence | null {
    return this.entries.get(PaymentEvidenceStore.key(orderId, attemptId))?.evidence ?? null;
  }

  clearEvidence(orderId: string, attemptId: string): void {
    this.entries.delete(PaymentEvidenceStore.key(orderId, attemptId));
  }

  /**
   * Same-process recovery: the most recent evidence held for THIS order together with the attempt it belongs to, so a newly created
   * controller (screen recreated while the JS process lives) can verify it again. Another order's evidence is never returned.
   */
  findForOrder(orderId: string): { attemptId: string; evidence: PaymentEvidence } | null {
    let found: { attemptId: string; evidence: PaymentEvidence } | null = null;
    for (const e of this.entries.values()) if (e.orderId === orderId) found = { attemptId: e.attemptId, evidence: e.evidence };
    return found;
  }

  /** Changes whenever everything is cleared, so a result that was still in flight across a sign-out can tell it must not be stored. */
  epoch(): number {
    return this.generation;
  }

  /** The end of the session. */
  clearAllEvidence(): void {
    this.generation += 1;
    this.entries.clear();
  }
}

const Ctx = createContext<PaymentEvidenceStore | null>(null);

export function PaymentEvidenceProvider({ store, children }: { store: PaymentEvidenceStore; children: React.ReactNode }) {
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function usePaymentEvidenceStore(): PaymentEvidenceStore {
  const s = useContext(Ctx);
  if (!s) throw new Error('usePaymentEvidenceStore must be used inside PaymentEvidenceProvider');
  return s;
}
