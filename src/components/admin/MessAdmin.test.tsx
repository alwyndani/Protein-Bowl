import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({
  auth: { isAuthenticated: true, isLoading: false, user: { id: 'admin-1', roles: ['SUPER_ADMIN'] } as { id: string; roles: string[] } | null, logout: vi.fn() }
}));

vi.mock('../../context/AuthContext', () => ({ useAuth: () => h.auth }));
vi.mock('../../services/adminService', () => ({
  AdminService: { stepUp: vi.fn(), getPermissionCatalogue: vi.fn(), listStaff: vi.fn(), getStaff: vi.fn(), listBranches: vi.fn(), listAudit: vi.fn() }
}));
vi.mock('../../services/messService', () => ({
  MessService: {
    adminAccounts: vi.fn(), adminServicePoints: vi.fn(), adminPlans: vi.fn(), adminSubscriptions: vi.fn(),
    approveAccount: vi.fn(), rejectAccount: vi.fn(), createServicePoint: vi.fn(), updateServicePoint: vi.fn(),
    createPlan: vi.fn(), updatePlan: vi.fn(), planAction: vi.fn(), adminCancel: vi.fn()
  }
}));

import { AdminService } from '../../services/adminService';
import { MessService } from '../../services/messService';
import { AdminWorkspace } from './AdminWorkspace';
import { MessAdmin } from './MessAdmin';
import { BRANCHES, BRANCH_A_ID, catalogue, page, staff } from '../../test/adminFixtures';
import { SP_A, adminAccount, adminPlan, adminServicePoint, adminSubscription } from '../../test/messFixtures';

const admin = vi.mocked(AdminService);
const mess = vi.mocked(MessService);
const PW = 'Sup3r-Secret-Pass!';
const WRITE_BUTTONS = /^(Approve…|Reject…|Add service point…|Create plan \(draft\)…|Edit…|Activate|Archive|Cancel…)$/;

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.isAuthenticated = true;
  h.auth.isLoading = false;
  h.auth.user = { id: 'admin-1', roles: ['SUPER_ADMIN'] };
  admin.getPermissionCatalogue.mockResolvedValue(catalogue());
  admin.listBranches.mockResolvedValue(page(BRANCHES));
  admin.listStaff.mockResolvedValue(page([staff()]));
  admin.listAudit.mockResolvedValue(page([]));
  admin.stepUp.mockResolvedValue({ stepUpToken: 'PROOF-1', expiresInSeconds: 300 });
  mess.adminAccounts.mockResolvedValue({ accounts: [adminAccount()], total: 1 });
  mess.adminServicePoints.mockResolvedValue([adminServicePoint()]);
  mess.adminPlans.mockResolvedValue([adminPlan()]);
  mess.adminSubscriptions.mockResolvedValue({ subscriptions: [adminSubscription()], total: 1 });
});

async function openMess(user: ReturnType<typeof userEvent.setup>, tab?: string) {
  render(<AdminWorkspace />);
  await user.click(await screen.findByRole('button', { name: 'Kerala Mess' }));
  const panel = await screen.findByTestId('mess-admin');
  if (tab) await user.click(within(panel).getByRole('tab', { name: tab }));
  return panel;
}
async function confirmPassword(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Current password'), PW);
  await user.click(screen.getByRole('button', { name: 'Confirm' }));
}

