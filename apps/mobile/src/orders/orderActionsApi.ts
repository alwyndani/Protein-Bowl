import type { ApiClient } from '../api/apiClient';

/**
 * The ONLY module with the customer cancellation, refund-status and Delivery Code endpoints (a static guard enforces it).
 * Bodies carry nothing but a typed reason code and an optional short note: never an amount, currency, payment id, status or customer id.
 * Nothing here is retried automatically.
 */
export const CANCEL_REASONS = [
  { code: 'CHANGED_MIND', label: 'I changed my mind' },
  { code: 'ORDERED_BY_MISTAKE', label: 'I ordered by mistake' },
  { code: 'WRONG_ORDER', label: 'Wrong items in my order' },
  { code: 'DELIVERY_TOO_LATE', label: 'Delivery will be too late' },
  { code: 'OTHER', label: 'Another reason' }
] as const;
export type CancelReasonCode = (typeof CANCEL_REASONS)[number]['code'];

export type RefundStateValue = 'NO_REFUND' | 'REFUND_PENDING' | 'REFUND_PROCESSING' | 'REFUNDED' | 'REFUND_REVIEW_REQUIRED';

export interface CancelResult {
  orderId: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  alreadyCancelled: boolean;
  cancellation: { state: string; allowed: boolean };
  refund: { state: RefundStateValue };
}

export type DeliveryCodeState = 'NOT_AVAILABLE' | 'NOT_ISSUED' | 'ISSUED' | 'LOCKED' | 'CODE_BLOCKED' | 'VERIFIED';
export interface DeliveryCodeView {
  state: DeliveryCodeState;
  issuedAt: string | null;
  lockedUntil: string | null;
}
/** Returned ONLY by issue / regenerate. Hold in component memory; never store, log or navigate with it. */
export interface IssuedDeliveryCode extends DeliveryCodeView {
  code: string;
}

export class OrderActionsApi {
  constructor(private readonly client: ApiClient) {}

  cancel = (orderId: string, reasonCode: CancelReasonCode, note?: string): Promise<CancelResult> => {
    const trimmed = note?.trim();
    return this.client.request(`/orders/${encodeURIComponent(orderId)}/cancel`, { method: 'POST', body: trimmed ? { reasonCode, note: trimmed } : { reasonCode } });
  };

  /** Staff-reviewed request for a PAID order the kitchen has started. Promises nothing; the server decides eligibility. */
  requestCancellation = (orderId: string, reasonCode: CancelReasonCode, note?: string): Promise<{ requestId: string; alreadyRequested: boolean }> => {
    const trimmed = note?.trim();
    return this.client.request(`/orders/${encodeURIComponent(orderId)}/cancellation-request`, { method: 'POST', body: trimmed ? { reasonCode, note: trimmed } : { reasonCode } });
  };

  deliveryCode = (orderId: string): Promise<DeliveryCodeView> => this.client.request(`/orders/${encodeURIComponent(orderId)}/delivery-code`);

  issueDeliveryCode = (orderId: string): Promise<IssuedDeliveryCode> =>
    this.client.request(`/orders/${encodeURIComponent(orderId)}/delivery-code`, { method: 'POST', body: {} });

  regenerateDeliveryCode = (orderId: string): Promise<IssuedDeliveryCode> =>
    this.client.request(`/orders/${encodeURIComponent(orderId)}/delivery-code/regenerate`, { method: 'POST', body: {} });
}
