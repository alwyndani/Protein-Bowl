import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ApiError } from '../src/api/ApiError';

const mockRequest = jest.fn();
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ manager: { requestPasswordReset: (...a: unknown[]) => mockRequest(...a) }, state: { status: 'signedOut', reason: null } })
}));

import { ForgotPasswordScreen, passwordResetMessage } from '../src/screens/AuthScreens';

const navigation = { navigate: jest.fn() } as any;
const route = { key: 'k', name: 'ForgotPassword' } as any;
const show = () => render(<ForgotPasswordScreen navigation={navigation} route={route} />);

beforeEach(() => {
  mockRequest.mockReset();
  navigation.navigate.mockReset();
});

describe('mobile password reset request', () => {
  it('validates the email locally and sends nothing when it is invalid', () => {
    show();
    fireEvent.changeText(screen.getByLabelText('Email'), 'not-an-email');
    fireEvent.press(screen.getByRole('button', { name: 'Send reset link' }));
    expect(screen.getByText('Enter a valid email address.')).toBeTruthy();
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('sends the trimmed address once and shows the same generic confirmation (no account enumeration)', async () => {
    mockRequest.mockResolvedValue(undefined);
    show();
    fireEvent.changeText(screen.getByLabelText('Email'), '  asha@example.test ');
    fireEvent.press(screen.getByRole('button', { name: 'Send reset link' }));
    fireEvent.press(screen.getByRole('button', { name: 'Send reset link' })); // double tap
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));
    expect(mockRequest).toHaveBeenCalledWith('asha@example.test');
    expect(await screen.findByText(/If an account exists for asha@example\.test, we have sent a password reset link/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(navigation.navigate).toHaveBeenCalledWith('SignIn');
  });

  it('failures show fixed copy and never server text', async () => {
    mockRequest.mockRejectedValue(new ApiError('http', 503, 'EMAIL_NOT_CONFIGURED'));
    show();
    fireEvent.changeText(screen.getByLabelText('Email'), 'a@b.test');
    fireEvent.press(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText(/not available right now/)).toBeTruthy();
    expect(passwordResetMessage(new ApiError('http', 429, 'X'))).toMatch(/Too many requests/);
    expect(passwordResetMessage(new Error('boom: stack trace'))).not.toMatch(/boom|stack/);
  });
});
