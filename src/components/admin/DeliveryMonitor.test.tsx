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
vi.mock('../../services/kitchenService', () => ({
  KitchenService: { getQueue: vi.fn(), act: vi.fn(), listRouting: vi.fn(), assignBranch: vi.fn() }
}));
vi.mock('../../services/deliveryService', () => ({
  DeliveryService: { getQueue: vi.fn(), act: vi.fn(), reportFailure: vi.fn(), getMonitor: vi.fn(), listDrivers: vi.fn(), assign: vi.fn() }
}));

import { AdminService } from '../../services/adminService';
import { DeliveryService } from '../../services/deliveryService';
import { ApiRequestError } from '../../services/apiClient';
import { AdminWorkspace } from './AdminWorkspace';
import { BRANCHES, BRANCH_A_ID, catalogue, page, staff } from '../../test/adminFixtures';
import { DRIVER_1, DRIVER_2, deliveryMonitor, monitorOrder } from '../../test/deliveryFixtures';

const admin = vi.mocked(AdminService);
const delivery = vi.mocked(DeliveryService);
const PW = 'Sup3r-Secret-Pass!';

async function openDelivery(user: ReturnType<typeof userEvent.setup>, branch = BRANCH_A_ID) {
  render(<AdminWorkspace />);
  await user.click(await screen.findByRole('button', { name: 'Delivery' }));
  const panel = await screen.findByTestId('delivery-monitor');
  await user.selectOptions(within(panel).getByLabelText('Branch'), branch);
  return panel;
}

async function confirmPassword(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Current password'), PW);
  await user.click(screen.getByRole('button', { name: 'Confirm' }));
}

const unclaimed = () => monitorOrder({ orderNumber: 'PB-UN-1' });
const assigned = () => monitorOrder({ orderNumber: 'PB-AS-1', assignment: { state: 'ASSIGNED', driver: DRIVER_1, pickupTime: null } });

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
  delivery.getMonitor.mockResolvedValue(deliveryMonitor({ unclaimed: [unclaimed()], assigned: [assigned()] }));
  delivery.listDrivers.mockResolvedValue([DRIVER_1, DRIVER_2]);
});

