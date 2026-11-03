import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrandFooter } from './BrandFooter';

const SOCIAL_NAMES = ['Protein Bowl on Instagram', 'Protein Bowl on Facebook', 'Protein Bowl on Twitter'];

describe('BrandFooter', () => {
  it('gives each icon-only social link an accessible name', () => {
    render(<BrandFooter />);
    for (const name of SOCIAL_NAMES) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
  });

  it('keeps the social links as placeholder links (href "#"): the accessible names change no URL', () => {
    render(<BrandFooter />);
    for (const name of SOCIAL_NAMES) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', '#');
    }
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
