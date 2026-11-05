import type { ApiClient } from '../api/apiClient';
import type {
  AccountInput,
  CancelReasonCode,
  CancelResult,
  HandoverIssued,
  HandoverStatus,
  MealActionResult,
  MealCalendar,
  MessAccount,
  MessPlan,
  MessServicePoint,
  MessSubscription,
  PurchaseResult
} from './types';

const enc = encodeURIComponent;

/**
 * The Kerala Mess customer API over the typed ApiClient. EVERY Mess endpoint string in the app lives in this module and nowhere else.
 * Exactly the backend's customer routes; nothing is invented. Prices, dates and statuses are never sent except the two purchase inputs
 * the backend accepts (planId, startDate). Financial / state-changing POSTs are never retried here.
 */
export class MessApi {
  constructor(private readonly client: ApiClient) {}

  /** Public plan list; with a service point id the server filters to plans sold there. */
  plans = (servicePointId?: string): Promise<MessPlan[]> => this.client.request(`/mess/plans${servicePointId ? `?servicePointId=${enc(servicePointId)}` : ''}`);

  servicePoints = async (): Promise<MessServicePoint[]> => (await this.client.request<{ servicePoints: MessServicePoint[] }>('/mess/service-points')).servicePoints;

  /** null = the customer has not submitted hostel details yet. */
  account = async (): Promise<MessAccount | null> => (await this.client.request<{ account: MessAccount | null }>('/mess/account')).account;

  saveAccount = (input: AccountInput): Promise<{ changed: boolean; account: MessAccount }> => this.client.request('/mess/account', { method: 'PUT', body: input });

  subscriptions = async (): Promise<MessSubscription[]> => (await this.client.request<{ subscriptions: MessSubscription[] }>('/mess/subscriptions')).subscriptions;

  subscription = async (id: string): Promise<MessSubscription> => (await this.client.request<{ subscription: MessSubscription }>(`/mess/subscriptions/${enc(id)}`)).subscription;

  /** ONLINE only: the body has no payment method. The idempotency key is required and comes from the screen's purchase attempt. */
  purchase = (input: { planId: string; startDate: string; idempotencyKey: string }): Promise<PurchaseResult> =>
    this.client.request('/mess/subscriptions', {
      method: 'POST',
      headers: { 'x-idempotency-key': input.idempotencyKey },
      body: { planId: input.planId, startDate: input.startDate }
    });

  calendar = (id: string, range?: { from?: string; to?: string }): Promise<MealCalendar> => {
    const q = new URLSearchParams();
    if (range?.from) q.set('from', range.from);
    if (range?.to) q.set('to', range.to);
    const qs = q.toString();
    return this.client.request(`/mess/subscriptions/${enc(id)}/meals${qs ? `?${qs}` : ''}`);
  };

  pauseMeal = (id: string, mealId: string): Promise<MealActionResult> => this.client.request(`/mess/subscriptions/${enc(id)}/meals/${enc(mealId)}/pause`, { method: 'POST', body: {} });

  resumeMeal = (id: string, mealId: string): Promise<MealActionResult> => this.client.request(`/mess/subscriptions/${enc(id)}/meals/${enc(mealId)}/resume`, { method: 'POST', body: {} });

  handoverState = (id: string, mealId: string): Promise<HandoverStatus> => this.client.request(`/mess/subscriptions/${enc(id)}/meals/${enc(mealId)}/handover-code`);

  issueHandoverCode = (id: string, mealId: string): Promise<HandoverIssued> => this.client.request(`/mess/subscriptions/${enc(id)}/meals/${enc(mealId)}/handover-code`, { method: 'POST', body: {} });

  regenerateHandoverCode = (id: string, mealId: string): Promise<HandoverIssued> =>
    this.client.request(`/mess/subscriptions/${enc(id)}/meals/${enc(mealId)}/handover-code/regenerate`, { method: 'POST', body: {} });

  cancelSubscription = (id: string, input: { reasonCode: CancelReasonCode; note?: string }): Promise<CancelResult> =>
    this.client.request(`/mess/subscriptions/${enc(id)}/cancel`, { method: 'POST', body: { reasonCode: input.reasonCode, ...(input.note ? { note: input.note } : {}) } });
}
