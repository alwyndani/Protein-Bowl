import { ApiClient } from './apiClient';

export class MDService {
  public static async getMetrics() {
    const response = await ApiClient.request('/md/metrics');
    return response.data;
  }
}
