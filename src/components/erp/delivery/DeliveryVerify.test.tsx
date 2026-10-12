import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../services/deliveryService', () => ({
  DeliveryService: { getQueue: vi.fn(), act: vi.fn(), reportFailure: vi.fn(), verifyDelivery: vi.fn(), overrideDelivery: vi.fn(), getMonitor: vi.fn(), listDrivers: vi.fn(), assign: vi.fn() }
}));

import { DeliveryService } from '../../../services/deliveryService';
import { ApiRequestError } from '../../../services/apiClient';
import { DeliveryWorkspace } from './DeliveryWorkspace';
import { driverQueue, outOrder } from '../../../test/deliveryFixtures';
import type { DeliveryOwnedOrder } from '../../../services/deliveryTypes';

const getQueue = vi.mocked(DeliveryService.getQueue);
const verify = vi.mocked(DeliveryService.verifyDelivery);
const CODE = '482913';

const withProof = (state: NonNullable<DeliveryOwnedOrder['proof']>['state'], lockedUntil: string | null = null, over: Partial<DeliveryOwnedOrder> = {}) =>
  outOrder({ orderNumber: 'PB-VERIFY-1', proof: { state, lockedUntil }, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  getQueue.mockResolvedValue(driverQueue({ out: [withProof('READY_FOR_VERIFICATION')] }));
  verify.mockResolvedValue({ changed: true, order: { id: 'x', orderNumber: 'PB-VERIFY-1', status: 'DELIVERED', deliveredAt: '2026-10-11T10:00:00.000Z' } });
});

