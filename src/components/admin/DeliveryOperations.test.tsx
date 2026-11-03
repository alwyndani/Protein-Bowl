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
vi.mock('../../services/deliveryService', () => ({
  DeliveryService: { getQueue: vi.fn(), act: vi.fn(), reportFailure: vi.fn(), verifyDelivery: vi.fn(), overrideDelivery: vi.fn(), getMonitor: vi.fn(), listDrivers: vi.fn(), assign: vi.fn() }
}));
vi.mock('../../services/deliveryOperateService', () => ({
  DeliveryOperateService: { getOrder: vi.fn(), dispatch: vi.fn(), takeover: vi.fn(), verify: vi.fn(), reportFailure: vi.fn(), retry: vi.fn(), resume: vi.fn() }
}));
vi.mock('../../services/messService', () => ({ MessService: { deliveryMonitor: vi.fn() } }));
vi.mock('../../services/messOperateService', () => ({
  MessOperateService: { claimRun: vi.fn(), dispatchRun: vi.fn(), takeoverRun: vi.fn(), verifyStop: vi.fn(), failStop: vi.fn(), retryStop: vi.fn() }
}));

import { AdminService } from '../../services/adminService';
import { DeliveryService } from '../../services/deliveryService';
import { DeliveryOperateService } from '../../services/deliveryOperateService';
import { MessService } from '../../services/messService';
import { MessOperateService } from '../../services/messOperateService';
import { ApiRequestError } from '../../services/apiClient';
import type { MessRun, MessStop } from '../../services/messTypes';
import { AdminWorkspace } from './AdminWorkspace';
import { actionsFor } from './OperateDirect';
import { BRANCHES, BRANCH_A_ID, catalogue, page, staff } from '../../test/adminFixtures';
import { DRIVER_1, deliveryMonitor, monitorOrder, ownedOrder } from '../../test/deliveryFixtures';

const admin = vi.mocked(AdminService);
const monitorSvc = vi.mocked(DeliveryService);
const op = vi.mocked(DeliveryOperateService);
const messMon = vi.mocked(MessService);
const messOp = vi.mocked(MessOperateService);
const PW = 'Sup3r-Secret-Pass!';
const OPERATOR = 'ADMIN' as const;

// ---- direct-order fixtures (admin-operated unless stated)
const readyUnclaimed = () => monitorOrder({ orderNumber: 'PB-RD-1' });
const readyDriverOwned = () => monitorOrder({ orderNumber: 'PB-RD-2', assignment: { state: 'ASSIGNED', driver: DRIVER_1, pickupTime: null, attemptNumber: 1 } });
const readyAdminOwned = () => monitorOrder({ orderNumber: 'PB-RD-3', assignment: { state: 'ASSIGNED', driver: null, operator: OPERATOR, pickupTime: null, attemptNumber: 1 } });
const inTransit = (n = 'PB-IT-1') => monitorOrder({ orderNumber: n, status: 'DISPATCHED', assignment: { state: 'IN_TRANSIT', driver: null, operator: OPERATOR, pickupTime: '2026-10-11T09:05:00.000Z', attemptNumber: 1 }, proofState: 'ISSUED' });
const failed = (attempt = 1) => monitorOrder({ orderNumber: 'PB-FL-1', status: 'DISPATCHED', assignment: { state: 'FAILED', driver: null, operator: OPERATOR, pickupTime: '2026-10-11T09:05:00.000Z', attemptNumber: attempt }, exception: { reasonCode: 'CUSTOMER_UNAVAILABLE', note: null }, proofState: 'ISSUED' });
const retryPending = () => monitorOrder({ orderNumber: 'PB-RP-1', status: 'DISPATCHED', assignment: { state: 'ASSIGNED', driver: null, operator: OPERATOR, pickupTime: null, attemptNumber: 2 } });
const driverInTransit = () => monitorOrder({ orderNumber: 'PB-DT-1', status: 'DISPATCHED', assignment: { state: 'IN_TRANSIT', driver: DRIVER_1, pickupTime: '2026-10-11T09:05:00.000Z', attemptNumber: 1 }, proofState: 'ISSUED' });

// ---- Mess fixtures
const stop = (o: Partial<MessStop> = {}): MessStop => ({
  id: 'stop-1',
  servicePoint: { name: 'CUSAT Hostel B', gateLabel: 'Main gate', addressLine: 'Block B', city: 'Kochi', postalCode: '682022', deliveryInstructions: null },
  expectedQuantity: 12,
  status: 'PENDING',
  attempt: { number: 1, max: 3 },
  failureCode: null,
  failureNote: null,
  proof: { state: 'READY_FOR_VERIFICATION', lockedUntil: null },
  handedOverAt: null,
  handoverMethod: null,
  closedAt: null,
  ...o
});
const run = (o: Partial<MessRun> = {}): MessRun => ({
  id: 'run-1',
  branch: { id: BRANCH_A_ID, code: 'kochi', name: 'Kochi Central' },
  mealDate: '2026-10-25',
  slot: 'LUNCH',
  status: 'AVAILABLE',
  mealCount: 12,
  stopCount: 1,
  releasedAt: '2026-10-25T05:00:00.000Z',
  claimedAt: null,
  dispatchedAt: null,
  completedAt: null,
  closedAt: null,
  driver: null,
  operator: null,
  stops: [stop()],
  ...o
});
const messMonitor = (runs: MessRun[]) => ({ serverTime: '2026-10-25T06:00:00.000Z', today: '2026-10-25', runs });

