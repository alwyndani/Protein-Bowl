import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    isLoading: false,
    user: { id: 'admin-1', roles: ['SUPER_ADMIN'] } as { id: string; roles: string[] } | null,
    logout: vi.fn()
  }
}));

vi.mock('../../context/AuthContext', () => ({ useAuth: () => h.auth }));
vi.mock('../../services/adminService', () => ({
  AdminService: {
    stepUp: vi.fn(),
    getPermissionCatalogue: vi.fn(),
    listStaff: vi.fn(),
    getStaff: vi.fn(),
    createStaff: vi.fn(),
    updateStaff: vi.fn(),
    reissueInvitation: vi.fn(),
    assignRole: vi.fn(),
    revokeRole: vi.fn(),
    assignBranch: vi.fn(),
    revokeBranch: vi.fn(),
    deactivateStaff: vi.fn(),
    activateStaff: vi.fn(),
    listBranches: vi.fn(),
    getBranch: vi.fn(),
    createBranch: vi.fn(),
    updateBranch: vi.fn(),
    listAudit: vi.fn(),
    acceptInvitation: vi.fn()
  }
}));

import { AdminService } from '../../services/adminService';
import { ApiRequestError } from '../../services/apiClient';
import { AdminWorkspace } from './AdminWorkspace';
import { StepUpProvider, useStepUp } from './StepUp';
import {
  BRANCHES,
  BRANCH_A_ID,
  BRANCH_B_ID,
  SECRET_LINK_TOKEN,
  STAFF_LIST,
  audit,
  catalogue,
  handoff,
  page,
  staff
} from '../../test/adminFixtures';

const svc = vi.mocked(AdminService);
const PW = 'Sup3r-Secret-Pass!';

function resetMocks() {
  Object.values(svc).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockReset());
  h.auth.isAuthenticated = true;
  h.auth.isLoading = false;
  h.auth.user = { id: 'admin-1', roles: ['SUPER_ADMIN'] };
  h.auth.logout.mockReset();
  svc.getPermissionCatalogue.mockResolvedValue(catalogue());
  svc.listBranches.mockResolvedValue(page(BRANCHES));
  svc.listStaff.mockResolvedValue(page(STAFF_LIST));
  svc.getStaff.mockResolvedValue(staff());
  svc.listAudit.mockResolvedValue(page([audit()]));
  svc.stepUp.mockResolvedValue({ stepUpToken: 'PROOF-1', expiresInSeconds: 300 });
}

async function confirmPassword(user: ReturnType<typeof userEvent.setup>, password = PW) {
  const input = await screen.findByLabelText('Current password');
  await user.type(input, password);
  await user.click(screen.getByRole('button', { name: 'Confirm' }));
}

async function openStaff(user: ReturnType<typeof userEvent.setup>, name = 'Asha Kitchen') {
  render(<AdminWorkspace />);
  await user.click(await screen.findByRole('button', { name: new RegExp(name) }));
  await screen.findByTestId('staff-detail-name');
}

