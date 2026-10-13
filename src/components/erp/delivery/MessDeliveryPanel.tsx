import React, { useCallback, useId, useRef, useState } from 'react';
import { AlertTriangle, Loader2, MapPin, RefreshCw, Truck } from 'lucide-react';
import { MessService } from '../../../services/messService';
import type { MessDriverRuns, MessRun, MessStop, MessStopFailureCode } from '../../../services/messTypes';
import { usePolledResource } from '../../../hooks/usePolledResource';
import { describeMessError, MessUserError } from '../../../utils/messErrors';
import { AccessibleDialog } from '../../common/AccessibleDialog';

const SLOT_LABEL: Record<string, string> = { BREAKFAST: 'Breakfast', LUNCH: 'Lunch', DINNER: 'Dinner' };
const FAILURE_LABEL: Record<MessStopFailureCode, string> = {
  SERVICE_POINT_CLOSED: 'The service point is closed',
  RECIPIENT_UNAVAILABLE: 'No resident is available',
  CODE_NOT_AVAILABLE: 'No handover code could be obtained',
  UNABLE_TO_REACH: 'Could not reach the service point',
  VEHICLE_ISSUE: 'Vehicle problem',
  QUANTITY_MISMATCH: 'The quantity does not match',
  OTHER: 'Another problem'
};
const RUN_LABEL: Record<string, string> = { AVAILABLE: 'Ready for pickup', CLAIMED: 'Claimed', IN_TRANSIT: 'On the road', COMPLETED: 'Completed', CLOSED: 'Closed' };
const STOP_LABEL: Record<string, string> = { PENDING: 'Waiting', FAILED: 'Problem reported', HANDED_OVER: 'Handed over', CLOSED_UNDELIVERED: 'Closed: not delivered' };
const PROOF_TEXT: Record<string, string> = {
  CODE_NOT_ISSUED: 'No resident has requested the code yet.',
  READY_FOR_VERIFICATION: 'A resident has the code. Ask them to read it to you.',
  LOCKED: 'Code entry is locked for a while after too many wrong codes.',
  CODE_BLOCKED: 'This code is blocked. A resident must generate a new one.',
  CODE_EXPIRED: 'The code expired. A resident must generate a new one.'
};
const toPolled = (e: unknown) => {
  const info = describeMessError(e);
  return { ...info, action: info.action === 'SIGN_IN' ? ('SIGN_IN' as const) : ('NONE' as const) };
};
const button = 'min-h-11 inline-flex items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-50';
const primary = `${button} bg-orange-600 text-white hover:bg-orange-700`;
const secondary = `${button} border border-stone-400 bg-white text-stone-900 hover:bg-stone-50`;

/**
 * Kerala Mess bulk delivery for the DELIVERY employee (P10C). One run = one kitchen batch; one stop per service point with a FROZEN quantity.
 * No customer name, phone, room or student id is ever shown, and the driver never sees the handover code: a resident of the service point reads it out.
 * No payment, cash, collection or refund control exists here. Polling is GET-only (the P8/P9 pattern); the server decides every outcome.
 */
