import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../services/orderService', () => ({ OrderService: { requestCancellation: vi.fn(), getOrder: vi.fn() } }));

import { OrderService } from '../../services/orderService';
import { ApiRequestError } from '../../services/apiClient';
import { CancellationRequestPanel } from './CancellationRequestPanel';
import type { ApiOrder } from '../../services/commerceTypes';

const O = OrderService as unknown as Record<string, ReturnType<typeof vi.fn>>;
const order = (cr?: ApiOrder['cancellationRequest'], status = 'PREPARING') => ({ id: 'o1', orderNumber: 'PB-1', status, cancellationRequest: cr }) as unknown as ApiOrder;

beforeEach(() => vi.clearAllMocks());

describe('CancellationRequestPanel', () => {
  it('renders nothing when the server offers no request, or the order is cancelled', () => {
    const { container, rerender } = render(<CancellationRequestPanel order={order()} onOrder={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<CancellationRequestPanel order={order({ state: 'REQUESTABLE' }, 'CANCELLED')} onOrder={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('never promises a refund or cancellation; sends only a typed reason; then shows the server state', async () => {
    O.requestCancellation.mockResolvedValue({ requestId: 'r1', alreadyRequested: false });
    O.getOrder.mockResolvedValue(order({ state: 'REQUESTED' }));
    const onOrder = vi.fn();
    render(<CancellationRequestPanel order={order({ state: 'REQUESTABLE' })} onOrder={onOrder} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('request-cancellation-button'));
    expect(screen.getByText(/cannot promise it will be approved/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send request/i })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText(/why do you want to cancel/i), 'CHANGED_MIND');
    await user.click(screen.getByRole('button', { name: /send request/i }));
    await waitFor(() => expect(O.requestCancellation).toHaveBeenCalledWith('o1', 'CHANGED_MIND', ''));
    await waitFor(() => expect(onOrder).toHaveBeenCalledWith(expect.objectContaining({ cancellationRequest: { state: 'REQUESTED' } })));
  });

  it('REQUESTED and DECLINED states are explained honestly (with the staff reason)', () => {
    const { rerender } = render(<CancellationRequestPanel order={order({ state: 'REQUESTED' })} onOrder={() => {}} />);
    expect(screen.getByTestId('cancellation-requested')).toHaveTextContent(/reviewing your request/i);
    rerender(<CancellationRequestPanel order={order({ state: 'DECLINED', declinedReason: 'Already cooked.' })} onOrder={() => {}} />);
    expect(screen.getByTestId('cancellation-declined')).toHaveTextContent('Already cooked.');
    expect(screen.queryByTestId('request-cancellation-button')).toBeNull();
  });

  it('a refused request shows an error and still re-reads the order from the server', async () => {
    O.requestCancellation.mockRejectedValue(new ApiRequestError('no', 'CANCELLATION_REQUEST_NOT_ALLOWED', 409));
    O.getOrder.mockResolvedValue(order());
    const onOrder = vi.fn();
    render(<CancellationRequestPanel order={order({ state: 'REQUESTABLE' })} onOrder={onOrder} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('request-cancellation-button'));
    await user.selectOptions(screen.getByLabelText(/why do you want to cancel/i), 'OTHER');
    await user.click(screen.getByRole('button', { name: /send request/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await waitFor(() => expect(onOrder).toHaveBeenCalled());
  });
});
