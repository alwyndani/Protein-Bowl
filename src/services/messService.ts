import { ApiClient } from './apiClient';

export class MessService {
  public static async getPlans() {
    const response = await ApiClient.request('/mess/plans');
    return response.data || [];
  }

  public static async getAccount() {
    const response = await ApiClient.request('/mess/account');
    return response.data;
  }

  public static async registerAccount(payload: { studentIdCard?: string; collegeHostelName: string; roomNumber: string }) {
    return await ApiClient.request('/mess/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  public static async pauseMeal(payload: { subscriptionId: string; pauseDate: string; slot: string }) {
    return await ApiClient.request('/mess/pause-meal', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  public static async verifyGatePass(code: string) {
    return await ApiClient.request('/mess/verify-gatepass', {
      method: 'POST',
      body: JSON.stringify({ code })
    });
  }
}
