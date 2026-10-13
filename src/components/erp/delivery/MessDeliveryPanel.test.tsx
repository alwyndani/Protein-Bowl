import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../services/messService', () => ({
  MessService: { deliveryRuns: vi.fn(), claimRun: vi.fn(), dispatchRun: vi.fn(), verifyStop: vi.fn(), failStop: vi.fn(), retryStop: vi.fn() }
}));

import { MessService } from '../../../services/messService';
import { ApiRequestError } from '../../../services/apiClient';
import { MessDeliveryPanel } from './MessDeliveryPanel';
import { messRun, stop } from '../../../test/messFixtures';

const svc = vi.mocked(MessService);
const runs = (over: { available?: ReturnType<typeof messRun>[]; mine?: ReturnType<typeof messRun>[] } = {}) => ({ serverTime: '2026-10-20T05:30:00.000Z', today: '2026-10-20', available: over.available ?? [], mine: over.mine ?? [] });
beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  svc.deliveryRuns.mockResolvedValue(runs({ mine: [messRun()] }));
});

describe('Kerala Mess delivery (DELIVERY employee)', () => {
  it('shows service-point stops with the FROZEN quantity, address and instructions, and NO customer / payment / cash data', async () => {
    render(<MessDeliveryPanel />);
    const a1 = await screen.findByTestId('mess-stop-Hostel A1');
    expect(within(a1).getByTestId('mess-stop-quantity')).toHaveTextContent('3 meals');
    expect(a1).toHaveTextContent('CUSAT Campus, Kochi 682022');
    expect(within(a1).getByTestId('mess-stop-instructions')).toHaveTextContent('Ring the bell twice');
    expect(a1).toHaveTextContent('Attempt 1 of 3');
    expect(screen.getByTestId('mess-stop-Hostel B2')).toHaveTextContent('1 meals');
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/room|phone|student|@|customer/i);
    expect(text).not.toMatch(/payment|cash|collect|refund|wallet|price|₹/i);
    expect(text).not.toMatch(/COD/);
    expect(svc.deliveryRuns).toHaveBeenCalledWith(); // the server scopes the branches: the client never sends one
  });

  it('claim: an available run is claimed with ONE request even on a double click; another driver\'s win is explained, not retried', async () => {
    const user = userEvent.setup();
    svc.deliveryRuns.mockResolvedValue(runs({ available: [messRun({ status: 'AVAILABLE', claimedAt: null, dispatchedAt: null })] }));
    svc.claimRun.mockImplementation(() => new Promise((r) => setTimeout(() => r({ changed: true }), 40)));
    render(<MessDeliveryPanel />);
    await user.dblClick(await screen.findByRole('button', { name: 'Claim this run' }));
    await waitFor(() => expect(svc.claimRun).toHaveBeenCalledTimes(1));
    expect(svc.claimRun).toHaveBeenCalledWith('run-1');
    svc.claimRun.mockRejectedValue(new ApiRequestError('raw internal text', 'ALREADY_CLAIMED', 409));
    await user.click(await screen.findByRole('button', { name: 'Claim this run' }));
    const err = await screen.findByTestId('mess-delivery-error');
    expect(err).toHaveTextContent('Another driver has already claimed this run.');
    expect(err.textContent).not.toContain('raw internal text');
  });

  it('a claimed run is started with an empty request', async () => {
    const user = userEvent.setup();
    svc.deliveryRuns.mockResolvedValue(runs({ mine: [messRun({ status: 'CLAIMED', dispatchedAt: null })] }));
    svc.dispatchRun.mockResolvedValue({ changed: true });
    render(<MessDeliveryPanel />);
    await user.click(await screen.findByRole('button', { name: 'Start the run (food loaded)' }));
    await waitFor(() => expect(svc.dispatchRun).toHaveBeenCalledWith('run-1'));
  });

  it('handover: the code is typed by the driver, sent once, cleared at once, and never stored; the driver is told they cannot see it', async () => {
    const user = userEvent.setup();
    svc.verifyStop.mockResolvedValue({ changed: true });
    render(<MessDeliveryPanel />);
    const card = await screen.findByTestId('mess-stop-Hostel A1');
    expect(card).toHaveTextContent('You cannot see the code yourself');
    const confirm = within(card).getByRole('button', { name: 'Confirm handover' });
    expect(confirm).toBeDisabled();
    const input = within(card).getByLabelText('Handover code') as HTMLInputElement;
    await user.type(input, '12ab34 56x');
    expect(input.value).toBe('1234 56');
    await user.click(confirm);
    await waitFor(() => expect(svc.verifyStop).toHaveBeenCalledWith('run-1', 'stop-1', '1234 56'));
    expect(input.value).toBe('');
    expect(JSON.stringify({ ...window.localStorage })).not.toContain('123456');
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain('123456');
    expect(document.body.textContent).not.toContain('123456');
  });

  it('a wrong code and a locked code show fixed, non-leaking copy', async () => {
    const user = userEvent.setup();
    render(<MessDeliveryPanel />);
    const card = await screen.findByTestId('mess-stop-Hostel A1');
    svc.verifyStop.mockRejectedValueOnce(new ApiRequestError('Detail: the code was 654321', 'INVALID_HANDOVER_CODE', 422));
    await user.type(within(card).getByLabelText('Handover code'), '111111');
    await user.click(within(card).getByRole('button', { name: 'Confirm handover' }));
    expect(await screen.findByTestId('mess-delivery-error')).toHaveTextContent('That handover code is not correct.');
    expect(document.body.textContent).not.toContain('654321');
    svc.verifyStop.mockRejectedValueOnce(new ApiRequestError('x', 'HANDOVER_CODE_LOCKED', 409));
    await user.type(within(card).getByLabelText('Handover code'), '222222');
    await user.click(within(card).getByRole('button', { name: 'Confirm handover' }));
    await waitFor(() => expect(screen.getByTestId('mess-delivery-error')).toHaveTextContent('Code entry is locked'));
  });

  it('reporting a problem: a fixed reason, a note only for OTHER, and the dialog says it only records what happened', async () => {
    const user = userEvent.setup();
    svc.failStop.mockResolvedValue({ changed: true });
    render(<MessDeliveryPanel />);
    const card = await screen.findByTestId('mess-stop-Hostel A1');
    await user.click(within(card).getByRole('button', { name: 'Report a problem' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('This only records what happened');
    const submit = within(dialog).getByRole('button', { name: 'Report problem' });
    expect(submit).toBeDisabled();
    await user.selectOptions(within(dialog).getByLabelText('What happened?'), 'OTHER');
    expect(submit).toBeDisabled(); // OTHER needs a note
    await user.type(within(dialog).getByLabelText(/Note/), 'Gate locked after calls');
    await user.click(submit);
    await waitFor(() => expect(svc.failStop).toHaveBeenCalledWith('run-1', 'stop-1', 'OTHER', 'Gate locked after calls'));
  });

  it('a failed stop can be retried while attempts remain; at the limit it says the team closes it at the end of the day', async () => {
    const user = userEvent.setup();
    svc.retryStop.mockResolvedValue({ changed: true });
    svc.deliveryRuns.mockResolvedValue(
      runs({ mine: [messRun({ stops: [stop({ status: 'FAILED', failureCode: 'RECIPIENT_UNAVAILABLE', attempt: { number: 1, max: 3 } }), stop({ id: 'stop-3', status: 'FAILED', failureCode: 'VEHICLE_ISSUE', attempt: { number: 3, max: 3 }, servicePoint: { name: 'Hostel C3', gateLabel: null, addressLine: 'X', city: 'Kochi', postalCode: '1', deliveryInstructions: null } })] })] })
    );
    render(<MessDeliveryPanel />);
    const first = await screen.findByTestId('mess-stop-Hostel A1');
    await user.click(within(first).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(svc.retryStop).toHaveBeenCalledWith('run-1', 'stop-1'));
    const last = screen.getByTestId('mess-stop-Hostel C3');
    expect(within(last).queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(last).toHaveTextContent('No more attempts');
    // the driver has no way to close a stop
    expect(document.body.textContent).not.toMatch(/close this stop|mark as undelivered/i);
    expect(screen.queryByRole('button', { name: /close|undeliver/i })).toBeNull();
  });

  it('terminal states are read-only: handed over, closed, completed runs show no action', async () => {
    svc.deliveryRuns.mockResolvedValue(runs({ mine: [messRun({ status: 'CLOSED', stops: [stop({ status: 'HANDED_OVER' }), stop({ id: 'stop-2', status: 'CLOSED_UNDELIVERED', servicePoint: { name: 'Hostel B2', gateLabel: null, addressLine: 'x', city: 'y', postalCode: '1', deliveryInstructions: null } })] })] }));
    render(<MessDeliveryPanel />);
    expect(await screen.findByTestId('mess-stop-Hostel A1')).toHaveTextContent('Handed over');
    expect(screen.getByTestId('mess-stop-Hostel B2')).toHaveTextContent('Closed: not delivered');
    expect(screen.queryByRole('button', { name: /Confirm handover|Report a problem|Try again|Claim|Start the run/ })).toBeNull();
  });

  it('a session that expired is reported to the shell and polling stops', async () => {
    const expired = vi.fn();
    svc.deliveryRuns.mockRejectedValue(new ApiRequestError('x', 'UNAUTHORIZED', 401));
    render(<MessDeliveryPanel onSessionExpired={expired} />);
    await waitFor(() => expect(expired).toHaveBeenCalled());
  });
});
