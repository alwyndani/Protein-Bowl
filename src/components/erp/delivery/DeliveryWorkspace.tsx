import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bike, Clock, Loader2, MapPin, Phone, RefreshCw } from 'lucide-react';
import { useDeliveryQueue } from '../../../hooks/useDeliveryQueue';
import { AccessibleDialog } from '../../common/AccessibleDialog';
import { FAILURE_REASONS } from '../../../services/deliveryTypes';
import type { DeliveryAreaOrder, DeliveryBranchRef, DeliveryOwnedOrder, FailureReasonCode } from '../../../services/deliveryTypes';

function elapsedText(fromIso: string | null, nowMs: number): string | null {
  if (!fromIso) return null;
  const mins = Math.max(0, Math.floor((nowMs - new Date(fromIso).getTime()) / 60_000));
  if (mins < 1) return 'less than a minute';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return `${h} h ${mins % 60} min`;
}

const buttonBase =
  'w-full min-h-11 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-black px-4 py-2 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';
const primary = `${buttonBase} bg-orange-950 hover:bg-orange-900 text-white focus-visible:ring-orange-500`;
const secondary = `${buttonBase} border border-stone-400 bg-white hover:bg-stone-50 text-stone-900 focus-visible:ring-orange-500`;

const Items: React.FC<{ order: DeliveryAreaOrder }> = ({ order }) => (
  <ul className="space-y-1" aria-label="Items in the bag">
    {order.items.map((item) => (
      <li key={item.id} className="text-xs text-stone-800 font-bold">
        {item.quantity} × {item.title}
        {item.variantName ? <span className="font-normal text-stone-600"> ({item.variantName})</span> : null}
      </li>
    ))}
  </ul>
);

const ErrorBox: React.FC<{ error: string | null; onDismiss: () => void }> = ({ error, onDismiss }) =>
  error ? (
    <div role="alert" className="text-[11px] text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-start justify-between gap-2">
      <span>{error}</span>
      <button type="button" onClick={onDismiss} className="font-bold underline shrink-0 min-h-8 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
        Dismiss
      </button>
    </div>
  ) : null;

const Header: React.FC<{ order: DeliveryAreaOrder; badge: string; showBranch: boolean; waiting: string | null; waitLabel: string }> = ({ order, badge, showBranch, waiting, waitLabel }) => (
  <>
    <header className="flex items-start justify-between gap-2">
      <div>
        <h4 className="text-sm font-black text-stone-900 break-all">{order.orderNumber}</h4>
        {showBranch && order.kitchenBranch && <p className="text-[11px] text-stone-600">Branch: {order.kitchenBranch.name}</p>}
      </div>
      <span className="shrink-0 text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-lg border border-stone-400 bg-stone-50 text-stone-900">{badge}</span>
    </header>
    {waiting && (
      <p className="flex items-center gap-1 text-[11px] text-stone-700">
        <Clock className="w-3 h-3" aria-hidden="true" />
        <span>
          {waitLabel} {waiting}
        </span>
      </p>
    )}
  </>
);

