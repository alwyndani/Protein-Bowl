import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { isUiRoleAllowed } from './roleGuard';
import { BrandHeader } from '../components/common/BrandHeader';
import type { UserRole } from '../types';

const STAFF_UI_ROLES: UserRole[] = ['md', 'nutritionist', 'trainer', 'chef', 'procurement', 'delivery', 'pos', 'bakery_fmcg', 'tepache_erp', 'swiggy_zomato'];

describe('isUiRoleAllowed (production presentation guard)', () => {
  it('development builds keep the role sandbox', () => {
    for (const role of STAFF_UI_ROLES) expect(isUiRoleAllowed(role, undefined, true)).toBe(true);
  });

  it('production: an anonymous visitor can only present customer views', () => {
    expect(isUiRoleAllowed('customer', undefined, false)).toBe(true);
    expect(isUiRoleAllowed('mess_customer', [], false)).toBe(true);
    for (const role of STAFF_UI_ROLES) expect(isUiRoleAllowed(role, undefined, false)).toBe(false);
  });

  it('production: a customer session cannot present any staff dashboard', () => {
    for (const role of STAFF_UI_ROLES) expect(isUiRoleAllowed(role, ['CUSTOMER'], false)).toBe(false);
  });

  it('production: a staff session may only present the dashboard matching its own backend role', () => {
    expect(isUiRoleAllowed('chef', ['CHEF'], false)).toBe(true);
    expect(isUiRoleAllowed('pos', ['CHEF'], false)).toBe(false);
    expect(isUiRoleAllowed('md', ['MD'], false)).toBe(true);
    expect(isUiRoleAllowed('delivery', ['MD'], false)).toBe(false);
  });

  it('production: SUPER_ADMIN is presented the MD dashboard only (until the admin workspace exists)', () => {
    expect(isUiRoleAllowed('md', ['SUPER_ADMIN'], false)).toBe(true);
    expect(isUiRoleAllowed('chef', ['SUPER_ADMIN'], false)).toBe(false);
  });
});

describe('BrandHeader role-demo sandbox', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const props = {
    currentRole: 'chef' as UserRole,
    onRoleChange: vi.fn(),
    activeCustomerTab: 'home',
    onSelectCustomerTab: vi.fn(),
    currentUser: null,
    onOpenAuthModal: vi.fn(),
    onLogout: vi.fn()
  };

  it('is rendered in development builds for staff views', () => {
    vi.stubEnv('DEV', true);
    render(<BrandHeader {...props} />);
    expect(screen.getByText(/Role Demo Sandbox/i)).toBeInTheDocument();
  });

  it('is NOT rendered in production builds', () => {
    vi.stubEnv('DEV', false);
    render(<BrandHeader {...props} />);
    expect(screen.queryByText(/Role Demo Sandbox/i)).not.toBeInTheDocument();
  });
});
