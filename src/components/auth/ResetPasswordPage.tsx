import React, { useRef, useState } from 'react';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { PasswordResetService } from '../../services/passwordResetService';
import { ApiRequestError } from '../../services/apiClient';

export const RESET_PASSWORD_PATH = '/reset-password';

export function isResetPasswordRoute(pathname: string): boolean {
  return pathname.replace(/\/+$/, '') === RESET_PASSWORD_PATH;
}

/**
 * The reset token arrives in the URL FRAGMENT (`#token=...`). It is read once, held in module memory only, and the fragment is
 * scrubbed from the address bar immediately. Never copied to a query string, storage, cookie or log.
 */
let capturedToken: string | null = null;

export function captureResetToken(): string | null {
  if (capturedToken !== null) return capturedToken;
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const token = new URLSearchParams(hash).get('token');
  if (token) {
    capturedToken = token;
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
  }
  return capturedToken;
}

export function clearCapturedResetToken(): void {
  capturedToken = null;
}

const MIN_LENGTH = 8;

export const ResetPasswordPage: React.FC = () => {
  const [token, setToken] = useState<string | null>(() => captureResetToken());
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const submitting = useRef(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current || !token) return;
    setError(null);
    if (password.length < MIN_LENGTH) return setError(`Your password must be at least ${MIN_LENGTH} characters.`);
    if (password !== confirm) return setError('The two passwords do not match.');

    submitting.current = true;
    setPending(true);
    try {
      await PasswordResetService.completeReset(token, password);
      clearCapturedResetToken();
      setToken(null);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'INVALID_RESET_TOKEN') {
        setError('This reset link is invalid, has expired, or has already been used. Request a new one from the sign-in page.');
      } else if (err instanceof ApiRequestError && err.code === 'PASSWORD_POLICY') {
        setError(err.message);
      } else {
        setError('We could not change your password. Please try again.');
      }
    } finally {
      setPassword('');
      setConfirm('');
      submitting.current = false;
      setPending(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-950 text-white flex items-center justify-center p-4">
      <main className="w-full max-w-md bg-stone-900 border border-stone-800 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/30"><KeyRound className="w-5 h-5" aria-hidden="true" /></div>
          <h1 className="text-xl font-black">Reset your password</h1>
        </div>

        {done ? (
          <div role="status" className="space-y-4">
            <div className="flex items-start gap-3 text-emerald-200"><CheckCircle2 className="w-6 h-6 shrink-0" aria-hidden="true" /><p className="text-sm">Your password has been changed and you have been signed out everywhere. Sign in with your new password.</p></div>
            <a href="/" className="block text-center bg-amber-500 text-stone-950 font-black rounded-xl py-2.5 text-sm">Go to Protein Bowl</a>
          </div>
        ) : !token ? (
          <p role="alert" className="text-sm text-stone-300">This reset link is missing or no longer available. Request a new one from the sign-in page ("Forgot password?").</p>
        ) : (
          <form onSubmit={submit} noValidate aria-label="Choose a new password" className="space-y-4">
            <label className="block text-xs font-bold text-stone-300 space-y-1" htmlFor="reset-password">New password
              <input id="reset-password" type="password" autoComplete="new-password" className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm" value={password} onChange={(e) => setPassword(e.target.value)} disabled={pending} />
            </label>
            <label className="block text-xs font-bold text-stone-300 space-y-1" htmlFor="reset-confirm">Confirm password
              <input id="reset-confirm" type="password" autoComplete="new-password" className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={pending} />
            </label>
            <p className="text-[11px] text-stone-400">At least {MIN_LENGTH} characters. Staff accounts need 12+ characters with a mix of character types, or a 20+ character passphrase.</p>
            {error && <p role="alert" className="text-xs text-red-200 bg-red-950/60 border border-red-500/40 rounded-xl px-3 py-2">{error}</p>}
            <button type="submit" disabled={pending} className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-stone-950 font-black rounded-xl py-2.5 text-sm">{pending ? 'Saving…' : 'Change password'}</button>
          </form>
        )}
      </main>
    </div>
  );
};
