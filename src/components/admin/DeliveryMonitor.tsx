import React, { useEffect, useState } from 'react';
import { RefreshCw, Truck } from 'lucide-react';
import { DeliveryService } from '../../services/deliveryService';
import type { AssignableDriver, DeliveryMonitorOrder, MonitorProofState, OverrideReasonCode } from '../../services/deliveryTypes';
import { FAILURE_REASONS, OVERRIDE_REASONS } from '../../services/deliveryTypes';
import { useDeliveryMonitor } from '../../hooks/useDeliveryMonitor';
import { useAuth } from '../../context/AuthContext';
import { useAdminReference } from './AdminReference';
import { useStepUp } from './StepUp';
import { useAdminAction } from './useAdminAction';
import { Chip, EmptyState, ErrorNotice, Field, Modal, Spinner, dangerButton, formatDate, inputClass, primaryButton, secondaryButton } from './adminUi';

/** Codes after which the screen the administrator was looking at is out of date: the monitor reloads (it also polls). */
const STALE_CODES = ['DELIVERY_ASSIGNMENT_CHANGED', 'ORDER_NOT_ASSIGNABLE', 'ORDER_STATE_CONFLICT', 'ORDER_NOT_DISPATCHED', 'ALREADY_DELIVERED', 'INVALID_DELIVERY_STATE', 'ORDER_NOT_OPERATIONALLY_ELIGIBLE'];

const PROOF_LABEL: Record<MonitorProofState, string> = {
  NOT_ISSUED: 'Delivery code: not generated yet',
  ISSUED: 'Delivery code: generated',
  LOCKED: 'Delivery code: entry temporarily locked',
  CODE_BLOCKED: 'Delivery code: blocked',
  VERIFIED: 'Delivery code: verified',
  OVERRIDDEN: 'Handover confirmed by administrator'
};

const reasonLabel = (code: string) => FAILURE_REASONS.find((r) => r.code === code)?.label ?? 'Other';

type Mode = 'assign' | 'reassign' | 'unassign';

