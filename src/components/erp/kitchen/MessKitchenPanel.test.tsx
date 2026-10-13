import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../services/messService', () => ({ MessService: { kitchenDemand: vi.fn(), kitchenBatches: vi.fn(), startBatch: vi.fn(), markBatchReady: vi.fn() } }));

import { MessService } from '../../../services/messService';
import { ApiRequestError } from '../../../services/apiClient';
import { MessKitchenPanel } from './MessKitchenPanel';
import { batch, demand } from '../../../test/messFixtures';

const svc = vi.mocked(MessService);
const BRANCH = '11111111-1111-4111-8111-111111111111';
beforeEach(() => {
  vi.clearAllMocks();
  svc.kitchenDemand.mockResolvedValue(demand());
  svc.kitchenBatches.mockResolvedValue({ today: '2026-10-20', batches: [batch()] });
});

describe('Mess kitchen panel (CHEF)', () => {
  it('shows aggregated demand with the service-point breakdown and ONLY counts: no customer data', async () => {
    render(<MessKitchenPanel />);
    const today = await screen.findByTestId('mess-demand-2026-10-20-LUNCH');
    expect(within(today).getByTestId('mess-demand-total')).toHaveTextContent('3 meals');
    expect(today).toHaveTextContent('Hostel A1 (Main gate): 2');
    expect(today).toHaveTextContent('Hostel A2: 1');
    expect(document.body.textContent).not.toMatch(/room|phone|student|@|customer name/i);
    expect(svc.kitchenDemand).toHaveBeenCalledWith(undefined); // a CHEF never sends a branch: the server scopes it
  });

  it('only TODAY can be started; a later day is planning only', async () => {
    render(<MessKitchenPanel />);
    const tomorrow = await screen.findByTestId('mess-demand-2026-10-21-LUNCH');
    expect(within(tomorrow).queryByRole('button', { name: 'Start preparation' })).toBeNull();
    expect(tomorrow).toHaveTextContent('Planning only');
    expect(within(screen.getByTestId('mess-demand-2026-10-20-LUNCH')).getByRole('button', { name: 'Start preparation' })).toBeInTheDocument();
  });

  it('starting sends exactly {branchId, mealDate, slot} once, then re-reads the server (double click = one request)', async () => {
    const user = userEvent.setup();
    svc.startBatch.mockImplementation(() => new Promise((r) => setTimeout(() => r({ changed: true, batch: batch() }), 50)));
    render(<MessKitchenPanel />);
    const btn = within(await screen.findByTestId('mess-demand-2026-10-20-LUNCH')).getByRole('button', { name: 'Start preparation' });
    await user.dblClick(btn);
    await waitFor(() => expect(svc.startBatch).toHaveBeenCalledTimes(1));
    expect(svc.startBatch).toHaveBeenCalledWith({ branchId: BRANCH, mealDate: '2026-10-20', slot: 'LUNCH' });
    await waitFor(() => expect(svc.kitchenDemand.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('a PREPARING batch shows its frozen count and breakdown and can be marked ready; a READY batch cannot, and says it is not served', async () => {
    const user = userEvent.setup();
    svc.kitchenBatches.mockResolvedValue({ today: '2026-10-20', batches: [batch(), batch({ id: 'b2', slot: 'LUNCH', status: 'READY', mealCount: 7, readyAt: '2026-10-19T05:00:00.000Z' })] });
    svc.markBatchReady.mockResolvedValue({ changed: true, batch: batch({ status: 'READY' }) });
    render(<MessKitchenPanel />);
    const prep = await screen.findByTestId('mess-batch-2026-10-19-BREAKFAST');
    expect(within(prep).getByTestId('mess-batch-count')).toHaveTextContent('4');
    expect(within(prep).getByTestId('mess-batch-breakdown')).toHaveTextContent('Hostel A1: 4');
    await user.click(within(prep).getByRole('button', { name: 'Mark ready' }));
    await waitFor(() => expect(svc.markBatchReady).toHaveBeenCalledWith('batch-1'));
    const ready = screen.getByTestId('mess-batch-2026-10-19-LUNCH');
    expect(within(ready).queryByRole('button')).toBeNull();
    expect(ready).toHaveTextContent('not marked as served');
    expect(document.body.textContent).not.toMatch(/out for delivery|handover|gate pass/i);
  });

  it('a refused action shows fixed copy (never the server text)', async () => {
    const user = userEvent.setup();
    svc.startBatch.mockRejectedValue(new ApiRequestError('boom internal', 'NO_ELIGIBLE_MEALS', 409));
    render(<MessKitchenPanel />);
    await user.click(within(await screen.findByTestId('mess-demand-2026-10-20-LUNCH')).getByRole('button', { name: 'Start preparation' }));
    const err = await screen.findByTestId('mess-kitchen-error');
    expect(err.textContent).not.toContain('boom internal');
  });
});

describe('Mess kitchen panel (SUPER_ADMIN / MD read-only)', () => {
  it('asks for a branch first; with one it shows the same data with NO action buttons', async () => {
    const { rerender } = render(<MessKitchenPanel readOnly />);
    expect(screen.getByTestId('mess-kitchen-pick-branch')).toBeInTheDocument();
    expect(svc.kitchenDemand).not.toHaveBeenCalled();
    rerender(<MessKitchenPanel readOnly branchId={BRANCH} />);
    await screen.findByTestId('mess-demand-2026-10-20-LUNCH');
    expect(svc.kitchenDemand).toHaveBeenCalledWith(BRANCH);
    expect(screen.queryByRole('button', { name: /Start preparation|Mark ready/ })).toBeNull();
    expect(screen.getByTestId('mess-kitchen')).toHaveTextContent('read-only');
  });
});
