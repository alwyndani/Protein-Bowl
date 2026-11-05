import type { ApiClient } from '../../api/apiClient';
import type { DietPlan, DietRequest, DietRequestInput } from './types';

/** The customer diet endpoints. Only the customer routes exist here; clinical routes are not part of the mobile app. */
export class DietApi {
  constructor(private readonly client: ApiClient) {}

  requests = (): Promise<DietRequest[]> => this.client.request('/diets/my-requests');

  plans = (): Promise<DietPlan[]> => this.client.request('/diets/my-plans');

  createRequest = (input: DietRequestInput): Promise<DietRequest> => this.client.request('/diets/requests', { method: 'POST', body: input });

  approvePlan = (planId: string, customerFeedback?: string): Promise<DietPlan> =>
    this.client.request(`/diets/plans/${encodeURIComponent(planId)}/approve`, { method: 'POST', body: customerFeedback ? { customerFeedback } : {} });

  requestRevision = (planId: string, revisionNotes: string): Promise<DietPlan> =>
    this.client.request(`/diets/plans/${encodeURIComponent(planId)}/request-revision`, { method: 'POST', body: { revisionNotes } });
}
