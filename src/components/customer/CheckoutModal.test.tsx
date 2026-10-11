import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CheckoutModal } from './CheckoutModal';
import type { CustomerProfile, DietPlanRequest } from '../../types';

const request = { id: 'req-1', durationDays: 30, goal: 'weight_loss', planType: 'standard', calculatedPrice: 14999 } as unknown as DietPlanRequest;
const profile = { id: 'cust-1', name: 'Test Customer' } as unknown as CustomerProfile;

describe('legacy diet-plan checkout (P7D: the fake payment surface is disabled)', () => {
  it('has no payment action: the gateway/VPA form is gone, a clear "not available" notice is shown, and the button is disabled', () => {
    render(<CheckoutModal isOpen onClose={vi.fn()} request={request} profile={profile} onOrderSuccess={vi.fn()} />);
    expect(screen.getByTestId('diet-plan-payment-unavailable')).toHaveTextContent(/online payment for diet plans is not available yet/i);
    expect(screen.getByTestId('diet-plan-payment-unavailable')).toHaveTextContent(/nothing has been charged/i);
    expect(screen.getByRole('button', { name: /payment not available yet/i })).toBeDisabled();
    expect(screen.queryByText(/Virtual Payment Address/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/username@upi/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Pay ₹/i)).not.toBeInTheDocument();
  });

  it('can never fabricate a paid order: submitting the form (even forcibly) does not call onOrderSuccess', async () => {
    vi.useFakeTimers();
    const onOrderSuccess = vi.fn();
    const { container } = render(<CheckoutModal isOpen onClose={vi.fn()} request={request} profile={profile} onOrderSuccess={onOrderSuccess} />);
    fireEvent.submit(container.querySelector('form')!);
    await vi.advanceTimersByTimeAsync(5000);
    expect(onOrderSuccess).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('can still be closed (labelled close button)', async () => {
    const onClose = vi.fn();
    render(<CheckoutModal isOpen onClose={onClose} request={request} profile={profile} onOrderSuccess={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