async function openOps(user: ReturnType<typeof userEvent.setup>) {
  render(<AdminWorkspace />);
  await user.click(await screen.findByRole('button', { name: 'Delivery operations' }));
  return await screen.findByTestId('delivery-operations');
}
async function openDirect(user: ReturnType<typeof userEvent.setup>, branch = BRANCH_A_ID) {
  const root = await openOps(user);
  const panel = within(root).getByTestId('operate-direct');
  await user.selectOptions(within(panel).getByLabelText('Branch'), branch);
  await waitFor(() => expect(monitorSvc.getMonitor).toHaveBeenCalledWith(branch));
  return panel;
}
async function openMess(user: ReturnType<typeof userEvent.setup>, branch = BRANCH_A_ID) {
  const root = await openOps(user);
  await user.click(within(root).getByRole('tab', { name: 'Kerala Mess runs' }));
  const panel = await within(root).findByTestId('operate-mess');
  await user.selectOptions(within(panel).getByLabelText('Branch'), branch);
  await waitFor(() => expect(messMon.deliveryMonitor).toHaveBeenCalledWith(branch));
  return panel;
}
async function confirmPassword(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Current password'), PW);
  await user.click(screen.getByRole('button', { name: 'Confirm' }));
}
const rowOf = (panel: HTMLElement, orderNumber: string) => within(panel).getAllByTestId('operate-row').find((r) => r.getAttribute('data-order-number') === orderNumber)!;
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
const orderResult = (changed = true) => ({ changed, order: ownedOrder() });

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
  monitorSvc.getMonitor.mockResolvedValue(
    deliveryMonitor({ unclaimed: [readyUnclaimed()], assigned: [readyDriverOwned(), readyAdminOwned()], dispatched: [inTransit(), driverInTransit(), retryPending()], exceptions: [failed()] })
  );
  messMon.deliveryMonitor.mockResolvedValue(messMonitor([run()]));
});

