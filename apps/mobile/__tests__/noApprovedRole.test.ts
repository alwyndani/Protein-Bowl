import * as SecureStore from 'expo-secure-store';
import { SessionManager } from '../src/auth/sessionManager';
import { secureSessionStorage, SESSION_KEY } from '../src/auth/secureSession';
import { FakeBackend } from '../src/test/fakeBackend';
import { ApiError } from '../src/api/ApiError';
import { messageForError, messageForSignedOut } from '../src/copy/errorCopy';

/**
 * Role simplification: the backend refuses an account that holds no approved role with 403 NO_APPROVED_ROLE (sign-in, refresh and every request).
 * The customer app shows fixed copy for it and, when it happens to a stored session, ends that session with its own signed-out reason.
 * Source-only: jest-expo with a fake fetch and an in-memory keychain; no network, no backend, no database.
 */
const store: Map<string, string> = (SecureStore as any).__store;
const BASE = 'https://api.test/api/v1';
const CLIENT = 'protein-bowl-mobile/1.0.0 (android)';

function setup() {
  const backend = new FakeBackend();
  const cleared = jest.fn();
  const manager = new SessionManager({
    storage: secureSessionStorage,
    baseUrl: BASE,
    clientHeader: CLIENT,
    timeoutMs: 200,
    fetchImpl: backend.fetch as unknown as typeof fetch,
    onSessionCleared: cleared
  });
  return { backend, manager, cleared };
}

const refusal = () =>
  ({ ok: false, status: 403, headers: { get: () => null }, text: async () => JSON.stringify({ success: false, error: 'NO_APPROVED_ROLE', message: 'x' }) }) as any;

describe('NO_APPROVED_ROLE (customer mobile app)', () => {
  it('1. sign-in: the refusal is a normalised 403 ApiError, nothing is stored and no session exists', async () => {
    const { backend, manager } = setup();
    backend.addUser({ email: 'a@b.test' });
    (manager as any).api.fetchImpl = async () => refusal();
    await expect(manager.signIn('a@b.test', 'Password-123')).rejects.toMatchObject({ status: 403, code: 'NO_APPROVED_ROLE' });
    expect(store.size).toBe(0);
    expect(manager.getState().status).not.toBe('signedIn');
  });

  it('2. sign-in copy is fixed text: no code, no server text, and it does not call the account "inactive"', () => {
    const msg = messageForError(new ApiError('http', 403, 'NO_APPROVED_ROLE'), 'signIn');
    expect(msg).toMatch(/can no longer be used with the app/);
    expect(msg).toMatch(/contact Protein Bowl support/i);
    expect(msg).not.toMatch(/NO_APPROVED_ROLE|Error:|undefined|\[object|inactive/);
    expect(messageForError(new ApiError('http', 403, 'NO_APPROVED_ROLE'))).toBe(msg);
  });

  it('3. other 403 codes keep their own copy (the new case does not swallow them)', () => {
    expect(messageForError(new ApiError('http', 403, 'CUSTOMER_APP_ONLY'))).toMatch(/customer accounts only/);
    expect(messageForError(new ApiError('http', 403, 'ACCOUNT_INACTIVE'))).toMatch(/not active/);
    expect(messageForError(new ApiError('http', 403, 'SOMETHING_ELSE'))).toBe('This is not available for your account.');
  });

  it('4. the signed-out reason has its own copy', () => {
    const msg = messageForSignedOut('no_approved_role');
    expect(msg).toMatch(/can no longer be used with the app/);
    expect(msg).not.toMatch(/NO_APPROVED_ROLE/);
    expect(messageForSignedOut('customer_only')).not.toBe(msg);
  });

  it('5. a stored session whose refresh is refused with NO_APPROVED_ROLE is ended for good: credential deleted, reason no_approved_role, never replayed', async () => {
    const first = setup();
    first.backend.addUser({ email: 'a@b.test' });
    await first.manager.signIn('a@b.test', 'Password-123');
    expect(store.has(SESSION_KEY)).toBe(true);
    // a fresh app launch over the same device storage
    const launch = setup();
    launch.backend.users = first.backend.users;
    launch.backend.refreshTokens = first.backend.refreshTokens;
    launch.backend.accessTokens = first.backend.accessTokens;
    const calls = jest.fn(refusal);
    (launch.manager as any).api.fetchImpl = async () => calls();
    await launch.manager.restore();
    expect(launch.manager.getState()).toEqual({ status: 'signedOut', reason: 'no_approved_role' });
    expect(store.size).toBe(0);
    expect(launch.cleared).toHaveBeenCalled();
    expect(calls).toHaveBeenCalledTimes(1);
  });
});
