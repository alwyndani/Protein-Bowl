import { ApiClient } from './apiClient';

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export class PasswordResetService {
  /** Always resolves the same way for known and unknown addresses (the API never reveals whether an account exists). */
  static async requestReset(email: string): Promise<void> {
    await ApiClient.requestData('/auth/forgot-password', post({ email: email.trim() }));
  }

  static async completeReset(token: string, password: string): Promise<void> {
    await ApiClient.requestData('/auth/reset-password', post({ token, password }));
  }
}
