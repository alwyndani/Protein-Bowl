import React, { useCallback, useEffect, useState } from 'react';
import { MapPin, RefreshCw } from 'lucide-react';
import { KitchenService } from '../../services/kitchenService';
import type { RoutingFilter, RoutingList, RoutingOrder } from '../../services/kitchenTypes';
import { useAdminReference } from './AdminReference';
import { useStepUp } from './StepUp';
import { useAdminAction } from './useAdminAction';
import { describeAdminError } from './adminErrors';
import type { AdminErrorInfo } from './adminErrors';
import { Chip, EmptyState, ErrorNotice, Field, Modal, Spinner, formatDate, inputClass, primaryButton, secondaryButton } from './adminUi';

const FILTERS: Array<{ id: RoutingFilter; label: string }> = [
  { id: 'unrouted', label: 'Unrouted' },
  { id: 'routed', label: 'Routed' },
  { id: 'all', label: 'All' }
];

/** Codes after which the list the administrator was looking at is out of date: reload it. */
const STALE_CODES = ['ORDER_NOT_ROUTABLE', 'KITCHEN_BRANCH_CHANGED', 'ORDER_STATE_CONFLICT'];

const RoutingDialog: React.FC<{ order: RoutingOrder; onClose: () => void; onDone: () => void; onStale: () => void }> = ({ order, onClose, onDone, onStale }) => {
  const reference = useAdminReference();
  const { withStepUp } = useStepUp();
  const { run, pending, error, clearError } = useAdminAction();
  const [branchId, setBranchId] = useState('');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  const current = order.kitchenBranch;
  const options = reference.activeBranches.filter((b) => b.id !== current?.id);
  const reasonOk = reason.trim().length >= 3;
  const valid = !!branchId && reasonOk;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    const outcome = await run(() =>
      // expectedBranchId = the branch THIS screen showed: if someone else changed it meanwhile the server answers 409 instead of overwriting
      withStepUp((proof) => KitchenService.assignBranch(order.id, { branchId, expectedBranchId: current?.id ?? null, reason: reason.trim() }, proof))
    );
    if (outcome.ok) onDone();
  };

  useEffect(() => {
    if (error?.code && STALE_CODES.includes(error.code)) onStale();
  }, [error, onStale]);

  return (
    <Modal title={current ? `Change kitchen for ${order.orderNumber}` : `Route ${order.orderNumber} to a kitchen`} onClose={onClose} closeDisabled={pending}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-xs text-stone-400">
          {current ? `Currently routed to ${current.name}.` : 'This order is paid and confirmed but not routed: no kitchen can see it yet.'} Routing does not change the order's status or payment.
        </p>
        <Field label="Kitchen branch" htmlFor="route-branch" error={touched && !branchId ? 'Choose a kitchen branch.' : undefined}>
          <select id="route-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} disabled={pending} className={inputClass} aria-invalid={touched && !branchId}>
            <option value="">Select an active branch…</option>
            {options.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.code})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reason" htmlFor="route-reason" hint="Recorded in the audit log (3–200 characters)." error={touched && !reasonOk ? 'Enter a reason of at least 3 characters.' : undefined}>
          <textarea id="route-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} rows={3} disabled={pending} className={inputClass} aria-invalid={touched && !reasonOk} />
        </Field>
        <ErrorNotice error={error} onDismiss={clearError} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" disabled={pending} className={primaryButton}>
            {pending ? 'Working…' : current ? 'Change kitchen' : 'Route order'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

/** SUPER_ADMIN: paid + confirmed customer orders by kitchen-routing state. Routing-relevant fields only (area = city + postal code). */
export const KitchenRouting: React.FC = () => {
  const [filter, setFilter] = useState<RoutingFilter>('unrouted');
  const [list, setList] = useState<RoutingList | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<AdminErrorInfo | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<RoutingOrder | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    KitchenService.listRouting(filter)
      .then((data) => {
        if (cancelled) return;
        setList(data);
        setError(null);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(describeAdminError(err));
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [filter, attempt]);

  return (
    <section aria-label="Kitchen routing" data-testid="kitchen-routing" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <MapPin className="w-5 h-5 text-amber-400" aria-hidden="true" />
            Kitchen routing
          </h2>
          <p className="text-xs text-stone-400">Paid, confirmed orders. An order is invisible to every chef until you route it to a kitchen branch.</p>
        </div>
        <button type="button" onClick={reload} className={secondaryButton} data-testid="routing-refresh">
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div role="group" aria-label="Routing filter" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`px-3 py-2 rounded-xl text-sm font-bold border focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${filter === f.id ? 'bg-amber-500 text-stone-950 border-amber-400' : 'bg-stone-900/70 text-stone-300 border-stone-800'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {notice && (
        <p role="status" data-testid="routing-notice" className="text-xs text-emerald-200 bg-emerald-950/50 border border-emerald-800 rounded-xl px-3 py-2">
          {notice}
        </p>
      )}

      {status === 'loading' && !list && <Spinner label="Loading orders…" />}
      {status === 'error' && <ErrorNotice error={error} onRetry={reload} />}

      {list && (
        <div aria-busy={status === 'loading'}>
          {list.items.length === 0 ? (
            <EmptyState message={filter === 'unrouted' ? 'No unrouted orders. Every paid order has a kitchen.' : 'No orders match this filter.'} />
          ) : (
            <ul className="space-y-3" aria-label="Orders">
              {list.items.map((o) => (
                <li key={o.id} data-testid="routing-row" data-order-number={o.orderNumber} className="bg-stone-900/70 border border-stone-800 rounded-2xl p-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-black text-white break-all">{o.orderNumber}</p>
                    <p className="text-[11px] text-stone-400">
                      Confirmed {formatDate(o.confirmedAt)} · Area: {[o.deliveryArea.city, o.deliveryArea.postalCode].filter(Boolean).join(' ') || 'not recorded'}
                    </p>
                    <p className="text-xs text-stone-300">{o.items.map((i) => `${i.quantity} × ${i.title}`).join(', ')}</p>
                    <div>{o.kitchenBranch ? <Chip tone="emerald">Routed to {o.kitchenBranch.name}</Chip> : <Chip tone="amber">Unrouted</Chip>}</div>
                  </div>
                  <button type="button" onClick={() => setEditing(o)} aria-label={`${o.kitchenBranch ? 'Change kitchen for' : 'Route'} ${o.orderNumber}`} className={primaryButton}>
                    {o.kitchenBranch ? 'Change kitchen' : 'Route to kitchen'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {list.truncated && (
            <p className="mt-2 text-[11px] text-amber-200" data-testid="routing-truncated">
              Showing the oldest {list.items.length} of {list.total}.
            </p>
          )}
        </div>
      )}

      {editing && (
        <RoutingDialog
          order={editing}
          onClose={() => setEditing(null)}
          onStale={reload}
          onDone={() => {
            setNotice(`Order ${editing.orderNumber} was routed.`);
            setEditing(null);
            reload();
          }}
        />
      )}
    </section>
  );
};
