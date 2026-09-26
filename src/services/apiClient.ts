const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

export interface ApiResponseEnvelope<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

export class ApiClient {
  // In-memory access token storage (Security: Never persisted in localStorage/sessionStorage)
  private static accessTokenInMemory: string | null = null;
  private static isRefreshing = false;

  public static getAccessToken(): string | null {
    return this.accessTokenInMemory;
  }

  public static setAccessToken(token: string | null): void {
    this.accessTokenInMemory = token;
  }

  public static async request<T = any>(
    endpoint: string,
    options: RequestInit = {},
    isRetry = false
  ): Promise<ApiResponseEnvelope<T>> {
    const token = this.getAccessToken();

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
        headers,
        credentials: 'include' // Sends HTTP-only refresh cookies
      });

      const data: ApiResponseEnvelope<T> = await response.json();

      // Handle 401 Unauthorized safely (Attempt refresh token rotation ONCE)
      if (!response.ok && response.status === 401 && !isRetry && endpoint !== '/auth/refresh' && endpoint !== '/auth/login') {
        if (!this.isRefreshing) {
          this.isRefreshing = true;
          try {
            const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include'
            });
            const refreshData = await refreshRes.json();
            this.isRefreshing = false;

            if (refreshRes.ok && refreshData.success && refreshData.data?.accessToken) {
              this.setAccessToken(refreshData.data.accessToken);
              // Retry original request once with new token
              return this.request<T>(endpoint, options, true);
            } else {
              this.setAccessToken(null);
            }
          } catch (_err) {
            this.isRefreshing = false;
            this.setAccessToken(null);
          }
        }
      }

      return data;
    } catch (error) {
      return {
        success: false,
        error: 'NETWORK_ERROR',
        message: (error as Error).message || 'Failed to communicate with server'
      };
    }
  }
}
