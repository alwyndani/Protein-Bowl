import { ApiClient } from './apiClient';

export interface RegisterParams {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  referredByCode?: string;
  requestedRole?: 'customer' | 'mess_customer';
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

  public static async refresh() {
    const res = await ApiClient.request('/auth/refresh', {
      method: 'POST'
    });

    if (res.success && res.data?.accessToken) {
      ApiClient.setAccessToken(res.data.accessToken);
    }
    return res;
  }

  public static async logout() {
    const res = await ApiClient.request('/auth/logout', {
      method: 'POST'
    });
    ApiClient.setAccessToken(null);
    return res;
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
