import { ApiClient } from './apiClient';

export interface RegisterParams {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  referredByCode?: string;
  requestedRole?: 'customer';
}

export interface LoginParams {
  email: string;
  password: string;
}

export class AuthService {
  public static async register(params: RegisterParams) {
    const res = await ApiClient.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(params)
    });

    if (res.success && res.data?.accessToken) {
      ApiClient.setAccessToken(res.data.accessToken);
    }
    return res;
  }

  public static async login(params: LoginParams) {
    const res = await ApiClient.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(params)
    });

    if (res.success && res.data?.accessToken) {
      ApiClient.setAccessToken(res.data.accessToken);
    }
    return res;
  }

  /** Session restore. Shares the single in-flight refresh with every other caller (see ApiClient.refreshAccessToken). */
  public static async refresh(): Promise<{ success: boolean; data?: { accessToken: string } }> {
    const ok = await ApiClient.refreshAccessToken();
    const accessToken = ApiClient.getAccessToken();
    return ok && accessToken ? { success: true, data: { accessToken } } : { success: false };
  }

  public static async logout() {
    ApiClient.endSession(); // first: a refresh already in flight must not bring the session back
    try {
      return await ApiClient.request('/auth/logout', {
        method: 'POST'
      });
    } finally {
      ApiClient.endSession();
    }
  }

  public static async getMe() {
    return ApiClient.request('/auth/me', {
      method: 'GET'
    });
  }

  public static async testRbac() {
    return ApiClient.request('/auth/rbac-test', {
      method: 'GET'
    });
  }
}
