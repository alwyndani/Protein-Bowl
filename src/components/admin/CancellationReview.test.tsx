import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../services/cancellationReviewService', () => ({
  CancellationReviewService: { list: vi.fn(), approve: vi.fn(), decline: vi.fn() }
}));
vi.mock('./StepUp', () => ({ useStepUp: () => ({ withStepUp: async (fn: (proof: string) => Promise<unknown>) => fn('proof-token'), hasProof: true, discardProof: () => {} }) }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ logout: vi.fn() }) }));

import { CancellationReviewService } from '../../services/cancellationReviewService';
import { ApiRequestError } from '../../services/apiClient';
import { CancellationReview } from './CancellationReview';

const S = CancellationReviewService as unknown as Record<string, ReturnType<typeof vi.fn>>;
const row = (over: Record<string, unknown> = {}) => ({
  id: 'r1', status: 'PENDING', reasonCode: 'CHANGED_MIND', note: 'sorry', decisionNote: null, decidedAt: null, createdAt: '2026-10-31T10:00:00.000Z',
  order: { id: 'o1', orderNumber: 'PB-1', status: 'PREPARING', paymentStatus: 'PAID', netAmount: '145.50', kitchenBranchId: 'b1' }, ...over
});
const page = (items: unknown[]) => ({ items, page: 1, pageSize: 25, total: items.length, totalPages: 1 });

beforeEach(() => vi.clearAllMocks());

describe('CancellationReview', () => {
  it('lists waiting requests and warns that approval starts a FULL refund of the server amount', async () => {
    S.list.mockResolvedValue(page([row()]));
    render(<CancellationReview />);
    const user = userEvent.setup();
    expect(await screen.findByText('PB-1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /approve…/i }));
    expect(screen.getByTestId('approve-warning')).toHaveTextContent(/FULL refund of ₹145\.50/);
  });

  it('approving sends the step-up proof and only an optional note, then reloads', async () => {
    S.list.mockResolvedValue(page([row()]));
    S.approve.mockResolvedValue({ requestId: 'r1', alreadyApproved: false, refundId: 'rf1' });
    render(<CancellationReview />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /approve…/i }));
    await user.click(screen.getByRole('button', { name: /approve and refund in full/i }));
    await waitFor(() => expect(S.approve).toHaveBeenCalledWith('r1', '', 'proof-token'));
    await waitFor(() => expect(S.list).toHaveBeenCalledTimes(2));
  });

  it('declining requires an explanation and sends nothing without one', async () => {
    S.list.mockResolvedValue(page([row()]));
    S.decline.mockResolvedValue({ requestId: 'r1', alreadyDeclined: false });
    render(<CancellationReview />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /decline…/i }));
    await user.click(screen.getByRole('button', { name: /decline request/i }));
    expect(S.decline).not.toHaveBeenCalled();
    expect(await screen.findByText(/at least 3 characters/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/explanation for the customer/i), 'Already cooked.');
    await user.click(screen.getByRole('button', { name: /decline request/i }));
    await waitFor(() => expect(S.decline).toHaveBeenCalledWith('r1', 'Already cooked.', 'proof-token'));
  });

  it('shows an error when approval fails (for example a provider or state conflict) and reloads a stale row', async () => {
    S.list.mockResolvedValue(page([row()]));
    S.approve.mockRejectedValue(new ApiRequestError('conflict', 'CANCELLATION_NOT_ALLOWED', 409));
    render(<CancellationReview />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /approve…/i }));
    await user.click(screen.getByRole('button', { name: /approve and refund in full/i }));
    expect(await screen.findByTestId('admin-error-message')).toBeInTheDocument();
    await waitFor(() => expect(S.list.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('decided requests show their outcome and have no action buttons', async () => {
    S.list.mockResolvedValue(page([row({ status: 'DECLINED', decisionNote: 'Already cooked.', decidedAt: '2026-10-31T11:00:00.000Z' })]));
    render(<CancellationReview />);
    const item = await screen.findByTestId('cancellation-row');
    expect(within(item).getByText(/Already cooked/)).toBeInTheDocument();
    expect(within(item).queryByRole('button', { name: /approve|decline/i })).toBeNull();
  });
});
