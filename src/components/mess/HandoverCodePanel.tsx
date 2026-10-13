import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { MessService } from '../../services/messService';
import type { MessHandoverStatus } from '../../services/messTypes';
import { describeMessError, MessUserError } from '../../utils/messErrors';

const secondary = 'inline-flex items-center justify-center gap-2 bg-stone-800 hover:bg-stone-700 text-stone-100 border border-stone-700 font-bold px-3 py-1.5 rounded-lg text-xs disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300';
const primary = 'inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black px-3 py-1.5 rounded-lg text-xs disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300';
const timeFmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });

/**
 * Service-point handover code for ONE meal that is out for delivery (P10C). The first resident of the service point to ask becomes the recipient and reads the
 * code to the driver in person; the driver can never see it. The plaintext lives ONLY in this component's memory (never localStorage / sessionStorage / IndexedDB,
 * never a URL, never a log) and disappears on reload or when the panel closes: after that the resident can only generate a new one.
 */
export const HandoverCodePanel: React.FC<{ subscriptionId: string; mealId: string; onSessionExpired?: () => void; onChanged?: () => void }> = ({ subscriptionId, mealId, onSessionExpired, onChanged }) => {
  const [status, setStatus] = useState<MessHandoverStatus | null>(null);
  const [code, setCode] = useState<{ value: string; expiresAt: string } | null>(null);
  const [visible, setVisible] = useState(true);
  const [confirmNew, setConfirmNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessUserError | null>(null);
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const mounted = useRef(true);

  const fail = useCallback(
    (err: unknown) => {
      const info = describeMessError(err);
      if (info.action === 'SIGN_IN') onSessionExpired?.();
      if (mounted.current) setError(info);
    },
    [onSessionExpired]
  );
  const load = useCallback(async (keepError = false) => {
    try {
      const s = await MessService.handoverState(subscriptionId, mealId);
      if (mounted.current) {
        setStatus(s);
        if (!keepError) setError(null); // a refresh after a refused action must not erase the explanation
      }
    } catch (err) {
      fail(err);
    }
  }, [subscriptionId, mealId, fail]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      setCode(null);
    };
  }, [load]);

  const act = async (kind: 'issue' | 'regenerate') => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setCopied(null);
    try {
      const out = kind === 'issue' ? await MessService.issueHandoverCode(subscriptionId, mealId) : await MessService.regenerateHandoverCode(subscriptionId, mealId);
      if (!mounted.current) return;
      setCode({ value: out.code, expiresAt: out.expiresAt });
      setVisible(true);
      setConfirmNew(false);
      setStatus({ state: 'ISSUED_TO_YOU', expiresAt: out.expiresAt, regenerationsLeft: out.regenerationsLeft });
      onChanged?.();
    } catch (err) {
      fail(err);
      await load(true);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code!.value);
      setCopied('yes');
    } catch {
      setCopied('no'); // permission denied: the digits are on screen anyway
    }
  };

  if (!status) {
    return error ? (
      <p role="alert" className="text-[11px] text-red-300" data-testid="handover-error">
        {error.message}
      </p>
    ) : (
      <p role="status" className="text-[11px] text-stone-400">Checking the delivery…</p>
    );
  }
  if (status.state === 'NOT_AVAILABLE' || status.state === 'VERIFIED') return null;

  const grouped = code ? `${code.value.slice(0, 3)} ${code.value.slice(3)}` : '';
  const left = status.regenerationsLeft ?? 0;
  return (
    <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2 w-full" data-testid="handover-panel">
      <p className="text-[11px] font-black text-amber-200 flex items-center gap-1.5">
        <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
        Delivery code for your service point
      </p>
      {error && (
        <p role="alert" data-testid="handover-error" className="text-[11px] text-red-300">
          {error.message}
        </p>
      )}
      {status.state === 'NOT_ISSUED' && (
        <>
          <p className="text-[11px] text-stone-300">The driver will ask for a 6-digit code when the food arrives. Generate it only when you are at the service point, and read it out to the driver yourself. The first resident who generates it receives it for everyone.</p>
          <button type="button" disabled={busy} onClick={() => void act('issue')} className={primary}>
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
            Get my delivery code
          </button>
        </>
      )}
      {status.state === 'ISSUED_TO_ANOTHER' && <p className="text-[11px] text-stone-300" data-testid="handover-other">A resident of your service point already holds the delivery code for this delivery. Ask them to read it to the driver.</p>}
      {(status.state === 'ISSUED_TO_YOU' || status.state === 'LOCKED' || status.state === 'CODE_BLOCKED' || status.state === 'CODE_EXPIRED') && (
        <>
          {code && status.state === 'ISSUED_TO_YOU' ? (
            <div className="space-y-1">
              <p className="text-2xl font-black tracking-[0.25em] text-white" data-testid="handover-code" aria-label={visible ? `Delivery code ${code.value.split('').join(' ')}` : 'Delivery code hidden'}>
                {visible ? grouped : '••• •••'}
              </p>
              <p className="text-[11px] text-stone-400">Valid until about {timeFmt.format(new Date(code.expiresAt))}. Read it only to the driver at your service point.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setVisible((v) => !v)} className={secondary}>
                  {visible ? <EyeOff className="w-3.5 h-3.5" aria-hidden="true" /> : <Eye className="w-3.5 h-3.5" aria-hidden="true" />}
                  {visible ? 'Hide' : 'Show'}
                </button>
                <button type="button" onClick={() => void copy()} className={secondary}>
                  Copy
                </button>
              </div>
              {copied === 'yes' && <p role="status" className="text-[11px] text-emerald-300">Copied.</p>}
              {copied === 'no' && <p role="status" className="text-[11px] text-amber-200">Copying is not allowed here. The digits are shown above.</p>}
            </div>
          ) : (
            <p className="text-[11px] text-stone-300" data-testid="handover-not-shown">
              {status.state === 'LOCKED'
                ? 'Too many wrong codes were entered, so code entry is paused for a while.'
                : status.state === 'CODE_BLOCKED'
                  ? 'This code was entered wrongly too many times and is blocked.'
                  : status.state === 'CODE_EXPIRED'
                    ? 'Your delivery code expired.'
                    : 'You already generated the code. For your security it cannot be shown again.'}{' '}
              Generate a new one if you need it.
            </p>
          )}
          {!confirmNew ? (
            <button type="button" disabled={busy || left < 1} onClick={() => setConfirmNew(true)} className={secondary}>
              Generate a new code{left > 0 ? ` (${left} left)` : ''}
            </button>
          ) : (
            <div className="space-y-1" role="group" aria-label="Confirm a new code">
              <p className="text-[11px] text-amber-100">The current code will stop working immediately.</p>
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => void act('regenerate')} className={primary}>
                  {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                  Yes, generate a new code
                </button>
                <button type="button" disabled={busy} onClick={() => setConfirmNew(false)} className={secondary}>
                  Keep the current code
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
