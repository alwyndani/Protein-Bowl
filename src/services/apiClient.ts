// Development defaults to the local API. A production build never points at localhost: without VITE_API_BASE_URL it uses the same origin
// (`/api/v1`, for a reverse proxy that serves the web app and the API together).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? '/api/v1' : 'http://localhost:5000/api/v1');

export interface ApiResponseEnvelope<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  error?: string;
  /** HTTP status of the response (set by ApiClient.request). */
  httpStatus?: number;
}

/** Thrown by ApiClient.requestData when the API reports failure. */
export class ApiRequestError extends Error {
  public readonly code: string;
  public readonly status?: number;

  constructor(message: string, code = 'REQUEST_FAILED', status?: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
  }
}

export class ApiClient {
  // In-memory access token storage (Security: Never persisted in localStorage/sessionStorage)
  private static accessTokenInMemory: string | null = null;
  /** Incremented every time a session ends (logout); a refresh that started before that moment can never install its token afterwards. */
  private static sessionEpoch = 0;

  /** Ends the session on this client: forgets the access token and invalidates any refresh that is still in flight. */
  public static endSession(): void {
    this.sessionEpoch += 1;
    this.accessTokenInMemory = null;
  }

  /** The ONE refresh request in flight (the refresh cookie rotates, so two concurrent refreshes must never both be sent). */
  private static refreshInFlight: Promise<boolean> | null = null;

  /**
   * Exchanges the HttpOnly refresh cookie for a new access token. Every caller that needs a refresh while one is already running (the session
   * restore at start-up, several requests that hit an expired token at the same moment, React StrictMode's double effect in development)
   * shares that single request and its result. Resolves false when there is no valid session (the server answers 401: expected for a visitor
   * who is not signed in; the browser cannot inspect an HttpOnly cookie to know beforehand).
   */
  public static refreshAccessToken(): Promise<boolean> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = (async () => {
        const epoch = this.sessionEpoch;
        try {
          const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
          });
          const body = await res.json();
          if (res.ok && body.success && body.data?.accessToken) {
            // The customer signed out while this refresh was on its way: its result belongs to the ended session and must not revive it.
            if (epoch !== this.sessionEpoch) return false;
            this.setAccessToken(body.data.accessToken);
            return true;
          }
        } catch {
          // network failure: no session could be established
        }
        this.setAccessToken(null);
        return false;
      })().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  public static getAccessToken(): string | null {
    return this.accessTokenInMemory;
  }

  public static setAccessToken(token: string | null): void {
    this.accessTokenInMemory = token;
  }

  /**
   * Like request(), but resolves with the typed data payload and THROWS ApiRequestError on any failure
   * (HTTP error, network error, success:false). Use for flows that must never treat a failure as success.
   */
  public static async requestData<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const res = await this.request<T>(endpoint, options);
    if (!res.success) {
      throw new ApiRequestError(res.message || 'Request failed', res.error || 'REQUEST_FAILED', res.httpStatus);
    }
    return res.data as T;
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
      if (!response.ok && response.status === 401 && !isRetry && endpoint !== '/auth/refresh' && endpoint !== '/auth/login' && data.error !== 'STEP_UP_FAILED') {
        // Every concurrent request that met an expired token waits for the SAME refresh, then retries once (before this, a second
        // concurrent request skipped the refresh and was handed the 401 although the session was fine).
        if (await this.refreshAccessToken()) {
          return this.request<T>(endpoint, options, true);
        }
      }

      return { ...data, httpStatus: response.status };
    } catch (error) {
      return {
        success: false,
        error: 'NETWORK_ERROR',
        message: (error as Error).message || 'Failed to communicate with server'
      };
    }
  }
}