export const MessDeliveryPanel: React.FC<{ onSessionExpired?: () => void }> = ({ onSessionExpired }) => {
  const poll = usePolledResource<MessDriverRuns, ReturnType<typeof toPolled>>({ fetcher: () => MessService.deliveryRuns(), resetKey: 'mess-runs', describeError: toPolled, onSessionExpired });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<MessUserError | null>(null);
  const [failing, setFailing] = useState<{ run: MessRun; stop: MessStop } | null>(null);
  const inFlight = useRef(false);

  const run = useCallback(
    async (key: string, fn: () => Promise<unknown>): Promise<boolean> => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setBusy(key);
      setError(null);
      let ok = false;
      try {
        await fn();
        ok = true;
      } catch (err) {
        const info = describeMessError(err);
        if (info.action === 'SIGN_IN') poll.halt();
        setError(info);
      } finally {
        inFlight.current = false;
        setBusy(null);
        await poll.refresh();
      }
      return ok;
    },
    [poll]
  );

  if (poll.loadState === 'loading') {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-stone-800">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        Loading Kerala Mess runs…
      </p>
    );
  }
  if (!poll.data) {
    return (
      <div role="alert" className="text-sm text-red-900 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
        {poll.loadError?.message ?? 'The Kerala Mess runs could not be loaded.'}
      </div>
    );
  }
  const { available, mine, today } = poll.data;

  return (
    <section aria-label="Kerala Mess runs" data-testid="mess-delivery" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-stone-700">
          Hostel meal runs for <strong>{today}</strong>. Each stop is a service point with a fixed number of meals. The list refreshes automatically.
        </p>
        <button type="button" onClick={() => void poll.refresh()} className={secondary} aria-label="Refresh Kerala Mess runs">
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          Refresh
        </button>
      </div>
      {poll.stale && <p role="status" className="text-xs text-amber-900 bg-amber-50 border border-amber-300 rounded-xl px-3 py-2">The list could not be refreshed. What you see may be out of date.</p>}
      {error && (
        <div role="alert" data-testid="mess-delivery-error" className="flex items-start gap-2 text-xs text-red-900 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p>{error.message}</p>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-black">Available runs</h3>
        {available.length === 0 && <p className="text-xs text-stone-700" data-testid="mess-runs-available-empty">No run is waiting for a driver.</p>}
        {available.map((r) => (
          <RunCard key={r.id} run={r} busy={busy} onClaim={() => void run(`claim-${r.id}`, () => MessService.claimRun(r.id))} />
        ))}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-black">My runs</h3>
        {mine.length === 0 && <p className="text-xs text-stone-700" data-testid="mess-runs-mine-empty">You have no run.</p>}
        {mine.map((r) => (
          <RunCard
            key={r.id}
            run={r}
            mine
            busy={busy}
            onDispatch={() => void run(`dispatch-${r.id}`, () => MessService.dispatchRun(r.id))}
            onVerify={(stop, code) => run(`verify-${stop.id}`, () => MessService.verifyStop(r.id, stop.id, code))}
            onFail={(stop) => setFailing({ run: r, stop })}
            onRetry={(stop) => void run(`retry-${stop.id}`, () => MessService.retryStop(r.id, stop.id))}
          />
        ))}
      </div>

      {failing && (
        <FailDialog
          run={failing.run}
          stop={failing.stop}
          busy={busy === `fail-${failing.stop.id}`}
          onClose={() => setFailing(null)}
          onSubmit={async (reasonCode, note) => {
            const ok = await run(`fail-${failing.stop.id}`, () => MessService.failStop(failing.run.id, failing.stop.id, reasonCode, note));
            if (ok) setFailing(null);
          }}
        />
      )}
    </section>
  );
};

const RunCard: React.FC<{
  run: MessRun;
  mine?: boolean;
  busy: string | null;
  onClaim?: () => void;
  onDispatch?: () => void;
  onVerify?: (stop: MessStop, code: string) => Promise<boolean>;
  onFail?: (stop: MessStop) => void;
  onRetry?: (stop: MessStop) => void;
}> = ({ run, mine, busy, onClaim, onDispatch, onVerify, onFail, onRetry }) => (
  <article data-testid={`mess-run-${run.mealDate}-${run.slot}`} data-status={run.status} className="rounded-2xl border border-stone-300 bg-stone-50 p-4 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="text-sm font-black flex items-center gap-2">
          <Truck className="w-4 h-4 text-orange-700" aria-hidden="true" />
          {SLOT_LABEL[run.slot] ?? run.slot} · {run.mealDate}
        </p>
        <p className="text-xs text-stone-700">
          {run.branch.name} · <strong>{run.mealCount}</strong> meals · {run.stopCount} {run.stopCount === 1 ? 'service point' : 'service points'}
        </p>
      </div>
      <span className="px-2 py-0.5 rounded-full border border-stone-400 bg-white text-[10px] font-black uppercase tracking-wider">{RUN_LABEL[run.status] ?? run.status}</span>
    </div>
    {!mine && run.status === 'AVAILABLE' && (
      <button type="button" disabled={!!busy} onClick={onClaim} className={primary}>
        {busy === `claim-${run.id}` && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
        Claim this run
      </button>
    )}
    {mine && run.status === 'CLAIMED' && (
      <button type="button" disabled={!!busy} onClick={onDispatch} className={primary}>
        {busy === `dispatch-${run.id}` && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
        Start the run (food loaded)
      </button>
    )}
    <ul className="space-y-2">
      {run.stops.map((s) => (
        <StopCard key={s.id} stop={s} run={run} mine={!!mine} busy={busy} onVerify={onVerify} onFail={onFail} onRetry={onRetry} />
      ))}
    </ul>
  </article>
);

const StopCard: React.FC<{
  stop: MessStop;
  run: MessRun;
  mine: boolean;
  busy: string | null;
  onVerify?: (stop: MessStop, code: string) => Promise<boolean>;
  onFail?: (stop: MessStop) => void;
  onRetry?: (stop: MessStop) => void;
}> = ({ stop, run, mine, busy, onVerify, onFail, onRetry }) => {
  const [code, setCode] = useState('');
  const inputId = useId();
  const working = run.status === 'IN_TRANSIT' && mine;
  const sp = stop.servicePoint;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = code;
    setCode(''); // the code never stays in the field (or anywhere else) once it has been submitted
    if (onVerify) await onVerify(stop, value);
  };
  return (
    <li data-testid={`mess-stop-${sp.name}`} data-status={stop.status} className="rounded-xl border border-stone-300 bg-white p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-black flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-orange-700" aria-hidden="true" />
            {sp.name}
            {sp.gateLabel ? ` (${sp.gateLabel})` : ''}
          </p>
          <p className="text-xs text-stone-700">
            {sp.addressLine}, {sp.city} {sp.postalCode}
          </p>
          {sp.deliveryInstructions && <p className="text-xs text-stone-900 mt-1" data-testid="mess-stop-instructions">Note: {sp.deliveryInstructions}</p>}
        </div>
        <div className="text-right">
          <p className="text-lg font-black text-orange-700" data-testid="mess-stop-quantity">
            {stop.expectedQuantity} <span className="text-xs font-bold">meals</span>
          </p>
          <p className="text-[11px] text-stone-700">
            Attempt {stop.attempt.number} of {stop.attempt.max}
          </p>
        </div>
      </div>
      <p className="text-[11px] font-black uppercase tracking-wider text-stone-700">{STOP_LABEL[stop.status] ?? stop.status}</p>

      {working && stop.status === 'PENDING' && (
        <div className="space-y-2">
          <p className="text-xs text-stone-800">
            {PROOF_TEXT[stop.proof.state] ?? ''} You cannot see the code yourself: a resident of this service point reads it to you.
          </p>
          <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor={inputId} className="block text-[11px] font-bold uppercase tracking-wide text-stone-700 mb-1">
                Handover code
              </label>
              <input
                id={inputId}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d\s-]/g, '').slice(0, 7))}
                inputMode="numeric"
                autoComplete="off"
                className="min-h-11 w-40 rounded-xl border border-stone-400 bg-white px-3 text-base tracking-widest text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              />
            </div>
            <button type="submit" disabled={!!busy || code.replace(/\D/g, '').length !== 6} className={primary}>
              {busy === `verify-${stop.id}` && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              Confirm handover
            </button>
            <button type="button" disabled={!!busy} onClick={() => onFail?.(stop)} className={secondary}>
              Report a problem
            </button>
          </form>
        </div>
      )}
      {stop.status === 'FAILED' && (
        <div className="space-y-2">
          <p className="text-xs text-stone-800">Problem reported{stop.failureCode ? `: ${FAILURE_LABEL[stop.failureCode] ?? stop.failureCode}` : ''}.</p>
          {working && stop.attempt.number < stop.attempt.max && (
            <button type="button" disabled={!!busy} onClick={() => onRetry?.(stop)} className={secondary}>
              {busy === `retry-${stop.id}` && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              Try again
            </button>
          )}
          {stop.attempt.number >= stop.attempt.max && <p className="text-xs text-stone-700">No more attempts. The team closes this stop at the end of the day.</p>}
        </div>
      )}
      {stop.status === 'CLOSED_UNDELIVERED' && <p className="text-xs text-stone-700">This stop was closed without a handover.</p>}
    </li>
  );
};

