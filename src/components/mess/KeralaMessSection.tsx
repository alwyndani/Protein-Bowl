import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Loader2, Utensils } from 'lucide-react';
import { MessService } from '../../services/messService';
import { OrderService } from '../../services/orderService';
import type { ApiOrder } from '../../services/commerceTypes';
import type { MessAccount, MessPublicPlan, MessServicePointOption, MessSubscription } from '../../services/messTypes';
import { describeMessError, MESS_CANCEL_REASONS, MessUserError, REJECTION_LABELS } from '../../utils/messErrors';
import { formatInr } from '../../utils/money';
import { AccessibleDialog } from '../common/AccessibleDialog';
import { PaymentPanel } from '../customer/PaymentPanel';

interface Props {
  onSessionExpired?: () => void;
}

const SLOT_LABEL: Record<string, string> = { BREAKFAST: 'Breakfast', LUNCH: 'Lunch', DINNER: 'Dinner' };
const STATUS_LABEL: Record<string, string> = { PENDING_PAYMENT: 'Awaiting payment', ACTIVE: 'Active', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };
const REFUND_LABEL: Record<string, string> = {
  REFUND_PENDING: 'Your refund has been requested.',
  REFUND_PROCESSING: 'Your refund is being processed.',
  REFUNDED: 'Your payment has been refunded.',
  REFUND_REVIEW_REQUIRED: 'Your refund is being reviewed by Protein Bowl. No action is needed from you.'
};

const card = 'rounded-2xl border border-stone-800 bg-stone-900/70 p-4 sm:p-5 space-y-3';
const input = 'w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-amber-500/60';
const primary = 'inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black px-4 py-2.5 rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300';
const secondary = 'inline-flex items-center justify-center gap-2 bg-stone-800 hover:bg-stone-700 text-stone-100 border border-stone-700 font-bold px-4 py-2.5 rounded-xl text-sm disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300';

function newKey(): string {
  return `mess-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`;
}

const ErrorBox: React.FC<{ error: MessUserError | null }> = ({ error }) =>
  error ? (
    <div role="alert" data-testid="mess-error" className="flex items-start gap-2 bg-red-950/60 border border-red-500/40 text-red-200 text-xs rounded-xl px-3 py-2.5">
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
      <p>{error.message}</p>
    </div>
  ) : null;

/**
 * Kerala Mess inside the CUSTOMER portal (P10A). Everything shown comes from the backend: account approval, active plans (priced by the
 * server), purchases, payment (the shared PaymentPanel) and cancellation. There is no wallet, meal calendar, pause, tracking or gate pass.
 */