const AvailableCard: React.FC<{ order: DeliveryAreaOrder; nowMs: number; showBranch: boolean; pending: boolean; error: string | null; onClaim: () => void; onDismiss: () => void }> = ({ order, nowMs, showBranch, pending, error, onClaim, onDismiss }) => (
  <article aria-label={`Order ${order.orderNumber}`} data-testid="delivery-card" data-order-number={order.orderNumber} className="bg-white border border-stone-300 rounded-2xl p-4 shadow-sm space-y-3">
    <Header order={order} badge="Ready" showBranch={showBranch} waiting={elapsedText(order.readyAt, nowMs)} waitLabel="Ready for" />
    <p className="flex items-center gap-1 text-xs text-stone-800">
      <MapPin className="w-3 h-3" aria-hidden="true" />
      <span>Area: {[order.area.city, order.area.postalCode].filter(Boolean).join(' ') || 'not recorded'}</span>
    </p>
    <Items order={order} />
    <p className="text-[11px] text-stone-600">Customer details are shown after you claim this order.</p>
    <button type="button" onClick={onClaim} disabled={pending} aria-busy={pending} aria-label={`Claim ${order.orderNumber}`} data-testid="delivery-claim" className={primary}>
      {pending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
      {pending ? 'Working…' : 'Claim order'}
    </button>
    <ErrorBox error={error} onDismiss={onDismiss} />
  </article>
);

const OwnedDetails: React.FC<{ order: DeliveryOwnedOrder }> = ({ order }) => {
  const a = order.delivery.address;
  const lines = [a.line1, a.line2, [a.city, a.state].filter(Boolean).join(', '), a.postalCode].filter(Boolean);
  return (
    <div className="rounded-xl bg-stone-50 border border-stone-200 p-3 space-y-1 text-xs text-stone-900" data-testid="delivery-details">
      <p className="font-black">{order.delivery.firstName ?? 'Customer'}</p>
      {order.delivery.phone && (
        <p className="flex items-center gap-1">
          <Phone className="w-3 h-3" aria-hidden="true" />
          <a href={`tel:${order.delivery.phone.replace(/[^+\d]/g, '')}`} className="underline font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
            {order.delivery.phone}
          </a>
        </p>
      )}
      <p className="flex items-start gap-1">
        <MapPin className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
        <span>{lines.join(', ')}</span>
      </p>
      {order.delivery.instructions && (
        <p className="text-stone-800">
          <span className="font-bold">Delivery instructions:</span> {order.delivery.instructions}
        </p>
      )}
    </div>
  );
};

const MineCard: React.FC<{ order: DeliveryOwnedOrder; nowMs: number; showBranch: boolean; pending: boolean; error: string | null; onDispatch: () => void; onDismiss: () => void }> = ({ order, nowMs, showBranch, pending, error, onDispatch, onDismiss }) => (
  <article aria-label={`Order ${order.orderNumber}`} data-testid="delivery-card" data-order-number={order.orderNumber} className="bg-white border border-stone-300 rounded-2xl p-4 shadow-sm space-y-3">
    <Header order={order} badge="Claimed by you" showBranch={showBranch} waiting={elapsedText(order.readyAt, nowMs)} waitLabel="Ready for" />
    <OwnedDetails order={order} />
    <Items order={order} />
    <p className="text-[11px] text-stone-600">Press the button once you have collected the bag and are leaving.</p>
    <button type="button" onClick={onDispatch} disabled={pending} aria-busy={pending} aria-label={`Start delivery ${order.orderNumber}`} data-testid="delivery-dispatch" className={primary}>
      {pending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
      {pending ? 'Working…' : 'Collected, start delivery'}
    </button>
    <ErrorBox error={error} onDismiss={onDismiss} />
  </article>
);

/**
 * Delivery Code entry for the driver's OWN order. The code lives only in this input's state and is cleared after every submit: it is never
 * stored, logged or sent anywhere except the verification request. Who may verify, and whether the code is right, is decided by the server.
 */
const VerifyForm: React.FC<{ order: DeliveryOwnedOrder; pending: boolean; onVerify: (code: string) => Promise<boolean> }> = ({ order, pending, onVerify }) => {
  const [value, setValue] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const state = order.proof?.state ?? 'CODE_NOT_ISSUED';
  const blocked = state === 'LOCKED' || state === 'CODE_BLOCKED';
  const inputId = `delivery-code-${order.id}`;
  const hintId = `${inputId}-hint`;
  const hint =
    state === 'CODE_NOT_ISSUED'
      ? 'The customer has not generated a code yet. Ask them to open their order and tap "Get my delivery code".'
      : state === 'LOCKED'
        ? `Code entry is locked until ${order.proof?.lockedUntil ? new Date(order.proof.lockedUntil).toLocaleTimeString() : 'later'}.`
        : state === 'CODE_BLOCKED'
          ? 'This code is blocked. Ask the customer to generate a new delivery code.'
          : 'Ask the customer for the 6-digit code shown in their order.';
  return (
    <form
      className="space-y-2 rounded-xl border border-stone-300 bg-stone-50 p-3"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (pending || blocked) return;
        if (value.replace(/\D/g, '').length !== 6) {
          setLocalError('Enter the 6-digit delivery code.');
          return;
        }
        setLocalError(null);
        const submitted = value;
        setValue(''); // the code never outlives the submit
        await onVerify(submitted);
      }}
    >
      <label htmlFor={inputId} className="block text-[11px] font-bold uppercase tracking-wide text-stone-700">
        Customer delivery code
      </label>
      <input
        id={inputId}
        data-testid="delivery-code-input"
        type="text"
        inputMode="numeric"
        pattern="[0-9 -]*"
        autoComplete="off"
        maxLength={8}
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/[^\d\s-]/g, ''))}
        disabled={pending || blocked}
        aria-describedby={hintId}
        aria-invalid={!!localError}
        placeholder="123 456"
        className="w-full min-h-11 rounded-xl border border-stone-400 bg-white px-3 text-lg tracking-widest text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-60"
      />
      <p id={hintId} data-testid="delivery-code-hint" className="text-[11px] text-stone-700">
        {hint}
      </p>
      {localError && (
        <p role="alert" className="text-[11px] text-red-800">
          {localError}
        </p>
      )}
      <button type="submit" disabled={pending || blocked} aria-busy={pending} aria-label={`Verify and complete delivery ${order.orderNumber}`} data-testid="delivery-verify" className={primary}>
        {pending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
        {pending ? 'Working…' : 'Verify & complete delivery'}
      </button>
    </form>
  );
};

