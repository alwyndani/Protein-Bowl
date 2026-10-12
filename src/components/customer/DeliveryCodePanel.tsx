import React, { useState } from 'react';
import { Copy, Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { useDeliveryCode } from '../../hooks/useDeliveryCode';
import { AccessibleDialog } from '../common/AccessibleDialog';

const group = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;
const spoken = (code: string) => code.split('').join(' ');

const primary = 'min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black px-4 py-2 text-sm disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300';
const secondary = 'min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-600 text-stone-100 font-bold px-4 py-2 text-xs disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300';

/**
 * The customer's Delivery Code while the order is out for delivery. The code is shown ONCE (right after it is generated) and lives in
 * component memory only: after a reload the customer sees that a code exists but never the old digits, and generates a new one if needed.
 * The customer gives the code to the delivery partner at handover; it proves the handover and has nothing to do with payment.
 */
export const DeliveryCodePanel: React.FC<{ orderId: string; onSessionExpired?: () => void; onVerified?: () => void }> = ({ orderId, onSessionExpired, onVerified }) => {
  const { proof, loadState, loadError, stale, code, busy, error, issue, regenerate, dismissError } = useDeliveryCode({ orderId, enabled: true, onSessionExpired, onVerified });
  const [revealed, setRevealed] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState('');

  const state = proof?.state ?? null;
  if (state === 'NOT_AVAILABLE') return null;

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied('Code copied.');
    } catch {
      setCopied('Could not copy automatically. Please read the digits out instead.');
    }
  };

  return (
    <section aria-label="Delivery code" data-testid="delivery-code-panel" className="bg-stone-950/60 border border-stone-800 rounded-2xl p-4 space-y-3">
      <h4 className="flex items-center gap-2 text-sm font-black text-white">
        <KeyRound className="w-4 h-4 text-amber-400" aria-hidden="true" />
        Delivery code
      </h4>
      <p className="text-xs text-stone-300">Show this 6-digit code to your delivery partner when you receive your order. It confirms the handover. Never share it before your order arrives.</p>

      {loadState === 'loading' && !proof && (
        <p role="status" className="flex items-center gap-2 text-xs text-stone-300">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Checking your delivery code…
        </p>
      )}
      {loadState === 'error' && !proof && (
        <p role="alert" data-testid="delivery-code-load-error" className="text-xs text-red-200">
          {loadError?.message ?? 'Your delivery code status could not be loaded.'}
        </p>
      )}
      {stale && (
        <p role="alert" data-testid="delivery-code-stale" className="text-xs text-amber-200">
          {loadError?.message ?? 'Status could not be refreshed.'} What you see may be out of date.
        </p>
      )}

      {state === 'NOT_ISSUED' && !code && (
        <button type="button" onClick={() => void issue()} disabled={busy} aria-busy={busy} data-testid="delivery-code-get" className={primary}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          {busy ? 'Working…' : 'Get my delivery code'}
        </button>
      )}

      {code && state !== 'CODE_BLOCKED' && state !== 'VERIFIED' && (
        <div className="space-y-2" data-testid="delivery-code-shown">
          <p
            data-testid="delivery-code-value"
            aria-label={revealed ? `Your delivery code is ${spoken(code)}` : 'Your delivery code is hidden'}
            className="text-4xl font-black tracking-[0.25em] text-white font-mono select-all"
          >
            {revealed ? group(code) : '••• •••'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setRevealed((v) => !v)} aria-pressed={!revealed} data-testid="delivery-code-toggle" className={secondary}>
              {revealed ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
              {revealed ? 'Hide code' : 'Show code'}
            </button>
            <button type="button" onClick={() => void copy()} data-testid="delivery-code-copy" className={secondary}>
              <Copy className="w-4 h-4" aria-hidden="true" />
              Copy code
            </button>
          </div>
          <p role="status" aria-live="polite" data-testid="delivery-code-copied" className="text-[11px] text-emerald-200 min-h-4">
            {copied}
          </p>
          <p className="text-[11px] text-amber-200">For your security this code is shown only now. If you leave this screen you will need to generate a new one.</p>
        </div>
      )}

      {state === 'ISSUED' && !code && (
        <p data-testid="delivery-code-issued-note" className="text-xs text-stone-200">
          A delivery code has been generated for this order. For your security it cannot be shown again. If you no longer have it, generate a new code (the old one will stop working).
        </p>
      )}
      {state === 'LOCKED' && (
        <p role="status" data-testid="delivery-code-locked" className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/40 rounded-xl px-3 py-2">
          Code entry is temporarily locked after several incorrect attempts
          {proof?.lockedUntil ? ` (until ${new Date(proof.lockedUntil).toLocaleTimeString()})` : ''}. You can wait, or generate a new code.
        </p>
      )}
      {state === 'CODE_BLOCKED' && (
        <p role="alert" data-testid="delivery-code-blocked" className="text-xs text-red-200 bg-red-500/10 border border-red-500/40 rounded-xl px-3 py-2">
          This code was blocked after too many incorrect attempts. Generate a new code to continue.
        </p>
      )}
      {state === 'VERIFIED' && (
        <p role="status" data-testid="delivery-code-verified" className="flex items-center gap-2 text-xs text-emerald-200">
          <ShieldCheck className="w-4 h-4" aria-hidden="true" />
          Delivery confirmed. Thank you!
        </p>
      )}

      {(state === 'ISSUED' || state === 'LOCKED' || state === 'CODE_BLOCKED') && (
        <button type="button" onClick={() => setConfirming(true)} disabled={busy} data-testid="delivery-code-regenerate" className={state === 'CODE_BLOCKED' ? primary : secondary}>
          Generate a new code
        </button>
      )}

      {error && (
        <div role="alert" data-testid="delivery-code-error" className="flex items-start justify-between gap-2 text-xs text-red-200 bg-red-500/10 border border-red-500/40 rounded-xl px-3 py-2">
          <span>{error}</span>
          <button type="button" onClick={dismissError} className="font-bold underline shrink-0 min-h-8 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300">
            Dismiss
          </button>
        </div>
      )}

      {confirming && (
        <AccessibleDialog labelledBy="delivery-code-confirm-title" onClose={() => setConfirming(false)} closeDisabled={busy}>
          <div className="p-5 space-y-4">
            <h2 id="delivery-code-confirm-title" className="text-base font-black text-white">
              Generate a new delivery code?
            </h2>
            <p className="text-xs text-stone-300">Your current code will stop working immediately. Only do this if you no longer have it or it was blocked.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={secondary}>
                Keep current code
              </button>
              <button
                type="button"
                disabled={busy}
                data-testid="delivery-code-confirm"
                onClick={async () => {
                  setConfirming(false);
                  setCopied('');
                  setRevealed(true);
                  await regenerate();
                }}
                className={primary}
              >
                Generate new code
              </button>
            </div>
          </div>
        </AccessibleDialog>
      )}
    </section>
  );
};
