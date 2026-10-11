import { ApiClient } from './apiClient';
import type { KitchenAction, KitchenActionResult, KitchenQueue, RoutingAssignInput, RoutingAssignResult, RoutingFilter, RoutingList } from './kitchenTypes';

/** Header carrying the password step-up proof (only the routing mutation sends it). */
const STEP_UP_HEADER = 'X-Step-Up-Token';

/**
 * Kitchen API client. Chef actions send an EMPTY body: the status, branch and payment are decided by the server; nothing here can carry
 * a status, payment, amount, customer or branch override. The queue read is a plain GET (the only call polling ever makes).
 */
export class KitchenService {
  public static async getQueue(branchId?: string): Promise<KitchenQueue> {
    const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
    return await ApiClient.requestData<KitchenQueue>(`/kds/orders${qs}`);
  }

  public static async act(orderId: string, action: KitchenAction): Promise<KitchenActionResult> {
    return await ApiClient.requestData<KitchenActionResult>(`/kds/orders/${encodeURIComponent(orderId)}/${action}`, { method: 'POST', body: JSON.stringify({}) });
  }

  // ------------------------------------------------------------ SUPER_ADMIN routing
  public static async listRouting(routing: RoutingFilter = 'unrouted', limit = 50): Promise<RoutingList> {
    return await ApiClient.requestData<RoutingList>(`/admin/kitchen/orders?routing=${routing}&limit=${limit}`);
  }

  public static async assignBranch(orderId: string, input: RoutingAssignInput, proof: string): Promise<RoutingAssignResult> {
    return await ApiClient.requestData<RoutingAssignResult>(`/admin/orders/${encodeURIComponent(orderId)}/kitchen-branch`, {
      method: 'PUT',
      headers: { [STEP_UP_HEADER]: proof },
      body: JSON.stringify({ branchId: input.branchId, expectedBranchId: input.expectedBranchId, reason: input.reason })
    });
  }
}