beforeEach(() => {
  resetMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

// ---------------------------------------------------------------------------------------------------------- authorization
describe('Super Admin workspace authorization', () => {
  it('renders the Admin workspace for a SUPER_ADMIN session', async () => {
    render(<AdminWorkspace />);
    expect(await screen.findByTestId('admin-workspace')).toBeInTheDocument();
    expect(await screen.findByText('Asha Kitchen')).toBeInTheDocument();
  });

  it('MD is NOT authorized: no workspace and no admin API request at all', async () => {
    h.auth.user = { id: 'md-1', roles: ['MD'] };
    render(<AdminWorkspace />);
    expect(screen.getByRole('alert')).toHaveTextContent(/not authorized/i);
    expect(screen.queryByTestId('admin-workspace')).not.toBeInTheDocument();
    await Promise.resolve();
    for (const fn of Object.values(svc)) expect(fn).not.toHaveBeenCalled();
  });

  it.each([['CUSTOMER'], ['MESS_CUSTOMER'], ['CHEF'], ['NUTRITIONIST'], ['POS']])('%s is denied and triggers no admin request', async (role) => {
    h.auth.user = { id: 'u', roles: [role] };
    render(<AdminWorkspace />);
    expect(screen.getByRole('alert')).toHaveTextContent(/not authorized/i);
    await Promise.resolve();
    for (const fn of Object.values(svc)) expect(fn).not.toHaveBeenCalled();
  });

  it('an unauthenticated visitor is denied', () => {
    h.auth.isAuthenticated = false;
    h.auth.user = null;
    render(<AdminWorkspace />);
    expect(screen.getByRole('alert')).toHaveTextContent(/not authorized/i);
    expect(svc.listStaff).not.toHaveBeenCalled();
  });

  it('while the session is still resolving nothing is rendered and no admin data is requested', () => {
    h.auth.isLoading = true;
    render(<AdminWorkspace />);
    expect(screen.queryByTestId('admin-workspace')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(svc.listStaff).not.toHaveBeenCalled();
    expect(svc.getPermissionCatalogue).not.toHaveBeenCalled();
  });

  it('the audit log is only reachable inside the SUPER_ADMIN workspace (MD never triggers listAudit)', () => {
    h.auth.user = { id: 'md-1', roles: ['MD'] };
    render(<AdminWorkspace />);
    expect(svc.listAudit).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------------------- staff list
describe('Staff list (server-side filtering)', () => {
  it('loads page 1 from the real list endpoint with the page size', async () => {
    render(<AdminWorkspace />);
    await screen.findByText('Asha Kitchen');
    expect(svc.listStaff).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 20, q: '', status: '', role: '', branchId: '' }));
    expect(screen.getByText('Ravi Counter')).toBeInTheDocument();
  });

  it('search, status, role and branch are sent to the server (not filtered locally)', async () => {
    const user = userEvent.setup();
    render(<AdminWorkspace />);
    await screen.findByText('Asha Kitchen');
    // the role/branch selects are filled from the reference data once it has loaded
    await screen.findByRole('option', { name: 'POS' });

    await user.type(screen.getByLabelText('Search staff'), 'zzz-no-local-match');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(svc.listStaff).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'zzz-no-local-match', page: 1 })));
    // the (mock) server still returned both people, and both are still displayed: nothing was filtered client-side
    expect(screen.getByText('Ravi Counter')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Status'), 'PENDING');
    await waitFor(() => expect(svc.listStaff).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'PENDING' })));
    await user.selectOptions(screen.getByLabelText('Role'), 'POS');
    await waitFor(() => expect(svc.listStaff).toHaveBeenLastCalledWith(expect.objectContaining({ role: 'POS' })));
    await user.selectOptions(screen.getByLabelText('Branch'), BRANCH_B_ID);
    await waitFor(() => expect(svc.listStaff).toHaveBeenLastCalledWith(expect.objectContaining({ branchId: BRANCH_B_ID, role: 'POS', status: 'PENDING', q: 'zzz-no-local-match' })));
  });

  it('pagination requests the next page from the server', async () => {
    svc.listStaff.mockResolvedValue(page(STAFF_LIST, { total: 45, totalPages: 3 }));
    const user = userEvent.setup();
    render(<AdminWorkspace />);
    await screen.findByText('Asha Kitchen');
    expect(screen.getByTestId('pagination-summary')).toHaveTextContent('45 results · page 1 of 3');
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(svc.listStaff).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
  });

  it('shows an empty state when the server returns no staff', async () => {
    svc.listStaff.mockResolvedValue(page([]));
    render(<AdminWorkspace />);
    expect(await screen.findByText(/no staff match these filters/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------------------------------------- error handling
describe('Consistent API error handling', () => {
  it.each([
    [403, 'FORBIDDEN', /not authorized to perform this action/i],
    [429, 'RATE_LIMITED', /too many attempts/i],
    [500, 'INTERNAL', /server could not complete/i],
    [undefined, 'NETWORK_ERROR', /could not reach the server/i]
  ])('list failure status=%s is shown safely', async (status, code, message) => {
    svc.listStaff.mockRejectedValue(new ApiRequestError('raw backend text', code as string, status as number | undefined));
    render(<AdminWorkspace />);
    expect(await screen.findByTestId('admin-error-message')).toHaveTextContent(message);
    expect(screen.queryByText('raw backend text')).not.toBeInTheDocument();
  });

  it('401 ends the session through AuthContext (no silent retry)', async () => {
    svc.listStaff.mockRejectedValue(new ApiRequestError('expired', 'UNAUTHORIZED', 401));
    render(<AdminWorkspace />);
    expect(await screen.findByTestId('admin-error-message')).toHaveTextContent(/session has ended/i);
    await waitFor(() => expect(h.auth.logout).toHaveBeenCalled());
  });

  it('retry reloads the list after a failure', async () => {
    const user = userEvent.setup();
    svc.listStaff.mockRejectedValueOnce(new ApiRequestError('x', 'NETWORK_ERROR'));
    render(<AdminWorkspace />);
    await user.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Asha Kitchen')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------------------------------------- invite
describe('Invite staff', () => {
  async function openInvite(user: ReturnType<typeof userEvent.setup>) {
    render(<AdminWorkspace />);
    await screen.findByText('Asha Kitchen');
    await user.click(screen.getByRole('button', { name: /invite staff/i }));
    return await screen.findByRole('form', { name: 'Invite staff' });
  }

  async function fillValid(user: ReturnType<typeof userEvent.setup>, form: HTMLElement) {
    await user.type(within(form).getByLabelText('Full name'), 'Temp Chef');
    await user.type(within(form).getByLabelText('Email'), 'Temp.Chef@proteinbowl.test');
    await user.type(within(form).getByLabelText('Designation'), 'Line cook');
    await user.click(within(form).getByLabelText('CHEF'));
    await user.click(within(form).getByLabelText(/Kochi Central/));
  }

  it('offers only roles the backend marks assignable: never SUPER_ADMIN, CUSTOMER or MESS_CUSTOMER', async () => {
    const user = userEvent.setup();
    const form = await openInvite(user);
    expect(within(form).getByLabelText('CHEF')).toBeInTheDocument();
    expect(within(form).getByLabelText('MD')).toBeInTheDocument();
    for (const forbidden of ['SUPER_ADMIN', 'CUSTOMER', 'MESS_CUSTOMER']) {
      expect(within(form).queryByLabelText(forbidden)).not.toBeInTheDocument();
    }
    // inactive branches cannot be selected for new staff
    expect(within(form).queryByLabelText(/Closed Branch/)).not.toBeInTheDocument();
  });

  it('validates on the client first: no step-up and no request for an empty form', async () => {
    const user = userEvent.setup();
    const form = await openInvite(user);
    await user.click(within(form).getByRole('button', { name: /create invitation/i }));
    expect(await within(form).findByText(/select at least one role/i)).toBeInTheDocument();
    expect(svc.stepUp).not.toHaveBeenCalled();
    expect(svc.createStaff).not.toHaveBeenCalled();
  });

  it('requires a branch for branch-scoped roles', async () => {
    const user = userEvent.setup();
    const form = await openInvite(user);
    await user.type(within(form).getByLabelText('Full name'), 'Temp Chef');
    await user.type(within(form).getByLabelText('Email'), 'temp@proteinbowl.test');
    await user.type(within(form).getByLabelText('Designation'), 'Cook');
    await user.click(within(form).getByLabelText('CHEF'));
    await user.click(within(form).getByRole('button', { name: /create invitation/i }));
    expect(await within(form).findByText(/at least one branch/i)).toBeInTheDocument();
    expect(svc.createStaff).not.toHaveBeenCalled();
  });

  it('creating staff requires step-up, then shows the one-time link with a "NO EMAIL WAS SENT" notice', async () => {
    const user = userEvent.setup();
    const created = staff({ id: 'new-1', status: 'PENDING', email: 'temp.chef@proteinbowl.test' });
    svc.createStaff.mockResolvedValue({ staff: created, invitation: handoff() });
    const form = await openInvite(user);
    await fillValid(user, form);
    await user.click(within(form).getByRole('button', { name: /create invitation/i }));

    // not created until the password is confirmed
    expect(svc.createStaff).not.toHaveBeenCalled();
    await confirmPassword(user);
    await waitFor(() => expect(svc.createStaff).toHaveBeenCalledTimes(1));
    expect(svc.stepUp).toHaveBeenCalledWith(PW);
    const [input, proof] = svc.createStaff.mock.calls[0];
    expect(proof).toBe('PROOF-1');
    expect(input).toMatchObject({ fullName: 'Temp Chef', email: 'temp.chef@proteinbowl.test', designation: 'Line cook', roles: ['CHEF'], branchIds: [BRANCH_A_ID] });
    expect(JSON.stringify(input)).not.toContain('PROOF-1');

    expect(await screen.findByTestId('no-email-banner')).toHaveTextContent('NO EMAIL WAS SENT');
    expect(screen.getByLabelText('One-time invitation link')).toHaveValue(handoff().setupLink);
    expect(screen.getByRole('button', { name: /copy invitation link/i })).toBeInTheDocument();
  });

  it('the invitation link is shown once: after dismissal it is gone from the page and from browser storage', async () => {
    const user = userEvent.setup();
    svc.createStaff.mockResolvedValue({ staff: staff({ id: 'new-1', status: 'PENDING' }), invitation: handoff() });
    const form = await openInvite(user);
    await fillValid(user, form);
    await user.click(within(form).getByRole('button', { name: /create invitation/i }));
    await confirmPassword(user);
    await screen.findByTestId('no-email-banner');

    expect(JSON.stringify({ ...window.localStorage, ...window.sessionStorage })).not.toContain(SECRET_LINK_TOKEN);
    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByLabelText('One-time invitation link')).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(SECRET_LINK_TOKEN);
  });

  it('a wrong password shows an error, keeps the dialog open and creates nothing', async () => {
    const user = userEvent.setup();
    svc.stepUp.mockRejectedValue(new ApiRequestError('Password is incorrect', 'STEP_UP_FAILED', 401));
    const form = await openInvite(user);
    await fillValid(user, form);
    await user.click(within(form).getByRole('button', { name: /create invitation/i }));
    await confirmPassword(user, 'wrong');
    expect(await screen.findByText(/password is not correct/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Current password')).toHaveValue('');
    expect(svc.createStaff).not.toHaveBeenCalled();
    expect(h.auth.logout).not.toHaveBeenCalled();
  });

  it('cancelling the step-up dialog performs no action and shows no error', async () => {
    const user = userEvent.setup();
    const form = await openInvite(user);
    await fillValid(user, form);
    await user.click(within(form).getByRole('button', { name: /create invitation/i }));
    await screen.findByLabelText('Current password');
    await user.click(within(screen.getByRole('form', { name: 'Password confirmation' })).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument());
    expect(svc.createStaff).not.toHaveBeenCalled();
    expect(screen.queryByTestId('admin-error-message')).not.toBeInTheDocument();
  });

  it('shows server 422 field errors next to the field and 409 duplicate guidance', async () => {
    const user = userEvent.setup();
    svc.createStaff.mockRejectedValueOnce(new ApiRequestError('Validation failed: email: Invalid email address', 'VALIDATION_ERROR', 422));
    const form = await openInvite(user);
    await fillValid(user, form);
    await user.click(within(form).getByRole('button', { name: /create invitation/i }));
    await confirmPassword(user);
    expect(await within(form).findByText('Invalid email address')).toBeInTheDocument();

    svc.createStaff.mockRejectedValueOnce(new ApiRequestError('dup', 'DUPLICATE', 409));
    await user.click(within(form).getByRole('button', { name: /create invitation/i }));
    expect(await screen.findByText(/already in use/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------------------------------------- staff detail actions
describe('Staff detail actions', () => {
  it('shows the safe staff record (no password hash or token fields rendered)', async () => {
    const user = userEvent.setup();
    await openStaff(user);
    expect(svc.getStaff).toHaveBeenCalledWith(STAFF_LIST[0].id);
    expect(screen.getByText('EMP-CHEF-101')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/passwordHash|tokenHash|setupToken/i);
  });

  it('profile edit calls updateStaff WITHOUT any step-up', async () => {
    const user = userEvent.setup();
    svc.updateStaff.mockResolvedValue(staff({ phone: '+91 90000 11111' }));
    await openStaff(user);
    await user.click(screen.getByRole('button', { name: /edit profile/i }));
    const phone = screen.getByLabelText('Phone');
    await user.clear(phone);
    await user.type(phone, '+91 90000 11111');
    await user.click(screen.getByRole('button', { name: /save profile/i }));
    await waitFor(() => expect(svc.updateStaff).toHaveBeenCalledWith(STAFF_LIST[0].id, expect.objectContaining({ phone: '+91 90000 11111' })));
    expect(svc.stepUp).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
  });

  it('assigning a role requires step-up and sends the proof', async () => {
    const user = userEvent.setup();
    svc.assignRole.mockResolvedValue({ changed: true, value: staff() });
    await openStaff(user);
    await user.selectOptions(await screen.findByLabelText('Add role'), 'MD');
    await user.click(screen.getByRole('button', { name: 'Assign role' }));
    expect(svc.assignRole).not.toHaveBeenCalled();
    await confirmPassword(user);
    await waitFor(() => expect(svc.assignRole).toHaveBeenCalledWith(STAFF_LIST[0].id, 'MD', 'PROOF-1'));
  });

  it('revoking a role requires step-up; the last role has no revoke control', async () => {
    const user = userEvent.setup();
    svc.getStaff.mockResolvedValue(staff({ roles: [{ role: 'CHEF', scope: 'BRANCH' }, { role: 'POS', scope: 'BRANCH' }] }));
    svc.revokeRole.mockResolvedValue({ changed: true, value: staff() });
    await openStaff(user);
    await user.click(await screen.findByRole('button', { name: 'Revoke role POS' }));
    expect(svc.revokeRole).not.toHaveBeenCalled();
    await confirmPassword(user);
    await waitFor(() => expect(svc.revokeRole).toHaveBeenCalledWith(STAFF_LIST[0].id, 'POS', 'PROOF-1'));

    svc.getStaff.mockResolvedValue(staff());
    await user.click(screen.getByRole('button', { name: /back to staff/i }));
    await user.click(await screen.findByRole('button', { name: /Asha Kitchen/ }));
    await screen.findByTestId('staff-detail-name');
    expect(screen.queryByRole('button', { name: /Revoke role/ })).not.toBeInTheDocument();
  });

  it('assigning and revoking a branch both require step-up', async () => {
    const user = userEvent.setup();
    svc.assignBranch.mockResolvedValue({ changed: true, value: [] });
    svc.revokeBranch.mockResolvedValue({ changed: true, value: [] });
    await openStaff(user);

    await user.selectOptions(await screen.findByLabelText('Assign branch'), BRANCH_B_ID);
    await user.click(screen.getByRole('button', { name: 'Assign branch' }));
    expect(svc.assignBranch).not.toHaveBeenCalled();
    await confirmPassword(user);
    await waitFor(() => expect(svc.assignBranch).toHaveBeenCalledWith(STAFF_LIST[0].id, BRANCH_B_ID, 'PROOF-1'));

    await user.click(screen.getByRole('button', { name: 'Revoke branch Kochi Central' }));
    // the in-memory proof is still valid: reused, no second password prompt
    await waitFor(() => expect(svc.revokeBranch).toHaveBeenCalledWith(STAFF_LIST[0].id, BRANCH_A_ID, 'PROOF-1'));
    expect(svc.stepUp).toHaveBeenCalledTimes(1);
  });

  it('deactivation needs a reason AND an explicit confirmation before the button enables, then step-up', async () => {
    const user = userEvent.setup();
    svc.deactivateStaff.mockResolvedValue({ changed: true, value: staff({ status: 'DEACTIVATED' }) });
    await openStaff(user);
    await user.click(screen.getByRole('button', { name: /deactivate…/i }));

    const submit = screen.getByRole('button', { name: 'Deactivate account' });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/reason/i), 'Left the company');
    expect(submit).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /i understand/i }));
    expect(submit).toBeEnabled();

    await user.click(submit);
    expect(svc.deactivateStaff).not.toHaveBeenCalled();
    await confirmPassword(user);
    await waitFor(() => expect(svc.deactivateStaff).toHaveBeenCalledWith(STAFF_LIST[0].id, { reason: 'Left the company', status: 'DEACTIVATED' }, 'PROOF-1'));
  });

  it('activation requires a reason and step-up', async () => {
    const user = userEvent.setup();
    svc.getStaff.mockResolvedValue(staff({ status: 'DEACTIVATED' }));
    svc.activateStaff.mockResolvedValue({ changed: true, value: staff() });
    await openStaff(user);
    await user.click(screen.getByRole('button', { name: /activate…/i }));
    expect(screen.getByRole('button', { name: 'Activate account' })).toBeDisabled();
    await user.type(screen.getByLabelText(/reason/i), 'Returned from leave');
    await user.click(screen.getByRole('button', { name: 'Activate account' }));
    expect(svc.activateStaff).not.toHaveBeenCalled();
    await confirmPassword(user);
    await waitFor(() => expect(svc.activateStaff).toHaveBeenCalledWith(STAFF_LIST[0].id, { reason: 'Returned from leave' }, 'PROOF-1'));
  });

  it('a PENDING account cannot be activated or deactivated-then-activated; it can only be reissued', async () => {
    const user = userEvent.setup();
    svc.getStaff.mockResolvedValue(staff({ status: 'PENDING', invitation: { state: 'ACTIVE', expiresAt: '2026-10-11T08:00:00.000Z' } }));
    await openStaff(user);
    expect(screen.queryByRole('button', { name: /^s*activate…/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reissue invitation/i })).toBeInTheDocument();
  });

  it('reissuing an invitation requires step-up and shows the NEW one-time link, which disappears on dismissal', async () => {
    const user = userEvent.setup();
    const newLink = `http://localhost:3000/staff/accept-invite#token=${'ab12'.repeat(16)}`;
    svc.getStaff.mockResolvedValue(staff({ status: 'PENDING', invitation: { state: 'ACTIVE', expiresAt: '2026-10-11T08:00:00.000Z' } }));
    svc.reissueInvitation.mockResolvedValue({ staff: staff({ status: 'PENDING' }), invitation: handoff({ setupLink: newLink }) });
    await openStaff(user);
    await user.click(screen.getByRole('button', { name: /reissue invitation/i }));
    expect(svc.reissueInvitation).not.toHaveBeenCalled();
    await confirmPassword(user);
    await waitFor(() => expect(svc.reissueInvitation).toHaveBeenCalledWith(STAFF_LIST[0].id, 'PROOF-1'));

    expect(await screen.findByTestId('no-email-banner')).toBeInTheDocument();
    expect(screen.getByLabelText('One-time invitation link')).toHaveValue(newLink);
    expect(screen.getByText(/previous invitation link no longer works/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByLabelText('One-time invitation link')).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('ab12ab12');
  });

  it('backend guardrail errors are explained (LAST_ROLE 409) and the record is left unchanged', async () => {
    const user = userEvent.setup();
    svc.getStaff.mockResolvedValue(staff({ roles: [{ role: 'CHEF', scope: 'BRANCH' }, { role: 'POS', scope: 'BRANCH' }] }));
    svc.revokeRole.mockRejectedValue(new ApiRequestError('x', 'LAST_ROLE', 409));
    await openStaff(user);
    await user.click(await screen.findByRole('button', { name: 'Revoke role POS' }));
    await confirmPassword(user);
    expect(await screen.findByTestId('admin-error-message')).toHaveTextContent(/must keep at least one role/i);
  });

  it('SELF_MODIFICATION_FORBIDDEN and LAST_SUPER_ADMIN guardrails are explained; self gets no role/status controls', async () => {
    const user = userEvent.setup();
    svc.getStaff.mockResolvedValue(staff({ id: 'admin-1', roles: [{ role: 'SUPER_ADMIN', scope: 'GLOBAL' }], status: 'ACTIVE' }));
    svc.listStaff.mockResolvedValue(page([staff({ id: 'admin-1', employeeProfile: { id: 'e', employeeCode: 'EMP-ROOT', fullName: 'Root Admin', designation: 'Owner', shiftTiming: null, primaryBranchId: null }, roles: [{ role: 'SUPER_ADMIN', scope: 'GLOBAL' }] })]));
    await openStaff(user, 'Root Admin');
    expect(screen.getByText(/cannot change your own roles/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /deactivate…/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assign role' })).not.toBeInTheDocument();
  });

  it('prevents duplicate mutations: a double click produces one password check and one request', async () => {
    const user = userEvent.setup();
    let release!: (v: { changed: boolean; value: ReturnType<typeof staff> }) => void;
    svc.revokeRole.mockReturnValue(new Promise((res) => (release = res)));
    svc.getStaff.mockResolvedValue(staff({ roles: [{ role: 'CHEF', scope: 'BRANCH' }, { role: 'POS', scope: 'BRANCH' }] }));
    await openStaff(user);
    await user.dblClick(await screen.findByRole('button', { name: 'Revoke role POS' }));
    await confirmPassword(user);
    await waitFor(() => expect(svc.revokeRole).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: 'Revoke role POS' })).catch(() => undefined);
    expect(screen.getByRole('button', { name: 'Revoke role POS' })).toBeDisabled();
    release({ changed: true, value: staff() });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Revoke role POS' })).toBeEnabled());
    expect(svc.revokeRole).toHaveBeenCalledTimes(1);
    expect(svc.stepUp).toHaveBeenCalledTimes(1);
  });

  it('a 403 STEP_UP_REQUIRED response discards the proof and the next attempt asks for the password again', async () => {
    const user = userEvent.setup();
    svc.getStaff.mockResolvedValue(staff({ roles: [{ role: 'CHEF', scope: 'BRANCH' }, { role: 'POS', scope: 'BRANCH' }] }));
    svc.revokeRole.mockRejectedValueOnce(new ApiRequestError('expired', 'STEP_UP_REQUIRED', 403)).mockResolvedValue({ changed: true, value: staff() });
    await openStaff(user);
    await user.click(await screen.findByRole('button', { name: 'Revoke role POS' }));
    await confirmPassword(user);
    expect(await screen.findByTestId('admin-error-message')).toHaveTextContent(/expired or was rejected/i);

    await user.click(screen.getByRole('button', { name: 'Revoke role POS' }));
    await confirmPassword(user);
    await waitFor(() => expect(svc.revokeRole).toHaveBeenCalledTimes(2));
    expect(svc.stepUp).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------------------------------------- branches
describe('Branch administration', () => {
  it('lists branches and surfaces the BRANCH_HAS_ACTIVE_STAFF guardrail on deactivation', async () => {
    const user = userEvent.setup();
    svc.updateBranch.mockRejectedValue(new ApiRequestError('x', 'BRANCH_HAS_ACTIVE_STAFF', 409));
    render(<AdminWorkspace />);
    await screen.findByText('Asha Kitchen');
    await user.click(screen.getByRole('button', { name: 'Branches' }));
    await user.click(await screen.findByRole('button', { name: 'Edit Kochi Central' }));
    await user.click(screen.getByLabelText('Branch is active'));
    await user.click(screen.getByLabelText('Yes, deactivate this branch'));
    await user.click(screen.getByRole('button', { name: 'Deactivate branch' }));
    expect(await screen.findByTestId('admin-error-message')).toHaveTextContent(/still has active or pending staff/i);
    expect(svc.updateBranch).toHaveBeenCalledWith(BRANCH_A_ID, expect.objectContaining({ isActive: false }));
  });

  it('branch deactivation needs an explicit confirmation before any request is made', async () => {
    const user = userEvent.setup();
    render(<AdminWorkspace />);
    await screen.findByText('Asha Kitchen');
    await user.click(screen.getByRole('button', { name: 'Branches' }));
    await user.click(await screen.findByRole('button', { name: 'Edit Kochi Central' }));
    await user.click(screen.getByLabelText('Branch is active'));
    await user.click(screen.getByRole('button', { name: 'Deactivate branch' }));
    expect(await screen.findByText(/confirm that you want to deactivate/i)).toBeInTheDocument();
    expect(svc.updateBranch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------------------- audit + permissions
describe('Audit log and permissions reference', () => {
  it('audit UI is read-only: filters go to the server, there are no edit/delete/export controls, secrets stay redacted', async () => {
    const user = userEvent.setup();
    render(<AdminWorkspace />);
    await screen.findByText('Asha Kitchen');
    await user.click(screen.getByRole('button', { name: 'Audit log' }));
    expect(await screen.findByText('STAFF_CREATED')).toBeInTheDocument();
    expect(svc.listAudit).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 25 }));

    const region = screen.getByRole('region', { name: /security audit log/i });
    const labels = within(region).getAllByRole('button').map((b) => b.textContent ?? '');
    expect(labels.join('|')).not.toMatch(/delete|edit|remove|purge|clear|export|revoke/i);
    expect(region.textContent).toContain('[REDACTED]');

    await user.type(within(region).getByLabelText('Action'), 'ROLE_ASSIGNED');
    await user.click(within(region).getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(svc.listAudit).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'ROLE_ASSIGNED', page: 1 })));
  });

  it('rejects malformed audit filters on the client', async () => {
    const user = userEvent.setup();
    render(<AdminWorkspace />);
    await screen.findByText('Asha Kitchen');
    await user.click(screen.getByRole('button', { name: 'Audit log' }));
    await screen.findByText('STAFF_CREATED');
    const callsBefore = svc.listAudit.mock.calls.length;
    await user.type(screen.getByLabelText('Actor user ID'), 'not-a-uuid');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(await screen.findByText(/valid user id/i)).toBeInTheDocument();
    expect(svc.listAudit.mock.calls.length).toBe(callsBefore);
  });

  it('permissions view is informational: shows the backend note, SUPER_ADMIN as not assignable, and no mutation controls', async () => {
    const user = userEvent.setup();
    render(<AdminWorkspace />);
    await screen.findByText('Asha Kitchen');
    await user.click(screen.getByRole('button', { name: 'Roles & permissions' }));
    expect(await screen.findByTestId('permissions-disclaimer')).toHaveTextContent(/enforced by the backend/i);
    const row = screen.getByRole('row', { name: /SUPER_ADMIN/ });
    expect(within(row).getByText('No')).toBeInTheDocument();

    const region = screen.getByRole('region', { name: /roles and permissions/i });
    expect(within(region).queryAllByRole('button')).toHaveLength(0);
    expect(within(region).queryAllByRole('checkbox')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------------------- step-up lifecycle
describe('Step-up proof lifecycle (memory only)', () => {
  const Probe: React.FC<{ action: (proof: string) => Promise<unknown> }> = ({ action }) => {
    const { withStepUp, hasProof } = useStepUp();
    return (
      <div>
        <span data-testid="has-proof">{String(hasProof)}</span>
        <button type="button" onClick={() => void withStepUp(action).catch(() => undefined)}>
          Run sensitive
        </button>
      </div>
    );
  };

  it('is reused while valid, never written to browser storage, and sent only to the callback', async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue('ok');
    render(
      <StepUpProvider>
        <Probe action={action} />
      </StepUpProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Run sensitive' }));
    await confirmPassword(user);
    await waitFor(() => expect(action).toHaveBeenCalledWith('PROOF-1'));
    expect(screen.getByTestId('has-proof')).toHaveTextContent('true');

    await user.click(screen.getByRole('button', { name: 'Run sensitive' }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    expect(svc.stepUp).toHaveBeenCalledTimes(1);

    expect(JSON.stringify({ ...window.localStorage, ...window.sessionStorage })).not.toContain('PROOF-1');
    expect(document.cookie).not.toContain('PROOF-1');
    expect(document.body.innerHTML).not.toContain('PROOF-1');
  });

  it('is discarded on logout / session change: the next sensitive action asks for the password again', async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue('ok');
    const tree = (
      <StepUpProvider>
        <Probe action={action} />
      </StepUpProvider>
    );
    const { rerender } = render(tree);
    await user.click(screen.getByRole('button', { name: 'Run sensitive' }));
    await confirmPassword(user);
    await waitFor(() => expect(screen.getByTestId('has-proof')).toHaveTextContent('true'));

    h.auth.user = { id: 'admin-2', roles: ['SUPER_ADMIN'] };
    rerender(
      <StepUpProvider>
        <Probe action={action} />
      </StepUpProvider>
    );
    await waitFor(() => expect(screen.getByTestId('has-proof')).toHaveTextContent('false'));

    await user.click(screen.getByRole('button', { name: 'Run sensitive' }));
    expect(await screen.findByLabelText('Current password')).toBeInTheDocument();
  });

  it('is lost on reload (remount): a fresh provider has no proof', async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue('ok');
    const first = render(
      <StepUpProvider>
        <Probe action={action} />
      </StepUpProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Run sensitive' }));
    await confirmPassword(user);
    await waitFor(() => expect(action).toHaveBeenCalled());
    first.unmount();

    render(
      <StepUpProvider>
        <Probe action={action} />
      </StepUpProvider>
    );
    expect(screen.getByTestId('has-proof')).toHaveTextContent('false');
    await user.click(screen.getByRole('button', { name: 'Run sensitive' }));
    expect(await screen.findByLabelText('Current password')).toBeInTheDocument();
  });

  it('a proof the backend rejects (401) is discarded immediately', async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockRejectedValueOnce(new ApiRequestError('no', 'UNAUTHORIZED', 401)).mockResolvedValue('ok');
    render(
      <StepUpProvider>
        <Probe action={action} />
      </StepUpProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Run sensitive' }));
    await confirmPassword(user);
    await waitFor(() => expect(screen.getByTestId('has-proof')).toHaveTextContent('false'));
  });
});
