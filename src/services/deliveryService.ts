import { ApiClient } from './apiClient';
import type {
  AssignableDriver,
  AssignmentInput,
  AssignmentResult,
  DeliveryMonitor,
  DriverAction,
  DriverActionResult,
  DriverQueue,
  FailureReportInput,
  OverrideInput,
  OverrideResult,
  VerifyDeliveryResult
} from './deliveryTypes';

/** Header carrying the password step-up proof (only the assignment mutation sends it). */
const STEP_UP_HEADER = 'X-Step-Up-Token';

/**
 * Delivery API client. Driver actions send an EMPTY body (claim, dispatch) or a structured reason (report-failure): the status, driver,
 * branch and payment are decided by the server and nothing here can carry them. There is NO "mark delivered" call (proof of delivery is a later phase).
 * The queue and monitor reads are plain GETs (the only calls polling ever makes).
 */
export class DeliveryService {
  public static async getQueue(branchId?: string): Promise<DriverQueue> {
    const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
    return await ApiClient.requestData<DriverQueue>(`/delivery/orders${qs}`);
  }

  public static async act(orderId: string, action: DriverAction): Promise<DriverActionResult> {
    return await ApiClient.requestData<DriverActionResult>(`/delivery/orders/${encodeURIComponent(orderId)}/${action}`, { method: 'POST', body: JSON.stringify({}) });
  }

  public static async reportFailure(orderId: string, input: FailureReportInput): Promise<DriverActionResult> {
    const note = input.note?.trim();
    return await ApiClient.requestData<DriverActionResult>(`/delivery/orders/${encodeURIComponent(orderId)}/report-failure`, {
      method: 'POST',
      body: JSON.stringify(note ? { reasonCode: input.reasonCode, note } : { reasonCode: input.reasonCode })
    });
  }

  /**
   * Completes a delivery with the customer's Delivery Code. The body is ONLY the code (never a status, payment or driver field). It is
   * never retried automatically and never logged or stored here.
   */
  public static async verifyDelivery(orderId: string, code: string): Promise<VerifyDeliveryResult> {
    return await ApiClient.requestData<VerifyDeliveryResult>(`/delivery/orders/${encodeURIComponent(orderId)}/verify-delivery`, { method: 'POST', body: JSON.stringify({ code }) });
  }

  // ------------------------------------------------------------ SUPER_ADMIN / MD
  public static async getMonitor(branchId: string): Promise<DeliveryMonitor> {
    return await ApiClient.requestData<DeliveryMonitor>(`/delivery/monitor?branchId=${encodeURIComponent(branchId)}`);
  }

  public static async listDrivers(branchId: string): Promise<AssignableDriver[]> {
    const data = await ApiClient.requestData<{ drivers: AssignableDriver[] }>(`/admin/delivery/drivers?branchId=${encodeURIComponent(branchId)}`);
    return data.drivers;
  }

  /** EXCEPTIONAL handover confirmation (step-up + structured reason + note + explicit confirmation). Not a routine completion path. */
  public static async overrideDelivery(orderId: string, input: OverrideInput, proof: string): Promise<OverrideResult> {
    return await ApiClient.requestData<OverrideResult>(`/admin/orders/${encodeURIComponent(orderId)}/delivery-override`, {
      method: 'POST',
      headers: { [STEP_UP_HEADER]: proof },
      body: JSON.stringify({ reasonCode: input.reasonCode, note: input.note.trim(), confirm: true })
    });
  }

  public static async assign(orderId: string, input: AssignmentInput, proof: string): Promise<AssignmentResult> {
    return await ApiClient.requestData<AssignmentResult>(`/admin/orders/${encodeURIComponent(orderId)}/delivery-assignment`, {
      method: 'PUT',
      headers: { [STEP_UP_HEADER]: proof },
      body: JSON.stringify({ driverEmployeeId: input.driverEmployeeId, expectedDriverId: input.expectedDriverId, reason: input.reason })
    });
  }
}
