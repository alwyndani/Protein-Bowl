import { ApiClient } from './apiClient';
import type { DeliveryOwnedOrder, FailureReasonCode } from './deliveryTypes';
import type { RetryReasonCode } from './deliveryResolutionTypes';

/** Header carrying the password step-up proof. */
const STEP_UP_HEADER = 'X-Step-Up-Token';

export interface OperateOrderResult {
  changed: boolean;
  order: DeliveryOwnedOrder;
}

export interface OperateVerifyResult {
  changed: boolean;
  order: { id: string; orderNumber: string; status: string; deliveredAt: string };
}

export interface OperateRetryResult {
  changed: boolean;
  orderId: string;
  orderNumber: string;
  attemptNumber: number;
  assignmentState: 'ASSIGNED';
}

export interface TakeoverInput {
  /** The driver THIS screen showed owning the job; a mismatch is a 409 instead of an overwrite. */
  expectedDriverId: string;
  reason: string;
}

export interface OperateFailureInput {
  reasonCode: FailureReasonCode;
  note?: string;
}

export interface OperateRetryInput {
  /** The attempt this screen showed; a mismatch is a 409 instead of an overwrite. */
  expectedAttemptNumber: number;
  reasonCode: RetryReasonCode;
  note?: string;
}

const withProof = (proof: string) => ({ headers: { [STEP_UP_HEADER]: proof } });

/**
 * SUPER_ADMIN operation of direct-order delivery (mounted by the backend at /api/v1/admin/delivery/orders/:orderId/...).
 * EVERY write requires the password step-up proof as an argument (the type system makes it impossible to call one without it) and sends it only as
 * X-Step-Up-Token. Bodies never carry a status, payment, customer, branch or amount; the server decides every outcome. The Delivery Code travels only in
 * the body of verify() and is never stored, logged or returned. Nothing here is retried automatically.
 */
export class DeliveryOperateService {
  private static path(orderId: string, tail = ''): string {
    return `/admin/delivery/orders/${encodeURIComponent(orderId)}${tail}`;
  }

  /** READ (no step-up): the approved delivery data of a job an administrator operates. 404 for everything else. */
  public static async getOrder(orderId: string): Promise<DeliveryOwnedOrder> {
    const data = await ApiClient.requestData<{ order: DeliveryOwnedOrder }>(this.path(orderId));
    return data.order;
  }

  public static async dispatch(orderId: string, proof: string): Promise<OperateOrderResult> {
    return await ApiClient.requestData<OperateOrderResult>(this.path(orderId, '/dispatch'), { method: 'POST', body: JSON.stringify({}), ...withProof(proof) });
  }

  public static async takeover(orderId: string, input: TakeoverInput, proof: string): Promise<OperateOrderResult> {
    return await ApiClient.requestData<OperateOrderResult>(this.path(orderId, '/takeover'), {
      method: 'POST',
      body: JSON.stringify({ expectedDriverId: input.expectedDriverId, reason: input.reason.trim() }),
      ...withProof(proof)
    });
  }

  /** Completes a delivery with the customer's Delivery Code (the body is ONLY the code). */
  public static async verify(orderId: string, code: string, proof: string): Promise<OperateVerifyResult> {
    return await ApiClient.requestData<OperateVerifyResult>(this.path(orderId, '/verify-delivery'), { method: 'POST', body: JSON.stringify({ code }), ...withProof(proof) });
  }

  public static async reportFailure(orderId: string, input: OperateFailureInput, proof: string): Promise<OperateOrderResult> {
    const note = input.note?.trim();
    return await ApiClient.requestData<OperateOrderResult>(this.path(orderId, '/report-failure'), {
      method: 'POST',
      body: JSON.stringify(note ? { reasonCode: input.reasonCode, note } : { reasonCode: input.reasonCode }),
      ...withProof(proof)
    });
  }

  public static async retry(orderId: string, input: OperateRetryInput, proof: string): Promise<OperateRetryResult> {
    const note = input.note?.trim();
    return await ApiClient.requestData<OperateRetryResult>(this.path(orderId, '/retry'), {
      method: 'POST',
      body: JSON.stringify(note ? { expectedAttemptNumber: input.expectedAttemptNumber, reasonCode: input.reasonCode, note } : { expectedAttemptNumber: input.expectedAttemptNumber, reasonCode: input.reasonCode }),
      ...withProof(proof)
    });
  }

  public static async resume(orderId: string, proof: string): Promise<OperateOrderResult> {
    return await ApiClient.requestData<OperateOrderResult>(this.path(orderId, '/resume'), { method: 'POST', body: JSON.stringify({}), ...withProof(proof) });
  }
}
