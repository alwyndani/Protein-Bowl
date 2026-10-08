import React, { useRef, useState } from 'react';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { AdminService } from '../../services/adminService';
import { AdminErrorInfo, describeAdminError } from './adminErrors';
import { ErrorNotice, Field, inputClass, primaryButton } from './adminUi';

export const ACCEPT_INVITE_PATH = '/staff/accept-invite';

export function isAcceptInviteRoute(pathname: string): boolean {
  return pathname.replace(/\/+$/, '') === ACCEPT_INVITE_PATH;
}

/**
 * The invitation token arrives in the URL FRAGMENT (`#token=...`). It is read once, held in MODULE MEMORY only, and the
 * fragment is scrubbed from the address bar immediately. It is never copied to a query string, localStorage,
 * sessionStorage, a cookie or any log. (Module memory - rather than React state - makes the capture idempotent under
 * React StrictMode's double-invoked initializers.)
 */
let capturedToken: string | null = null;

export function captureInvitationToken(): string | null {
  if (capturedToken !== null) return capturedToken;
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const token = new URLSearchParams(hash).get('token');
  if (token) {
    capturedToken = token;
    // Remove the secret from the visible URL (and from history) as soon as it is safely in memory.
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
  }
  return capturedToken;
}

/** Test helper: forget the in-memory token. */
export function clearCapturedInvitationToken(): void {
  capturedToken = null;
}

const MIN_LENGTH = 12;

export const AcceptInvitePage: React.FC = () => {
  const [token, setToken] = useState<string | null>(() => captureInvitationToken());
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const [error, setError] = useState<AdminErrorInfo | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const submitting = useRef(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current || !token) return;
    setClientError(null);
    if (password.length < MIN_LENGTH) {
      setClientError(`Your password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setClientError('The two passwords do not match.');
      return;
    }

    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      await AdminService.acceptInvitation(token, password);
      // Success: drop the secret and the password from memory.
      clearCapturedInvitationToken();
      setToken(null);
      setPassword('');
      setConfirm('');
      setDone(true);
    } catch (err) {
      const info = describeAdminError(err);
      setPassword('');
      setConfirm('');
      setError(
        info.code === 'INVALID_INVITATION'
          ? { ...info, message: 'This invitation link is invalid, has expired, or has already been used. Ask your administrator to send a new invitation.' }
          : info.code === 'PASSWORD_POLICY'
            ? { ...info, message: info.message }
            : info
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-950 text-white flex items-center justify-center p-4">
      <main className="w-full max-w-md bg-stone-900 border border-stone-800 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <KeyRound className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-amber-300">Protein Bowl staff</p>
            <h1 className="text-xl font-black">Activate your account</h1>
          </div>
        </div>

        {done ? (
          <div role="status" className="space-y-4">
            <div className="flex items-start gap-3 text-emerald-200">
              <CheckCircle2 className="w-6 h-6 shrink-0" aria-hidden="true" />
              <p className="text-sm">Your account is active. You can now sign in with your email and the new password.</p>
            </div>
            <a href="/staff/login" className={`${primaryButton} w-full`}>
              Go to staff sign-in
            </a>
          </div>
        ) : !token ? (
          <div role="alert" className="space-y-3 text-sm text-stone-300">
            <p>This invitation link is missing or no longer available. Open the full link your administrator gave you, or ask them to send a new invitation.</p>
          </div>
        ) : (
          <form onSubmit={submit} noValidate aria-label="Set your password" className="space-y-4">
            <p className="text-xs text-stone-400">Choose a password to finish setting up your staff account.</p>

            <Field label="New password" htmlFor="invite-password">
              <input id="invite-password" type="password" autoComplete="new-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} disabled={pending} />
            </Field>
            <Field label="Confirm password" htmlFor="invite-confirm" error={clientError ?? undefined}>
              <input id="invite-confirm" type="password" autoComplete="new-password" className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={pending} />
            </Field>

            <ul className="text-[11px] text-stone-400 list-disc pl-5 space-y-0.5" aria-label="Password requirements">
              <li>At least {MIN_LENGTH} characters (up to 128).</li>
              <li>Mix at least three of: lowercase, uppercase, digits, symbols — or use a passphrase of 20+ characters.</li>
              <li>Do not use common or default passwords, or your name or email.</li>
            </ul>

            <ErrorNotice error={error} />

            <button type="submit" disabled={pending} className={`${primaryButton} w-full`}>
              {pending ? 'Activating…' : 'Activate account'}
            </button>
          </form>
        )}
      </main>
    </div>
  );
};