const AssignmentDialog: React.FC<{ order: DeliveryMonitorOrder; branchId: string; mode: Mode; onClose: () => void; onDone: (message: string) => void; onStale: () => void }> = ({ order, branchId, mode, onClose, onDone, onStale }) => {
  const { withStepUp } = useStepUp();
  const { run, pending, error, clearError } = useAdminAction();
  const [drivers, setDrivers] = useState<AssignableDriver[] | null>(null);
  const [driversError, setDriversError] = useState(false);
  const [driverId, setDriverId] = useState('');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  const current = order.assignment.driver;
  const needsDriver = mode !== 'unassign';
  const reasonOk = reason.trim().length >= 3;
  const valid = reasonOk && (!needsDriver || !!driverId);

  useEffect(() => {
    if (!needsDriver) return;
    let cancelled = false;
    DeliveryService.listDrivers(branchId)
      .then((list) => !cancelled && setDrivers(list))
      .catch(() => !cancelled && setDriversError(true));
    return () => {
      cancelled = true;
    };
  }, [branchId, needsDriver]);

  useEffect(() => {
    if (error?.code && STALE_CODES.includes(error.code)) onStale();
  }, [error, onStale]);

  const options = (drivers ?? []).filter((d) => d.employeeId !== current?.employeeId);
  const title = mode === 'assign' ? `Assign a driver to ${order.orderNumber}` : mode === 'reassign' ? `Reassign ${order.orderNumber}` : `Unassign ${order.orderNumber}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    const outcome = await run(() =>
      // expectedDriverId = the driver THIS screen showed: if someone else changed it meanwhile the server answers 409 instead of overwriting
      withStepUp((proof) => DeliveryService.assign(order.id, { driverEmployeeId: needsDriver ? driverId : null, expectedDriverId: current?.employeeId ?? null, reason: reason.trim() }, proof))
    );
    if (outcome.ok) onDone(mode === 'unassign' ? `Order ${order.orderNumber} is unassigned.` : `Order ${order.orderNumber} was ${mode === 'assign' ? 'assigned' : 'reassigned'}.`);
  };

  return (
    <Modal title={title} onClose={onClose} closeDisabled={pending}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-xs text-stone-400">
          {current ? `Currently assigned to ${current.fullName} (${current.employeeCode}).` : 'No driver has claimed this order yet.'} This only changes who delivers it: the order's status and payment are not touched. It cannot be changed once the order is out for delivery.
        </p>
        {needsDriver && (
          <Field label="Driver" htmlFor="assign-driver" error={touched && !driverId ? 'Choose a driver.' : undefined}>
            <select id="assign-driver" value={driverId} onChange={(e) => setDriverId(e.target.value)} disabled={pending || drivers === null} className={inputClass} aria-invalid={touched && !driverId}>
              <option value="">{drivers === null && !driversError ? 'Loading drivers…' : 'Select an active driver…'}</option>
              {options.map((d) => (
                <option key={d.employeeId} value={d.employeeId}>
                  {d.fullName} ({d.employeeCode})
                </option>
              ))}
            </select>
            {driversError && (
              <p role="alert" className="text-[11px] text-red-300">
                The drivers could not be loaded. Close this dialog and try again.
              </p>
            )}
            {drivers !== null && options.length === 0 && <p className="text-[11px] text-amber-300">No other active driver is assigned to this branch.</p>}
          </Field>
        )}
        <Field label="Reason" htmlFor="assign-reason" hint="Recorded in the audit log (3–200 characters)." error={touched && !reasonOk ? 'Enter a reason of at least 3 characters.' : undefined}>
          <textarea id="assign-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} rows={3} disabled={pending} className={inputClass} aria-invalid={touched && !reasonOk} />
        </Field>
        <ErrorNotice error={error} onDismiss={clearError} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" disabled={pending} className={primaryButton}>
            {pending ? 'Working…' : mode === 'assign' ? 'Assign driver' : mode === 'reassign' ? 'Reassign driver' : 'Unassign'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

/**
 * EXCEPTIONAL handover confirmation. Deliberately separate from routine delivery (which is the driver entering the customer's code):
 * step-up, a structured reason, a mandatory note and an explicit confirmation. The customer's code is never shown here.
 */
const OverrideDialog: React.FC<{ order: DeliveryMonitorOrder; onClose: () => void; onDone: (message: string) => void; onStale: () => void }> = ({ order, onClose, onDone, onStale }) => {
  const { withStepUp } = useStepUp();
  const { run, pending, error, clearError } = useAdminAction();
  const [reasonCode, setReasonCode] = useState<OverrideReasonCode | ''>('');
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [touched, setTouched] = useState(false);
  const previouslyFailed = order.assignment.state === 'FAILED' || !!order.exception;
  const noteOk = note.trim().length >= 10;
  const valid = !!reasonCode && noteOk && confirmed;

  useEffect(() => {
    if (error?.code && STALE_CODES.includes(error.code)) onStale();
  }, [error, onStale]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid || !reasonCode) return;
    const outcome = await run(() => withStepUp((proof) => DeliveryService.overrideDelivery(order.id, { reasonCode, note: note.trim() }, proof)));
    if (outcome.ok) onDone(`Handover for ${order.orderNumber} was confirmed by override.`);
  };

  return (
    <Modal title={`Exceptional handover confirmation for ${order.orderNumber}`} onClose={onClose} closeDisabled={pending}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p role="note" className="text-xs text-amber-200 bg-amber-950/50 border border-amber-700 rounded-xl px-3 py-2">
          This confirms that the order was handed over to the customer WITHOUT their delivery code. Use it only in an exceptional situation: it is recorded against your account and cannot be undone. Routine deliveries are completed by the driver with the customer's code.
        </p>
        {previouslyFailed && (
          <p role="alert" data-testid="override-failed-warning" className="text-xs text-red-200 bg-red-950/60 border border-red-500/40 rounded-xl px-3 py-2">
            A delivery issue was previously reported for this order{order.exception ? ` (${FAILURE_REASONS.find((r) => r.code === order.exception!.reasonCode)?.label ?? 'Other'})` : ''}. Confirming the handover records that history; the report is not erased.
          </p>
        )}
        <Field label="Reason" htmlFor="override-reason" error={touched && !reasonCode ? 'Choose a reason.' : undefined}>
          <select id="override-reason" value={reasonCode} onChange={(e) => setReasonCode(e.target.value as OverrideReasonCode | '')} disabled={pending} className={inputClass} aria-invalid={touched && !reasonCode}>
            <option value="">Select a reason…</option>
            {OVERRIDE_REASONS.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Explanation" htmlFor="override-note" hint="Recorded in the audit trail (10–200 characters)." error={touched && !noteOk ? 'Enter an explanation of at least 10 characters.' : undefined}>
          <textarea id="override-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} rows={3} disabled={pending} className={inputClass} aria-invalid={touched && !noteOk} />
        </Field>
        <div>
          <label className="flex items-start gap-3 text-xs text-stone-200 cursor-pointer min-h-11">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={pending} className="mt-0.5 w-4 h-4" />
            <span>I confirm that this order was physically handed over to the customer.</span>
          </label>
          {touched && !confirmed && (
            <p role="alert" className="text-[11px] text-red-300">
              Tick the confirmation to continue.
            </p>
          )}
        </div>
        <ErrorNotice error={error} onDismiss={clearError} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" disabled={pending} className={dangerButton}>
            {pending ? 'Working…' : 'Confirm handover'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const OrderRow: React.FC<{ order: DeliveryMonitorOrder; canAssign: boolean; onAction: (order: DeliveryMonitorOrder, mode: Mode) => void; onOverride: (order: DeliveryMonitorOrder) => void }> = ({ order, canAssign, onAction, onOverride }) => {
  const driver = order.assignment.driver;
  return (
    <li data-testid="delivery-monitor-row" data-order-number={order.orderNumber} className="bg-stone-900/70 border border-stone-800 rounded-2xl p-4 flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1 min-w-0">
        <p className="text-sm font-black text-white break-all">{order.orderNumber}</p>
        <p className="text-[11px] text-stone-400">
          {order.status === 'READY' ? `Ready ${formatDate(order.readyAt)}` : `Picked up ${formatDate(order.assignment.pickupTime)}`} · Area: {[order.area.city, order.area.postalCode].filter(Boolean).join(' ') || 'not recorded'}
        </p>
        <p className="text-xs text-stone-300">{order.items.map((i) => `${i.quantity} × ${i.title}`).join(', ')}</p>
        <div className="flex flex-wrap gap-2">
          {driver ? <Chip tone="emerald">Driver: {driver.fullName} ({driver.employeeCode})</Chip> : <Chip tone="amber">No driver yet</Chip>}
          {order.exception && <Chip tone="amber">Issue reported: {reasonLabel(order.exception.reasonCode)}</Chip>}
          {order.proofState && <Chip>{PROOF_LABEL[order.proofState]}</Chip>}
        </div>
        {order.exception?.note && <p className="text-[11px] text-stone-300">Driver note: {order.exception.note}</p>}
        {order.exception && <p className="text-[11px] text-amber-200">Awaiting review. There is no automatic cancellation, refund or return to the kitchen.</p>}
      </div>
      {canAssign && order.status === 'DISPATCHED' && order.proofState !== 'VERIFIED' && order.proofState !== 'OVERRIDDEN' && (
        <button type="button" onClick={() => onOverride(order)} aria-label={`Exceptional handover confirmation for ${order.orderNumber}`} data-testid="override-open" className="text-xs font-bold text-stone-300 underline hover:text-white min-h-11 px-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded">
          Exceptional handover confirmation…
        </button>
      )}
      {canAssign && order.status === 'READY' && (
        <div className="flex flex-wrap gap-2">
          {driver ? (
            <>
              <button type="button" onClick={() => onAction(order, 'reassign')} aria-label={`Reassign ${order.orderNumber}`} className={primaryButton}>
                Reassign
              </button>
              <button type="button" onClick={() => onAction(order, 'unassign')} aria-label={`Unassign ${order.orderNumber}`} className={secondaryButton}>
                Unassign
              </button>
            </>
          ) : (
            <button type="button" onClick={() => onAction(order, 'assign')} aria-label={`Assign ${order.orderNumber}`} className={primaryButton}>
              Assign driver
            </button>
          )}
        </div>
      )}
    </li>
  );
};

/** SUPER_ADMIN delivery monitor of ONE explicit branch (unclaimed / assigned READY, out for delivery, exceptions). Order data is area-only. */
export const DeliveryMonitor: React.FC = () => {
  const reference = useAdminReference();
  const auth = useAuth();
  const [branchId, setBranchId] = useState('');
  const monitor = useDeliveryMonitor({ branchId, onSessionExpired: () => void auth.logout() });
  const [editing, setEditing] = useState<{ order: DeliveryMonitorOrder; mode: Mode } | null>(null);
  const [overriding, setOverriding] = useState<DeliveryMonitorOrder | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const data = monitor.data;
  const canAssign = !!data && !data.readOnly;

  const sections = data
    ? ([
        { id: 'unclaimed', title: 'Ready, unclaimed', empty: 'No unclaimed orders.', section: data.sections.unclaimed },
        { id: 'assigned', title: 'Ready, assigned', empty: 'No assigned orders waiting for pickup.', section: data.sections.assigned },
        { id: 'dispatched', title: 'Out for delivery', empty: 'Nothing is out for delivery.', section: data.sections.dispatched },
        { id: 'exceptions', title: 'Exceptions', empty: 'No reported delivery issues.', section: data.sections.exceptions }
      ] as const)
    : [];

  return (
    <section aria-label="Delivery" data-testid="delivery-monitor" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <Truck className="w-5 h-5 text-amber-400" aria-hidden="true" />
            Delivery
          </h2>
          <p className="text-xs text-stone-400">Ready orders and deliveries in progress for one branch. Customer contact details are not shown here.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="delivery-monitor-branch" className="block text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-1">
              Branch
            </label>
            <select id="delivery-monitor-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputClass}>
              <option value="">Select a branch…</option>
              {reference.activeBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>
          <button type="button" onClick={() => void monitor.refresh()} disabled={!branchId} className={secondaryButton} data-testid="delivery-monitor-refresh">
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      {!branchId && <EmptyState message="Choose a branch to see its deliveries." />}

      {notice && (
        <p role="status" data-testid="delivery-monitor-notice" className="text-xs text-emerald-200 bg-emerald-950/50 border border-emerald-800 rounded-xl px-3 py-2">
          {notice}
        </p>
      )}

      {branchId && monitor.stale && (
        <p role="alert" data-testid="delivery-monitor-stale" className="text-xs text-amber-200 bg-amber-950/50 border border-amber-700 rounded-xl px-3 py-2">
          {monitor.loadError?.message ?? 'The list could not be refreshed.'} What you see may be out of date{monitor.lastUpdatedMs ? ` (last updated ${new Date(monitor.lastUpdatedMs).toLocaleTimeString()})` : ''}.
        </p>
      )}

      {branchId && monitor.loadState === 'loading' && !data && <Spinner label="Loading deliveries…" />}
      {branchId && monitor.loadState === 'error' && !data && (
        <div role="alert" data-testid="delivery-monitor-error" className="flex items-center justify-between gap-3 bg-red-950/60 border border-red-500/40 text-red-200 text-xs rounded-2xl px-4 py-3">
          <span>{monitor.loadError?.message ?? 'The deliveries could not be loaded.'}</span>
          <button type="button" onClick={() => void monitor.refresh()} className="font-bold underline">
            Retry
          </button>
        </div>
      )}

      {data && (
        <div className="space-y-6">
          {sections.map(({ id, title, empty, section }) => (
            <div key={id} role="region" aria-labelledby={`delivery-monitor-h-${id}`} data-testid={`delivery-monitor-${id}`} className="space-y-2">
              <h3 id={`delivery-monitor-h-${id}`} className="text-sm font-black text-white flex items-center gap-2">
                {title}
                <span className="text-xs font-bold text-stone-300 bg-stone-800 border border-stone-700 rounded-lg px-2 py-0.5">{section.total}</span>
              </h3>
              {section.items.length === 0 ? (
                <EmptyState message={empty} />
              ) : (
                <ul className="space-y-3" aria-label={title}>
                  {section.items.map((o) => (
                    <OrderRow key={o.id} order={o} canAssign={canAssign} onAction={(order, mode) => setEditing({ order, mode })} onOverride={setOverriding} />
                  ))}
                </ul>
              )}
              {section.truncated && (
                <p className="text-[11px] text-amber-200" data-testid={`delivery-monitor-truncated-${id}`}>
                  Showing the first {section.items.length} of {section.total}.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <AssignmentDialog
          order={editing.order}
          branchId={branchId}
          mode={editing.mode}
          onClose={() => setEditing(null)}
          onStale={() => void monitor.refresh()}
          onDone={(message) => {
            setNotice(message);
            setEditing(null);
            void monitor.refresh();
          }}
        />
      )}
      {overriding && (
        <OverrideDialog
          order={overriding}
          onClose={() => setOverriding(null)}
          onStale={() => void monitor.refresh()}
          onDone={(message) => {
            setNotice(message);
            setOverriding(null);
            void monitor.refresh();
          }}
        />
      )}
    </section>
  );
};