export const KeralaMessSection: React.FC<Props> = ({ onSessionExpired }) => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<MessUserError | null>(null);
  const [account, setAccount] = useState<MessAccount | null>(null);
  const [subscriptions, setSubscriptions] = useState<MessSubscription[]>([]);
  const [servicePoints, setServicePoints] = useState<MessServicePointOption[]>([]);
  const [plans, setPlans] = useState<MessPublicPlan[]>([]);
  const mounted = useRef(true);

  const handleError = useCallback(
    (err: unknown): MessUserError => {
      const info = describeMessError(err);
      if (info.action === 'SIGN_IN') onSessionExpired?.();
      return info;
    },
    [onSessionExpired]
  );

  const load = useCallback(async () => {
    try {
      const [acc, subs] = await Promise.all([MessService.getAccount(), MessService.getSubscriptions()]);
      if (!mounted.current) return;
      setAccount(acc);
      setSubscriptions(subs);
      if (!acc || acc.approvalStatus !== 'APPROVED') {
        const points = await MessService.getServicePoints();
        if (mounted.current) setServicePoints(points);
      } else {
        const list = await MessService.getPlans(acc.servicePoint?.id);
        if (mounted.current) setPlans(list);
      }
      setLoadError(null);
    } catch (err) {
      if (mounted.current) setLoadError(handleError(err));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [handleError]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  if (loading) {
    return (
      <div role="status" className="flex items-center justify-center gap-3 py-16 text-stone-300 text-sm">
        <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
        <span>Loading Kerala Mess…</span>
      </div>
    );
  }

  const openSubscription = subscriptions.find((s) => s.status === 'PENDING_PAYMENT') ?? null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6 text-white" data-testid="kerala-mess">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-amber-400 text-xs font-black uppercase tracking-wider">
          <Utensils className="w-4 h-4" aria-hidden="true" />
          <span>Kerala Mess</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black">Hostel meal subscriptions</h1>
        <p className="text-sm text-stone-400">Subscribe to a Kerala Mess plan for your hostel. Payment is online only.</p>
      </header>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-100 text-xs px-4 py-3" data-testid="mess-checkpoint-note">
        Meal scheduling, pausing and daily delivery are not available yet. Your subscription is recorded and activated once your payment is confirmed.
      </div>

      <ErrorBox error={loadError} />
      {loadError?.action === 'LEGACY_ROLE' ? null : (
        <>
          {(!account || account.approvalStatus === 'REJECTED') && <AccountForm account={account} servicePoints={servicePoints} onSaved={load} handleError={handleError} />}
          {account?.approvalStatus === 'PENDING' && <PendingCard account={account} servicePoints={servicePoints} onSaved={load} handleError={handleError} />}
          {account?.approvalStatus === 'APPROVED' && (
            <>
              <ApprovedCard account={account} />
              {!openSubscription && <PlanList plans={plans} onPurchased={load} handleError={handleError} />}
            </>
          )}
          <SubscriptionList subscriptions={subscriptions} onChanged={load} handleError={handleError} onSessionExpired={onSessionExpired} />
        </>
      )}
    </div>
  );
};

// ------------------------------------------------------------------------------------------------ account
const AccountForm: React.FC<{ account: MessAccount | null; servicePoints: MessServicePointOption[]; onSaved: () => Promise<void>; handleError: (e: unknown) => MessUserError }> = ({ account, servicePoints, onSaved, handleError }) => {
  const [servicePointId, setServicePointId] = useState(account?.servicePoint?.id ?? '');
  const [room, setRoom] = useState(account?.roomNumber ?? '');
  const [studentId, setStudentId] = useState(account?.studentIdCard ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessUserError | null>(null);
  const ids = { sp: useId(), room: useId(), sid: useId() };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !servicePointId || !room.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await MessService.saveAccount({ servicePointId, roomNumber: room, studentIdCard: studentId });
      await onSaved();
    } catch (err) {
      setError(handleError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={card} data-testid="mess-account-form" aria-label="Hostel details">
      <h2 className="text-base font-black">{account ? 'Update your hostel details' : 'Tell us where you stay'}</h2>
      {account?.approvalStatus === 'REJECTED' && (
        <p role="status" className="text-xs text-red-200 bg-red-950/50 border border-red-500/30 rounded-xl px-3 py-2" data-testid="mess-rejected">
          Your request was not approved. {REJECTION_LABELS[account.rejectionReasonCode ?? 'OTHER'] ?? REJECTION_LABELS.OTHER} You can correct your details and submit again.
        </p>
      )}
      <p className="text-xs text-stone-400">A Protein Bowl administrator reviews your details before you can buy a plan.</p>
      <div className="space-y-1">
        <label htmlFor={ids.sp} className="block text-xs font-bold text-stone-200">Hostel / service point</label>
        <select id={ids.sp} value={servicePointId} onChange={(e) => setServicePointId(e.target.value)} required className={input}>
          <option value="">Select your hostel</option>
          {servicePoints.map((sp) => (
            <option key={sp.id} value={sp.id}>
              {sp.name}{sp.gateLabel ? ` (${sp.gateLabel})` : ''} · {sp.city}
            </option>
          ))}
        </select>
        {servicePoints.length === 0 && <p className="text-[11px] text-stone-500">No service points are open yet. Please check back soon.</p>}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor={ids.room} className="block text-xs font-bold text-stone-200">Room number</label>
          <input id={ids.room} value={room} onChange={(e) => setRoom(e.target.value)} required maxLength={20} className={input} />
        </div>
        <div className="space-y-1">
          <label htmlFor={ids.sid} className="block text-xs font-bold text-stone-200">Student ID (optional)</label>
          <input id={ids.sid} value={studentId} onChange={(e) => setStudentId(e.target.value)} maxLength={40} className={input} />
        </div>
      </div>
      <ErrorBox error={error} />
      <button type="submit" disabled={busy || !servicePointId || !room.trim()} className={primary}>
        {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
        {account ? 'Submit again for approval' : 'Submit for approval'}
      </button>
    </form>
  );
};

const PendingCard: React.FC<{ account: MessAccount; servicePoints: MessServicePointOption[]; onSaved: () => Promise<void>; handleError: (e: unknown) => MessUserError }> = ({ account, servicePoints, onSaved, handleError }) => {
  const [editing, setEditing] = useState(false);
  return (
    <section className={card} data-testid="mess-pending" aria-label="Approval status">
      <div className="flex items-center gap-2 text-amber-300 text-sm font-black">
        <Clock className="w-4 h-4" aria-hidden="true" />
        <h2>Waiting for approval</h2>
      </div>
      <p className="text-xs text-stone-300">
        {account.servicePoint?.name} · Room {account.roomNumber}. You can buy a plan as soon as an administrator approves your details.
      </p>
      <button type="button" className={secondary} onClick={() => setEditing((v) => !v)}>{editing ? 'Close' : 'Change my details'}</button>
      {editing && <AccountForm account={account} servicePoints={servicePoints} onSaved={async () => { setEditing(false); await onSaved(); }} handleError={handleError} />}
    </section>
  );
};

const ApprovedCard: React.FC<{ account: MessAccount }> = ({ account }) => (
  <section className={card} data-testid="mess-approved" aria-label="Approval status">
    <div className="flex items-center gap-2 text-emerald-300 text-sm font-black">
      <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
      <h2>Approved</h2>
    </div>
    <p className="text-xs text-stone-300">
      {account.servicePoint?.name}{account.servicePoint?.gateLabel ? ` (${account.servicePoint.gateLabel})` : ''} · Room {account.roomNumber}
    </p>
  </section>
);

// ------------------------------------------------------------------------------------------------ plans + purchase
const PlanList: React.FC<{ plans: MessPublicPlan[]; onPurchased: () => Promise<void>; handleError: (e: unknown) => MessUserError }> = ({ plans, onPurchased, handleError }) => {
  if (plans.length === 0) {
    return (
      <section className={card} aria-label="Plans">
        <h2 className="text-base font-black">Plans</h2>
        <p className="text-sm text-stone-400" data-testid="mess-no-plans">No plans are on sale for your hostel right now.</p>
      </section>
    );
  }
  return (
    <section className="space-y-3" aria-label="Plans">
      <h2 className="text-base font-black">Choose a plan</h2>
      {plans.map((plan) => (
        <PlanCard key={plan.id} plan={plan} onPurchased={onPurchased} handleError={handleError} />
      ))}
    </section>
  );
};

const PlanCard: React.FC<{ plan: MessPublicPlan; onPurchased: () => Promise<void>; handleError: (e: unknown) => MessUserError }> = ({ plan, onPurchased, handleError }) => {
  const [start, setStart] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessUserError | null>(null);
  const keyRef = useRef<{ sig: string; key: string } | null>(null);
  const startId = useId();

  // Only a hint for the date picker: the server validates the real minimum start date.
  const minDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + plan.minStartLeadDays);
    return d.toISOString().slice(0, 10);
  }, [plan.minStartLeadDays]);

  const buy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !start) return;
    const sig = `${plan.id}|${start}`;
    // the same selection reuses its idempotency key (a retry can never create a second purchase); a different selection is a new purchase
    if (!keyRef.current || keyRef.current.sig !== sig) keyRef.current = { sig, key: newKey() };
    setBusy(true);
    setError(null);
    try {
      await MessService.purchase({ planId: plan.id, startDate: start }, keyRef.current.key);
      await onPurchased();
    } catch (err) {
      setError(handleError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={buy} className={card} data-testid={`mess-plan-${plan.code}`} aria-label={plan.name}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-black">{plan.name}</h3>
          {plan.description && <p className="text-xs text-stone-400 mt-0.5">{plan.description}</p>}
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-black text-amber-300" data-testid="mess-plan-total">{formatInr(plan.price.total)}</div>
          <div className="text-[11px] text-stone-500">{formatInr(plan.price.subtotal)} + {formatInr(plan.price.taxAmount)} tax</div>
        </div>
      </div>
      <ul className="flex flex-wrap gap-2 text-[11px] text-stone-300">
        <li className="px-2 py-0.5 rounded-lg bg-stone-800 border border-stone-700">{plan.durationDays} days</li>
        <li className="px-2 py-0.5 rounded-lg bg-stone-800 border border-stone-700">{plan.mealSlots.map((s) => SLOT_LABEL[s] ?? s).join(' + ')}</li>
        <li className="px-2 py-0.5 rounded-lg bg-stone-800 border border-stone-700">{plan.mealsIncluded} meals</li>
      </ul>
      <div className="space-y-1">
        <label htmlFor={startId} className="block text-xs font-bold text-stone-200">Start date</label>
        <input id={startId} type="date" value={start} min={minDate} onChange={(e) => setStart(e.target.value)} required className={input} />
        <p className="text-[11px] text-stone-500">Earliest start: {plan.minStartLeadDays === 0 ? 'today' : `${plan.minStartLeadDays} day${plan.minStartLeadDays === 1 ? '' : 's'} from today`}.</p>
      </div>
      <ErrorBox error={error} />
      <button type="submit" disabled={busy || !start} className={primary}>
        {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
        Continue to payment
      </button>
    </form>
  );
};

// ------------------------------------------------------------------------------------------------ subscriptions
const SubscriptionList: React.FC<{ subscriptions: MessSubscription[]; onChanged: () => Promise<void>; handleError: (e: unknown) => MessUserError; onSessionExpired?: () => void }> = ({ subscriptions, onChanged, handleError, onSessionExpired }) => {
  if (subscriptions.length === 0) return null;
  return (
    <section className="space-y-3" aria-label="My subscriptions">
      <h2 className="text-base font-black">My subscriptions</h2>
      {subscriptions.map((s) => (
        <SubscriptionCard key={s.id} sub={s} onChanged={onChanged} handleError={handleError} onSessionExpired={onSessionExpired} />
      ))}
    </section>
  );
};

const SubscriptionCard: React.FC<{ sub: MessSubscription; onChanged: () => Promise<void>; handleError: (e: unknown) => MessUserError; onSessionExpired?: () => void }> = ({ sub, onChanged, handleError, onSessionExpired }) => {
  const [cancelOpen, setCancelOpen] = useState(false);
  const refundText = REFUND_LABEL[sub.refund.state];
  return (
    <article className={card} data-testid={`mess-sub-${sub.id}`} data-status={sub.status}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black">{sub.plan.name}</h3>
          <p className="text-xs text-stone-400">{sub.startDate} to {sub.endDate} · {sub.mealsIncluded} meals{sub.servicePoint ? ` · ${sub.servicePoint.name}` : ''}</p>
        </div>
        <span data-testid="mess-sub-status" className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${sub.status === 'ACTIVE' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : sub.status === 'PENDING_PAYMENT' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-stone-700/40 text-stone-300 border-stone-600'}`}>
          {STATUS_LABEL[sub.status] ?? sub.status}
        </span>
      </div>
      {sub.price && <p className="text-xs text-stone-300">Total {formatInr(sub.price.total)} (incl. {formatInr(sub.price.taxAmount)} tax)</p>}
      {sub.status === 'ACTIVE' && <p className="text-xs text-emerald-200" data-testid="mess-sub-active-note">Your payment is confirmed and your subscription is active.</p>}
      {refundText && <p role="status" className="text-xs text-stone-200" data-testid="mess-refund">{refundText}</p>}
      {sub.status === 'PENDING_PAYMENT' && sub.purchaseOrder && <MessPayment sub={sub} onChanged={onChanged} onSessionExpired={onSessionExpired} />}
      {sub.cancellation.allowed && (
        <button type="button" className={secondary} onClick={() => setCancelOpen(true)} data-testid="mess-cancel-open">
          Cancel subscription
        </button>
      )}
      {cancelOpen && <CancelDialog sub={sub} onClose={() => setCancelOpen(false)} onDone={onChanged} handleError={handleError} />}
    </article>
  );
};

/** The purchase order is paid through the SAME PaymentPanel food orders use: payment truth comes only from the server. */
const MessPayment: React.FC<{ sub: MessSubscription; onChanged: () => Promise<void>; onSessionExpired?: () => void }> = ({ sub, onChanged, onSessionExpired }) => {
  const orderId = sub.purchaseOrder!.id;
  const [order, setOrder] = useState<ApiOrder | null>(null);
  const [failed, setFailed] = useState(false);
  const fetchOrder = useCallback(() => OrderService.getOrder(orderId), [orderId]);

  useEffect(() => {
    let live = true;
    fetchOrder().then((o) => live && setOrder(o)).catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [fetchOrder]);

  if (failed) return <p role="alert" className="text-xs text-red-200">We could not load the payment details. Please refresh.</p>;
  if (!order) return <p role="status" className="text-xs text-stone-400">Loading payment…</p>;
  return (
    <PaymentPanel
      order={order}
      fetchOrder={fetchOrder}
      onOrder={(o) => {
        setOrder(o);
        if (o.payment?.state === 'PAID' || o.status === 'CONFIRMED') void onChanged();
      }}
      onSessionExpired={onSessionExpired}
    />
  );
};

const CancelDialog: React.FC<{ sub: MessSubscription; onClose: () => void; onDone: () => Promise<void>; handleError: (e: unknown) => MessUserError }> = ({ sub, onClose, onDone, handleError }) => {
  const titleId = useId();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessUserError | null>(null);
  const paid = sub.status === 'ACTIVE';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason || busy) return;
    setBusy(true);
    setError(null);
    try {
      await MessService.cancel(sub.id, reason, note);
      await onDone();
      onClose();
    } catch (err) {
      setError(handleError(err));
      await onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccessibleDialog labelledBy={titleId} onClose={onClose} closeDisabled={busy}>
      <form onSubmit={submit} className="p-5 space-y-4" data-testid="mess-cancel-dialog">
        <h2 id={titleId} className="text-base font-black text-white">Cancel {sub.plan.name}?</h2>
        <p className="text-xs text-stone-300">
          {paid ? 'Your full payment will be refunded to your original payment method. The refund is processed separately and shown here.' : 'No payment has been taken for this purchase.'}
        </p>
        <div className="space-y-1">
          <label htmlFor={`${titleId}-reason`} className="block text-xs font-bold text-stone-200">Why are you cancelling?</label>
          <select id={`${titleId}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} required disabled={busy} className={input}>
            <option value="">Select a reason</option>
            {MESS_CANCEL_REASONS.map((r) => (
              <option key={r.code} value={r.code}>{r.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${titleId}-note`} className="block text-xs font-bold text-stone-200">Note (optional)</label>
          <textarea id={`${titleId}-note`} value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} rows={2} maxLength={200} disabled={busy} className={input} />
        </div>
        <ErrorBox error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className={secondary} onClick={onClose} disabled={busy}>Keep subscription</button>
          <button type="submit" className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white font-black px-4 py-2.5 rounded-xl text-sm disabled:opacity-50" disabled={!reason || busy}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            Cancel subscription
          </button>
        </div>
      </form>
    </AccessibleDialog>
  );
};
