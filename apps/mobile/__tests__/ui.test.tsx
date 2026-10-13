import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { AppRoot } from '../src/AppRoot';
import { SessionManager } from '../src/auth/sessionManager';
import { secureSessionStorage, SESSION_KEY } from '../src/auth/secureSession';
import { FakeBackend } from '../src/test/fakeBackend';

const store: Map<string, string> = (SecureStore as any).__store;
const BASE = 'https://api.test/api/v1';
const CLIENT = 'protein-bowl-mobile/1.0.0 (android)';

function mount(backend: FakeBackend, opts: { timeoutMs?: number } = {}) {
  const cleared = jest.fn();
  let manager!: SessionManager;
  const createManager = (onCleared: () => void) => {
    manager = new SessionManager({
      storage: secureSessionStorage,
      baseUrl: BASE,
      clientHeader: CLIENT,
      timeoutMs: opts.timeoutMs ?? 100,
      fetchImpl: backend.fetch as unknown as typeof fetch,
      onSessionCleared: () => {
        cleared();
        onCleared();
      }
    });
    return manager;
  };
  render(<AppRoot createManager={createManager} />);
  return { cleared, getManager: () => manager };
}

/** Put a valid credential into the (mock) keychain exactly as a previous app run would have. */
async function seedSignedInDevice(backend: FakeBackend, email = 'a@b.test') {
  backend.addUser({ email });
  const m = new SessionManager({ storage: secureSessionStorage, baseUrl: BASE, clientHeader: CLIENT, fetchImpl: backend.fetch as unknown as typeof fetch });
  await m.signIn(email, 'Password-123');
  backend.log.length = 0;
}

const button = (name: string) => screen.getByRole('button', { name });

