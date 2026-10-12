import { ApiClient } from './apiClient';
import type { DeliveryAttempts, RetryInput, RetryResult, UndeliverableInput, UndeliverableResult } from './deliveryResolutionTypes';

/** Header carrying the password step-up proof. */
const STEP_UP_HEADER = 'X-Step-Up-Token';

/**
 * Failed-delivery resolution client (P9C), used ONLY by the SUPER_ADMIN / MD delivery monitor. The resolution calls never carry a status,
 * payment, branch or amount: the server derives everything. They are never retried automatically.
 */
export class DeliveryResolutionService {
  /** Attempt history of one order (SUPER_ADMIN and MD; the server never sends free-text notes to MD). A plain GET. */
  public static async getAttempts(orderId: string): Promise<DeliveryAttempts> {
    return await ApiClient.requestData<DeliveryAttempts>(`/admin/orders/${encodeURIComponent(orderId)}/delivery-attempts`);
  }

  /** Retry with the same driver / reassign (also hands a pending retry to another driver). Step-up + structured reason + expected attempt and driver. */
  public static async retryDelivery(orderId: string, input: RetryInput, proof: string): Promise<RetryResult> {
    const note = input.note?.trim();
    return await ApiClient.requestData<RetryResult>(`/admin/orders/${encodeURIComponent(orderId)}/delivery-retry`, {
      method: 'POST',
      headers: { [STEP_UP_HEADER]: proof },
      body: JSON.stringify({
        mode: input.mode,
        ...(input.mode === 'REASSIGN' ? { driverEmployeeId: input.driverEmployeeId } : {}),
        expectedAttemptNumber: input.expectedAttemptNumber,
        expectedDriverId: input.expectedDriverId,
        reasonCode: input.reasonCode,
        ...(note ? { note } : {})
      })
    });
  }

  /** Cancel & Full Refund for an undeliverable delivery. The server derives the refund (always the full captured amount); no amount is ever sent. */
  public static async markUndeliverable(orderId: string, input: UndeliverableInput, proof: string): Promise<UndeliverableResult> {
    return await ApiClient.requestData<UndeliverableResult>(`/admin/orders/${encodeURIComponent(orderId)}/delivery-undeliverable`, {
      method: 'POST',
      headers: { [STEP_UP_HEADER]: proof },
      body: JSON.stringify({ reasonCode: input.reasonCode, note: input.note.trim(), expectedAttemptNumber: input.expectedAttemptNumber, confirm: true })
    });
  }
}