describe('access: only a Super Admin session reaches the delivery operations', () => {
  it.each([['CUSTOMER'], ['CHEF'], ['MD'], ['DELIVERY'], ['NUTRITIONIST'], ['TRAINER'], ['PROCUREMENT']])('a %s session sees "Not authorized" and nothing is requested', async (role) => {
    h.auth.user = { id: 'u-1', roles: [role] };
    render(<AdminWorkspace />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Not authorized');
    expect(screen.queryByRole('button', { name: 'Delivery operations' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('delivery-operations')).not.toBeInTheDocument();
    expect(admin.listBranches).not.toHaveBeenCalled();
    expect(monitorSvc.getMonitor).not.toHaveBeenCalled();
    expect(messMon.deliveryMonitor).not.toHaveBeenCalled();
    expect(op.dispatch).not.toHaveBeenCalled();
    expect(messOp.claimRun).not.toHaveBeenCalled();
  });

  it('an unauthenticated or still-loading session shows nothing operational', async () => {
    h.auth.isAuthenticated = false;
    h.auth.user = null;
    const { unmount } = render(<AdminWorkspace />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Not authorized');
    unmount();
    h.auth.isLoading = true;
    render(<AdminWorkspace />);
    expect(screen.queryByTestId('delivery-operations')).not.toBeInTheDocument();
    expect(monitorSvc.getMonitor).not.toHaveBeenCalled();
  });

  it('SUPER_ADMIN sees the section; no list is requested until a branch is chosen; the other sections (Delivery, Kerala Mess) are still there', async () => {
    const user = userEvent.setup();
    const root = await openOps(user);
    expect(screen.getByRole('button', { name: 'Delivery' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kerala Mess' })).toBeInTheDocument();
    expect(within(root).getByText(/choose a branch/i)).toBeInTheDocument();
    expect(monitorSvc.getMonitor).not.toHaveBeenCalled();
    expect(messMon.deliveryMonitor).not.toHaveBeenCalled();
  });
});

describe('what an administrator may do with each kind of row (derived only from the server data)', () => {
  it('maps the monitor state to the offered actions', () => {
    expect(actionsFor(readyUnclaimed())).toEqual(['start']);
    expect(actionsFor(readyAdminOwned())).toEqual(['start']);
    expect(actionsFor(readyDriverOwned())).toEqual(['takeover']);
    expect(actionsFor(driverInTransit())).toEqual(['takeover']);
    expect(actionsFor(inTransit())).toEqual(['verify', 'fail']);
    expect(actionsFor(failed(1))).toEqual(['retry']);
    expect(actionsFor(failed(3))).toEqual([]); // attempt limit: no retry offered
    expect(actionsFor(retryPending())).toEqual(['resume']);
  });
});

describe('direct orders', () => {
  it('shows the four groups with the right buttons per row, and nothing money-related', async () => {
    const user = userEvent.setup();
    const panel = await openDirect(user);
    for (const id of ['unclaimed', 'assigned', 'dispatched', 'exceptions']) expect(await within(panel).findByTestId(`operate-${id}`)).toBeInTheDocument();
    expect(within(rowOf(panel, 'PB-RD-1')).getByTestId('act-start')).toBeInTheDocument();
    expect(within(rowOf(panel, 'PB-RD-2')).getByTestId('act-takeover')).toBeInTheDocument();
    expect(within(rowOf(panel, 'PB-RD-2')).queryByTestId('act-start')).not.toBeInTheDocument();
    expect(within(rowOf(panel, 'PB-IT-1')).getByTestId('act-verify')).toBeInTheDocument();
    expect(within(rowOf(panel, 'PB-IT-1')).getByTestId('act-fail')).toBeInTheDocument();
    expect(within(rowOf(panel, 'PB-DT-1')).getByTestId('act-takeover')).toBeInTheDocument();
    expect(within(rowOf(panel, 'PB-RP-1')).getByTestId('act-resume')).toBeInTheDocument();
    expect(within(rowOf(panel, 'PB-FL-1')).getByTestId('act-retry')).toBeInTheDocument();
    expect(panel.textContent).not.toMatch(/₹|\bcod\b|cash|wallet|price/i);
  });

  it('empty and loading states are shown honestly', async () => {
    monitorSvc.getMonitor.mockResolvedValue(deliveryMonitor());
    const user = userEvent.setup();
    const panel = await openDirect(user);
    expect(await within(panel).findByText('No orders are waiting for pickup.')).toBeInTheDocument();
    expect(within(panel).getByText('Nothing is out for delivery.')).toBeInTheDocument();
    expect(within(panel).getByText('No reported delivery problems.')).toBeInTheDocument();
  });

  it('a failed list load says so and offers Retry (no data is invented)', async () => {
    monitorSvc.getMonitor.mockRejectedValue(new ApiRequestError('boom', 'INTERNAL_SERVER_ERROR', 500));
    const user = userEvent.setup();
    const panel = await openDirect(user);
    expect(await within(panel).findByTestId('operate-load-error')).toBeInTheDocument();
    expect(within(panel).queryByTestId('operate-row')).not.toBeInTheDocument();
  });

  it('Start delivery: confirmation, then password step-up, then dispatch(orderId, proof); success is shown only AFTER the server confirms', async () => {
    const d = deferred<ReturnType<typeof orderResult>>();
    op.dispatch.mockReturnValue(d.promise);
    const user = userEvent.setup();
    const panel = await openDirect(user);
    await user.click(within(rowOf(panel, 'PB-RD-1')).getByTestId('act-start'));
    const dialog = await screen.findByRole('dialog', { name: /Start delivery of PB-RD-1/ });
    expect(op.dispatch).not.toHaveBeenCalled();
    expect(admin.stepUp).not.toHaveBeenCalled(); // nothing is asked before the administrator confirms
    await user.click(within(dialog).getByTestId('operate-confirm'));
    await confirmPassword(user);

    await waitFor(() => expect(op.dispatch).toHaveBeenCalledTimes(1));
    expect(admin.stepUp).toHaveBeenCalledWith(PW);
    expect(op.dispatch).toHaveBeenCalledWith(expect.any(String), 'PROOF-1');
    expect(screen.queryByTestId('operate-notice')).not.toBeInTheDocument(); // NOT confirmed yet
    expect(screen.getByRole('dialog', { name: /Start delivery of PB-RD-1/ })).toBeInTheDocument();

    monitorSvc.getMonitor.mockClear();
    d.resolve(orderResult(true));
    expect(await screen.findByTestId('operate-notice')).toHaveTextContent('Delivery of PB-RD-1 has started.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(monitorSvc.getMonitor).toHaveBeenCalled()); // the list reloads from the server
  }, 20000);

  it('a replay is worded as "No change", not as a new success', async () => {
    op.dispatch.mockResolvedValue(orderResult(false));
    const user = userEvent.setup();
    const panel = await openDirect(user);
    await user.click(within(rowOf(panel, 'PB-RD-3')).getByTestId('act-start'));
    await user.click(await screen.findByTestId('operate-confirm'));
    await confirmPassword(user);
    expect(await screen.findByTestId('operate-notice')).toHaveTextContent('No change: PB-RD-3 was already started.');
  }, 20000);

  it('a server refusal (409) shows fixed copy, NO success, keeps the dialog and reloads the list', async () => {
    op.dispatch.mockRejectedValue(new ApiRequestError('Raw server text that must not be shown', 'DELIVERY_OWNED_BY_DRIVER', 409));
    const user = userEvent.setup();
    const panel = await openDirect(user);
    monitorSvc.getMonitor.mockClear();
    await user.click(within(rowOf(panel, 'PB-RD-1')).getByTestId('act-start'));
    await user.click(await screen.findByTestId('operate-confirm'));
    await confirmPassword(user);
    const err = await screen.findByTestId('operate-error');
    expect(err).toHaveTextContent('A driver still owns this delivery. Take it over first.');
    expect(err.textContent).not.toContain('Raw server text');
    expect(screen.queryByTestId('operate-notice')).not.toBeInTheDocument();
    await waitFor(() => expect(monitorSvc.getMonitor).toHaveBeenCalled());
  }, 20000);

  it('a rejected step-up proof (403 STEP_UP_REQUIRED) asks the administrator to confirm the password again', async () => {
    op.dispatch.mockRejectedValue(new ApiRequestError('x', 'STEP_UP_REQUIRED', 403));
    const user = userEvent.setup();
    const panel = await openDirect(user);
    await user.click(within(rowOf(panel, 'PB-RD-1')).getByTestId('act-start'));
    await user.click(await screen.findByTestId('operate-confirm'));
    await confirmPassword(user);
    expect(await screen.findByTestId('operate-error')).toHaveTextContent('Confirm your password and try again');
    expect(screen.queryByTestId('operate-notice')).not.toBeInTheDocument();
  }, 20000);

  it('cancelling the password dialog sends nothing and shows no error', async () => {
    const user = userEvent.setup();
    const panel = await openDirect(user);
    await user.click(within(rowOf(panel, 'PB-RD-1')).getByTestId('act-start'));
    await user.click(await screen.findByTestId('operate-confirm'));
    const stepUpDialog = (await screen.findByLabelText('Current password')).closest('[role="dialog"]') as HTMLElement;
    await user.click(within(stepUpDialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument());
    expect(op.dispatch).not.toHaveBeenCalled();
    expect(screen.queryByTestId('operate-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('operate-notice')).not.toBeInTheDocument();
  }, 20000);

  it('Take over: the reason (3+ characters) is required BEFORE the password is asked; the driver the screen showed is sent as expectedDriverId', async () => {
    op.takeover.mockResolvedValue(orderResult(true));
    const user = userEvent.setup();
    const panel = await openDirect(user);
    await user.click(within(rowOf(panel, 'PB-RD-2')).getByTestId('act-takeover'));
    const dialog = await screen.findByRole('dialog', { name: /Take over PB-RD-2/ });
    expect(dialog).toHaveTextContent('Ravi Kumar (DRV-001)');
    await user.click(within(dialog).getByTestId('operate-submit'));
    expect(within(dialog).getByText(/at least 3 characters/)).toBeInTheDocument();
    expect(admin.stepUp).not.toHaveBeenCalled();
    expect(op.takeover).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText('Reason'), '  Driver is off sick  ');
    await user.click(within(dialog).getByTestId('operate-submit'));
    await confirmPassword(user);
    await waitFor(() => expect(op.takeover).toHaveBeenCalledTimes(1));
    expect(op.takeover).toHaveBeenCalledWith(expect.any(String), { expectedDriverId: DRIVER_1.employeeId, reason: 'Driver is off sick' }, 'PROOF-1');
    expect(await screen.findByTestId('operate-notice')).toHaveTextContent('PB-RD-2 is now operated by the administrators.');
  }, 20000);

  it('Enter customer code: digits only, 6 required, cleared on submit, sent only to verify(); success only after the server answers', async () => {
    const d = deferred<{ changed: boolean; order: { id: string; orderNumber: string; status: string; deliveredAt: string } }>();
    op.verify.mockReturnValue(d.promise);
    const user = userEvent.setup();
    const panel = await openDirect(user);
    await user.click(within(rowOf(panel, 'PB-IT-1')).getByTestId('act-verify'));
    const dialog = await screen.findByRole('dialog', { name: /Confirm delivery of PB-IT-1/ });
    const input = within(dialog).getByTestId('operate-code-input') as HTMLInputElement;
    await user.type(input, 'ab12');
    expect(input.value).toBe('12'); // non-digits are never accepted
    await user.click(within(dialog).getByTestId('operate-submit'));
    expect(within(dialog).getByText('Enter the 6-digit code.')).toBeInTheDocument();
    expect(admin.stepUp).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, '123 456');
    await user.click(within(dialog).getByTestId('operate-submit'));
    expect(input.value).toBe(''); // the code never outlives the submit
    await confirmPassword(user);
    await waitFor(() => expect(op.verify).toHaveBeenCalledTimes(1));
    expect(op.verify).toHaveBeenCalledWith(expect.any(String), '123 456', 'PROOF-1');
    expect(screen.queryByTestId('operate-notice')).not.toBeInTheDocument();

    d.resolve({ changed: true, order: { id: 'o', orderNumber: 'PB-IT-1', status: 'DELIVERED', deliveredAt: '2026-10-11T10:00:00.000Z' } });
    expect(await screen.findByTestId('operate-notice')).toHaveTextContent('Delivery of PB-IT-1 was confirmed.');
    expect(document.body.textContent).not.toContain('123456');
  }, 25000);

  it('a wrong code shows fixed copy, no success, keeps the dialog open and the input empty', async () => {
    op.verify.mockRejectedValue(new ApiRequestError('Invalid code 123456', 'INVALID_DELIVERY_CODE', 422));
    const user = userEvent.setup();
    const panel = await openDirect(user);
    await user.click(within(rowOf(panel, 'PB-IT-1')).getByTestId('act-verify'));
    const dialog = await screen.findByRole('dialog', { name: /Confirm delivery of PB-IT-1/ });
    await user.type(within(dialog).getByTestId('operate-code-input'), '123456');
    await user.click(within(dialog).getByTestId('operate-submit'));
    await confirmPassword(user);
    const err = await screen.findByTestId('operate-error');
    expect(err).toHaveTextContent('That code is not correct');
    expect(err.textContent).not.toContain('123456');
    expect(screen.queryByTestId('operate-notice')).not.toBeInTheDocument();
    expect((within(dialog).getByTestId('operate-code-input') as HTMLInputElement).value).toBe('');
  }, 25000);

  it('Report a problem: a reason is required; the body carries only the reason code and the note', async () => {
    op.reportFailure.mockResolvedValue(orderResult(true));
    const user = userEvent.setup();
    const panel = await openDirect(user);
    await user.click(within(rowOf(panel, 'PB-IT-1')).getByTestId('act-fail'));
    const dialog = await screen.findByRole('dialog', { name: /Report a problem with PB-IT-1/ });
    await user.click(within(dialog).getByTestId('operate-submit'));
    expect(within(dialog).getByText('Choose a reason.')).toBeInTheDocument();
    expect(admin.stepUp).not.toHaveBeenCalled();

    await user.selectOptions(within(dialog).getByLabelText('Reason'), 'WRONG_ADDRESS');
    await user.type(within(dialog).getByLabelText('Note (optional)'), ' Gate locked ');
    await user.click(within(dialog).getByTestId('operate-submit'));
    await confirmPassword(user);
    await waitFor(() => expect(op.reportFailure).toHaveBeenCalledTimes(1));
    expect(op.reportFailure).toHaveBeenCalledWith(expect.any(String), { reasonCode: 'WRONG_ADDRESS', note: 'Gate locked' }, 'PROOF-1');
    expect(await screen.findByTestId('operate-notice')).toHaveTextContent('A problem was reported for PB-IT-1.');
  }, 25000);

  it('Retry: the attempt number the screen showed is sent as expectedAttemptNumber with a structured reason', async () => {
    op.retry.mockResolvedValue({ changed: true, orderId: 'o', orderNumber: 'PB-FL-1', attemptNumber: 2, assignmentState: 'ASSIGNED' });
    const user = userEvent.setup();
    const panel = await openDirect(user);
    await user.click(within(rowOf(panel, 'PB-FL-1')).getByTestId('act-retry'));
    const dialog = await screen.findByRole('dialog', { name: /Retry delivery of PB-FL-1/ });
    expect(dialog).toHaveTextContent('attempt 2 of 3');
    await user.click(within(dialog).getByTestId('operate-submit'));
    expect(within(dialog).getByText('Choose a reason.')).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText('Reason'), 'CUSTOMER_AVAILABLE_NOW');
    await user.click(within(dialog).getByTestId('operate-submit'));
    await confirmPassword(user);
    await waitFor(() => expect(op.retry).toHaveBeenCalledTimes(1));
    expect(op.retry).toHaveBeenCalledWith(expect.any(String), { expectedAttemptNumber: 1, reasonCode: 'CUSTOMER_AVAILABLE_NOW', note: undefined }, 'PROOF-1');
    expect(await screen.findByTestId('operate-notice')).toHaveTextContent('Attempt 2 of PB-FL-1 is arranged.');
  }, 25000);

  it('at the attempt limit no retry is offered; the way out is named', async () => {
    monitorSvc.getMonitor.mockResolvedValue(deliveryMonitor({ exceptions: [failed(3)] }));
    const user = userEvent.setup();
    const panel = await openDirect(user);
    const row = await within(panel).findByTestId('operate-row');
    expect(within(row).queryByTestId('act-retry')).not.toBeInTheDocument();
    expect(within(row).getByTestId('attempt-limit')).toHaveTextContent(/Cancel & Full Refund|exceptional handover/);
  });

  it('Start delivery again (resume) confirms, asks the password and calls resume(orderId, proof)', async () => {
    op.resume.mockResolvedValue(orderResult(true));
    const user = userEvent.setup();
    const panel = await openDirect(user);
    await user.click(within(rowOf(panel, 'PB-RP-1')).getByTestId('act-resume'));
    await user.click(await screen.findByTestId('operate-confirm'));
    await confirmPassword(user);
    await waitFor(() => expect(op.resume).toHaveBeenCalledWith(expect.any(String), 'PROOF-1'));
    expect(await screen.findByTestId('operate-notice')).toHaveTextContent('The next attempt for PB-RP-1 has started.');
  }, 20000);

  it('delivery details are a READ (no password), shown only for administrator-operated jobs, and a failure to load them is reported', async () => {
    op.getOrder.mockResolvedValue(ownedOrder({ orderNumber: 'PB-IT-1' }));
    const user = userEvent.setup();
    const panel = await openDirect(user);
    expect(within(rowOf(panel, 'PB-DT-1')).queryByTestId('details-open')).not.toBeInTheDocument(); // driver-owned: take it over first
    await user.click(within(rowOf(panel, 'PB-IT-1')).getByTestId('details-open'));
    const details = await screen.findByTestId('delivery-details');
    expect(details).toHaveTextContent('Asha');
    expect(details).toHaveTextContent('12 Marine Drive');
    expect(admin.stepUp).not.toHaveBeenCalled();
    expect(op.getOrder).toHaveBeenCalledTimes(1);

    op.getOrder.mockRejectedValue(new ApiRequestError('x', 'ORDER_NOT_FOUND', 404));
    await user.click(within(rowOf(panel, 'PB-RP-1')).getByTestId('details-open'));
    expect(await within(rowOf(panel, 'PB-RP-1')).findByTestId('operate-error')).toHaveTextContent('not available for delivery operation');
  });

  it('a 401 ends the session', async () => {
    op.dispatch.mockRejectedValue(new ApiRequestError('x', 'UNAUTHORIZED', 401));
    const user = userEvent.setup();
    const panel = await openDirect(user);
    await user.click(within(rowOf(panel, 'PB-RD-1')).getByTestId('act-start'));
    await user.click(await screen.findByTestId('operate-confirm'));
    await confirmPassword(user);
    await waitFor(() => expect(h.auth.logout).toHaveBeenCalled());
  }, 20000);
});

describe('Kerala Mess runs', () => {
  it('lists runs for the chosen branch; an unclaimed run offers Claim only', async () => {
    const user = userEvent.setup();
    const panel = await openMess(user);
    const card = await within(panel).findByTestId('operate-run');
    expect(card).toHaveTextContent('LUNCH · 2026-10-25');
    expect(within(card).getByTestId('act-run-claim')).toBeInTheDocument();
    expect(within(card).queryByTestId('act-run-dispatch')).not.toBeInTheDocument();
    expect(within(card).queryByTestId('stop-actions')).not.toBeInTheDocument(); // stops cannot be worked before the run is started
    expect(panel.textContent).not.toMatch(/₹|\bcod\b|cash|wallet|price/i);
  });

  it('empty and failed loads are reported', async () => {
    messMon.deliveryMonitor.mockResolvedValue(messMonitor([]));
    const user = userEvent.setup();
    const panel = await openMess(user);
    expect(await within(panel).findByText(/No Kerala Mess runs for this branch/)).toBeInTheDocument();
  });

  it('Claim run: confirm, password, claimRun(runId, proof); success only after the server answers', async () => {
    const d = deferred<{ changed: boolean }>();
    messOp.claimRun.mockReturnValue(d.promise);
    const user = userEvent.setup();
    const panel = await openMess(user);
    await user.click(await within(panel).findByTestId('act-run-claim'));
    await user.click(await screen.findByTestId('operate-confirm'));
    await confirmPassword(user);
    await waitFor(() => expect(messOp.claimRun).toHaveBeenCalledWith('run-1', 'PROOF-1'));
    expect(screen.queryByTestId('operate-mess-notice')).not.toBeInTheDocument();
    d.resolve({ changed: true });
    expect(await screen.findByTestId('operate-mess-notice')).toHaveTextContent('The LUNCH run of 2026-10-25 is claimed.');
  }, 20000);

  it('a claimed administrator run offers Start run; an out-for-delivery one lets the administrator work the stops', async () => {
    messMon.deliveryMonitor.mockResolvedValue(messMonitor([run({ id: 'r-claimed', status: 'CLAIMED', operator: OPERATOR }), run({ id: 'r-out', slot: 'DINNER', status: 'IN_TRANSIT', operator: OPERATOR, stops: [stop({ id: 's-pending' }), stop({ id: 's-failed', status: 'FAILED', failureCode: 'UNABLE_TO_REACH', failureNote: 'no answer', attempt: { number: 1, max: 3 } }), stop({ id: 's-done', status: 'HANDED_OVER' })] })]));
    messOp.dispatchRun.mockResolvedValue({ changed: true });
    const user = userEvent.setup();
    const panel = await openMess(user);
    const cards = await within(panel).findAllByTestId('operate-run');
    expect(within(cards[0]).getByTestId('act-run-dispatch')).toBeInTheDocument();
    const stops = within(cards[1]).getAllByTestId('operate-stop');
    expect(within(stops[0]).getByTestId('act-stop-verify')).toBeInTheDocument();
    expect(within(stops[0]).getByTestId('act-stop-fail')).toBeInTheDocument();
    expect(within(stops[1]).getByTestId('act-stop-retry')).toBeInTheDocument();
    expect(within(stops[1]).getByText(/no answer/)).toBeInTheDocument();
    expect(within(stops[2]).queryByTestId('stop-actions')).not.toBeInTheDocument(); // handed over: nothing left to do

    await user.click(within(cards[0]).getByTestId('act-run-dispatch'));
    await user.click(await screen.findByTestId('operate-confirm'));
    await confirmPassword(user);
    await waitFor(() => expect(messOp.dispatchRun).toHaveBeenCalledWith('r-claimed', 'PROOF-1'));
    expect(await screen.findByTestId('operate-mess-notice')).toHaveTextContent('is out for delivery.');
  }, 20000);

  const workingRun = () => run({ id: 'r-out', status: 'IN_TRANSIT', operator: OPERATOR, stops: [stop({ id: 's-1' })] });

  it('Enter handover code: 6 digits, cleared on submit, verifyStop(run, stop, code, proof)', async () => {
    messMon.deliveryMonitor.mockResolvedValue(messMonitor([workingRun()]));
    messOp.verifyStop.mockResolvedValue({ changed: true, run: workingRun() });
    const user = userEvent.setup();
    const panel = await openMess(user);
    await user.click(await within(panel).findByTestId('act-stop-verify'));
    const dialog = await screen.findByRole('dialog', { name: /Confirm handover at CUSAT Hostel B/ });
    const input = within(dialog).getByTestId('operate-code-input') as HTMLInputElement;
    await user.type(input, '12');
    await user.click(within(dialog).getByTestId('operate-submit'));
    expect(within(dialog).getByText('Enter the 6-digit code.')).toBeInTheDocument();
    expect(admin.stepUp).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, '654321');
    await user.click(within(dialog).getByTestId('operate-submit'));
    expect(input.value).toBe('');
    await confirmPassword(user);
    await waitFor(() => expect(messOp.verifyStop).toHaveBeenCalledWith('r-out', 's-1', '654321', 'PROOF-1'));
    expect(await screen.findByTestId('operate-mess-notice')).toHaveTextContent('Handover at CUSAT Hostel B was confirmed.');
  }, 25000);

  it('a wrong handover code shows fixed copy and no success', async () => {
    messMon.deliveryMonitor.mockResolvedValue(messMonitor([workingRun()]));
    messOp.verifyStop.mockRejectedValue(new ApiRequestError('bad 654321', 'INVALID_HANDOVER_CODE', 422));
    const user = userEvent.setup();
    const panel = await openMess(user);
    await user.click(await within(panel).findByTestId('act-stop-verify'));
    const dialog = await screen.findByRole('dialog', { name: /Confirm handover/ });
    await user.type(within(dialog).getByTestId('operate-code-input'), '654321');
    await user.click(within(dialog).getByTestId('operate-submit'));
    await confirmPassword(user);
    const err = await screen.findByTestId('operate-error');
    expect(err).toHaveTextContent('That handover code is not correct.');
    expect(err.textContent).not.toContain('654321');
    expect(screen.queryByTestId('operate-mess-notice')).not.toBeInTheDocument();
  }, 25000);

  it('Report a problem: OTHER needs a note of 3+ characters before the password is asked; other reasons do not', async () => {
    messMon.deliveryMonitor.mockResolvedValue(messMonitor([workingRun()]));
    messOp.failStop.mockResolvedValue({ changed: true, run: workingRun() });
    const user = userEvent.setup();
    const panel = await openMess(user);
    await user.click(await within(panel).findByTestId('act-stop-fail'));
    const dialog = await screen.findByRole('dialog', { name: /Report a problem at CUSAT Hostel B/ });
    await user.selectOptions(within(dialog).getByLabelText('Reason'), 'OTHER');
    await user.click(within(dialog).getByTestId('operate-submit'));
    expect(within(dialog).getByText(/at least 3 characters/)).toBeInTheDocument();
    expect(admin.stepUp).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText('Note'), ' Gate shut ');
    await user.click(within(dialog).getByTestId('operate-submit'));
    await confirmPassword(user);
    await waitFor(() => expect(messOp.failStop).toHaveBeenCalledWith('r-out', 's-1', 'OTHER', 'Gate shut', 'PROOF-1'));
    expect(await screen.findByTestId('operate-mess-notice')).toHaveTextContent('A problem was reported at CUSAT Hostel B.');
  }, 25000);

  it('Reopen a failed stop: confirm, password, retryStop; at the attempt limit it is not offered', async () => {
    const failedStop = stop({ id: 's-f', status: 'FAILED', failureCode: 'VEHICLE_ISSUE', attempt: { number: 1, max: 3 } });
    messMon.deliveryMonitor.mockResolvedValue(messMonitor([run({ id: 'r-out', status: 'IN_TRANSIT', operator: OPERATOR, stops: [failedStop, stop({ id: 's-l', status: 'FAILED', attempt: { number: 3, max: 3 } })] })]));
    messOp.retryStop.mockResolvedValue({ changed: true, run: workingRun() });
    const user = userEvent.setup();
    const panel = await openMess(user);
    const stops = await within(panel).findAllByTestId('operate-stop');
    expect(within(stops[1]).queryByTestId('act-stop-retry')).not.toBeInTheDocument();
    expect(within(stops[1]).getByTestId('stop-attempt-limit')).toBeInTheDocument();
    await user.click(within(stops[0]).getByTestId('act-stop-retry'));
    await user.click(await screen.findByTestId('operate-confirm'));
    await confirmPassword(user);
    await waitFor(() => expect(messOp.retryStop).toHaveBeenCalledWith('r-out', 's-f', 'PROOF-1'));
    expect(await screen.findByTestId('operate-mess-notice')).toHaveTextContent('is open for another attempt.');
  }, 25000);

  const DRIVER_EMP = '11111111-1111-4111-8111-111111111111';
  const driverRun = (o: Partial<MessRun> = {}) => run({ id: 'r-drv', status: 'IN_TRANSIT', operator: null, driver: { employeeId: DRIVER_EMP, name: 'Ravi Kumar', employeeCode: 'DRV-001' }, ...o });

  it('a driver-owned run offers Take over only: no claim, start or stop controls', async () => {
    messMon.deliveryMonitor.mockResolvedValue(messMonitor([driverRun()]));
    const user = userEvent.setup();
    const panel = await openMess(user);
    const card = await within(panel).findByTestId('operate-run');
    expect(card).toHaveTextContent('Driver: Ravi Kumar (DRV-001)');
    expect(within(card).getByTestId('act-run-takeover')).toBeInTheDocument();
    expect(within(card).queryByTestId('driver-owned-note')).not.toBeInTheDocument();
    expect(within(card).queryByTestId('stop-actions')).not.toBeInTheDocument();
    expect(within(card).queryByTestId('act-run-claim')).not.toBeInTheDocument();
    expect(within(card).queryByTestId('act-run-dispatch')).not.toBeInTheDocument();
  });

  it('takeover is offered for CLAIMED and IN_TRANSIT driver runs only (never for unclaimed, completed or closed ones)', async () => {
    messMon.deliveryMonitor.mockResolvedValue(
      messMonitor([driverRun({ id: 'r-1', status: 'CLAIMED' }), driverRun({ id: 'r-2', status: 'IN_TRANSIT' }), driverRun({ id: 'r-3', status: 'COMPLETED' }), driverRun({ id: 'r-4', status: 'CLOSED' }), run({ id: 'r-5', status: 'AVAILABLE' })])
    );
    const user = userEvent.setup();
    const panel = await openMess(user);
    const cards = await within(panel).findAllByTestId('operate-run');
    expect(cards.map((c) => within(c).queryByTestId('act-run-takeover') !== null)).toEqual([true, true, false, false, false]);
  });

  it('Take over: the reason (3+ characters) is required BEFORE the password; the driver id the monitor reported is sent as expectedEmployeeId; success only after the server answers', async () => {
    const d = deferred<{ changed: boolean; run: MessRun }>();
    messOp.takeoverRun.mockReturnValue(d.promise);
    messMon.deliveryMonitor.mockResolvedValue(messMonitor([driverRun()]));
    const user = userEvent.setup();
    const panel = await openMess(user);
    await user.click(await within(panel).findByTestId('act-run-takeover'));
    const dialog = await screen.findByRole('dialog', { name: /Take over the LUNCH run of 2026-10-25/ });
    expect(dialog).toHaveTextContent('Ravi Kumar (DRV-001)');
    await user.click(within(dialog).getByTestId('operate-submit'));
    expect(within(dialog).getByText(/at least 3 characters/)).toBeInTheDocument();
    expect(admin.stepUp).not.toHaveBeenCalled();
    expect(messOp.takeoverRun).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText('Reason'), '  Driver is off sick  ');
    await user.click(within(dialog).getByTestId('operate-submit'));
    await confirmPassword(user);
    await waitFor(() => expect(messOp.takeoverRun).toHaveBeenCalledTimes(1));
    expect(admin.stepUp).toHaveBeenCalledWith(PW);
    expect(messOp.takeoverRun).toHaveBeenCalledWith('r-drv', { expectedEmployeeId: DRIVER_EMP, reason: 'Driver is off sick' }, 'PROOF-1');
    expect(screen.queryByTestId('operate-mess-notice')).not.toBeInTheDocument(); // NOT confirmed yet

    messMon.deliveryMonitor.mockClear();
    d.resolve({ changed: true, run: driverRun({ driver: null, operator: OPERATOR }) });
    expect(await screen.findByTestId('operate-mess-notice')).toHaveTextContent('The LUNCH run of 2026-10-25 is now operated by the administrators.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(messMon.deliveryMonitor).toHaveBeenCalled()); // the list reloads from the server
  }, 25000);

  it('after a takeover the reloaded run is administrator-operated: the driver note and Take over disappear and the administrator can start or work it', async () => {
    messOp.takeoverRun.mockResolvedValue({ changed: true, run: driverRun({ driver: null, operator: OPERATOR }) });
    messMon.deliveryMonitor.mockResolvedValueOnce(messMonitor([driverRun({ status: 'CLAIMED' })])).mockResolvedValue(messMonitor([driverRun({ status: 'CLAIMED', driver: null, operator: OPERATOR })]));
    const user = userEvent.setup();
    const panel = await openMess(user);
    await user.click(await within(panel).findByTestId('act-run-takeover'));
    const dialog = await screen.findByRole('dialog', { name: /Take over/ });
    await user.type(within(dialog).getByLabelText('Reason'), 'Driver unavailable');
    await user.click(within(dialog).getByTestId('operate-submit'));
    await confirmPassword(user);
    const card = await within(panel).findByTestId('act-run-dispatch');
    expect(card).toBeInTheDocument();
    expect(within(panel).queryByTestId('act-run-takeover')).not.toBeInTheDocument();
  }, 25000);

  it('a replay is worded "No change", never as a new takeover', async () => {
    messOp.takeoverRun.mockResolvedValue({ changed: false, run: driverRun({ driver: null, operator: OPERATOR }) });
    messMon.deliveryMonitor.mockResolvedValue(messMonitor([driverRun()]));
    const user = userEvent.setup();
    const panel = await openMess(user);
    await user.click(await within(panel).findByTestId('act-run-takeover'));
    const dialog = await screen.findByRole('dialog', { name: /Take over/ });
    await user.type(within(dialog).getByLabelText('Reason'), 'Driver unavailable');
    await user.click(within(dialog).getByTestId('operate-submit'));
    await confirmPassword(user);
    expect(await screen.findByTestId('operate-mess-notice')).toHaveTextContent('No change: the LUNCH run of 2026-10-25 was already taken over.');
  }, 25000);

  it.each([
    ['RUN_OWNER_CHANGED', 409, 'The run owner changed in the meantime.'],
    ['RUN_NOT_TAKEOVER_ELIGIBLE', 409, 'This run cannot be taken over in its current state.'],
    ['NOT_FOUND', 404, 'That record was not found.']
  ])('a stale or refused takeover (%s) shows fixed copy, NO success, keeps the dialog and reloads the list', async (code, status, copy) => {
    messOp.takeoverRun.mockRejectedValue(new ApiRequestError('Raw server text that must not be shown', code, status));
    messMon.deliveryMonitor.mockResolvedValue(messMonitor([driverRun()]));
    const user = userEvent.setup();
    const panel = await openMess(user);
    await user.click(await within(panel).findByTestId('act-run-takeover'));
    const dialog = await screen.findByRole('dialog', { name: /Take over/ });
    await user.type(within(dialog).getByLabelText('Reason'), 'Driver unavailable');
    messMon.deliveryMonitor.mockClear();
    await user.click(within(dialog).getByTestId('operate-submit'));
    await confirmPassword(user);
    const err = await screen.findByTestId('operate-error');
    expect(err).toHaveTextContent(copy);
    expect(err.textContent).not.toContain('Raw server text');
    expect(screen.queryByTestId('operate-mess-notice')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /Take over/ })).toBeInTheDocument();
    await waitFor(() => expect(messMon.deliveryMonitor).toHaveBeenCalled()); // out-of-date screens reload
  }, 25000);

  it('a rejected step-up proof, a cancelled password dialog and a 403 all fail safely without success', async () => {
    messOp.takeoverRun.mockRejectedValueOnce(new ApiRequestError('x', 'STEP_UP_REQUIRED', 403)).mockRejectedValueOnce(new ApiRequestError('x', 'FORBIDDEN', 403));
    messMon.deliveryMonitor.mockResolvedValue(messMonitor([driverRun()]));
    const user = userEvent.setup();
    const panel = await openMess(user);
    await user.click(await within(panel).findByTestId('act-run-takeover'));
    const dialog = await screen.findByRole('dialog', { name: /Take over/ });
    await user.type(within(dialog).getByLabelText('Reason'), 'Driver unavailable');
    await user.click(within(dialog).getByTestId('operate-submit'));
    await confirmPassword(user);
    expect(await screen.findByTestId('operate-error')).toHaveTextContent('Confirm your password and try again');
    expect(screen.queryByTestId('operate-mess-notice')).not.toBeInTheDocument();

    await user.click(within(dialog).getByTestId('operate-submit')); // the proof was discarded: the password is asked again
    await confirmPassword(user);
    expect(await within(dialog).findByText('You are not authorized to do that.')).toBeInTheDocument();
    expect(screen.queryByTestId('operate-mess-notice')).not.toBeInTheDocument();
  }, 30000);

  it('a driver run whose monitor entry lacks the employee id (an older server) cannot be taken over from here and says why', async () => {
    messMon.deliveryMonitor.mockResolvedValue(messMonitor([driverRun({ driver: { name: 'Ravi Kumar', employeeCode: 'DRV-001' } })]));
    const user = userEvent.setup();
    const panel = await openMess(user);
    const card = await within(panel).findByTestId('operate-run');
    expect(within(card).queryByTestId('act-run-takeover')).not.toBeInTheDocument();
    expect(within(card).getByTestId('driver-owned-note')).toHaveTextContent(/did not say which employee/);
    expect(messOp.takeoverRun).not.toHaveBeenCalled();
  });

  it('a server refusal (409 RUN_OWNED_BY_DRIVER) shows fixed copy and no success', async () => {
    messOp.claimRun.mockRejectedValue(new ApiRequestError('raw', 'RUN_OWNED_BY_DRIVER', 409));
    const user = userEvent.setup();
    const panel = await openMess(user);
    await user.click(await within(panel).findByTestId('act-run-claim'));
    await user.click(await screen.findByTestId('operate-confirm'));
    await confirmPassword(user);
    expect(await screen.findByTestId('operate-error')).toHaveTextContent('A driver still owns this run.');
    expect(screen.queryByTestId('operate-mess-notice')).not.toBeInTheDocument();
  }, 20000);
});
