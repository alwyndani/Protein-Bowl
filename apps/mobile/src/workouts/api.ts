import type { ApiClient } from '../api/apiClient';
import type { LogInput, WorkoutLog, WorkoutPlan } from './types';

/**
 * The customer workout API surface: EXACTLY the three customer endpoints under /trainer/my. No trainer, admin or assignment
 * endpoint exists in this module. The server scopes every call to the signed-in customer's own plans.
 */
export class WorkoutsApi {
  constructor(private readonly client: ApiClient) {}

  plans = (): Promise<WorkoutPlan[]> => this.client.request('/trainer/my/plans');

  logs = (planId: string): Promise<WorkoutLog[]> => this.client.request(`/trainer/my/plans/${encodeURIComponent(planId)}/logs`);

  /** Not idempotent: a failed or ambiguous call is never retried automatically. */
  logProgress = (planId: string, input: LogInput): Promise<WorkoutLog> =>
    this.client.request(`/trainer/my/plans/${encodeURIComponent(planId)}/logs`, { method: 'POST', body: input });
}