describe('driver Delivery Code verification (own out-for-delivery order)', () => {
  it('shows a labelled numeric code field and "Verify & complete delivery"; there is no other way to complete a delivery, and no money control', async () => {
    render(<DeliveryWorkspace />);
    const input = (await screen.findByLabelText('Customer delivery code')) as HTMLInputElement;
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveAttribute('autocomplete', 'off');
    expect(input.className).toMatch(/min-h-11/);
    const button = screen.getByRole('button', { name: 'Verify and complete delivery PB-VERIFY-1' });
    expect(button.className).toMatch(/min-h-11/);
    expect(screen.getByTestId('delivery-code-hint')).toHaveTextContent(/ask the customer for the 6-digit code/i);
    expect(document.body.textContent).not.toMatch(/mark(ed)? (as )?delivered|\bcod\b|cash|payment|refund|₹|price|amount/i);
    const labels = screen.getAllByRole('button').map((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').toLowerCase());
    expect(labels.filter((l) => /deliver/.test(l) && !/start delivery|collected|verify and complete delivery|out for delivery/.test(l))).toEqual([]);
  });

  it('submits the NORMALIZED-by-server input exactly once (double click), then clears the field: the code never stays in the page', async () => {
    let finish!: () => void;
    verify.mockImplementation(() => new Promise((res) => (finish = () => res({ changed: true, order: { id: 'x', orderNumber: 'PB-VERIFY-1', status: 'DELIVERED', deliveredAt: 'x' } }))));
    render(<DeliveryWorkspace />);
    const input = (await screen.findByLabelText('Customer delivery code')) as HTMLInputElement;
    await userEvent.type(input, '482 913');
    expect(input.value).toBe('482 913');
    getQueue.mockResolvedValue(driverQueue()); // after completion the order leaves the list
    await userEvent.dblClick(screen.getByTestId('delivery-verify'));
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledWith(expect.any(String), '482 913');
    expect(input.value).toBe('');
    expect(screen.getByTestId('delivery-verify')).toBeDisabled();
    finish();
    await waitFor(() => expect(screen.queryByTestId('delivery-card')).not.toBeInTheDocument());
    expect(document.body.textContent).not.toContain(CODE);
  });

  it('input rules: only digits / space / hyphen are accepted, paste works, and anything that is not 6 digits is refused locally (role=alert) without a request', async () => {
    render(<DeliveryWorkspace />);
    const input = (await screen.findByLabelText('Customer delivery code')) as HTMLInputElement;
    await userEvent.type(input, 'ab12-3x4');
    expect(input.value).toBe('12-34');
    await userEvent.click(screen.getByTestId('delivery-verify'));
    expect((await screen.findAllByRole('alert')).some((a) => /6-digit delivery code/i.test(a.textContent ?? ''))).toBe(true);
    expect(verify).not.toHaveBeenCalled();
    await userEvent.clear(input);
    await userEvent.click(input);
    await userEvent.paste('123-456');
    expect(input.value).toBe('123-456');
    await userEvent.click(screen.getByTestId('delivery-verify'));
    expect(verify).toHaveBeenCalledWith(expect.any(String), '123-456');
  });

  it('a WRONG code shows safe mapped copy (never the raw backend text, never the submitted code) and the field is emptied for a retry', async () => {
    verify.mockRejectedValue(new ApiRequestError(`The delivery code ${CODE} is not correct SQL`, 'INVALID_DELIVERY_CODE', 422));
    render(<DeliveryWorkspace />);
    const input = (await screen.findByLabelText('Customer delivery code')) as HTMLInputElement;
    await userEvent.type(input, CODE);
    await userEvent.click(screen.getByTestId('delivery-verify'));
    const card = await screen.findByTestId('delivery-card');
    const alert = await screen.findByText(/that code is not correct/i);
    expect(alert).toBeInTheDocument();
    expect(card.textContent).not.toMatch(/SQL/);
    expect(document.body.textContent).not.toContain(CODE);
    expect(input.value).toBe('');
  });

  it.each([
    ['DELIVERY_CODE_NOT_ISSUED', 409, /has not generated a delivery code/i],
    ['DELIVERY_CODE_LOCKED', 409, /locked for a while/i],
    ['DELIVERY_CODE_BLOCKED', 409, /must generate a new delivery code/i],
    ['DELIVERY_CODE_CHANGED', 409, /generated a new delivery code/i],
    ['DELIVERY_IN_EXCEPTION', 409, /problem was reported/i],
    ['ORDER_NOT_OPERATIONALLY_ELIGIBLE', 409, /cannot be taken for delivery right now/i],
    ['ALREADY_DELIVERED', 409, /already been completed/i],
    ['ORDER_NOT_FOUND', 404, /no longer available to you/i]
  ])('%s is mapped to safe copy and the list refreshes (a stale card heals itself)', async (code, status, copy) => {
    verify.mockRejectedValue(new ApiRequestError('RAW BACKEND TEXT', code, status));
    render(<DeliveryWorkspace />);
    await userEvent.type(await screen.findByLabelText('Customer delivery code'), CODE);
    const before = getQueue.mock.calls.length;
    await userEvent.click(screen.getByTestId('delivery-verify'));
    expect(await screen.findByText(copy)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/RAW BACKEND TEXT/);
    await waitFor(() => expect(getQueue.mock.calls.length).toBeGreaterThan(before));
  });

  it('network and server failures are safe and keep the card; a dead session is reported', async () => {
    const onSessionExpired = vi.fn();
    verify.mockRejectedValueOnce(new ApiRequestError('x', 'NETWORK_ERROR'));
    render(<DeliveryWorkspace onSessionExpired={onSessionExpired} />);
    const input = await screen.findByLabelText('Customer delivery code');
    await userEvent.type(input, CODE);
    await userEvent.click(screen.getByTestId('delivery-verify'));
    expect(await screen.findByText(/could not reach the server/i)).toBeInTheDocument();
    verify.mockRejectedValueOnce(new ApiRequestError('expired', 'INVALID_TOKEN', 401));
    await userEvent.type(input, CODE);
    await userEvent.click(screen.getByTestId('delivery-verify'));
    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1));
  });

  it('proof states drive the form: not issued -> instruction; LOCKED -> disabled with the unlock time; BLOCKED -> disabled; no counters are ever shown', async () => {
    getQueue.mockResolvedValue(driverQueue({ out: [withProof('CODE_NOT_ISSUED')] }));
    const a = render(<DeliveryWorkspace />);
    expect(await screen.findByTestId('delivery-code-hint')).toHaveTextContent(/has not generated a code yet/i);
    a.unmount();

    getQueue.mockResolvedValue(driverQueue({ out: [withProof('LOCKED', '2026-10-11T10:15:00.000Z')] }));
    const b = render(<DeliveryWorkspace />);
    expect(await screen.findByTestId('delivery-code-hint')).toHaveTextContent(/locked until/i);
    expect(screen.getByTestId('delivery-code-input')).toBeDisabled();
    expect(screen.getByTestId('delivery-verify')).toBeDisabled();
    b.unmount();

    getQueue.mockResolvedValue(driverQueue({ out: [withProof('CODE_BLOCKED')] }));
    render(<DeliveryWorkspace />);
    expect(await screen.findByTestId('delivery-code-hint')).toHaveTextContent(/blocked/i);
    expect(screen.getByTestId('delivery-code-input')).toBeDisabled();
    expect(document.body.textContent).not.toMatch(/attempt|remaining|guess/i);
  });

  it('a FAILED / issue-reported delivery has NO code form (the exception must be resolved by the team); only the exception notice remains', async () => {
    getQueue.mockResolvedValue(driverQueue({ out: [withProof('READY_FOR_VERIFICATION', null, { assignment: { state: 'FAILED', pickupTime: '2026-10-11T09:05:00.000Z', issueReported: true, attemptNumber: 1, maxAttempts: 3 } })] }));
    render(<DeliveryWorkspace />);
    expect(await screen.findByTestId('delivery-issue-reported')).toHaveTextContent(/awaiting review/i);
    expect(screen.queryByLabelText('Customer delivery code')).not.toBeInTheDocument();
    expect(screen.queryByTestId('delivery-verify')).not.toBeInTheDocument();
  });

  it('the code is never written to storage or the console', async () => {
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    verify.mockRejectedValue(new ApiRequestError('no', 'INVALID_DELIVERY_CODE', 422));
    render(<DeliveryWorkspace />);
    await userEvent.type(await screen.findByLabelText('Customer delivery code'), CODE);
    await userEvent.click(screen.getByTestId('delivery-verify'));
    await screen.findByText(/that code is not correct/i);
    expect(setItem).not.toHaveBeenCalled();
    for (const spy of logs) expect(JSON.stringify(spy.mock.calls)).not.toContain(CODE);
  });
});
