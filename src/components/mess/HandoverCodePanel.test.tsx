import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../services/messService', () => ({ MessService: { handoverState: vi.fn(), issueHandoverCode: vi.fn(), regenerateHandoverCode: vi.fn() } }));

import { MessService } from '../../services/messService';
import { ApiRequestError } from '../../services/apiClient';
import { HandoverCodePanel } from './HandoverCodePanel';

const svc = vi.mocked(MessService);
beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});
const renderIt = () => render(<HandoverCodePanel subscriptionId="sub-1" mealId="meal-1" />);

describe('Resident handover code panel', () => {
  it('issues the code on request: grouped digits in component memory only; hide / show; nothing is stored', async () => {
    const user = userEvent.setup();
    svc.handoverState.mockResolvedValue({ state: 'NOT_ISSUED' });
    svc.issueHandoverCode.mockResolvedValue({ state: 'ISSUED_TO_YOU', code: '482913', expiresAt: '2026-10-20T08:30:00.000Z', regenerationsLeft: 3 });
    renderIt();
    expect(await screen.findByText(/Generate it only when you are at the service point/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Get my delivery code' }));
    const shown = await screen.findByTestId('handover-code');
    expect(shown).toHaveTextContent('482 913');
    expect(shown).toHaveAttribute('aria-label', 'Delivery code 4 8 2 9 1 3');
    await user.click(screen.getByRole('button', { name: 'Hide' }));
    expect(screen.getByTestId('handover-code')).toHaveTextContent('••• •••');
    expect(screen.getByTestId('handover-code')).not.toHaveTextContent('482');
    await user.click(screen.getByRole('button', { name: 'Show' }));
    expect(screen.getByTestId('handover-code')).toHaveTextContent('482 913');
    expect(JSON.stringify({ ...window.localStorage, ...window.sessionStorage })).not.toContain('482913');
    expect(svc.issueHandoverCode).toHaveBeenCalledWith('sub-1', 'meal-1');
  });

  it('after a reload the digits are GONE: only "generate a new one" remains (the server never returns the old code)', async () => {
    svc.handoverState.mockResolvedValue({ state: 'ISSUED_TO_YOU', expiresAt: '2026-10-20T08:30:00.000Z', regenerationsLeft: 2 });
    renderIt();
    expect(await screen.findByTestId('handover-not-shown')).toHaveTextContent('cannot be shown again');
    expect(screen.queryByTestId('handover-code')).toBeNull();
    expect(screen.getByRole('button', { name: /Generate a new code \(2 left\)/ })).toBeInTheDocument();
  });

  it('regenerating asks first (the old code stops working) and then replaces it', async () => {
    const user = userEvent.setup();
    svc.handoverState.mockResolvedValue({ state: 'ISSUED_TO_YOU', regenerationsLeft: 2 });
    svc.regenerateHandoverCode.mockResolvedValue({ state: 'ISSUED_TO_YOU', code: '100200', expiresAt: '2026-10-20T08:30:00.000Z', regenerationsLeft: 1 });
    renderIt();
    await user.click(await screen.findByRole('button', { name: /Generate a new code/ }));
    expect(screen.getByText(/The current code will stop working immediately/)).toBeInTheDocument();
    expect(svc.regenerateHandoverCode).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Yes, generate a new code' }));
    expect(await screen.findByTestId('handover-code')).toHaveTextContent('100 200');
    expect(svc.regenerateHandoverCode).toHaveBeenCalledTimes(1);
  });

  it('when another resident holds the code, nobody is identified and there is nothing to press', async () => {
    svc.handoverState.mockResolvedValue({ state: 'ISSUED_TO_ANOTHER' });
    renderIt();
    expect(await screen.findByTestId('handover-other')).toHaveTextContent('A resident of your service point already holds the delivery code');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a refused issue shows fixed copy and re-reads the state', async () => {
    const user = userEvent.setup();
    svc.handoverState.mockResolvedValueOnce({ state: 'NOT_ISSUED' }).mockResolvedValue({ state: 'ISSUED_TO_ANOTHER' });
    svc.issueHandoverCode.mockRejectedValue(new ApiRequestError('raw', 'HANDOVER_CODE_ISSUED_TO_ANOTHER', 409));
    renderIt();
    await user.click(await screen.findByRole('button', { name: 'Get my delivery code' }));
    expect(await screen.findByTestId('handover-error')).toHaveTextContent('A resident of your service point already holds the handover code');
    await waitFor(() => expect(svc.handoverState).toHaveBeenCalledTimes(2));
  });

  it('nothing is shown when no code is available or the delivery is already confirmed', async () => {
    svc.handoverState.mockResolvedValue({ state: 'NOT_AVAILABLE' });
    const { container, rerender } = renderIt();
    await waitFor(() => expect(svc.handoverState).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    svc.handoverState.mockResolvedValue({ state: 'VERIFIED' });
    rerender(<HandoverCodePanel subscriptionId="sub-2" mealId="meal-2" />);
    await waitFor(() => expect(svc.handoverState).toHaveBeenCalledWith('sub-2', 'meal-2'));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
