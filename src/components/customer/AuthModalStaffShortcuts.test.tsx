import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const auth = { login: vi.fn(), register: vi.fn(), user: null, isAuthenticated: false, isLoading: false, logout: vi.fn() };
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth, mapBackendRoleToUserRole: () => 'customer' }));

const profile = { id: 'c', name: '', email: '', phone: '' } as never;

async function renderStaffLogin(dev: boolean) {
  vi.resetModules();
  vi.stubEnv('DEV', dev);
  const { AuthModal } = await import('./AuthModal');
  return render(<AuthModal isOpen onClose={vi.fn()} onSuccessLogin={vi.fn()} initialProfile={profile} initialMode="employee_login" />);
}

afterEach(() => vi.unstubAllEnvs());

describe('staff quick-select shortcuts are development-only (P9A pre-commit security verification)', () => {
  it('PRODUCTION: no quick-select heading, department tabs, staff cards, prefilled email or password; only the manual sign-in form', async () => {
    await renderStaffLogin(false);
    expect(screen.queryByText(/quick select/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/1-click/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Kerala Mess & Hostels|Central Kitchen|Aggregators|Management & POS/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/proteinbowl\.in|nutrifitkitchen\.in/)).not.toBeInTheDocument();
    const email = screen.getByPlaceholderText('Employee ID or work email') as HTMLInputElement;
    expect(email.value).toBe('');
    expect((document.querySelector('input[type=password]') as HTMLInputElement).value).toBe('');
  });

  it('DEVELOPMENT: the shortcuts exist (proves the production test above is meaningful)', async () => {
    await renderStaffLogin(true);
    expect(screen.getByText(/quick select/i)).toBeInTheDocument();
  });

  it('the shortcut data and the hard-coded seed password are reachable only behind the DEV flag (static)', () => {
    const src = readFileSync(join(__dirname, 'AuthModal.tsx'), 'utf8');
    expect(src).toContain('const EMPLOYEE_PRESETS = IS_DEV ? ALL_EMPLOYEE_PRESETS : [];');
    expect(src).toMatch(/handleQuickEmployeeLogin[\s\S]{0,120}if \(!IS_DEV\) return;/);
    expect(src).toMatch(/\{IS_DEV && \(\s*<div>[\s\S]{0,200}Quick Select Staff Account/);
  });
});
