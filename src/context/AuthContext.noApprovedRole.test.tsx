import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('../services/authService', () => ({
  AuthService: { refresh: vi.fn(), getMe: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }
}));

import { AuthService } from '../services/authService';
import { AuthProvider, mapBackendRoleToUserRole, useAuth } from './AuthContext';
import { NO_APPROVED_ROLE_COPY, fixedAuthErrorMessage } from '../utils/authErrors';
import { describeMessError } from '../utils/messErrors';
import { ApiRequestError } from '../services/apiClient';

/**
 * Role simplification: the backend refuses an account that holds no approved role with 403 NO_APPROVED_ROLE. The web shows FIXED copy for it
 * (never depends on the server's message text), and only the six approved roles map to a workspace.
 * Source-only: jsdom with a mocked AuthService; no network, no backend, no database.
 */
const svc = vi.mocked(AuthService);
const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;

beforeEach(() => {
  vi.clearAllMocks();
  svc.refresh.mockResolvedValue({ success: false } as never);
});

describe('fixed copy for NO_APPROVED_ROLE', () => {
  it('maps only that code, and the copy carries no code or server text', () => {
    expect(fixedAuthErrorMessage('NO_APPROVED_ROLE')).toBe(NO_APPROVED_ROLE_COPY);
    for (const other of ['INVALID_CREDENTIALS', 'ACCOUNT_INACTIVE', 'CUSTOMER_APP_ONLY', '', undefined, null]) expect(fixedAuthErrorMessage(other)).toBeNull();
    expect(NO_APPROVED_ROLE_COPY).toMatch(/contact Protein Bowl support/);
    expect(NO_APPROVED_ROLE_COPY).not.toMatch(/NO_APPROVED_ROLE|administrator|undefined|\[object/);
  });

  it('the Kerala Mess screen shows the same fixed copy and no forms (the old legacy-role treatment)', () => {
    expect(describeMessError(new ApiRequestError('server text that must not be shown', 'NO_APPROVED_ROLE', 403))).toEqual({
      code: 'NO_APPROVED_ROLE',
      action: 'LEGACY_ROLE',
      message: NO_APPROVED_ROLE_COPY
    });
  });
});

describe('sign-in with a refused account', () => {
  it('login() reports the fixed copy, sets the error and does not authenticate', async () => {
    svc.login.mockResolvedValue({ success: false, message: 'Your account has no approved role. Please contact an administrator.', error: 'NO_APPROVED_ROLE', httpStatus: 403 } as never);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.login({ email: 'a@b.test', password: 'a-password' });
    });
    expect(outcome).toEqual({ success: false, message: NO_APPROVED_ROLE_COPY });
    expect(result.current.error).toBe(NO_APPROVED_ROLE_COPY);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('any other failure keeps the existing behaviour (the server message, or the default text)', async () => {
    svc.login.mockResolvedValueOnce({ success: false, message: 'Invalid email or password', error: 'INVALID_CREDENTIALS' } as never);
    svc.login.mockResolvedValueOnce({ success: false } as never);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let first: unknown;
    let second: unknown;
    await act(async () => {
      first = await result.current.login({ email: 'a@b.test', password: 'a-password' });
    });
    await act(async () => {
      second = await result.current.login({ email: 'a@b.test', password: 'a-password' });
    });
    expect(first).toEqual({ success: false, message: 'Invalid email or password' });
    expect(second).toEqual({ success: false, message: 'Login failed. Please check your credentials.' });
  });
});

describe('only approved roles map to a workspace', () => {
  it('the six approved roles map to their own workspace', () => {
    expect(mapBackendRoleToUserRole(['CUSTOMER'])).toBe('customer');
    expect(mapBackendRoleToUserRole(['CHEF'])).toBe('chef');
    expect(mapBackendRoleToUserRole(['NUTRITIONIST'])).toBe('nutritionist');
    expect(mapBackendRoleToUserRole(['TRAINER'])).toBe('trainer');
    expect(mapBackendRoleToUserRole(['PROCUREMENT'])).toBe('procurement');
    expect(mapBackendRoleToUserRole(['SUPER_ADMIN'])).toBe('super_admin');
    expect(mapBackendRoleToUserRole(['CHEF', 'SUPER_ADMIN'])).toBe('super_admin');
  });

  it('a retired role has no workspace: it falls back to the customer default, which the backend then refuses', () => {
    for (const retired of ['MD', 'DELIVERY', 'POS', 'BAKERY_FMCG', 'TEPACHE_ERP', 'SWIGGY_ZOMATO']) {
      expect(mapBackendRoleToUserRole([retired]), retired).toBe('customer');
    }
    // a retired role next to an approved one never changes the approved result
    expect(mapBackendRoleToUserRole(['POS', 'CHEF'])).toBe('chef');
    expect(mapBackendRoleToUserRole(['MD', 'SUPER_ADMIN'])).toBe('super_admin');
  });
});