describe('Kerala Mess administration (SUPER_ADMIN)', () => {
  it('approving an account asks for step-up and sends the exact service point the reviewer saw', async () => {
    const user = userEvent.setup();
    mess.approveAccount.mockResolvedValue(adminAccount({ approvalStatus: 'APPROVED' }));
    const panel = await openMess(user);
    const card = await within(panel).findByTestId('mess-account-acc-9');
    expect(card).toHaveTextContent('Sneha Joseph');
    expect(card).toHaveTextContent('STU-2026-88'); // staff see the student id
    await user.click(within(card).getByRole('button', { name: 'Approve…' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Approve' }));
    await confirmPassword(user);
    await waitFor(() => expect(mess.approveAccount).toHaveBeenCalledTimes(1));
    expect(mess.approveAccount).toHaveBeenCalledWith('acc-9', SP_A.id, 'PROOF-1');
  }, 15000); // step-up dialog flow: 4-5 s under full-suite parallel load (default 5 s leaves no margin)

  it('rejecting needs a reason code and sends no client-controlled status', async () => {
    const user = userEvent.setup();
    mess.rejectAccount.mockResolvedValue(adminAccount({ approvalStatus: 'REJECTED' }));
    const panel = await openMess(user);
    await user.click(within(await within(panel).findByTestId('mess-account-acc-9')).getByRole('button', { name: 'Reject…' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Reject' })).toBeDisabled();
    await user.selectOptions(within(dialog).getByLabelText('Reason'), 'INCOMPLETE_DETAILS');
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));
    await confirmPassword(user);
    await waitFor(() => expect(mess.rejectAccount).toHaveBeenCalledWith('acc-9', 'INCOMPLETE_DETAILS', '', 'PROOF-1'));
  }, 15000); // step-up dialog flow: 4-5 s under full-suite parallel load (default 5 s leaves no margin)

  it('a plan is created as a DRAFT with NO default price tax: an empty tax rate is sent as null', async () => {
    const user = userEvent.setup();
    mess.createPlan.mockResolvedValue(adminPlan());
    const panel = await openMess(user, 'Plans');
    await user.click(await within(panel).findByRole('button', { name: 'Create plan (draft)…' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Code'), 'NEW-PLAN');
    await user.type(within(dialog).getByLabelText('Name'), 'New plan');
    await user.type(within(dialog).getByLabelText('Price before tax (INR)'), '1000');
    expect(within(dialog).getByLabelText(/Tax rate/)).toHaveValue(''); // never pre-filled
    await user.click(within(dialog).getByLabelText('Lunch'));
    await user.click(within(dialog).getByRole('button', { name: 'Create draft' }));
    await confirmPassword(user);
    await waitFor(() => expect(mess.createPlan).toHaveBeenCalledTimes(1));
    const [body, proof] = mess.createPlan.mock.calls[0];
    expect(proof).toBe('PROOF-1');
    expect(body).toMatchObject({ code: 'NEW-PLAN', name: 'New plan', basePrice: '1000', taxRate: null, mealSlots: ['LUNCH'], minStartLeadDays: null, branchId: null });
    expect(body).not.toHaveProperty('status');
  }, 15000); // step-up dialog flow: 4-5 s under full-suite parallel load (default 5 s leaves no margin)

  it('activating and archiving send the plan version the screen showed', async () => {
    const user = userEvent.setup();
    mess.planAction.mockResolvedValue(adminPlan({ status: 'ACTIVE', version: 3 }));
    const panel = await openMess(user, 'Plans');
    const card = await within(panel).findByTestId('mess-plan-MONTHLY-LB');
    await user.click(within(card).getByRole('button', { name: 'Activate' }));
    await confirmPassword(user);
    await waitFor(() => expect(mess.planAction).toHaveBeenCalledWith('plan-1', 'activate', 2, 'PROOF-1'));
    await user.click(within(card).getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(mess.planAction).toHaveBeenCalledWith('plan-1', 'archive', 2, 'PROOF-1'));
  }, 15000); // step-up dialog flow: 4-5 s under full-suite parallel load (default 5 s leaves no margin)

  it('editing a service point sends expectedVersion and never the branch or code', async () => {
    const user = userEvent.setup();
    mess.updateServicePoint.mockResolvedValue(adminServicePoint({ version: 4 }));
    const panel = await openMess(user, 'Service points');
    const card = await within(panel).findByTestId('mess-sp-CUSAT-LH-B');
    await user.click(within(card).getByRole('button', { name: 'Edit…' }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Status'), 'INACTIVE');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await confirmPassword(user);
    await waitFor(() => expect(mess.updateServicePoint).toHaveBeenCalledTimes(1));
    const [id, body] = mess.updateServicePoint.mock.calls[0];
    expect(id).toBe(SP_A.id);
    expect(body).toMatchObject({ expectedVersion: 3, status: 'INACTIVE' });
    expect(body).not.toHaveProperty('branchId');
    expect(body).not.toHaveProperty('code');
  }, 15000); // step-up dialog flow: 4-5 s under full-suite parallel load (default 5 s leaves no margin)

  it('administrative cancellation needs a reason and an explicit confirmation, and states that the refund is full', async () => {
    const user = userEvent.setup();
    mess.adminSubscriptions.mockResolvedValue({ subscriptions: [adminSubscription({ status: 'ACTIVE', payment: { state: 'PAID', canStartPayment: false } })], total: 1 });
    mess.adminCancel.mockResolvedValue({ subscriptionId: 'sub-1', status: 'CANCELLED', alreadyCancelled: false, refund: { state: 'REFUND_PENDING' }, payment: null });
    const panel = await openMess(user, 'Subscriptions');
    await user.click(await within(panel).findByRole('button', { name: 'Cancel…' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('refunded IN FULL');
    const submit = within(dialog).getByRole('button', { name: 'Cancel subscription' });
    expect(submit).toBeDisabled();
    await user.selectOptions(within(dialog).getByLabelText('Reason'), 'OPERATIONAL_ISSUE');
    expect(submit).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(submit);
    await confirmPassword(user);
    await waitFor(() => expect(mess.adminCancel).toHaveBeenCalledWith('sub-1', 'OPERATIONAL_ISSUE', '', 'PROOF-1'));
  }, 15000); // step-up dialog flow: 4-5 s under full-suite parallel load (default 5 s leaves no margin)

  it('a backend refusal (stale version) is shown as a safe message and the dialog stays open', async () => {
    const user = userEvent.setup();
    const { ApiRequestError } = await import('../../services/apiClient');
    mess.planAction.mockRejectedValue(new ApiRequestError('stale', 'VERSION_CONFLICT', 409));
    const panel = await openMess(user, 'Plans');
    await user.click(within(await within(panel).findByTestId('mess-plan-MONTHLY-LB')).getByRole('button', { name: 'Activate' }));
    await confirmPassword(user);
    expect(await within(panel).findByTestId('admin-error-message')).toBeInTheDocument();
  }, 15000); // step-up dialog flow: 4-5 s under full-suite parallel load (default 5 s leaves no margin)
});

describe('Kerala Mess administration: legacy accounts', () => {
  it('a legacy account without a service point cannot be approved (no Approve button, explanation shown)', async () => {
    mess.adminAccounts.mockResolvedValue({ accounts: [adminAccount({ servicePoint: null })], total: 1 });
    const user = userEvent.setup();
    const panel = await openMess(user);
    const card = await within(panel).findByTestId('mess-account-acc-9');
    expect(within(card).queryByRole('button', { name: 'Approve…' })).toBeNull();
    expect(card).toHaveTextContent('without a service point');
    expect(within(card).getByRole('button', { name: 'Reject…' })).toBeInTheDocument();
  }, 15000); // step-up provider mounts with the workspace: slower under full-suite parallel load
});

describe('Kerala Mess administration (MD, read-only)', () => {
  it('renders the real lists with NO write control, no step-up prompt and no student id / phone', async () => {
    h.auth.user = { id: 'md-1', roles: ['MD'] };
    mess.adminAccounts.mockResolvedValue({ accounts: [adminAccount({ studentIdCard: undefined, phone: undefined, email: undefined })], total: 1 });
    const user = userEvent.setup();
    render(<MessAdmin readOnly />);
    const card = await screen.findByTestId('mess-account-acc-9');
    expect(card).toHaveTextContent('Sneha Joseph');
    expect(card.textContent).not.toMatch(/STU-2026-88|\+91|@example/);
    expect(screen.queryByRole('button', { name: WRITE_BUTTONS })).toBeNull();
    for (const tab of ['Service points', 'Plans', 'Subscriptions']) {
      await user.click(screen.getByRole('tab', { name: tab }));
      await screen.findByTestId('mess-admin');
      expect(screen.queryByRole('button', { name: WRITE_BUTTONS }), tab).toBeNull();
    }
    expect(admin.stepUp).not.toHaveBeenCalled();
    expect(mess.approveAccount).not.toHaveBeenCalled();
  });

  it('a non-SUPER_ADMIN session never reaches the Super Admin workspace (and so no Mess write control)', async () => {
    h.auth.user = { id: 'md-1', roles: ['MD'] };
    render(<AdminWorkspace />);
    expect(await screen.findByText('Not authorized')).toBeInTheDocument();
    expect(mess.adminAccounts).not.toHaveBeenCalled();
    void BRANCH_A_ID;
  });
});
