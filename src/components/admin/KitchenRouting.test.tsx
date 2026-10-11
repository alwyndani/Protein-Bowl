import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({
  auth: { isAuthenticated: true, isLoading: false, user: { id: 'admin-1', roles: ['SUPER_ADMIN'] } as { id: string; roles: string[] } | null, logout: vi.fn() }
}));

vi.mock('../../context/AuthContext', () => ({ useAuth: () => h.auth }));
vi.mock('../../services/adminService', () => ({
  AdminService: {
    stepUp: vi.fn(),
    getPermissionCatalogue: vi.fn(),
    listStaff: vi.fn(),
    getStaff: vi.fn(),
    listBranches: vi.fn(),
    listAudit: vi.fn()
  }
}));
vi.mock('../../services/kitchenService', () => ({
  KitchenService: { getQueue: vi.fn(), act: vi.fn(), listRouting: vi.fn(), assignBranch: vi.fn() }
}));

import { AdminService } from '../../services/adminService';
import { KitchenService } from '../../services/kitchenService';
import { ApiRequestError } from '../../services/apiClient';
import { AdminWorkspace } from './AdminWorkspace';
import { BRANCHES, BRANCH_A_ID, BRANCH_B_ID, BRANCH_CLOSED_ID, catalogue, page, staff } from '../../test/adminFixtures';
import { routingList, routingOrder } from '../../test/kitchenFixtures';

const admin = vi.mocked(AdminService);
const kitchen = vi.mocked(KitchenService);
const PW = 'Sup3r-Secret-Pass!';

async function openRouting(user: ReturnType<typeof userEvent.setup>) {
  render(<AdminWorkspace />);
  await user.click(await screen.findByRole('button', { name: 'Kitchen routing' }));
  return await screen.findByTestId('kitchen-routing');
}

async function confirmPassword(user: ReturnType<typeof userEvent.setup>) {
  const input = await screen.findByLabelText('Current password');
  await user.type(input, PW);
  await user.click(screen.getByRole('button', { name: 'Confirm' }));
}

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
  kitchen.listRouting.mockResolvedValue(routingList([routingOrder({ orderNumber: 'PB-UNROUTED-1' })]));
});