const FailDialog: React.FC<{ run: MessRun; stop: MessStop; busy: boolean; onClose: () => void; onSubmit: (reason: MessStopFailureCode, note: string) => Promise<void> }> = ({ stop, busy, onClose, onSubmit }) => {
  const titleId = useId();
  const [reason, setReason] = useState<MessStopFailureCode | ''>('');
  const [note, setNote] = useState('');
  const needsNote = reason === 'OTHER';
  return (
    <AccessibleDialog labelledBy={titleId} onClose={onClose} closeDisabled={busy}>
      <form
        className="p-5 space-y-4 text-stone-900"
        onSubmit={(e) => {
          e.preventDefault();
          if (reason) void onSubmit(reason, note);
        }}
      >
        <h2 id={titleId} className="text-base font-black">
          Report a problem at {stop.servicePoint.name}
        </h2>
        <p className="text-xs text-stone-700">This only records what happened. The meals stay scheduled until the stop is handed over or closed.</p>
        <div>
          <label htmlFor="mess-fail-reason" className="block text-[11px] font-bold uppercase tracking-wide text-stone-700 mb-1">
            What happened?
          </label>
          <select id="mess-fail-reason" value={reason} onChange={(e) => setReason(e.target.value as MessStopFailureCode)} required className="min-h-11 w-full rounded-xl border border-stone-400 bg-white px-3 text-sm">
            <option value="">Select…</option>
            {(Object.keys(FAILURE_LABEL) as MessStopFailureCode[]).map((c) => (
              <option key={c} value={c}>
                {FAILURE_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="mess-fail-note" className="block text-[11px] font-bold uppercase tracking-wide text-stone-700 mb-1">
            Note {needsNote ? '(required)' : '(optional)'}
          </label>
          <textarea id="mess-fail-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} rows={2} required={needsNote} className="w-full rounded-xl border border-stone-400 bg-white px-3 py-2 text-sm" />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={secondary}>
            Cancel
          </button>
          <button type="submit" disabled={busy || !reason || (needsNote && note.trim().length < 3)} className={primary}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            Report problem
          </button>
        </div>
      </form>
    </AccessibleDialog>
  );
};
