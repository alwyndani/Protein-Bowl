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
  DeliveryService: { getQueue: vi.fn(), act: vi.fn(), reportFailure: vi.fn(), verifyDelivery: vi.fn(), overrideDelivery: vi.fn(), getMonitor: vi.fn(), listDrivers: vi.fn(), assign: vi.fn() }
}));
vi.mock('../../services/deliveryResolutionService', () => ({
  DeliveryResolutionService: { getAttempts: vi.fn(), retryDelivery: vi.fn(), markUndeliverable: vi.fn() }
}));

import { AdminService } from '../../services/adminService';
import { DeliveryService } from '../../services/deliveryService';
import { DeliveryResolutionService } from '../../services/deliveryResolutionService';
import { ApiRequestError } from '../../services/apiClient';
import { AdminWorkspace } from './AdminWorkspace';
import { BRANCHES, BRANCH_A_ID, catalogue, page, staff } from '../../test/adminFixtures';
import { DRIVER_1, DRIVER_2, deliveryMonitor, monitorOrder } from '../../test/deliveryFixtures';
import type { DeliveryAttempts } from '../../services/deliveryResolutionTypes';

const admin = vi.mocked(AdminService);
const delivery = vi.mocked(DeliveryService);
const resolution = vi.mocked(DeliveryResolutionService);
const PW = 'Sup3r-Secret-Pass!';
const SA_NOTE = 'Admin explanation that only SUPER_ADMIN may read';

async function openDelivery(user: ReturnType<typeof userEvent.setup>) {
  render(<AdminWorkspace />);
  await user.click(await screen.findByRole('button', { name: 'Delivery' }));
  const panel = await screen.findByTestId('delivery-monitor');
  await user.selectOptions(within(panel).getByLabelText('Branch'), BRANCH_A_ID);
  return panel;
}
async function confirmPassword(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Current password'), PW);
  await user.click(screen.getByRole('button', { name: 'Confirm' }));
}

const failed = (attemptNumber = 1, over: Parameters<typeof monitorOrder>[0] = {}) =>
  monitorOrder({
    orderNumber: 'PB-FAIL-1',
    status: 'DISPATCHED',
    assignment: { state: 'FAILED', driver: DRIVER_1, pickupTime: '2026-10-12T09:05:00.000Z', attemptNumber },
    exception: { reasonCode: 'CUSTOMER_UNREACHABLE', note: 'Phone off' },
    proofState: 'NOT_ISSUED',
    ...over
  });
const pendingRetry = () => monitorOrder({ orderNumber: 'PB-PEND-1', status: 'DISPATCHED', assignment: { state: 'ASSIGNED', driver: DRIVER_1, pickupTime: null, attemptNumber: 2 }, proofState: 'NOT_ISSUED' });
const attempts = (withNotes: boolean): DeliveryAttempts => ({
  orderId: 'order-x',
  orderNumber: 'PB-FAIL-1',
  maxAttempts: 3,
  current: { attemptNumber: 2, state: 'FAILED', driver: DRIVER_1, startedAt: '2026-10-12T09:30:00.000Z', failedAt: '2026-10-12T09:40:00.000Z', failureReasonCode: 'CUSTOMER_UNREACHABLE', canRetry: true },
  attempts: [
    {
      attemptNumber: 1,
      driver: DRIVER_1,
      branch: { id: BRANCH_A_ID, code: 'kochi', name: 'Kochi Central' },
      startedAt: '2026-10-12T08:00:00.000Z',
      failedAt: '2026-10-12T08:20:00.000Z',
      endedAt: '2026-10-12T09:00:00.000Z',
      failureReasonCode: 'CUSTOMER_UNAVAILABLE',
      outcome: 'RETRY_SAME_DRIVER',
      resolutionReasonCode: 'CUSTOMER_AVAILABLE_NOW',
      ...(withNotes ? { failureNote: 'Nobody home', resolutionNote: SA_NOTE, resolvedByUserId: 'admin-1' } : {})
    }
  ]
});

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
  delivery.getMonitor.mockResolvedValue(deliveryMonitor({ exceptions: [failed(1)] }));
  delivery.listDrivers.mockResolvedValue([DRIVER_1, DRIVER_2]);
  resolution.getAttempts.mockResolvedValue(attempts(true));
  resolution.retryDelivery.mockResolvedValue({ changed: true, orderId: 'x', orderNumber: 'PB-FAIL-1', action: 'RETRY_SAME_DRIVER', attemptNumber: 2, assignmentState: 'ASSIGNED', driverEmployeeId: DRIVER_1.employeeId });
  resolution.markUndeliverable.mockResolvedValue({ changed: true, orderId: 'x', orderNumber: 'PB-FAIL-1', status: 'CANCELLED', attemptNumber: 1 });
});

