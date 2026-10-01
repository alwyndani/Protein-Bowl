import { ApiClient } from './apiClient';

export class KDSService {
  public static async getTickets(branchId?: string) {
    const response = await ApiClient.request(`/kds/tickets${branchId ? `?branchId=${branchId}` : ''}`);
    return response.data || [];
  }

  public static async updateStatus(kotId: string, status: string) {
    return await ApiClient.request(`/kds/tickets/${kotId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  }
}
