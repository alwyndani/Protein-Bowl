import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../services/adminService', () => ({ AdminService: { acceptInvitation: vi.fn() } }));

import { AdminService } from '../../services/adminService';
import { ApiRequestError } from '../../services/apiClient';
import { AcceptInvitePage, clearCapturedInvitationToken, isAcceptInviteRoute } from './AcceptInvitePage';
import { SECRET_LINK_TOKEN } from '../../test/adminFixtures';

const accept = vi.mocked(AdminService.acceptInvitation);
const GOOD = 'Str0ng-Passw0rd!x';

function openLink(hash = `#token=${SECRET_LINK_TOKEN}`) {
  window.history.replaceState(null, '', `/staff/accept-invite${hash}`);
}

describe('AcceptInvitePage', () => {
  beforeEach(() => {
    accept.mockReset();
    clearCapturedInvitationToken();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('recognises only the accept-invite path', () => {
    expect(isAcceptInviteRoute('/staff/accept-invite')).toBe(true);
    expect(isAcceptInviteRoute('/staff/accept-invite/')).toBe(true);
    expect(isAcceptInviteRoute('/staff')).toBe(false);
    expect(isAcceptInviteRoute('/')).toBe(false);
  });

  it('reads the token from the URL fragment and scrubs it from the address bar and history entry', () => {
    openLink();
    render(<AcceptInvitePage />);
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain(SECRET_LINK_TOKEN);
    expect(screen.getByRole('form', { name: /set your password/i })).toBeInTheDocument();
  });

  it('never persists the token or password to localStorage / sessionStorage', async () => {
    openLink();
    const user = userEvent.setup();
    accept.mockResolvedValueOnce();
    render(<AcceptInvitePage />);
    await user.type(screen.getByLabelText('New password'), GOOD);
    await user.type(screen.getByLabelText('Confirm password'), GOOD);
    await user.click(screen.getByRole('button', { name: /activate account/i }));
    await waitFor(() => expect(accept).toHaveBeenCalled());
    const dump = JSON.stringify({ ...window.localStorage }) + JSON.stringify({ ...window.sessionStorage });
    expect(dump).not.toContain(SECRET_LINK_TOKEN);
    expect(dump).not.toContain(GOOD);
    expect(window.localStorage.length + window.sessionStorage.length).toBe(0);
  });

  it('submits the captured token + password to the real accept endpoint, then shows success and forgets the token', async () => {
    openLink();
    const user = userEvent.setup();
    accept.mockResolvedValueOnce();
    render(<AcceptInvitePage />);
    await user.type(screen.getByLabelText('New password'), GOOD);
    await user.type(screen.getByLabelText('Confirm password'), GOOD);
    await user.click(screen.getByRole('button', { name: /activate account/i }));

    expect(accept).toHaveBeenCalledWith(SECRET_LINK_TOKEN, GOOD);
    expect(await screen.findByText(/your account is active/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /staff sign-in/i })).toHaveAttribute('href', '/staff/login');
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  });

  it('blocks mismatched passwords on the client without calling the API', async () => {
    openLink();
    const user = userEvent.setup();
    render(<AcceptInvitePage />);
    await user.type(screen.getByLabelText('New password'), GOOD);
    await user.type(screen.getByLabelText('Confirm password'), `${GOOD}-different`);
    await user.click(screen.getByRole('button', { name: /activate account/i }));
    expect(await screen.findByText(/do not match/i)).toBeInTheDocument();
    expect(accept).not.toHaveBeenCalled();
  });

  it('rejects passwords shorter than 12 characters on the client', async () => {
    openLink();
    const user = userEvent.setup();
    render(<AcceptInvitePage />);
    await user.type(screen.getByLabelText('New password'), 'Short1!');
    await user.type(screen.getByLabelText('Confirm password'), 'Short1!');
    await user.click(screen.getByRole('button', { name: /activate account/i }));
    expect(await screen.findByText(/password must be at least 12 characters/i)).toBeInTheDocument();
    expect(accept).not.toHaveBeenCalled();
  });

  it('shows the server password-policy error verbatim-safe and clears the typed passwords', async () => {
    openLink();
    const user = userEvent.setup();
    accept.mockRejectedValueOnce(new ApiRequestError('Password is too common. Choose something harder to guess.', 'PASSWORD_POLICY', 422));
    render(<AcceptInvitePage />);
    await user.type(screen.getByLabelText('New password'), 'Password1234!');
    await user.type(screen.getByLabelText('Confirm password'), 'Password1234!');
    await user.click(screen.getByRole('button', { name: /activate account/i }));
    expect(await screen.findByText(/too common/i)).toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toHaveValue('');
  });

  it('uses one uniform message for invalid / expired / used invitations (no state leak)', async () => {
    openLink();
    const user = userEvent.setup();
    accept.mockRejectedValueOnce(new ApiRequestError('Invitation expired internally', 'INVALID_INVITATION', 400));
    render(<AcceptInvitePage />);
    await user.type(screen.getByLabelText('New password'), GOOD);
    await user.type(screen.getByLabelText('Confirm password'), GOOD);
    await user.click(screen.getByRole('button', { name: /activate account/i }));
    expect(await screen.findByText(/invalid, has expired, or has already been used/i)).toBeInTheDocument();
    expect(screen.queryByText(/expired internally/i)).not.toBeInTheDocument();
  });

  it('shows a clear message when the link has no token', () => {
    openLink('');
    render(<AcceptInvitePage />);
    expect(screen.getByRole('alert')).toHaveTextContent(/missing or no longer available/i);
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  });
});
