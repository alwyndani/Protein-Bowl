import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrandFooter } from './BrandFooter';

describe('BrandFooter', () => {
  it('renders no social link or dead "#" link when no social profile is configured', () => {
    const { container } = render(<BrandFooter />);
    expect(screen.queryByTestId('footer-social')).not.toBeInTheDocument();
    expect(container.querySelector('a[href="#"]')).toBeNull();
  });

  it('opens the Privacy Policy and Terms of Subscription in a dialog and closes it', async () => {
    const user = userEvent.setup();
    render(<BrandFooter />);
    await user.click(screen.getByRole('button', { name: 'Privacy Policy' }));
    expect(screen.getByRole('dialog', { name: 'Privacy Policy' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Terms of Subscription' }));
    const dialog = screen.getByRole('dialog', { name: 'Terms of Subscription' });
    expect(dialog).toHaveTextContent(/paid online/i);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the staff access link only when a handler is passed, and calls it once on click', async () => {
    const user = userEvent.setup();
    const openEmployeeLogin = vi.fn();
    const { rerender } = render(<BrandFooter />);
    expect(screen.queryByRole('link', { name: /staff access portal/i })).not.toBeInTheDocument();

    rerender(<BrandFooter onOpenEmployeeLogin={openEmployeeLogin} />);
    await user.click(screen.getByRole('link', { name: /staff access portal/i }));
    expect(openEmployeeLogin).toHaveBeenCalledTimes(1);
  });

  it('has no SRS document control', () => {
    render(<BrandFooter />);
    expect(screen.queryByText(/srs/i)).not.toBeInTheDocument();
  });
});
