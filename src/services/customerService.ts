import { ApiClient } from './apiClient';
import { CustomerProfile } from '../types';
import { pruneUnentered, withBlankDefaults } from '../utils/healthProfile';

const withBlank = <T extends { data?: CustomerProfile }>(res: T): T =>
  res && res.data ? { ...res, data: withBlankDefaults(res.data) } : res;

export class CustomerService {
  /**
   * Get authenticated customer's profile & health biometrics from backend
   */
  public static async getMyProfile() {
    return withBlank(await ApiClient.request<CustomerProfile>('/customers/me/profile', {
      method: 'GET'
    }));
  }

  /**
   * Update authenticated customer's profile & health biometrics on backend.
   * Values the customer left empty are not sent, so the server stores "not provided" rather than a zero.
   */
  public static async updateMyProfile(profile: Partial<CustomerProfile>, options: { phone?: boolean } = {}) {
    const payload = pruneUnentered(profile);
    // The mobile number is sent ONLY when the caller says the customer changed it: health saves never carry it along, so a stored number
    // can neither be rewritten nor make an unrelated save fail validation.
    if (!options.phone) delete payload.phone;
    return withBlank(await ApiClient.request<CustomerProfile>('/customers/me/profile', {
      method: 'PUT',
      body: JSON.stringify(payload)
    }));
  }
}