describe('P11A auth UI and navigation guards', () => {
  it('signed out: Welcome is shown, the authenticated shell does not exist', async () => {
    const backend = new FakeBackend();
    mount(backend);
    expect(await screen.findByText('Protein Bowl')).toBeTruthy();
    expect(button('Sign in')).toBeTruthy();
    expect(button('Create account')).toBeTruthy();
    expect(screen.queryByText('Account')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
  });

  it('session restoring shows a progress state first, then the signed-in shell (never a stale authenticated UI)', async () => {
    const backend = new FakeBackend();
    await seedSignedInDevice(backend);
    backend.delayMs = 30;
    mount(backend);
    expect(screen.getByLabelText('Restoring your session')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
    expect(await screen.findByText('a@b.test')).toBeTruthy();
    expect(button('Sign out')).toBeTruthy();
  });

  it('sign in: validation first (no request), then success shows the Account screen', async () => {
    const backend = new FakeBackend();
    backend.addUser({ email: 'a@b.test', fullName: 'Asha Rao' });
    mount(backend);
    fireEvent.press(await screen.findByRole('button', { name: 'Sign in' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address.')).toBeTruthy();
    expect(screen.getByText('Enter your password.')).toBeTruthy();
    expect(backend.count('/auth/mobile/login')).toBe(0);

    fireEvent.changeText(screen.getByLabelText('Email'), 'a@b.test');
    fireEvent.changeText(screen.getByLabelText('Password'), 'Password-123');
    fireEvent.press(button('Sign in'));
    expect(await screen.findByText('Asha Rao')).toBeTruthy();
    expect(screen.getByText('a@b.test')).toBeTruthy();
    expect(backend.count('/auth/mobile/login')).toBe(1);
  });

  it('duplicate submit is prevented: a double press sends ONE login request and disables the control', async () => {
    const backend = new FakeBackend();
    backend.addUser({ email: 'a@b.test' });
    backend.delayMs = 40;
    mount(backend);
    fireEvent.press(await screen.findByRole('button', { name: 'Sign in' }));
    fireEvent.changeText(await screen.findByLabelText('Email'), 'a@b.test');
    fireEvent.changeText(screen.getByLabelText('Password'), 'Password-123');
    const submit = button('Sign in');
    fireEvent.press(submit);
    fireEvent.press(submit);
    fireEvent.press(submit);
    expect(button('Sign in').props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    await screen.findByText('a@b.test');
    expect(backend.count('/auth/mobile/login')).toBe(1);
  });

  it('wrong password: safe mapped copy only, the form stays usable', async () => {
    const backend = new FakeBackend();
    backend.addUser({ email: 'a@b.test' });
    mount(backend);
    fireEvent.press(await screen.findByRole('button', { name: 'Sign in' }));
    fireEvent.changeText(await screen.findByLabelText('Email'), 'a@b.test');
    fireEvent.changeText(screen.getByLabelText('Password'), 'wrong');
    fireEvent.press(button('Sign in'));
    expect(await screen.findByText('Incorrect email or password.')).toBeTruthy();
    expect(screen.queryByText(/server message that must never be shown/)).toBeNull();
    expect(screen.queryByText(/INVALID_CREDENTIALS/)).toBeNull();
    await waitFor(() => expect(button('Sign in').props.accessibilityState.disabled).toBe(false));
    expect(store.size).toBe(0);
  });

  it('a staff account cannot use the app: customer-only message, nothing stored, no shell', async () => {
    const backend = new FakeBackend();
    backend.addUser({ email: 'chef@b.test', roles: ['CHEF'] });
    mount(backend);
    fireEvent.press(await screen.findByRole('button', { name: 'Sign in' }));
    fireEvent.changeText(await screen.findByLabelText('Email'), 'chef@b.test');
    fireEvent.changeText(screen.getByLabelText('Password'), 'Password-123');
    fireEvent.press(button('Sign in'));
    expect(await screen.findByText('This app is for customer accounts only.')).toBeTruthy();
    expect(store.size).toBe(0);
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
  });

  it('offline during sign in shows the offline copy', async () => {
    const backend = new FakeBackend();
    backend.addUser({ email: 'a@b.test' });
    backend.failNext('/auth/mobile/login', 'network');
    mount(backend);
    fireEvent.press(await screen.findByRole('button', { name: 'Sign in' }));
    fireEvent.changeText(await screen.findByLabelText('Email'), 'a@b.test');
    fireEvent.changeText(screen.getByLabelText('Password'), 'Password-123');
    fireEvent.press(button('Sign in'));
    expect(await screen.findByText(/offline/i)).toBeTruthy();
  });

  it('register: validates, creates the customer account and enters the shell', async () => {
    const backend = new FakeBackend();
    mount(backend);
    fireEvent.press(await screen.findByRole('button', { name: 'Create account' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Enter your full name.')).toBeTruthy();
    expect(screen.getByText('Use at least 8 characters.')).toBeTruthy();
    expect(backend.count('/auth/mobile/register')).toBe(0);

    fireEvent.changeText(screen.getByLabelText('Full name'), 'New Person');
    fireEvent.changeText(screen.getByLabelText('Email'), 'new@b.test');
    fireEvent.changeText(screen.getByLabelText('Password'), 'Password-123');
    fireEvent.press(button('Create account'));
    expect(await screen.findByText('New Person')).toBeTruthy();
    expect(backend.log.find((r) => r.path === '/auth/mobile/register')!.body).toEqual({ email: 'new@b.test', password: 'Password-123', fullName: 'New Person' });
    expect(JSON.parse(store.get(SESSION_KEY)!).refreshToken).toBeTruthy();
  });

  it('register: an existing email gets the mapped duplicate-account copy', async () => {
    const backend = new FakeBackend();
    backend.addUser({ email: 'dup@b.test' });
    mount(backend);
    fireEvent.press(await screen.findByRole('button', { name: 'Create account' }));
    fireEvent.changeText(await screen.findByLabelText('Full name'), 'Dup Person');
    fireEvent.changeText(screen.getByLabelText('Email'), 'dup@b.test');
    fireEvent.changeText(screen.getByLabelText('Password'), 'Password-123');
    fireEvent.press(button('Create account'));
    expect(await screen.findByText(/already exists/)).toBeTruthy();
  });

  it('a revoked stored session lands on Welcome with an explanation (no shell)', async () => {
    const backend = new FakeBackend();
    await seedSignedInDevice(backend);
    backend.refreshTokens.forEach((t) => (t.revoked = true));
    mount(backend);
    expect(await screen.findByText(/For your security you were signed out/)).toBeTruthy();
    expect(store.size).toBe(0);
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
  });

  it('ambiguous refresh at launch: the recovery screen is shown, nothing authenticated, no automatic replay; "Try again" is a user action', async () => {
    const backend = new FakeBackend();
    await seedSignedInDevice(backend);
    backend.failNext('/auth/mobile/refresh', 'timeout');
    mount(backend, { timeoutMs: 40 });
    expect(await screen.findByText('We could not reconnect')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
    await new Promise((r) => setTimeout(r, 150));
    expect(backend.count('/auth/mobile/refresh')).toBe(1);
    fireEvent.press(button('Try again'));
    expect(await screen.findByText('a@b.test')).toBeTruthy();
    expect(backend.count('/auth/mobile/refresh')).toBe(2);
  });

  it('recovery "Sign in again" clears the device session and returns to authentication', async () => {
    const backend = new FakeBackend();
    await seedSignedInDevice(backend);
    backend.failNext('/auth/mobile/refresh', 'network');
    mount(backend);
    await screen.findByText('We could not reconnect');
    fireEvent.press(button('Sign in again'));
    expect(await screen.findByRole('button', { name: 'Create account' })).toBeTruthy();
    expect(store.size).toBe(0);
  });

  it('sign out: server logout, credential deleted, query cache cleared, back to Welcome; double press = one logout', async () => {
    const backend = new FakeBackend();
    await seedSignedInDevice(backend);
    const { cleared } = mount(backend);
    await screen.findByText('a@b.test');
    backend.delayMs = 30;
    fireEvent.press(button('Sign out'));
    fireEvent.press(button('Sign out'));
    expect(await screen.findByRole('button', { name: 'Create account' })).toBeTruthy();
    expect(backend.count('/auth/mobile/logout')).toBe(1);
    expect(store.size).toBe(0);
    expect(cleared).toHaveBeenCalled();
    expect(screen.queryByText('a@b.test')).toBeNull();
  });

  it('sign out with the network down still signs out locally and explains the server could not be confirmed', async () => {
    const backend = new FakeBackend();
    await seedSignedInDevice(backend);
    mount(backend);
    await screen.findByText('a@b.test');
    backend.failNext('/auth/mobile/logout', 'network');
    fireEvent.press(button('Sign out'));
    expect(await screen.findByText(/could not confirm the sign-out/)).toBeTruthy();
    expect(store.size).toBe(0);
  });
});
