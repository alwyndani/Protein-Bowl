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
const act = vi.mocked(DeliveryService.act);

const retryAssigned = (over: Partial<DeliveryOwnedOrder> = {}) =>
  outOrder({
    orderNumber: 'PB-RETRY-1',
    assignment: { state: 'ASSIGNED', pickupTime: null, issueReported: false, attemptNumber: 2, maxAttempts: 3 },
    proof: { state: 'CODE_NOT_ISSUED', lockedUntil: null },
    ...over
  });

beforeEach(() => {
  vi.clearAllMocks();
  getQueue.mockResolvedValue(driverQueue({ out: [retryAssigned()] }));
  act.mockResolvedValue({ changed: true, order: retryAssigned({ assignment: { state: 'IN_TRANSIT', pickupTime: '2026-10-12T09:00:00.000Z', issueReported: false, attemptNumber: 2, maxAttempts: 3 } }) });
});

describe('driver: retry assigned (P9C) -> "Start delivery again"', () => {
  it('a retry that was arranged shows "Retry assigned", the attempt number and ONE next step; no code form, no report button, no money control', async () => {
    render(<DeliveryWorkspace />);
    const card = await screen.findByTestId('delivery-card');
    expect(card).toHaveTextContent('Retry assigned');
    expect(screen.getByTestId('delivery-attempt')).toHaveTextContent('Attempt 2 of 3');
    expect(screen.getByTestId('delivery-retry-assigned')).toHaveTextContent(/another delivery attempt/i);
    const resume = screen.getByRole('button', { name: 'Start delivery again PB-RETRY-1' });
    expect(resume.className).toMatch(/min-h-11/);
    expect(resume).toHaveTextContent('Start delivery again');
    // nothing that could bypass the retry: no code entry yet, no failure report, no delivered / payment control
    expect(screen.queryByTestId('delivery-code-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('delivery-report')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/mark(ed)? (as )?delivered|\bcod\b|cash|refund|₹|price|amount/i);
  });

  it('pressing the button sends ONLY the resume action (empty body, no status / driver / branch / payment) once, even on a double click', async () => {
    const user = userEvent.setup();
    render(<DeliveryWorkspace />);
    let release: () => void = () => undefined;
    act.mockImplementation(() => new Promise((resolve) => { release = () => resolve({ changed: true, order: retryAssigned() }); })); // the request stays in flight while the second click arrives
    const resume = await screen.findByTestId('delivery-resume');
    await user.dblClick(resume);
    await waitFor(() => expect(act).toHaveBeenCalled());
    expect(act).toHaveBeenCalledTimes(1);
    expect(act).toHaveBeenCalledWith(expect.any(String), 'resume');
    release();
  });

  it('safe mapped copy for the refusals: failed again, not yours any more, cancelled; raw server text is never shown', async () => {
    const user = userEvent.setup();
    for (const [status, code, copy] of [
      [409, 'DELIVERY_IN_EXCEPTION', /problem was reported/i],
      [404, 'ORDER_NOT_FOUND', /no longer available to you/i],
      [409, 'ORDER_NOT_DISPATCHED', /out for delivery/i]
    ] as const) {
      act.mockRejectedValueOnce(new ApiRequestError('RAW SERVER TEXT select * from orders', code, status));
      const { unmount } = render(<DeliveryWorkspace />);
      await user.click(await screen.findByTestId('delivery-resume'));
      expect(await screen.findByRole('alert')).toHaveTextContent(copy);
      expect(document.body.textContent).not.toMatch(/RAW SERVER|select \*/);
      unmount();
    }
  });

  it('after the driver resumes (IN_TRANSIT, attempt 2) the normal code form returns with the attempt label; a first attempt shows no attempt label', async () => {
    getQueue.mockResolvedValue(driverQueue({ out: [retryAssigned({ assignment: { state: 'IN_TRANSIT', pickupTime: '2026-10-12T09:00:00.000Z', issueReported: false, attemptNumber: 2, maxAttempts: 3 }, proof: { state: 'READY_FOR_VERIFICATION', lockedUntil: null } })] }));
    const { unmount } = render(<DeliveryWorkspace />);
    expect(await screen.findByTestId('delivery-code-input')).toBeInTheDocument();
    expect(screen.getByTestId('delivery-attempt')).toHaveTextContent('Attempt 2 of 3');
    expect(screen.queryByTestId('delivery-resume')).not.toBeInTheDocument();
    unmount();
    getQueue.mockResolvedValue(driverQueue({ out: [outOrder({ orderNumber: 'PB-FIRST-1' })] }));
    render(<DeliveryWorkspace />);
    await screen.findByTestId('delivery-code-input');
    expect(screen.queryByTestId('delivery-attempt')).not.toBeInTheDocument();
  });

  it('a FAILED attempt still shows only the exception notice: the driver cannot reopen, retry or resume it', async () => {
    getQueue.mockResolvedValue(driverQueue({ out: [retryAssigned({ assignment: { state: 'FAILED', pickupTime: '2026-10-12T09:00:00.000Z', issueReported: true, attemptNumber: 2, maxAttempts: 3 } })] }));
    render(<DeliveryWorkspace />);
    expect(await screen.findByTestId('delivery-issue-reported')).toHaveTextContent(/awaiting review/i);
    expect(screen.queryByTestId('delivery-resume')).not.toBeInTheDocument();
    expect(screen.queryByTestId('delivery-code-input')).not.toBeInTheDocument();
  });
});