const OutCard: React.FC<{ order: DeliveryOwnedOrder; nowMs: number; showBranch: boolean; pending: boolean; error: string | null; onReport: () => void; onResume: () => void; onVerify: (code: string) => Promise<boolean>; onDismiss: () => void }> = ({ order, nowMs, showBranch, pending, error, onReport, onResume, onVerify, onDismiss }) => {
  const retryPending = order.assignment.state === 'ASSIGNED';
  const attemptLabel = order.assignment.attemptNumber > 1 ? `Attempt ${order.assignment.attemptNumber} of ${order.assignment.maxAttempts}` : null;
  return (
  <article aria-label={`Order ${order.orderNumber}`} data-testid="delivery-card" data-order-number={order.orderNumber} className="bg-white border border-stone-300 rounded-2xl p-4 shadow-sm space-y-3">
    <Header order={order} badge={retryPending ? 'Retry assigned' : 'Out for delivery'} showBranch={showBranch} waiting={elapsedText(order.assignment.pickupTime, nowMs)} waitLabel="On the road" />
    <OwnedDetails order={order} />
    <Items order={order} />
    {attemptLabel && (
      <p data-testid="delivery-attempt" className="text-[11px] font-bold text-stone-800">
        {attemptLabel}
      </p>
    )}
    {retryPending ? (
      <>
        <p role="status" data-testid="delivery-retry-assigned" className="text-xs font-bold text-sky-900 bg-sky-50 border border-sky-300 rounded-xl px-3 py-2">
          The team arranged another delivery attempt for you. Press the button when you have the bag and are leaving.
        </p>
        <button type="button" onClick={onResume} disabled={pending} aria-busy={pending} aria-label={`Start delivery again ${order.orderNumber}`} data-testid="delivery-resume" className={primary}>
          {pending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          {pending ? 'Working…' : 'Start delivery again'}
        </button>
      </>
    ) : order.assignment.issueReported ? (
      <p role="status" data-testid="delivery-issue-reported" className="text-xs font-bold text-amber-900 bg-amber-50 border border-amber-300 rounded-xl px-3 py-2">
        Issue reported, awaiting review. Please wait for instructions from the team.
      </p>
    ) : (
      <>
        <VerifyForm order={order} pending={pending} onVerify={onVerify} />
        <button type="button" onClick={onReport} aria-label={`Report an issue with ${order.orderNumber}`} data-testid="delivery-report" className={secondary}>
          Report an issue
        </button>
      </>
    )}
    <ErrorBox error={error} onDismiss={onDismiss} />
  </article>
  );
};

const ReportDialog: React.FC<{ order: DeliveryOwnedOrder; pending: boolean; error: string | null; onSubmit: (reasonCode: FailureReasonCode, note: string) => void; onClose: () => void }> = ({ order, pending, error, onSubmit, onClose }) => {
  const [reasonCode, setReasonCode] = useState<FailureReasonCode | ''>('');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  return (
    <AccessibleDialog
      labelledBy="delivery-report-title"
      onClose={onClose}
      closeDisabled={pending}
      overlayClassName="fixed inset-0 z-50 bg-stone-950/70 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      panelClassName="bg-white text-stone-900 border border-stone-300 rounded-3xl w-full max-w-md max-h-[92vh] overflow-y-auto shadow-2xl focus:outline-none"
    >
      <form
        className="p-5 space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (reasonCode) onSubmit(reasonCode, note);
        }}
      >
        <h2 id="delivery-report-title" className="text-base font-black">
          Report an issue with {order.orderNumber}
        </h2>
        <p className="text-xs text-stone-700">This tells the team the delivery could not be completed. This report does not cancel the order.</p>
        <fieldset className="space-y-2" aria-describedby={touched && !reasonCode ? 'delivery-reason-error' : undefined}>
          <legend className="text-[11px] font-bold uppercase tracking-wide text-stone-700 mb-1">What happened?</legend>
          {FAILURE_REASONS.map((r) => (
            <label key={r.code} className="flex items-center gap-3 min-h-11 rounded-xl border border-stone-300 px-3 text-sm cursor-pointer has-[:checked]:border-orange-700 has-[:checked]:bg-orange-50">
              <input type="radio" name="delivery-reason" value={r.code} checked={reasonCode === r.code} onChange={() => setReasonCode(r.code)} disabled={pending} className="w-4 h-4" />
              <span>{r.label}</span>
            </label>
          ))}
        </fieldset>
        {touched && !reasonCode && (
          <p id="delivery-reason-error" role="alert" className="text-[11px] text-red-800">
            Choose what happened.
          </p>
        )}
        <div className="space-y-1">
          <label htmlFor="delivery-note" className="block text-[11px] font-bold uppercase tracking-wide text-stone-700">
            Note (optional)
          </label>
          <textarea id="delivery-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} rows={3} disabled={pending} className="w-full rounded-xl border border-stone-400 px-3 py-2 text-sm text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500" />
          <p className="text-[11px] text-stone-600">Up to 200 characters. Keep it short and factual.</p>
        </div>
        {error && (
          <p role="alert" className="text-[11px] text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending} className={`${secondary} sm:w-auto`}>
            Cancel
          </button>
          <button type="submit" disabled={pending} aria-busy={pending} className={`${primary} sm:w-auto`}>
            {pending ? 'Working…' : 'Report issue'}
          </button>
        </div>
      </form>
    </AccessibleDialog>
  );
};

/**
 * The production DELIVERY workspace: a backend-derived queue (Available for pickup / My orders ready / Out for delivery).
 * Customer details exist only on the driver's OWN orders (server-enforced). There is no "mark delivered", no payment or cash control and
 * no map / tracking: those are not part of this phase. Buttons offer only the next valid step, but the SERVER decides every outcome.
 */
export const DeliveryWorkspace: React.FC<{ onSessionExpired?: () => void }> = ({ onSessionExpired }) => {
  const [branchId, setBranchId] = useState('');
  const { queue, loadState, loadError, stale, lastUpdatedMs, clockOffsetMs, actions, notice, refresh, act, reportFailure, verifyDelivery, dismissActionError } = useDeliveryQueue({ branchId: branchId || undefined, onSessionExpired });

  const [knownBranches, setKnownBranches] = useState<DeliveryBranchRef[]>([]);
  useEffect(() => {
    if (queue && queue.branches.length > 0) setKnownBranches(queue.branches);
  }, [queue]);

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const serverNowMs = nowMs + clockOffsetMs;

  const [reporting, setReporting] = useState<DeliveryOwnedOrder | null>(null);

  // announce newly available orders to assistive technology
  const seen = useRef<Set<string> | null>(null);
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    if (!queue) return;
    const current = new Set(queue.sections.available.items.map((o) => o.id));
    if (seen.current) {
      const fresh = [...current].filter((id) => !seen.current!.has(id)).length;
      if (fresh > 0) setAnnouncement(`${fresh} new ${fresh === 1 ? 'order is' : 'orders are'} available for pickup.`);
    }
    seen.current = current;
  }, [queue]);

  // Errors of orders that already left the lists would vanish with their card, so they are shown here instead.
  const numbers = useRef(new Map<string, string>());
  const orphanErrors = useMemo(() => {
    if (!queue) return [];
    const present = new Set<string>();
    for (const s of [queue.sections.available, queue.sections.mine, queue.sections.outForDelivery]) {
      for (const o of s.items) {
        present.add(o.id);
        numbers.current.set(o.id, o.orderNumber);
      }
    }
    return (Object.entries(actions) as Array<[string, { pending: boolean; error: string | null }]>)
      .filter(([id, a]) => a.error && !present.has(id) && reporting?.id !== id)
      .map(([id, a]) => ({ id, orderNumber: numbers.current.get(id) ?? 'An order', text: a.error as string }));
  }, [queue, actions, reporting]);

  const total = queue ? queue.sections.available.total + queue.sections.mine.total + queue.sections.outForDelivery.total : 0;
  const multiBranch = knownBranches.length > 1;
  const reportingState = reporting ? actions[reporting.id] : undefined;

  return (
    <section aria-label="Delivery queue" data-testid="delivery-workspace" className="bg-white text-stone-900 border border-stone-200 rounded-3xl p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-stone-900 flex items-center gap-2">
            <Bike className="w-5 h-5 text-orange-700" aria-hidden="true" />
            Deliveries
          </h2>
          <p className="text-xs text-stone-700">Orders that are ready at your branch. The list refreshes automatically.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {multiBranch && (
            <div>
              <label htmlFor="delivery-branch" className="block text-[11px] font-bold uppercase tracking-wide text-stone-700 mb-1">
                Branch
              </label>
              <select id="delivery-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} className="min-h-11 rounded-xl border border-stone-400 bg-white px-3 text-sm text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
                <option value="">All my branches</option>
                {knownBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button type="button" onClick={() => void refresh()} data-testid="delivery-refresh" className="min-h-11 inline-flex items-center gap-2 rounded-xl border border-stone-400 bg-white px-4 text-sm font-bold text-stone-900 hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      <div role="status" aria-live="polite" data-testid="delivery-announcement" className="sr-only">
        {announcement}
      </div>

      {notice && (
        <p role="status" data-testid="delivery-notice" className="text-xs text-stone-900 bg-stone-100 border border-stone-300 rounded-xl px-3 py-2">
          {notice}
        </p>
      )}

      {orphanErrors.map((e) => (
        <div key={e.id} role="alert" data-testid="delivery-orphan-error" className="flex items-start justify-between gap-3 text-xs text-red-900 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          <span>
            <strong>{e.orderNumber}:</strong> {e.text}
          </span>
          <button type="button" onClick={() => dismissActionError(e.id)} className="font-bold underline shrink-0 min-h-8 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
            Dismiss
          </button>
        </div>
      ))}

      {stale && (
        <p role="alert" data-testid="delivery-stale" className="flex items-start gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-300 rounded-xl px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            {loadError?.message ?? 'The list could not be refreshed.'} The orders below may be out of date
            {lastUpdatedMs ? ` (last updated ${new Date(lastUpdatedMs).toLocaleTimeString()})` : ''}.
          </span>
        </p>
      )}

      {loadState === 'loading' && !queue && (
        <p role="status" data-testid="delivery-loading" className="flex items-center gap-2 text-sm text-stone-800">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Loading deliveries…
        </p>
      )}

      {loadState === 'error' && !queue && (
        <div role="alert" data-testid="delivery-error" className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-900 space-y-2">
          <p>{loadError?.message ?? 'The deliveries could not be loaded.'}</p>
          {loadError?.action !== 'SIGN_IN' && (
            <button type="button" onClick={() => void refresh()} className="min-h-11 rounded-xl bg-red-900 text-white font-bold px-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
              Try again
            </button>
          )}
        </div>
      )}

      {queue && total === 0 && (
        <p data-testid="delivery-empty" className="text-sm text-stone-800 bg-white border border-dashed border-stone-400 rounded-2xl p-6 text-center">
          No deliveries are waiting at your branch right now.
        </p>
      )}

      {queue && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div data-testid="delivery-section-available" role="region" aria-labelledby="delivery-h-available" className="bg-stone-50 border border-stone-200 rounded-2xl p-3 space-y-3 min-w-0">
            <h3 id="delivery-h-available" className="text-sm font-black text-stone-900 flex items-center justify-between">
              <span>Available for pickup</span>
              <span className="text-xs font-bold text-stone-800 bg-white border border-stone-300 rounded-lg px-2 py-0.5">{queue.sections.available.total}</span>
            </h3>
            {queue.sections.available.truncated && <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">Showing the first {queue.sections.available.items.length} of {queue.sections.available.total}.</p>}
            {queue.sections.available.items.length === 0 ? (
              <p className="text-xs text-stone-700">Nothing is waiting to be claimed.</p>
            ) : (
              queue.sections.available.items.map((o) => (
                <AvailableCard key={o.id} order={o} nowMs={serverNowMs} showBranch={multiBranch} pending={actions[o.id]?.pending ?? false} error={actions[o.id]?.error ?? null} onClaim={() => void act(o.id, 'claim')} onDismiss={() => dismissActionError(o.id)} />
              ))
            )}
          </div>

          <div data-testid="delivery-section-mine" role="region" aria-labelledby="delivery-h-mine" className="bg-stone-50 border border-stone-200 rounded-2xl p-3 space-y-3 min-w-0">
            <h3 id="delivery-h-mine" className="text-sm font-black text-stone-900 flex items-center justify-between">
              <span>My orders, ready to collect</span>
              <span className="text-xs font-bold text-stone-800 bg-white border border-stone-300 rounded-lg px-2 py-0.5">{queue.sections.mine.total}</span>
            </h3>
            {queue.sections.mine.items.length === 0 ? (
              <p className="text-xs text-stone-700">You have not claimed any order yet.</p>
            ) : (
              queue.sections.mine.items.map((o) => (
                <MineCard key={o.id} order={o} nowMs={serverNowMs} showBranch={multiBranch} pending={actions[o.id]?.pending ?? false} error={actions[o.id]?.error ?? null} onDispatch={() => void act(o.id, 'dispatch')} onDismiss={() => dismissActionError(o.id)} />
              ))
            )}
          </div>

          <div data-testid="delivery-section-out" role="region" aria-labelledby="delivery-h-out" className="bg-stone-50 border border-stone-200 rounded-2xl p-3 space-y-3 min-w-0">
            <h3 id="delivery-h-out" className="text-sm font-black text-stone-900 flex items-center justify-between">
              <span>Out for delivery</span>
              <span className="text-xs font-bold text-stone-800 bg-white border border-stone-300 rounded-lg px-2 py-0.5">{queue.sections.outForDelivery.total}</span>
            </h3>
            {queue.sections.outForDelivery.items.length === 0 ? (
              <p className="text-xs text-stone-700">Nothing is out for delivery.</p>
            ) : (
              queue.sections.outForDelivery.items.map((o) => (
                <OutCard key={o.id} order={o} nowMs={serverNowMs} showBranch={multiBranch} pending={actions[o.id]?.pending ?? false} error={reporting?.id === o.id ? null : (actions[o.id]?.error ?? null)} onReport={() => setReporting(o)} onResume={() => void act(o.id, 'resume')} onVerify={(code) => verifyDelivery(o.id, code)} onDismiss={() => dismissActionError(o.id)} />
              ))
            )}
          </div>
        </div>
      )}

      {reporting && (
        <ReportDialog
          order={reporting}
          pending={reportingState?.pending ?? false}
          error={reportingState?.error ?? null}
          onClose={() => {
            dismissActionError(reporting.id);
            setReporting(null);
          }}
          onSubmit={async (reasonCode, note) => {
            const ok = await reportFailure(reporting.id, { reasonCode, note });
            if (ok) setReporting(null);
          }}
        />
      )}
    </section>
  );
};
