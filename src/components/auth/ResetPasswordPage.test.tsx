import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../services/passwordResetService', () => ({ PasswordResetService: { requestReset: vi.fn(), completeReset: vi.fn() } }));

import { PasswordResetService } from '../../services/passwordResetService';
import { ApiRequestError } from '../../services/apiClient';
import { ResetPasswordPage, clearCapturedResetToken, isResetPasswordRoute } from './ResetPasswordPage';

const svc = PasswordResetService as unknown as { completeReset: ReturnType<typeof vi.fn> };

beforeEach(() => {
  clearCapturedResetToken();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/reset-password#token=' + 'a'.repeat(64));
});
afterEach(() => window.history.replaceState(null, '', '/'));

describe('ResetPasswordPage', () => {
  it('recognises its route', () => {
    expect(isResetPasswordRoute('/reset-password')).toBe(true);
    expect(isResetPasswordRoute('/reset-password/')).toBe(true);
    expect(isResetPasswordRoute('/staff/accept-invite')).toBe(false);
  });

  it('captures the token from the fragment and scrubs it from the address bar', () => {
    render(<ResetPasswordPage />);
    expect(window.location.hash).toBe('');
    expect(screen.getByRole('form', { name: /choose a new password/i })).toBeInTheDocument();
  });

  it('shows a clear message when no token is present', () => {
    window.history.replaceState(null, '', '/reset-password');
    render(<ResetPasswordPage />);
    expect(screen.getByRole('alert')).toHaveTextContent(/missing or no longer available/i);
  });

  it('validates locally and sends the token and password once on submit', async () => {
    svc.completeReset.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ResetPasswordPage />);
    await user.type(screen.getByLabelText(/^new password/i), 'short');
    await user.type(screen.getByLabelText(/confirm password/i), 'short');
    await user.click(screen.getByRole('button', { name: /change password/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8/i);
    expect(svc.completeReset).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(/^new password/i));
    await user.clear(screen.getByLabelText(/confirm password/i));
    await user.type(screen.getByLabelText(/^new password/i), 'long-enough-1');
    await user.type(screen.getByLabelText(/confirm password/i), 'long-enough-2');
    await user.click(screen.getByRole('button', { name: /change password/i }));
    expect(await screen.findByText(/do not match/i)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/^new password/i));
    await user.clear(screen.getByLabelText(/confirm password/i));
    await user.type(screen.getByLabelText(/^new password/i), 'long-enough-1');
    await user.type(screen.getByLabelText(/confirm password/i), 'long-enough-1');
    await user.click(screen.getByRole('button', { name: /change password/i }));
    await waitFor(() => expect(svc.completeReset).toHaveBeenCalledTimes(1));
    expect(svc.completeReset).toHaveBeenCalledWith('a'.repeat(64), 'long-enough-1');
    expect(await screen.findByRole('status')).toHaveTextContent(/password has been changed/i);
  });

  it('maps an invalid or expired link to fixed copy and clears the password fields', async () => {
    svc.completeReset.mockRejectedValue(new ApiRequestError('server text', 'INVALID_RESET_TOKEN', 400));
    const user = userEvent.setup();
    render(<ResetPasswordPage />);
    await user.type(screen.getByLabelText(/^new password/i), 'long-enough-1');
    await user.type(screen.getByLabelText(/confirm password/i), 'long-enough-1');
    await user.click(screen.getByRole('button', { name: /change password/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid, has expired, or has already been used/i);
    expect(screen.getByLabelText(/^new password/i)).toHaveValue('');
  });
});