describe('SUPER_ADMIN kitchen routing UI', () => {
  it('lists UNROUTED orders by default with routing-relevant fields only (area = city + postal code)', async () => {
    const user = userEvent.setup();
    const panel = await openRouting(user);
    expect(kitchen.listRouting).toHaveBeenCalledWith('unrouted');
    const row = await within(panel).findByTestId('routing-row');
    expect(row).toHaveTextContent('PB-UNROUTED-1');
    expect(row).toHaveTextContent('Unrouted');
    expect(row).toHaveTextContent('Kochi 682001');
    expect(panel.textContent).not.toMatch(/phone|email|street|customer name|payment|refund|health/i);
  });

  it('the filter switches between unrouted / routed / all and each request names the filter', async () => {
    const user = userEvent.setup();
    const panel = await openRouting(user);
    await within(panel).findByTestId('routing-row');
    kitchen.listRouting.mockResolvedValue(routingList([routingOrder({ orderNumber: 'PB-ROUTED-1', kitchenBranch: { id: BRANCH_B_ID, code: 'kozhikode', name: 'Kozhikode Hub' } })], { routing: 'routed' }));
    await user.click(within(panel).getByRole('button', { name: 'Routed' }));
    expect(await within(panel).findByText('Routed to Kozhikode Hub')).toBeInTheDocument();
    expect(kitchen.listRouting).toHaveBeenLastCalledWith('routed');
    await user.click(within(panel).getByRole('button', { name: 'All' }));
    await waitFor(() => expect(kitchen.listRouting).toHaveBeenLastCalledWith('all'));
    expect(within(panel).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('empty and error states', async () => {
    const user = userEvent.setup();
    kitchen.listRouting.mockResolvedValueOnce(routingList([]));
    const panel = await openRouting(user);
    expect(await within(panel).findByText(/no unrouted orders/i)).toBeInTheDocument();
    kitchen.listRouting.mockRejectedValueOnce(new ApiRequestError('raw sql error', 'INTERNAL_SERVER_ERROR', 500));
    await user.click(within(panel).getByTestId('routing-refresh'));
    const alert = await within(panel).findByRole('alert');
    expect(alert).not.toHaveTextContent(/raw sql/);
  });

  it('routes an order: accessible dialog, reason required, only ACTIVE branches offered, step-up first, expectedBranchId = what was shown', async () => {
    const user = userEvent.setup();
    const panel = await openRouting(user);
    await user.click(await within(panel).findByRole('button', { name: 'Route PB-UNROUTED-1' }));
    const dialog = await screen.findByRole('dialog', { name: /Route PB-UNROUTED-1/ });
    const select = within(dialog).getByLabelText('Kitchen branch');
    const offered = within(select).getAllByRole('option').map((o) => o.getAttribute('value'));
    expect(offered).toContain(BRANCH_A_ID);
    expect(offered).toContain(BRANCH_B_ID);
    expect(offered).not.toContain(BRANCH_CLOSED_ID); // the inactive branch is not offered

    // validation: branch and reason are required
    await user.click(within(dialog).getByRole('button', { name: 'Route order' }));
    expect(within(dialog).getByText('Choose a kitchen branch.')).toBeInTheDocument();
    expect(within(dialog).getByText(/at least 3 characters/)).toBeInTheDocument();
    expect(admin.stepUp).not.toHaveBeenCalled();
    expect(kitchen.assignBranch).not.toHaveBeenCalled();

    await user.selectOptions(select, BRANCH_B_ID);
    await user.type(within(dialog).getByLabelText('Reason'), '  Nearest hub for Kochi  ');
    kitchen.assignBranch.mockResolvedValue({ changed: true, orderId: 'x', orderNumber: 'PB-UNROUTED-1', status: 'CONFIRMED', previousBranchId: null, kitchenBranch: { id: BRANCH_B_ID, code: 'kozhikode', name: 'Kozhikode Hub' } });
    kitchen.listRouting.mockResolvedValue(routingList([]));
    await user.click(within(dialog).getByRole('button', { name: 'Route order' }));
    await confirmPassword(user);

    await waitFor(() => expect(kitchen.assignBranch).toHaveBeenCalledTimes(1));
    expect(admin.stepUp).toHaveBeenCalledWith(PW);
    const [orderId, input, proof] = kitchen.assignBranch.mock.calls[0];
    expect(orderId).toMatch(/^route-/);
    expect(input).toEqual({ branchId: BRANCH_B_ID, expectedBranchId: null, reason: 'Nearest hub for Kochi' });
    expect(Object.keys(input).sort()).toEqual(['branchId', 'expectedBranchId', 'reason']); // no status, payment or any other field
    expect(proof).toBe('PROOF-1');
    expect(await screen.findByTestId('routing-notice')).toHaveTextContent('PB-UNROUTED-1 was routed');
    expect(screen.queryByRole('dialog', { name: /Route PB-UNROUTED-1/ })).not.toBeInTheDocument();
    await waitFor(() => expect(kitchen.listRouting.mock.calls.length).toBeGreaterThan(1)); // list reloaded
  });

  it('changing a routed order sends the CURRENT branch as expectedBranchId', async () => {
    const user = userEvent.setup();
    kitchen.listRouting.mockResolvedValue(routingList([routingOrder({ orderNumber: 'PB-ROUTED-9', kitchenBranch: { id: BRANCH_A_ID, code: 'kochi-central', name: 'Kochi Central' } })], { routing: 'all' }));
    const panel = await openRouting(user);
    await user.click(await within(panel).findByRole('button', { name: 'Change kitchen for PB-ROUTED-9' }));
    const dialog = await screen.findByRole('dialog', { name: /Change kitchen for PB-ROUTED-9/ });
    const offered = within(within(dialog).getByLabelText('Kitchen branch')).getAllByRole('option').map((o) => o.getAttribute('value'));
    expect(offered).not.toContain(BRANCH_A_ID); // the current branch is not offered again
    await user.selectOptions(within(dialog).getByLabelText('Kitchen branch'), BRANCH_B_ID);
    await user.type(within(dialog).getByLabelText('Reason'), 'Branch A is closed today');
    kitchen.assignBranch.mockResolvedValue({ changed: true, orderId: 'x', orderNumber: 'PB-ROUTED-9', status: 'CONFIRMED', previousBranchId: BRANCH_A_ID, kitchenBranch: { id: BRANCH_B_ID, code: 'k', name: 'K' } });
    await user.click(within(dialog).getByRole('button', { name: 'Change kitchen' }));
    await confirmPassword(user);
    await waitFor(() => expect(kitchen.assignBranch).toHaveBeenCalled());
    expect(kitchen.assignBranch.mock.calls[0][1].expectedBranchId).toBe(BRANCH_A_ID);
  });

  it('a STALE expectedBranchId (409) shows safe copy, keeps the dialog open and reloads the list; no raw backend text', async () => {
    const user = userEvent.setup();
    const panel = await openRouting(user);
    await user.click(await within(panel).findByRole('button', { name: 'Route PB-UNROUTED-1' }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Kitchen branch'), BRANCH_A_ID);
    await user.type(within(dialog).getByLabelText('Reason'), 'Nearest hub');
    kitchen.assignBranch.mockRejectedValue(new ApiRequestError('The kitchen assignment changed in the meantime. RAW', 'KITCHEN_BRANCH_CHANGED', 409));
    const loads = kitchen.listRouting.mock.calls.length;
    await user.click(within(dialog).getByRole('button', { name: 'Route order' }));
    await confirmPassword(user);
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(/changed this order's kitchen in the meantime/i);
    expect(alert).not.toHaveTextContent(/RAW/);
    await waitFor(() => expect(kitchen.listRouting.mock.calls.length).toBeGreaterThan(loads));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('a double submit sends ONE routing request', async () => {
    const user = userEvent.setup();
    const panel = await openRouting(user);
    await user.click(await within(panel).findByRole('button', { name: 'Route PB-UNROUTED-1' }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Kitchen branch'), BRANCH_A_ID);
    await user.type(within(dialog).getByLabelText('Reason'), 'double click test');
    let finish!: () => void;
    kitchen.assignBranch.mockImplementation(() => new Promise((res) => (finish = () => res({ changed: true, orderId: 'x', orderNumber: 'n', status: 'CONFIRMED', previousBranchId: null, kitchenBranch: { id: BRANCH_A_ID, code: 'k', name: 'K' } }))));
    await user.click(within(dialog).getByRole('button', { name: 'Route order' }));
    await confirmPassword(user);
    await waitFor(() => expect(kitchen.assignBranch).toHaveBeenCalledTimes(1));
    const submit = within(dialog).getByRole('button', { name: /working/i });
    await user.dblClick(submit);
    expect(kitchen.assignBranch).toHaveBeenCalledTimes(1);
    finish();
  });

  it('Escape closes the dialog and focus returns to the control that opened it', async () => {
    const user = userEvent.setup();
    const panel = await openRouting(user);
    const opener = await within(panel).findByRole('button', { name: 'Route PB-UNROUTED-1' });
    await user.click(opener);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('only SUPER_ADMIN reaches the routing UI: MD, CHEF and customers get the not-authorized screen and no routing request', async () => {
    for (const roles of [['MD'], ['CHEF'], ['CUSTOMER']]) {
      h.auth.user = { id: 'u', roles };
      const { unmount } = render(<AdminWorkspace />);
      expect(screen.getByRole('alert')).toHaveTextContent(/not authorized/i);
      unmount();
    }
    expect(kitchen.listRouting).not.toHaveBeenCalled();
  });
});
