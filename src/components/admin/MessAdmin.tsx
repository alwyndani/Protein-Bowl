import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { MessService } from '../../services/messService';
import type { MealSlot, MessAdminAccount, MessAdminPlan, MessAdminServicePoint, MessAdminSubscription, MessPlanInput } from '../../services/messTypes';
import { formatInr } from '../../utils/money';
import { useAdminReference } from './AdminReference';
import { useStepUp } from './StepUp';
import { useAdminAction } from './useAdminAction';
import { describeAdminError } from './adminErrors';
import type { AdminErrorInfo } from './adminErrors';
import { MessKitchenPanel } from '../erp/kitchen/MessKitchenPanel';
import { Chip, EmptyState, ErrorNotice, Field, Modal, Spinner, formatDate, inputClass, primaryButton, secondaryButton } from './adminUi';

type Tab = 'accounts' | 'servicePoints' | 'plans' | 'subscriptions' | 'kitchen';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'accounts', label: 'Account approvals' },
  { id: 'servicePoints', label: 'Service points' },
  { id: 'plans', label: 'Plans' },
  { id: 'subscriptions', label: 'Subscriptions' },
  { id: 'kitchen', label: 'Mess kitchen (read-only)' }
];
const SLOTS: MealSlot[] = ['BREAKFAST', 'LUNCH', 'DINNER'];
const REJECT_REASONS = ['INCOMPLETE_DETAILS', 'NOT_ELIGIBLE', 'SERVICE_POINT_MISMATCH', 'OTHER'];
const ADMIN_CANCEL_REASONS = ['PLAN_WITHDRAWN', 'SERVICE_UNAVAILABLE', 'ACCOUNT_ISSUE', 'PAYMENT_ISSUE', 'OPERATIONAL_ISSUE', 'OTHER'];
const pretty = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

