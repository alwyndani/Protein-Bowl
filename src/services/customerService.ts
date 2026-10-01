import { ApiClient } from './apiClient';
import { CustomerProfile } from '../types';

export class CustomerService {
  /**
   * Get authenticated customer's profile & health biometrics from backend
   */
  public static async getMyProfile() {
    return ApiClient.request<CustomerProfile>('/customers/me/profile', {
      method: 'GET'
    });
  }

  /**
   * Update authenticated customer's profile & health biometrics on backend
   */
  public static async updateMyProfile(profile: Partial<CustomerProfile>) {
    return ApiClient.request<CustomerProfile>('/customers/me/profile', {
      method: 'PUT',
      body: JSON.stringify(profile)
    });
  }
}
