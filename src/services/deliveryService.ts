import { ApiClient } from './apiClient';
import type { DeliveryMonitor, OverrideInput, OverrideResult } from './deliveryTypes';

/** Header carrying the password step-up proof (only the override mutation sends it). */
const STEP_UP_HEADER = 'X-Step-Up-Token';

/**
 * Delivery API client for the SUPER_ADMIN workspace. B2a: the driver calls (queue, claim, dispatch, resume, report-failure, verify) and the
 * driver assignment calls were removed with the DELIVERY role; delivery is operated through `deliveryOperateService`. The monitor read is a
 * plain GET (the only call polling ever makes). There is NO "mark delivered" call.
 */
export class DeliveryService {
  public static async getMonitor(branchId: string): Promise<DeliveryMonitor> {
    return await ApiClient.requestData<DeliveryMonitor>(`/delivery/monitor?branchId=${encodeURIComponent(branchId)}`);
  }

  /** EXCEPTIONAL handover confirmation (step-up + structured reason + note + explicit confirmation). Not a routine completion path. */
  public static async overrideDelivery(orderId: string, input: OverrideInput, proof: string): Promise<OverrideResult> {
    return await ApiClient.requestData<OverrideResult>(`/admin/orders/${encodeURIComponent(orderId)}/delivery-override`, {
      method: 'POST',
      headers: { [STEP_UP_HEADER]: proof },
      body: JSON.stringify({ reasonCode: input.reasonCode, note: input.note.trim(), confirm: true })
    });
  }
}