describe('SUPER_ADMIN delivery monitor', () => {
  it('requires an explicit branch: nothing is requested until one is chosen, then the four groups appear with area-only order data', async () => {
    const user = userEvent.setup();
    render(<AdminWorkspace />);
    await user.click(await screen.findByRole('button', { name: 'Delivery' }));
    const panel = await screen.findByTestId('delivery-monitor');
    expect(within(panel).getByText(/choose a branch/i)).toBeInTheDocument();
    expect(delivery.getMonitor).not.toHaveBeenCalled();

    await user.selectOptions(within(panel).getByLabelText('Branch'), BRANCH_A_ID);
    await waitFor(() => expect(delivery.getMonitor).toHaveBeenCalledWith(BRANCH_A_ID));
    for (const id of ['unclaimed', 'assigned', 'dispatched', 'exceptions']) expect(await within(panel).findByTestId(`delivery-monitor-${id}`)).toBeInTheDocument();
    const rows = within(panel).getAllByTestId('delivery-monitor-row');
    expect(rows[0]).toHaveTextContent('PB-UN-1');
    expect(rows[0]).toHaveTextContent('Area: Kochi 682001');
    expect(rows[0]).toHaveTextContent('No driver yet');
    expect(rows[1]).toHaveTextContent('Driver: Ravi Kumar (DRV-001)');
    expect(panel.textContent).not.toMatch(/phone|email|street|marine drive|payment|refund|price|₹/i);
  });

  it('assign: accessible dialog, driver + reason required, step-up first, expectedDriverId = null for an unclaimed order, only the approved fields are sent', async () => {
    const user = userEvent.setup();
    const panel = await openDelivery(user);
    await user.click(await within(panel).findByRole('button', { name: 'Assign PB-UN-1' }));
    const dialog = await screen.findByRole('dialog', { name: /Assign a driver to PB-UN-1/ });
    await waitFor(() => expect(delivery.listDrivers).toHaveBeenCalledWith(BRANCH_A_ID));

    await user.click(within(dialog).getByRole('button', { name: 'Assign driver' }));
    expect(within(dialog).getByText('Choose a driver.')).toBeInTheDocument();
    expect(within(dialog).getByText(/at least 3 characters/)).toBeInTheDocument();
    expect(admin.stepUp).not.toHaveBeenCalled();
    expect(delivery.assign).not.toHaveBeenCalled();

    await user.selectOptions(await within(dialog).findByLabelText('Driver'), DRIVER_2.employeeId);
    await user.type(within(dialog).getByLabelText('Reason'), '  Closest to the customer  ');
    delivery.assign.mockResolvedValue({ changed: true, orderId: 'x', orderNumber: 'PB-UN-1', action: 'ASSIGNED', previousDriverId: null, driverEmployeeId: DRIVER_2.employeeId });
    await user.click(within(dialog).getByRole('button', { name: 'Assign driver' }));
    await confirmPassword(user);

    await waitFor(() => expect(delivery.assign).toHaveBeenCalledTimes(1));
    expect(admin.stepUp).toHaveBeenCalledWith(PW);
    const [, input, proof] = delivery.assign.mock.calls[0];
    expect(input).toEqual({ driverEmployeeId: DRIVER_2.employeeId, expectedDriverId: null, reason: 'Closest to the customer' });
    expect(Object.keys(input).sort()).toEqual(['driverEmployeeId', 'expectedDriverId', 'reason']);
    expect(proof).toBe('PROOF-1');
    expect(await screen.findByTestId('delivery-monitor-notice')).toHaveTextContent('PB-UN-1 was assigned');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('reassign offers every OTHER driver and sends the CURRENT driver as expectedDriverId; unassign sends a null driver with the current driver expected', async () => {
    const user = userEvent.setup();
    const panel = await openDelivery(user);
    await user.click(await within(panel).findByRole('button', { name: 'Reassign PB-AS-1' }));
    let dialog = await screen.findByRole('dialog', { name: /Reassign PB-AS-1/ });
    const select = await within(dialog).findByLabelText('Driver');
    await waitFor(() => expect(within(select).getAllByRole('option').map((o) => o.getAttribute('value'))).toContain(DRIVER_2.employeeId));
    expect(within(select).getAllByRole('option').map((o) => o.getAttribute('value'))).not.toContain(DRIVER_1.employeeId); // the current driver is not offered again
    await user.selectOptions(select, DRIVER_2.employeeId);
    await user.type(within(dialog).getByLabelText('Reason'), 'Driver 1 is off shift');
    delivery.assign.mockResolvedValue({ changed: true, orderId: 'x', orderNumber: 'PB-AS-1', action: 'REASSIGNED', previousDriverId: DRIVER_1.employeeId, driverEmployeeId: DRIVER_2.employeeId });
    await user.click(within(dialog).getByRole('button', { name: 'Reassign driver' }));
    await confirmPassword(user);
    await waitFor(() => expect(delivery.assign).toHaveBeenCalledTimes(1));
    expect(delivery.assign.mock.calls[0][1]).toEqual({ driverEmployeeId: DRIVER_2.employeeId, expectedDriverId: DRIVER_1.employeeId, reason: 'Driver 1 is off shift' });

    await user.click(await within(panel).findByRole('button', { name: 'Unassign PB-AS-1' }));
    dialog = await screen.findByRole('dialog', { name: /Unassign PB-AS-1/ });
    expect(within(dialog).queryByLabelText('Driver')).not.toBeInTheDocument(); // no driver choice when unassigning
    await user.type(within(dialog).getByLabelText('Reason'), 'Back to the pool');
    delivery.assign.mockResolvedValue({ changed: true, orderId: 'x', orderNumber: 'PB-AS-1', action: 'UNASSIGNED', previousDriverId: DRIVER_1.employeeId, driverEmployeeId: null });
    await user.click(within(dialog).getByRole('button', { name: 'Unassign' }));
    await waitFor(() => expect(delivery.assign).toHaveBeenCalledTimes(2)); // the proof is reused: no second password prompt
    expect(delivery.assign.mock.calls[1][1]).toEqual({ driverEmployeeId: null, expectedDriverId: DRIVER_1.employeeId, reason: 'Back to the pool' });
  });

  it('a STALE expectedDriverId (409) shows safe copy, keeps the dialog open and reloads the monitor; no raw backend text', async () => {
    const user = userEvent.setup();
    const panel = await openDelivery(user);
    await user.click(await within(panel).findByRole('button', { name: 'Assign PB-UN-1' }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(await within(dialog).findByLabelText('Driver'), DRIVER_1.employeeId);
    await user.type(within(dialog).getByLabelText('Reason'), 'Closest driver');
    delivery.assign.mockRejectedValue(new ApiRequestError('The delivery assignment changed in the meantime. RAW', 'DELIVERY_ASSIGNMENT_CHANGED', 409));
    const loads = delivery.getMonitor.mock.calls.length;
    await user.click(within(dialog).getByRole('button', { name: 'Assign driver' }));
    await confirmPassword(user);
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(/changed this order's delivery assignment in the meantime/i);
    expect(alert).not.toHaveTextContent(/RAW/);
    await waitFor(() => expect(delivery.getMonitor.mock.calls.length).toBeGreaterThan(loads));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('an order that is already out for delivery cannot be reassigned: the server refusal (ORDER_NOT_ASSIGNABLE) is shown as safe copy', async () => {
    const user = userEvent.setup();
    const panel = await openDelivery(user);
    await user.click(await within(panel).findByRole('button', { name: 'Reassign PB-AS-1' }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(await within(dialog).findByLabelText('Driver'), DRIVER_2.employeeId);
    await user.type(within(dialog).getByLabelText('Reason'), 'Too late test');
    delivery.assign.mockRejectedValue(new ApiRequestError('Delivery can only be assigned while the order is READY and eligible', 'ORDER_NOT_ASSIGNABLE', 409));
    await user.click(within(dialog).getByRole('button', { name: 'Reassign driver' }));
    await confirmPassword(user);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/only be assigned while the order is ready/i);
  });

  it('a double submit sends ONE assignment request', async () => {
    const user = userEvent.setup();
    const panel = await openDelivery(user);
    await user.click(await within(panel).findByRole('button', { name: 'Assign PB-UN-1' }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(await within(dialog).findByLabelText('Driver'), DRIVER_1.employeeId);
    await user.type(within(dialog).getByLabelText('Reason'), 'double click test');
    let finish!: () => void;
    delivery.assign.mockImplementation(() => new Promise((res) => (finish = () => res({ changed: true, orderId: 'x', orderNumber: 'n', action: 'ASSIGNED', previousDriverId: null, driverEmployeeId: DRIVER_1.employeeId }))));
    await user.click(within(dialog).getByRole('button', { name: 'Assign driver' }));
    await confirmPassword(user);
    await waitFor(() => expect(delivery.assign).toHaveBeenCalledTimes(1));
    await user.dblClick(within(dialog).getByRole('button', { name: /working/i }));
    expect(delivery.assign).toHaveBeenCalledTimes(1);
    finish();
  });

  it('exceptions: shows the reason, the note and the "awaiting review" policy; there is NO resolve, refund, cancel, dispatch or mark-delivered action', async () => {
    const user = userEvent.setup();
    const exception = monitorOrder({
      orderNumber: 'PB-EX-1',
      status: 'DISPATCHED',
      assignment: { state: 'FAILED', driver: DRIVER_1, pickupTime: '2026-10-11T09:05:00.000Z' },
      exception: { reasonCode: 'CUSTOMER_UNREACHABLE', note: 'Phone switched off' }
    });
    delivery.getMonitor.mockResolvedValue(deliveryMonitor({ dispatched: [monitorOrder({ orderNumber: 'PB-OUT-1', status: 'DISPATCHED', assignment: { state: 'IN_TRANSIT', driver: DRIVER_2, pickupTime: '2026-10-11T09:01:00.000Z' } })], exceptions: [exception] }));
    const panel = await openDelivery(user);
    const section = await within(panel).findByTestId('delivery-monitor-exceptions');
    expect(section).toHaveTextContent('PB-EX-1');
    expect(section).toHaveTextContent('Issue reported: Customer not reachable');
    expect(section).toHaveTextContent('Driver note: Phone switched off');
    expect(section).toHaveTextContent(/awaiting review/i);
    expect(within(panel).queryByRole('button', { name: /resolve|refund|cancel|dispatch|deliver|return/i })).not.toBeInTheDocument();
    // dispatched / exception rows have no assignment controls at all (READY only)
    expect(within(panel).queryByRole('button', { name: /assign|reassign|unassign/i })).not.toBeInTheDocument();
    expect(within(panel).getByTestId('delivery-monitor-dispatched')).toHaveTextContent('Driver: Meera Nair');
  });

  it('a read-only monitor (MD-style response) offers no assign / reassign / unassign controls', async () => {
    const user = userEvent.setup();
    delivery.getMonitor.mockResolvedValue(deliveryMonitor({ unclaimed: [unclaimed()], assigned: [assigned()] }, { readOnly: true }));
    const panel = await openDelivery(user);
    await within(panel).findAllByTestId('delivery-monitor-row');
    expect(within(panel).queryByRole('button', { name: /assign|reassign|unassign/i })).not.toBeInTheDocument();
  });

  it('loading error and stale warning are safe copy with role=alert; the old list stays visible while stale', async () => {
    const user = userEvent.setup();
    delivery.getMonitor.mockRejectedValueOnce(new ApiRequestError('raw sql error', 'INTERNAL_SERVER_ERROR', 500));
    const panel = await openDelivery(user);
    const error = await within(panel).findByTestId('delivery-monitor-error');
    expect(error).toHaveAttribute('role', 'alert');
    expect(error).not.toHaveTextContent(/raw sql/);
    delivery.getMonitor.mockResolvedValue(deliveryMonitor({ unclaimed: [unclaimed()] }));
    await user.click(within(error).getByRole('button', { name: 'Retry' }));
    await within(panel).findByText('PB-UN-1');
    delivery.getMonitor.mockRejectedValue(new ApiRequestError('boom', 'NETWORK_ERROR'));
    await user.click(within(panel).getByTestId('delivery-monitor-refresh'));
    expect(await within(panel).findByTestId('delivery-monitor-stale')).toHaveTextContent(/may be out of date/i);
    expect(within(panel).getByText('PB-UN-1')).toBeInTheDocument();
  });

  it('Escape closes the dialog and focus returns to the control that opened it', async () => {
    const user = userEvent.setup();
    const panel = await openDelivery(user);
    const opener = await within(panel).findByRole('button', { name: 'Assign PB-UN-1' });
    await user.click(opener);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('only SUPER_ADMIN reaches the delivery admin UI: MD, DELIVERY and customers get the not-authorized screen and no delivery request', async () => {
    for (const roles of [['MD'], ['DELIVERY'], ['CUSTOMER']]) {
      h.auth.user = { id: 'u', roles };
      const { unmount } = render(<AdminWorkspace />);
      expect(await screen.findByText('Not authorized')).toBeInTheDocument();
      unmount();
    }
    expect(delivery.getMonitor).not.toHaveBeenCalled();
    expect(delivery.listDrivers).not.toHaveBeenCalled();
  });
});
