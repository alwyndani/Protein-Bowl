import { ApiClient } from './apiClient';
import type {
  MessAccount,
  MessAccountInput,
  MessAdminAccount,
  MessAdminPlan,
  MessAdminServicePoint,
  MessAdminSubscription,
  MessCancelResult,
  MessPlanInput,
  MessPublicPlan,
  MessServicePointInput,
  MessServicePointOption,
  MessSubscription
} from './messTypes';

const STEP_UP_HEADER = 'X-Step-Up-Token';
const stepUp = (proof: string) => ({ headers: { [STEP_UP_HEADER]: proof } });

/**
 * Kerala Mess API client (P10A). Every method throws ApiRequestError on failure. Request bodies carry ONLY the fields the server accepts:
 * never a price, tax rate, status, branch or customer id on the customer side (the server derives them), and money is never computed here.
 * The legacy mock endpoints (pause-meal, verify-gatepass, register) are retired on the server and have no client method.
 */
export class MessService {
  // ------------------------------------------------------------------ customer
  public static async getPlans(servicePointId?: string): Promise<MessPublicPlan[]> {
    const qs = servicePointId ? `?servicePointId=${encodeURIComponent(servicePointId)}` : '';
    return (await ApiClient.requestData<MessPublicPlan[]>(`/mess/plans${qs}`)) ?? [];
  }

  public static async getServicePoints(): Promise<MessServicePointOption[]> {
    return (await ApiClient.requestData<{ servicePoints: MessServicePointOption[] }>('/mess/service-points')).servicePoints;
  }

  public static async getAccount(): Promise<MessAccount | null> {
    return (await ApiClient.requestData<{ account: MessAccount | null }>('/mess/account')).account;
  }

  public static async saveAccount(input: MessAccountInput): Promise<MessAccount> {
    const body = { servicePointId: input.servicePointId, roomNumber: input.roomNumber.trim(), ...(input.studentIdCard?.trim() ? { studentIdCard: input.studentIdCard.trim() } : {}) };
    return (await ApiClient.requestData<{ account: MessAccount }>('/mess/account', { method: 'PUT', body: JSON.stringify(body) })).account;
  }

  public static async getSubscriptions(): Promise<MessSubscription[]> {
    return (await ApiClient.requestData<{ subscriptions: MessSubscription[] }>('/mess/subscriptions')).subscriptions;
  }

  public static async getSubscription(id: string): Promise<MessSubscription> {
    return (await ApiClient.requestData<{ subscription: MessSubscription }>(`/mess/subscriptions/${encodeURIComponent(id)}`)).subscription;
  }

  /** The idempotency key MUST be reused when the same purchase is retried; a new key is a new purchase. Never auto-retried. */
  public static async purchase(input: { planId: string; startDate: string }, idempotencyKey: string): Promise<{ subscription: MessSubscription; replay: boolean }> {
    return await ApiClient.requestData<{ subscription: MessSubscription; replay: boolean }>('/mess/subscriptions', {
      method: 'POST',
      headers: { 'x-idempotency-key': idempotencyKey },
      body: JSON.stringify({ planId: input.planId, startDate: input.startDate })
    });
  }

  public static async cancel(id: string, reasonCode: string, note?: string): Promise<MessCancelResult> {
    const trimmed = note?.trim();
    return await ApiClient.requestData<MessCancelResult>(`/mess/subscriptions/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      body: JSON.stringify(trimmed ? { reasonCode, note: trimmed } : { reasonCode })
    });
  }

  // ------------------------------------------------------------------ staff reads (SUPER_ADMIN + MD)
  public static async adminServicePoints(): Promise<MessAdminServicePoint[]> {
    return (await ApiClient.requestData<{ servicePoints: MessAdminServicePoint[] }>('/admin/mess/service-points')).servicePoints;
  }
  public static async adminPlans(): Promise<MessAdminPlan[]> {
    return (await ApiClient.requestData<{ plans: MessAdminPlan[] }>('/admin/mess/plans')).plans;
  }
  public static async adminAccounts(status?: string): Promise<{ accounts: MessAdminAccount[]; total: number }> {
    return await ApiClient.requestData(`/admin/mess/accounts${status ? `?status=${encodeURIComponent(status)}` : ''}`);
  }
  public static async adminSubscriptions(status?: string): Promise<{ subscriptions: MessAdminSubscription[]; total: number }> {
    return await ApiClient.requestData(`/admin/mess/subscriptions${status ? `?status=${encodeURIComponent(status)}` : ''}`);
  }

  // ------------------------------------------------------------------ SUPER_ADMIN writes (each needs a step-up proof)
  public static async createServicePoint(input: MessServicePointInput, proof: string): Promise<MessAdminServicePoint> {
    return (await ApiClient.requestData<{ servicePoint: MessAdminServicePoint }>('/admin/mess/service-points', { method: 'POST', body: JSON.stringify(input), ...stepUp(proof) })).servicePoint;
  }
  public static async updateServicePoint(id: string, input: Record<string, unknown> & { expectedVersion: number }, proof: string): Promise<MessAdminServicePoint> {
    return (await ApiClient.requestData<{ servicePoint: MessAdminServicePoint }>(`/admin/mess/service-points/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input), ...stepUp(proof) })).servicePoint;
  }
  public static async createPlan(input: MessPlanInput, proof: string): Promise<MessAdminPlan> {
    return (await ApiClient.requestData<{ plan: MessAdminPlan }>('/admin/mess/plans', { method: 'POST', body: JSON.stringify(input), ...stepUp(proof) })).plan;
  }
  public static async updatePlan(id: string, input: MessPlanInput & { expectedVersion: number }, proof: string): Promise<MessAdminPlan> {
    return (await ApiClient.requestData<{ plan: MessAdminPlan }>(`/admin/mess/plans/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input), ...stepUp(proof) })).plan;
  }
  public static async planAction(id: string, action: 'activate' | 'archive', expectedVersion: number, proof: string): Promise<MessAdminPlan> {
    return (await ApiClient.requestData<{ plan: MessAdminPlan }>(`/admin/mess/plans/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: JSON.stringify({ expectedVersion }), ...stepUp(proof) })).plan;
  }
  public static async approveAccount(id: string, expectedServicePointId: string, proof: string): Promise<MessAdminAccount> {
    return (await ApiClient.requestData<{ account: MessAdminAccount }>(`/admin/mess/accounts/${encodeURIComponent(id)}/approve`, { method: 'POST', body: JSON.stringify({ expectedServicePointId }), ...stepUp(proof) })).account;
  }
  public static async rejectAccount(id: string, reasonCode: string, note: string | undefined, proof: string): Promise<MessAdminAccount> {
    const n = note?.trim();
    return (await ApiClient.requestData<{ account: MessAdminAccount }>(`/admin/mess/accounts/${encodeURIComponent(id)}/reject`, { method: 'POST', body: JSON.stringify(n ? { reasonCode, note: n } : { reasonCode }), ...stepUp(proof) })).account;
  }
  public static async adminCancel(id: string, reasonCode: string, note: string | undefined, proof: string): Promise<MessCancelResult> {
    const n = note?.trim();
    return await ApiClient.requestData<MessCancelResult>(`/admin/mess/subscriptions/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: JSON.stringify(n ? { reasonCode, note: n } : { reasonCode }), ...stepUp(proof) });
  }
}
