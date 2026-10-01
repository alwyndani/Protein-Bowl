import { MobileStorage } from './storage';

const API_BASE_URL = 'http://localhost:5000/api/v1';

export class MobileApiClient {
  public static async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<{ success: boolean; data?: T; error?: string; message?: string }> {
    const token = await MobileStorage.getItem('access_token');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>)
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers
      });

      const json = await response.json();
      return json;
    } catch (error) {
      return {
        success: false,
        error: 'NETWORK_ERROR',
        message: (error as Error).message || 'Server connection failed'
      };
    }
  }
}
