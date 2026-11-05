import type { ApiClient } from '../../api/apiClient';
import type { HealthProfile, HealthProfileInput } from './types';

/** The customer health-profile endpoints (owner-scoped on the server; the customer role is required). */
export class HealthApi {
  constructor(private readonly client: ApiClient) {}

  profile = (): Promise<HealthProfile> => this.client.request('/customers/me/profile');

  saveProfile = (input: HealthProfileInput): Promise<HealthProfile> => this.client.request('/customers/me/profile', { method: 'PUT', body: input });
}
