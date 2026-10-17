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
  private readonly entries = new Map<string, PaymentEvidence>();

  private static key(orderId: string, attemptId: string): string {
    return JSON.stringify([orderId, attemptId]);
  }

  /** Keeps a private frozen copy, so later mutation of the caller's object cannot change what will be sent. */
  setEvidence(orderId: string, attemptId: string, evidence: PaymentEvidence): void {
    this.entries.set(
      PaymentEvidenceStore.key(orderId, attemptId),
      Object.freeze({ providerOrderId: evidence.providerOrderId, providerPaymentId: evidence.providerPaymentId, signature: evidence.signature })
    );
  }

  getEvidence(orderId: string, attemptId: string): PaymentEvidence | null {
    return this.entries.get(PaymentEvidenceStore.key(orderId, attemptId)) ?? null;
  }

  clearEvidence(orderId: string, attemptId: string): void {
    this.entries.delete(PaymentEvidenceStore.key(orderId, attemptId));
  }

  /** The end of the session. */
  clearAllEvidence(): void {
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