describe('SUPER_ADMIN failed-delivery resolution (P9C)', () => {
  it('a FAILED attempt offers Retry same driver, Reassign driver, Cancel & Full Refund and the exceptional override; the attempt number is shown', async () => {
    const user = userEvent.setup();
    const panel = await openDelivery(user);
    const row = await within(panel).findByText('PB-FAIL-1').then((el) => el.closest('li')!);
    expect(row).toHaveTextContent('Attempt 1 of 3');
    for (const name of ['Retry PB-FAIL-1 with the same driver', 'Reassign PB-FAIL-1 to another driver', 'Cancel and fully refund PB-FAIL-1', 'Exceptional handover confirmation for PB-FAIL-1']) {
      const b = within(row).getByRole('button', { name });
      expect(b.className).toMatch(/min-h-11|px-2|px-4/);
    }
    expect(document.body.textContent).not.toMatch(/\bcod\b|cash on|pay at/i);
  });

  it('Retry same driver: step-up first, reason required, sends the EXPECTED attempt and driver (never a status or amount) and confirms the next attempt', async () => {
    const user = userEvent.setup();
    const panel = await openDelivery(user);
    await user.click(await within(panel).findByRole('button', { name: 'Retry PB-FAIL-1 with the same driver' }));
    const dialog = await screen.findByRole('dialog', { name: /Retry PB-FAIL-1 with the same driver/ });
    expect(within(dialog).getByTestId('retry-explainer')).toHaveTextContent(/attempt 2 of 3.*new delivery code/i);
    await user.click(within(dialog).getByRole('button', { name: 'Arrange retry' }));
    expect(await within(dialog).findByText('Choose a reason.')).toBeInTheDocument();
    expect(resolution.retryDelivery).not.toHaveBeenCalled();
    await user.selectOptions(within(dialog).getByLabelText('Reason'), 'CUSTOMER_AVAILABLE_NOW');
    await user.click(within(dialog).getByRole('button', { name: 'Arrange retry' }));
    await confirmPassword(user);
    await waitFor(() => expect(resolution.retryDelivery).toHaveBeenCalledTimes(1));
    const [orderId, input, proof] = resolution.retryDelivery.mock.calls[0];
    expect(orderId).toEqual(expect.any(String));
    expect(proof).toBe('PROOF-1');
    expect(input).toEqual({ mode: 'SAME_DRIVER', expectedAttemptNumber: 1, expectedDriverId: DRIVER_1.employeeId, reasonCode: 'CUSTOMER_AVAILABLE_NOW', note: '' });
    expect(JSON.stringify(input)).not.toMatch(/status|amount|refund|payment/i);
    expect(await screen.findByTestId('delivery-monitor-notice')).toHaveTextContent(/attempt 2.*Start delivery again/i);
  }, 15000); // step-up dialog flow: 4-5 s under full-suite parallel load (default 5 s leaves no margin)

  it('Reassign driver: another driver of the branch is required, the CURRENT driver is not offered, and the request carries the new driver id', async () => {
    const user = userEvent.setup();
    const panel = await openDelivery(user);
    await user.click(await within(panel).findByRole('button', { name: 'Reassign PB-FAIL-1 to another driver' }));
    const dialog = await screen.findByRole('dialog', { name: /Reassign PB-FAIL-1 to another driver/ });
    const picker = await within(dialog).findByLabelText('Driver (same branch)');
    await waitFor(() => expect(within(picker).getAllByRole('option').length).toBeGreaterThan(1));
    const names = within(picker).getAllByRole('option').map((o) => o.textContent ?? '');
    expect(names.some((n) => n.includes(DRIVER_1.fullName))).toBe(false);
    await user.selectOptions(within(dialog).getByLabelText('Reason'), 'DRIVER_CHANGE');
    await user.click(within(dialog).getByRole('button', { name: 'Reassign driver' }));
    expect(await within(dialog).findByText('Choose a driver.')).toBeInTheDocument();
    await user.selectOptions(picker, DRIVER_2.employeeId);
    await user.click(within(dialog).getByRole('button', { name: 'Reassign driver' }));
    await confirmPassword(user);
    await waitFor(() => expect(resolution.retryDelivery).toHaveBeenCalledTimes(1));
    expect(resolution.retryDelivery.mock.calls[0][1]).toMatchObject({ mode: 'REASSIGN', driverEmployeeId: DRIVER_2.employeeId, expectedAttemptNumber: 1, expectedDriverId: DRIVER_1.employeeId, reasonCode: 'DRIVER_CHANGE' });
  }, 15000); // step-up dialog flow: 4-5 s under full-suite parallel load (default 5 s leaves no margin)

  it('a stale screen (409 DELIVERY_ATTEMPT_CHANGED) shows safe copy, keeps the dialog and reloads the monitor', async () => {
    const user = userEvent.setup();
    resolution.retryDelivery.mockRejectedValue(new ApiRequestError('RAW', 'DELIVERY_ATTEMPT_CHANGED', 409));
    const panel = await openDelivery(user);
    await waitFor(() => expect(delivery.getMonitor).toHaveBeenCalledTimes(1));
    await user.click(await within(panel).findByRole('button', { name: 'Retry PB-FAIL-1 with the same driver' }));
    const dialog = await screen.findByRole('dialog', { name: /Retry PB-FAIL-1/ });
    await user.selectOptions(within(dialog).getByLabelText('Reason'), 'OPERATIONAL_RETRY');
    await user.click(within(dialog).getByRole('button', { name: 'Arrange retry' }));
    await confirmPassword(user);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/changed in the meantime/i);
    expect(document.body.textContent).not.toContain('RAW');
    await waitFor(() => expect(delivery.getMonitor.mock.calls.length).toBeGreaterThan(1));
  });

  it('after attempt 3 failed there is NO retry or reassign: only Cancel & Full Refund and the exceptional handover remain, with an explanation', async () => {
    const user = userEvent.setup();
    delivery.getMonitor.mockResolvedValue(deliveryMonitor({ exceptions: [failed(3)] }));
    const panel = await openDelivery(user);
    const row = await within(panel).findByText('PB-FAIL-1').then((el) => el.closest('li')!);
    expect(within(row).queryByRole('button', { name: /Retry PB-FAIL-1/ })).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /Reassign PB-FAIL-1/ })).not.toBeInTheDocument();
    expect(within(row).getByTestId('attempt-limit')).toHaveTextContent(/maximum of 3 delivery attempts/i);
    expect(within(row).getByRole('button', { name: 'Cancel and fully refund PB-FAIL-1' })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Exceptional handover confirmation for PB-FAIL-1' })).toBeInTheDocument();
  });

  it('Cancel & Full Refund needs a reason, a 10+ character note and an explicit confirmation; it sends no amount; success explains the refund is automatic', async () => {
    const user = userEvent.setup();
    const panel = await openDelivery(user);
    await user.click(await within(panel).findByRole('button', { name: 'Cancel and fully refund PB-FAIL-1' }));
    const dialog = await screen.findByRole('dialog', { name: /Cancel & Full Refund for PB-FAIL-1/ });
    expect(dialog).toHaveTextContent(/FULL amount they paid/);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel & Full Refund' }));
    expect(await within(dialog).findByText('Choose a reason.')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter an explanation of at least 10 characters.')).toBeInTheDocument();
    expect(within(dialog).getByText('Tick the confirmation to continue.')).toBeInTheDocument();
    expect(resolution.markUndeliverable).not.toHaveBeenCalled();
    await user.selectOptions(within(dialog).getByLabelText('Reason'), 'CUSTOMER_REFUSED');
    await user.type(within(dialog).getByLabelText('Explanation'), 'Customer refused at the door');
    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(within(dialog).getByRole('button', { name: 'Cancel & Full Refund' }));
    await confirmPassword(user);
    await waitFor(() => expect(resolution.markUndeliverable).toHaveBeenCalledTimes(1));
    const [, input, proof] = resolution.markUndeliverable.mock.calls[0];
    expect(proof).toBe('PROOF-1');
    expect(input).toEqual({ reasonCode: 'CUSTOMER_REFUSED', note: 'Customer refused at the door', expectedAttemptNumber: 1 });
    expect(await screen.findByTestId('delivery-monitor-notice')).toHaveTextContent(/cancelled.*full refund.*processed automatically/i);
  }, 15000); // step-up dialog flow: 4-5 s under full-suite parallel load (default 5 s leaves no margin)

  it('a retry that was arranged but not resumed can be handed to another driver (same attempt); the override is not offered for it', async () => {
    const user = userEvent.setup();
    delivery.getMonitor.mockResolvedValue(deliveryMonitor({ dispatched: [pendingRetry()] }));
    const panel = await openDelivery(user);
    const row = await within(panel).findByText('PB-PEND-1').then((el) => el.closest('li')!);
    expect(row).toHaveTextContent('Retry assigned: waiting for the driver to start');
    expect(within(row).queryByRole('button', { name: /Exceptional handover/ })).not.toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'Hand the pending retry of PB-PEND-1 to another driver' }));
    const dialog = await screen.findByRole('dialog', { name: /Hand the pending retry of PB-PEND-1/ });
    expect(within(dialog).getByTestId('retry-explainer')).toHaveTextContent(/does not use up another attempt/i);
    await user.selectOptions(await within(dialog).findByLabelText('Driver (same branch)'), DRIVER_2.employeeId);
    await user.selectOptions(within(dialog).getByLabelText('Reason'), 'DRIVER_CHANGE');
    await user.click(within(dialog).getByRole('button', { name: 'Reassign driver' }));
    await confirmPassword(user);
    await waitFor(() => expect(resolution.retryDelivery).toHaveBeenCalledTimes(1));
    expect(resolution.retryDelivery.mock.calls[0][1]).toMatchObject({ mode: 'REASSIGN', driverEmployeeId: DRIVER_2.employeeId, expectedAttemptNumber: 2, expectedDriverId: DRIVER_1.employeeId });
  });

  it('the attempt history is readable (outcomes, drivers, times, reasons, notes for SUPER_ADMIN) and never contains a code, hash or counter', async () => {
    const user = userEvent.setup();
    const panel = await openDelivery(user);
    const row = await within(panel).findByText('PB-FAIL-1').then((el) => el.closest('li')!);
    await user.click(within(row).getByTestId('attempt-history-toggle'));
    const history = await within(row).findByTestId('attempt-history');
    expect(within(history).getByTestId('attempt-record')).toHaveTextContent('Attempt 1: Retried with the same driver');
    expect(history).toHaveTextContent(DRIVER_1.fullName);
    expect(history).toHaveTextContent('Administrator note: ' + SA_NOTE);
    expect(history).toHaveTextContent('Driver note: Nobody home');
    expect(history).toHaveTextContent('Current: attempt 2 (failed, awaiting a decision)');
    expect(history.textContent).not.toMatch(/codeHash|codeVersion|failedAttempts|lockCycles|\b\d{6}\b/);
  });
});

describe('MD (read-only) failed-delivery view (P9C)', () => {
  it('MD sees the failure and the attempt history but NO resolution control and NO free-text notes', async () => {
    const user = userEvent.setup();
    delivery.getMonitor.mockResolvedValue(deliveryMonitor({ exceptions: [failed(2)] }, { readOnly: true }));
    resolution.getAttempts.mockResolvedValue(attempts(false)); // what the server returns to MD: structured fields only
    const panel = await openDelivery(user);
    const row = await within(panel).findByText('PB-FAIL-1').then((el) => el.closest('li')!);
    for (const re of [/Retry/, /Reassign/, /Cancel/, /Exceptional handover/]) expect(within(row).queryByRole('button', { name: re })).not.toBeInTheDocument();
    await user.click(within(row).getByTestId('attempt-history-toggle'));
    const history = await within(row).findByTestId('attempt-history');
    expect(history).toHaveTextContent('Attempt 1: Retried with the same driver');
    expect(history.textContent).not.toContain(SA_NOTE);
    expect(history.textContent).not.toContain('Nobody home');
    expect(history.textContent).not.toContain('Administrator note');
  });
});
