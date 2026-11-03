import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const auth = { login: vi.fn(), register: vi.fn(), user: null, isAuthenticated: false, isLoading: false, logout: vi.fn() };
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth, mapBackendRoleToUserRole: () => 'customer' }));

const profile = { id: 'c', name: '', email: '', phone: '' } as never;

async function renderLogin(dev: boolean, mode: 'employee_login' | 'signin' | 'signup') {
  vi.resetModules();
  vi.stubEnv('DEV', dev);
  const { AuthModal } = await import('./AuthModal');
  return render(<AuthModal {...({ isOpen: true, onClose: vi.fn(), onSuccessLogin: vi.fn(), onProfileLoaded: vi.fn(), initialProfile: profile, initialMode: mode } as unknown as React.ComponentProps<typeof AuthModal>)} />);
}

afterEach(() => vi.unstubAllEnvs());

describe('no fake credentials, preset accounts or shortcut logins in ANY build (development included)', () => {
  for (const dev of [true, false]) {
    it(`DEV=${dev}: the staff form has only empty manual fields: no quick-select, no preset cards, no prefilled email or password`, async () => {
      await renderLogin(dev, 'employee_login');
      expect(screen.queryByText(/quick select/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/1-click/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Kerala Mess & Hostels|Central Kitchen|Aggregators|Management & POS/ })).not.toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/proteinbowl\.in|nutrifitkitchen\.in|Password123/);
      const email = screen.getByPlaceholderText('Employee ID or work email') as HTMLInputElement;
      expect(email.value).toBe('');
      expect((document.querySelector('input[type=password]') as HTMLInputElement).value).toBe('');
    });

    it(`DEV=${dev}: the customer sign-in and sign-up forms show no social sign-in buttons`, async () => {
      for (const mode of ['signin', 'signup'] as const) {
        const { unmount } = await renderLogin(dev, mode);
        expect(screen.queryByText(/Google SSO/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Apple ID/)).not.toBeInTheDocument();
        unmount();
      }
    });
  }

  it('the source carries no credential literal, preset staff list, quick-login handler or social-auth stand-in (static)', () => {
    const src = readFileSync(join(__dirname, 'AuthModal.tsx'), 'utf8');
    for (const forbidden of [/Password123/, /SocialAuthPassword/, /EMPLOYEE_PRESETS/, /handleQuickEmployeeLogin/, /handleSocialAuth/, /@proteinbowl\.in/, /@nutrifitkitchen\.in/, /IS_DEV/]) {
      expect(src, String(forbidden)).not.toMatch(forbidden);
    }
  });
});