/** Loads one list from the backend and exposes reload. */
function useList<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<AdminErrorInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loader());
      setError(null);
    } catch (err) {
      setError(describeAdminError(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, error, loading, load };
}

/**
 * Kerala Mess administration (P10A). SUPER_ADMIN gets the full workspace; `readOnly` (MD) renders the SAME real data with NO write control and without
 * touching the step-up or branch-reference providers. Every write is a password-step-up request carrying an expected version where one exists.
 */
export const MessAdmin: React.FC<{ readOnly?: boolean }> = ({ readOnly = false }) => {
  const [tab, setTab] = useState<Tab>('accounts');
  return (
    <section aria-label="Kerala Mess administration" data-testid="mess-admin" className="space-y-4 text-white">
      <div className="space-y-1">
        <h2 className="text-lg font-black">Kerala Mess</h2>
        <p className="text-xs text-stone-400">
          {readOnly ? 'Read-only view of service points, plans, account approvals and subscriptions.' : 'Manage service points, plans, account approvals and subscriptions. Meal scheduling is not available yet.'}
        </p>
      </div>
      <div role="tablist" aria-label="Kerala Mess sections" className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`px-3 py-1.5 rounded-xl text-xs font-bold border whitespace-nowrap ${tab === t.id ? 'bg-amber-500 text-stone-950 border-amber-400' : 'bg-stone-900/70 text-stone-300 border-stone-800'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'accounts' && <AccountsTab readOnly={readOnly} />}
      {tab === 'servicePoints' && <ServicePointsTab readOnly={readOnly} />}
      {tab === 'plans' && <PlansTab readOnly={readOnly} />}
      {tab === 'subscriptions' && <SubscriptionsTab readOnly={readOnly} />}
      {tab === 'kitchen' && <KitchenTab />}
    </section>
  );
};

const Frame: React.FC<{ loading: boolean; error: AdminErrorInfo | null; onReload: () => void; children: React.ReactNode }> = ({ loading, error, onReload, children }) => (
  <div className="space-y-3">
    <div className="flex justify-end">
      <button type="button" onClick={onReload} className={secondaryButton} aria-label="Refresh list">
        <RefreshCw className="w-4 h-4" aria-hidden="true" />
        Refresh
      </button>
    </div>
    <ErrorNotice error={error} onRetry={onReload} />
    {loading ? <Spinner /> : children}
  </div>
);

// ------------------------------------------------------------------------------------------------ accounts
const AccountsTab: React.FC<{ readOnly: boolean }> = ({ readOnly }) => {
  const [status, setStatus] = useState('PENDING');
  const { data, error, loading, load } = useList(() => MessService.adminAccounts(status));
  useEffect(() => {
    void load();
  }, [status, load]);
  const [reviewing, setReviewing] = useState<{ account: MessAdminAccount; mode: 'approve' | 'reject' } | null>(null);
  return (
    <Frame loading={loading} error={error} onReload={load}>
      <div className="flex gap-2" role="group" aria-label="Filter by approval status">
        {['PENDING', 'APPROVED', 'REJECTED'].map((s) => (
          <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)} className={`px-3 py-1 rounded-lg text-[11px] font-bold border ${status === s ? 'bg-stone-700 border-stone-500' : 'bg-stone-900 border-stone-800 text-stone-400'}`}>
            {pretty(s)}
          </button>
        ))}
      </div>
      {data && data.accounts.length === 0 && <EmptyState message={`No ${status.toLowerCase()} accounts.`} />}
      <ul className="space-y-2">
        {data?.accounts.map((a) => (
          <li key={a.id} data-testid={`mess-account-${a.id}`} className="bg-stone-900/70 border border-stone-800 rounded-2xl p-4 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-black">{a.customerName}</p>
                <p className="text-xs text-stone-400">{a.servicePoint?.name ?? a.hostelName} · Room {a.roomNumber}</p>
                {!readOnly && a.studentIdCard && <p className="text-[11px] text-stone-500">Student ID: {a.studentIdCard}</p>}
                {!readOnly && a.phone && <p className="text-[11px] text-stone-500">Phone: {a.phone}</p>}
              </div>
              <Chip tone={a.approvalStatus === 'APPROVED' ? 'emerald' : a.approvalStatus === 'PENDING' ? 'amber' : 'neutral'}>{pretty(a.approvalStatus)}</Chip>
            </div>
            {!readOnly && a.approvalStatus === 'PENDING' && (
              <div className="flex gap-2">
                {a.servicePoint ? <button type="button" className={primaryButton} onClick={() => setReviewing({ account: a, mode: 'approve' })}>Approve…</button> : <span className="text-[11px] text-amber-300">Legacy account without a service point: the customer must choose one before it can be approved.</span>}
                <button type="button" className={secondaryButton} onClick={() => setReviewing({ account: a, mode: 'reject' })}>Reject…</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && reviewing && <ReviewDialog {...reviewing} onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); void load(); }} />}
    </Frame>
  );
};

const ReviewDialog: React.FC<{ account: MessAdminAccount; mode: 'approve' | 'reject'; onClose: () => void; onDone: () => void }> = ({ account, mode, onClose, onDone }) => {
  const { withStepUp } = useStepUp();
  const { run, pending, error, clearError } = useAdminAction();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'reject' && !reason) return;
    const out = await run(() =>
      withStepUp((proof) => (mode === 'approve' ? MessService.approveAccount(account.id, account.servicePoint!.id, proof) : MessService.rejectAccount(account.id, reason, note, proof)))
    );
    if (out.ok) onDone();
  };
  return (
    <Modal title={mode === 'approve' ? `Approve ${account.customerName}?` : `Reject ${account.customerName}?`} onClose={onClose} closeDisabled={pending}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-stone-400">{account.servicePoint?.name} · Room {account.roomNumber}</p>
        {mode === 'reject' && (
          <>
            <Field label="Reason" htmlFor="rej-reason">
              <select id="rej-reason" value={reason} onChange={(e) => setReason(e.target.value)} required className={inputClass}>
                <option value="">Select a reason…</option>
                {REJECT_REASONS.map((r) => <option key={r} value={r}>{pretty(r)}</option>)}
              </select>
            </Field>
            <Field label="Internal note (optional)" htmlFor="rej-note" hint="Not shown to the customer.">
              <textarea id="rej-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} rows={2} className={inputClass} />
            </Field>
          </>
        )}
        <ErrorNotice error={error} onDismiss={clearError} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending} className={secondaryButton}>Cancel</button>
          <button type="submit" disabled={pending || (mode === 'reject' && !reason)} className={primaryButton}>{pending ? 'Working…' : mode === 'approve' ? 'Approve' : 'Reject'}</button>
        </div>
      </form>
    </Modal>
  );
};

// ------------------------------------------------------------------------------------------------ service points
const ServicePointsTab: React.FC<{ readOnly: boolean }> = ({ readOnly }) => {
  const { data, error, loading, load } = useList(() => MessService.adminServicePoints());
  const [editing, setEditing] = useState<MessAdminServicePoint | 'new' | null>(null);
  return (
    <Frame loading={loading} error={error} onReload={load}>
      {!readOnly && <button type="button" className={primaryButton} onClick={() => setEditing('new')}>Add service point…</button>}
      {data && data.length === 0 && <EmptyState message="No service points yet." />}
      <ul className="space-y-2">
        {data?.map((sp) => (
          <li key={sp.id} data-testid={`mess-sp-${sp.code}`} className="bg-stone-900/70 border border-stone-800 rounded-2xl p-4 flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-black">{sp.name} <span className="text-stone-500 font-normal">({sp.code})</span></p>
              <p className="text-xs text-stone-400">{sp.addressLine}, {sp.city} {sp.postalCode}{sp.gateLabel ? ` · ${sp.gateLabel}` : ''}</p>
              <p className="text-[11px] text-stone-500">Branch: {sp.branch.name}</p>
            </div>
            <div className="flex items-center gap-2">
              <Chip tone={sp.status === 'ACTIVE' ? 'emerald' : 'neutral'}>{pretty(sp.status)}</Chip>
              {!readOnly && <button type="button" className={secondaryButton} onClick={() => setEditing(sp)}>Edit…</button>}
            </div>
          </li>
        ))}
      </ul>
      {!readOnly && editing && <ServicePointDialog sp={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); void load(); }} />}
    </Frame>
  );
};

const ServicePointDialog: React.FC<{ sp: MessAdminServicePoint | null; onClose: () => void; onDone: () => void }> = ({ sp, onClose, onDone }) => {
  const reference = useAdminReference();
  const { withStepUp } = useStepUp();
  const { run, pending, error, clearError } = useAdminAction();
  const [f, setF] = useState({ code: sp?.code ?? '', name: sp?.name ?? '', gateLabel: sp?.gateLabel ?? '', addressLine: sp?.addressLine ?? '', city: sp?.city ?? '', postalCode: sp?.postalCode ?? '', branchId: sp?.branch.id ?? '', status: sp?.status ?? 'ACTIVE' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const out = await run(() =>
      withStepUp((proof) =>
        sp
          ? MessService.updateServicePoint(sp.id, { expectedVersion: sp.version, name: f.name, gateLabel: f.gateLabel || null, addressLine: f.addressLine, city: f.city, postalCode: f.postalCode, status: f.status }, proof)
          : MessService.createServicePoint({ code: f.code, name: f.name, gateLabel: f.gateLabel || null, addressLine: f.addressLine, city: f.city, postalCode: f.postalCode, branchId: f.branchId }, proof)
      )
    );
    if (out.ok) onDone();
  };
  return (
    <Modal title={sp ? `Edit ${sp.name}` : 'Add service point'} onClose={onClose} closeDisabled={pending} wide>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          {!sp && <Field label="Code" htmlFor="sp-code"><input id="sp-code" value={f.code} onChange={set('code')} required className={inputClass} /></Field>}
          <Field label="Name" htmlFor="sp-name"><input id="sp-name" value={f.name} onChange={set('name')} required className={inputClass} /></Field>
          <Field label="Gate / pickup label" htmlFor="sp-gate"><input id="sp-gate" value={f.gateLabel} onChange={set('gateLabel')} className={inputClass} /></Field>
          <Field label="Address" htmlFor="sp-addr"><input id="sp-addr" value={f.addressLine} onChange={set('addressLine')} required className={inputClass} /></Field>
          <Field label="City" htmlFor="sp-city"><input id="sp-city" value={f.city} onChange={set('city')} required className={inputClass} /></Field>
          <Field label="Postal code" htmlFor="sp-pin"><input id="sp-pin" value={f.postalCode} onChange={set('postalCode')} required className={inputClass} /></Field>
          {!sp ? (
            <Field label="Branch" htmlFor="sp-branch" hint="The branch that will serve this service point.">
              <select id="sp-branch" value={f.branchId} onChange={set('branchId')} required className={inputClass}>
                <option value="">Select a branch…</option>
                {reference.activeBranches.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Status" htmlFor="sp-status" hint="A service point with open subscriptions cannot be deactivated.">
              <select id="sp-status" value={f.status} onChange={set('status')} className={inputClass}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </Field>
          )}
        </div>
        <ErrorNotice error={error} onDismiss={clearError} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending} className={secondaryButton}>Cancel</button>
          <button type="submit" disabled={pending} className={primaryButton}>{pending ? 'Working…' : sp ? 'Save changes' : 'Create service point'}</button>
        </div>
      </form>
    </Modal>
  );
};

// ------------------------------------------------------------------------------------------------ plans
const PlansTab: React.FC<{ readOnly: boolean }> = ({ readOnly }) => {
  const { data, error, loading, load } = useList(() => MessService.adminPlans());
  const [editing, setEditing] = useState<MessAdminPlan | 'new' | null>(null);
  return (
    <Frame loading={loading} error={error} onReload={load}>
      {!readOnly && <button type="button" className={primaryButton} onClick={() => setEditing('new')}>Create plan (draft)…</button>}
      {data && data.length === 0 && <EmptyState message="No plans yet." />}
      <ul className="space-y-2">
        {data?.map((p) => (
          <li key={p.id} data-testid={`mess-plan-${p.code}`} className="bg-stone-900/70 border border-stone-800 rounded-2xl p-4 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-black">{p.name} <span className="text-stone-500 font-normal">({p.code})</span></p>
                <p className="text-xs text-stone-400">
                  {p.durationDays} days · {p.mealSlots.length ? p.mealSlots.map(pretty).join(' + ') : 'no meal slots'} · {p.basePrice === null ? 'no price' : formatInr(p.basePrice)} + {p.taxRate === null ? 'no tax rate set' : `${(p.taxRate * 100).toFixed(2)}% tax`}
                </p>
                <p className="text-[11px] text-stone-500">
                  Service times: {p.slotTimes && Object.keys(p.slotTimes).length ? SLOTS.filter((x) => p.slotTimes?.[x]).map((x) => `${pretty(x)} ${p.slotTimes![x]}`).join(', ') : 'not set'} · Earliest start: {p.minStartLeadDays === null ? 'not set' : `${p.minStartLeadDays} day(s)`} · Branch: {p.branch?.name ?? 'all branches'}
                  {p.validFrom || p.validUntil ? ` · Valid ${p.validFrom ?? '…'} to ${p.validUntil ?? '…'}` : ''}
                </p>
              </div>
              <Chip tone={p.status === 'ACTIVE' ? 'emerald' : p.status === 'DRAFT' ? 'amber' : 'neutral'}>{pretty(p.status)}</Chip>
            </div>
            {!readOnly && p.status !== 'ARCHIVED' && <PlanActions plan={p} onEdit={() => setEditing(p)} onDone={load} />}
          </li>
        ))}
      </ul>
      {!readOnly && editing && <PlanDialog plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); void load(); }} />}
    </Frame>
  );
};

/** Write controls for one plan (rendered only for SUPER_ADMIN, so the step-up hook is never needed by the read-only MD view). */
const PlanActions: React.FC<{ plan: MessAdminPlan; onEdit: () => void; onDone: () => void }> = ({ plan, onEdit, onDone }) => {
  const { withStepUp } = useStepUp();
  const { run, pending, error, clearError } = useAdminAction();
  const act = async (action: 'activate' | 'archive') => {
    const out = await run(() => withStepUp((proof) => MessService.planAction(plan.id, action, plan.version, proof)));
    if (out.ok) onDone();
  };
  return (
    <div className="space-y-2">
      <ErrorNotice error={error} onDismiss={clearError} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondaryButton} onClick={onEdit}>Edit…</button>
        {plan.status === 'DRAFT' && (
          <button type="button" className={primaryButton} disabled={pending} onClick={() => act('activate')}>
            Activate
          </button>
        )}
        <button type="button" className={secondaryButton} disabled={pending} onClick={() => act('archive')}>
          Archive
        </button>
      </div>
    </div>
  );
};

const PlanDialog: React.FC<{ plan: MessAdminPlan | null; onClose: () => void; onDone: () => void }> = ({ plan, onClose, onDone }) => {
  const reference = useAdminReference();
  const { withStepUp } = useStepUp();
  const { run, pending, error, clearError } = useAdminAction();
  const [f, setF] = useState({
    code: plan?.code ?? '',
    name: plan?.name ?? '',
    description: plan?.description ?? '',
    durationDays: String(plan?.durationDays ?? 30),
    basePrice: plan?.basePrice === null || plan?.basePrice === undefined ? '' : String(plan.basePrice),
    taxRate: plan?.taxRate === null || plan?.taxRate === undefined ? '' : String(plan.taxRate),
    pauseCutoffHours: plan?.pauseCutoffHours === null || plan?.pauseCutoffHours === undefined ? '' : String(plan.pauseCutoffHours),
    maxPauses: plan?.maxPauses === null || plan?.maxPauses === undefined ? '' : String(plan.maxPauses),
    minStartLeadDays: plan?.minStartLeadDays === null || plan?.minStartLeadDays === undefined ? '' : String(plan.minStartLeadDays),
    validFrom: plan?.validFrom ?? '',
    validUntil: plan?.validUntil ?? '',
    branchId: plan?.branch?.id ?? ''
  });
  const [slots, setSlots] = useState<MealSlot[]>(plan?.mealSlots ?? []);
  const [times, setTimes] = useState<Record<string, string>>({ BREAKFAST: plan?.slotTimes?.BREAKFAST ?? '', LUNCH: plan?.slotTimes?.LUNCH ?? '', DINNER: plan?.slotTimes?.DINNER ?? '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const int = (v: string) => (v.trim() === '' ? null : Number(v));
  const toggle = (s: MealSlot) => setSlots((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: MessPlanInput = {
      name: f.name,
      description: f.description || null,
      durationDays: Number(f.durationDays),
      basePrice: f.basePrice,
      taxRate: f.taxRate.trim() === '' ? null : f.taxRate,
      mealSlots: SLOTS.filter((s) => slots.includes(s)),
      pauseCutoffHours: int(f.pauseCutoffHours),
      maxPauses: int(f.maxPauses),
      minStartLeadDays: int(f.minStartLeadDays),
      validFrom: f.validFrom || null,
      validUntil: f.validUntil || null,
      branchId: f.branchId || null,
      // exactly one explicit HH:mm per ENABLED slot, never a default (an incomplete draft may carry none)
      slotTimes: SLOTS.filter((x) => slots.includes(x) && times[x]).length ? (Object.fromEntries(SLOTS.filter((x) => slots.includes(x) && times[x]).map((x) => [x, times[x]])) as Record<string, string>) : null
    };
    const out = await run(() => withStepUp((proof) => (plan ? MessService.updatePlan(plan.id, { ...body, expectedVersion: plan.version }, proof) : MessService.createPlan({ ...body, code: f.code }, proof))));
    if (out.ok) onDone();
  };

  return (
    <Modal title={plan ? `Edit ${plan.name}` : 'Create plan (draft)'} onClose={onClose} closeDisabled={pending} wide>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-[11px] text-stone-400">The price and tax rate are entered here and nowhere else: they are not defaulted. A plan can be activated only when price, tax rate, meal slots, pause policy and earliest-start days are all set.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {!plan && <Field label="Code" htmlFor="pl-code"><input id="pl-code" value={f.code} onChange={set('code')} required className={inputClass} /></Field>}
          <Field label="Name" htmlFor="pl-name"><input id="pl-name" value={f.name} onChange={set('name')} required className={inputClass} /></Field>
          <Field label="Duration (days)" htmlFor="pl-days"><input id="pl-days" type="number" min={1} value={f.durationDays} onChange={set('durationDays')} required className={inputClass} /></Field>
          <Field label="Price before tax (INR)" htmlFor="pl-price"><input id="pl-price" inputMode="decimal" value={f.basePrice} onChange={set('basePrice')} required className={inputClass} /></Field>
          <Field label="Tax rate (fraction, e.g. 0.05 = 5%)" htmlFor="pl-tax" hint="Leave empty only for a draft."><input id="pl-tax" inputMode="decimal" value={f.taxRate} onChange={set('taxRate')} className={inputClass} /></Field>
          <Field label="Earliest start (days from today)" htmlFor="pl-lead"><input id="pl-lead" type="number" min={0} value={f.minStartLeadDays} onChange={set('minStartLeadDays')} className={inputClass} /></Field>
          <Field label="Pause cutoff (hours)" htmlFor="pl-cut"><input id="pl-cut" type="number" min={0} value={f.pauseCutoffHours} onChange={set('pauseCutoffHours')} className={inputClass} /></Field>
          <Field label="Max pauses" htmlFor="pl-max"><input id="pl-max" type="number" min={0} value={f.maxPauses} onChange={set('maxPauses')} className={inputClass} /></Field>
          <Field label="Sold from" htmlFor="pl-from"><input id="pl-from" type="date" value={f.validFrom} onChange={set('validFrom')} className={inputClass} /></Field>
          <Field label="Sold until" htmlFor="pl-until"><input id="pl-until" type="date" value={f.validUntil} onChange={set('validUntil')} className={inputClass} /></Field>
          <Field label="Branch" htmlFor="pl-branch" hint="Empty = available at every branch.">
            <select id="pl-branch" value={f.branchId} onChange={set('branchId')} className={inputClass}>
              <option value="">All branches</option>
              {reference.activeBranches.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
            </select>
          </Field>
        </div>
        <fieldset className="space-y-1">
          <legend className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Meal slots</legend>
          <div className="flex gap-3">
            {SLOTS.map((s) => (
              <label key={s} className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={slots.includes(s)} onChange={() => toggle(s)} />
                {pretty(s)}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-1" data-testid="slot-times">
          <legend className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Service time per enabled slot (Asia/Kolkata, 24-hour)</legend>
          <div className="flex flex-wrap gap-3">
            {SLOTS.filter((x) => slots.includes(x)).map((x) => (
              <label key={x} className="flex items-center gap-1.5 text-xs">
                {pretty(x)}
                <input type="time" aria-label={`${pretty(x)} service time`} value={times[x]} onChange={(e) => setTimes((cur) => ({ ...cur, [x]: e.target.value }))} className={inputClass} style={{ width: '7.5rem' }} />
              </label>
            ))}
            {slots.length === 0 && <span className="text-[11px] text-stone-500">Enable a meal slot first.</span>}
          </div>
          <p className="text-[11px] text-stone-500">Required to activate a plan. There are no default times: they decide when each meal is served and when pausing closes.</p>
        </fieldset>
        <Field label="Description" htmlFor="pl-desc"><textarea id="pl-desc" value={f.description} onChange={set('description')} maxLength={500} rows={2} className={inputClass} /></Field>
        <ErrorNotice error={error} onDismiss={clearError} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending} className={secondaryButton}>Cancel</button>
          <button type="submit" disabled={pending} className={primaryButton}>{pending ? 'Working…' : plan ? 'Save changes' : 'Create draft'}</button>
        </div>
      </form>
    </Modal>
  );
};

// ------------------------------------------------------------------------------------------------ kitchen (read-only for SUPER_ADMIN and MD)
const KitchenTab: React.FC = () => {
  const { data } = useList(() => MessService.adminServicePoints());
  const [branchId, setBranchId] = useState('');
  const branches: Array<{ id: string; code: string; name: string }> = [...new Map<string, { id: string; code: string; name: string }>((data ?? []).map((sp) => [sp.branch.id, sp.branch] as const)).values()];
  return (
    <div className="space-y-3">
      <Field label="Branch" htmlFor="mess-kitchen-branch" hint="Preparation is done by the branch's Chef; this view is read-only.">
        <select id="mess-kitchen-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputClass}>
          <option value="">Select a branch…</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.code})
            </option>
          ))}
        </select>
      </Field>
      <MessKitchenPanel readOnly branchId={branchId || undefined} />
    </div>
  );
};

// ------------------------------------------------------------------------------------------------ subscriptions
const SubscriptionsTab: React.FC<{ readOnly: boolean }> = ({ readOnly }) => {
  const { data, error, loading, load } = useList(() => MessService.adminSubscriptions());
  const [cancelling, setCancelling] = useState<MessAdminSubscription | null>(null);
  return (
    <Frame loading={loading} error={error} onReload={load}>
      {data && data.subscriptions.length === 0 && <EmptyState message="No subscriptions yet." />}
      <ul className="space-y-2">
        {data?.subscriptions.map((s) => (
          <li key={s.id} data-testid={`mess-subscription-${s.id}`} className="bg-stone-900/70 border border-stone-800 rounded-2xl p-4 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-black">{s.customerName} · {s.plan.name}</p>
                <p className="text-xs text-stone-400">{s.startDate} to {s.endDate} · {s.servicePoint?.name ?? '-'} · Room {s.roomNumber}</p>
                <p className="text-[11px] text-stone-500">{s.price ? formatInr(s.price.total) : '-'} · Payment {s.payment?.state ?? '-'} · Created {formatDate(s.createdAt)}{s.refund.state !== 'NO_REFUND' ? ` · ${pretty(s.refund.state)}` : ''}</p>
              </div>
              <Chip tone={s.status === 'ACTIVE' ? 'emerald' : s.status === 'PENDING_PAYMENT' ? 'amber' : 'neutral'}>{pretty(s.status)}</Chip>
            </div>
            {!readOnly && s.cancellation.allowed && <button type="button" className={secondaryButton} onClick={() => setCancelling(s)}>Cancel…</button>}
          </li>
        ))}
      </ul>
      {!readOnly && cancelling && <AdminCancelDialog sub={cancelling} onClose={() => setCancelling(null)} onDone={() => { setCancelling(null); void load(); }} />}
    </Frame>
  );
};

const AdminCancelDialog: React.FC<{ sub: MessAdminSubscription; onClose: () => void; onDone: () => void }> = ({ sub, onClose, onDone }) => {
  const { withStepUp } = useStepUp();
  const { run, pending, error, clearError } = useAdminAction();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason || !confirmed) return;
    const out = await run(() => withStepUp((proof) => MessService.adminCancel(sub.id, reason, note, proof)));
    if (out.ok) onDone();
  };
  return (
    <Modal title={`Cancel ${sub.customerName}'s subscription?`} onClose={onClose} closeDisabled={pending}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-stone-300">
          {sub.status === 'ACTIVE' ? 'The customer is refunded IN FULL (no partial refund, fee or credit). This is only possible while no meal has been served.' : 'No payment has been taken for this purchase.'}
        </p>
        <Field label="Reason" htmlFor="adm-cancel-reason">
          <select id="adm-cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} required className={inputClass}>
            <option value="">Select a reason…</option>
            {ADMIN_CANCEL_REASONS.map((r) => <option key={r} value={r}>{pretty(r)}</option>)}
          </select>
        </Field>
        <Field label="Note (optional)" htmlFor="adm-cancel-note"><textarea id="adm-cancel-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} rows={2} className={inputClass} /></Field>
        <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />I confirm this cancellation{sub.status === 'ACTIVE' ? ' and the full refund' : ''}.</label>
        <ErrorNotice error={error} onDismiss={clearError} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending} className={secondaryButton}>Keep subscription</button>
          <button type="submit" disabled={pending || !reason || !confirmed} className={primaryButton}>{pending ? 'Working…' : 'Cancel subscription'}</button>
        </div>
      </form>
    </Modal>
  );
};
