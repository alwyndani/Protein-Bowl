import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./DeliveryWorkspace', () => ({ DeliveryWorkspace: () => <div data-testid="orders-workspace">orders</div> }));
vi.mock('./MessDeliveryPanel', () => ({ MessDeliveryPanel: () => <div data-testid="mess-panel">mess</div> }));

import { DeliveryHome } from './DeliveryHome';

describe('DELIVERY home: per-order deliveries and Kerala Mess runs are separate workflows', () => {
  it('opens on the per-order queue and switches to the Mess runs without sharing anything', async () => {
    const user = userEvent.setup();
    render(<DeliveryHome />);
    expect(screen.getByTestId('orders-workspace')).toBeInTheDocument();
    expect(screen.queryByTestId('mess-panel')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Orders' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Kerala Mess runs' }));
    expect(screen.getByTestId('mess-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('orders-workspace')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Kerala Mess runs' })).toHaveAttribute('aria-selected', 'true');
  });
});
