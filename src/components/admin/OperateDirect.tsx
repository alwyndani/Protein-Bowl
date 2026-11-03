import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { DeliveryOperateService } from '../../services/deliveryOperateService';
import type { DeliveryMonitorOrder, DeliveryOwnedOrder, FailureReasonCode } from '../../services/deliveryTypes';
import { FAILURE_REASONS } from '../../services/deliveryTypes';
import { RETRY_REASONS } from '../../services/deliveryResolutionTypes';
import type { RetryReasonCode } from '../../services/deliveryResolutionTypes';
import { useDeliveryMonitor } from '../../hooks/useDeliveryMonitor';
import { describeOperateError } from '../../utils/operateErrors';
import type { OperateErrorInfo } from '../../utils/operateErrors';
import { useAuth } from '../../context/AuthContext';
import { useAdminReference } from './AdminReference';
import { useStepUp } from './StepUp';
import { Chip, EmptyState, Spinner, formatDate, inputClass, primaryButton, secondaryButton } from './adminUi';
import { CodeDialog, ConfirmDialog, OperateErrorNotice, ReasonDialog, SuccessNotice } from './operateUi';

type Action = 'start' | 'takeover' | 'verify' | 'fail' | 'retry' | 'resume';

/** What an administrator can do with a row, derived ONLY from the server's monitor data. The server re-checks everything under its own locks. */
export function actionsFor(order: DeliveryMonitorOrder): Action[] {
  const a = order.assignment;
  const adminOwned = a.operator === 'ADMIN';
  const driverOwned = !!a.driver && !adminOwned;
  if (driverOwned) return ['takeover'];
  if (order.status === 'READY') return a.state === null || adminOwned ? ['start'] : [];
  if (order.status === 'DISPATCHED' && adminOwned) {
    if (a.state === 'IN_TRANSIT') return ['verify', 'fail'];
    if (a.state === 'FAILED') return order.canRetry ? ['retry'] : [];
    if (a.state === 'ASSIGNED') return ['resume'];
  }
  return [];
}

const reasonLabel = (code: string) => FAILURE_REASONS.find((r) => r.code === code)?.label ?? 'Other';

const DetailsPanel: React.FC<{ order: DeliveryMonitorOrder; onSessionExpired: () => void }> = ({ order, onSessionExpired }) => {
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [detail, setDetail] = useState<DeliveryOwnedOrder | null>(null);
  const [error, setError] = useState<OperateErrorInfo | null>(null);

  const load = async () => {
    setState('loading');
    setError(null);
    try {
      setDetail(await DeliveryOperateService.getOrder(order.id));
      setState('ready');
    } catch (err) {
      const info = describeOperateError(err);
      if (info.kind === 'session-expired') onSessionExpired();
      setError(info);
      setState('error');
    }
  };

  return (
    <div className="space-y-1">
      {state !== 'ready' && (
        <button type="button" onClick={() => void load()} disabled={state === 'loading'} data-testid="details-open" aria-label={`Show delivery details for ${order.orderNumber}`} className="text-[11px] font-bold text-stone-300 underline min-h-8">
          {state === 'loading' ? 'Loading details…' : 'Show delivery details'}
        </button>
      )}
      {state === 'error' && <OperateErrorNotice error={error} onDismiss={() => setState('idle')} />}
      {state === 'ready' && detail && (
        <div data-testid="delivery-details" className="text-xs text-stone-200 bg-stone-950/60 border border-stone-800 rounded-xl p-3 space-y-0.5">
          <p>
            <span className="text-stone-400">Customer:</span> {detail.delivery.firstName ?? 'not recorded'} · {detail.delivery.phone ?? 'no phone recorded'}
          </p>
          <p>
            <span className="text-stone-400">Address:</span> {[detail.delivery.address.line1, detail.delivery.address.line2, detail.delivery.address.city, detail.delivery.address.state, detail.delivery.address.postalCode].filter(Boolean).join(', ') || 'not recorded'}
          </p>
          {detail.delivery.instructions && (
            <p>
              <span className="text-stone-400">Instructions:</span> {detail.delivery.instructions}
            </p>
          )}
          <p>
            <span className="text-stone-400">Attempt:</span> {detail.assignment.attemptNumber} of {detail.assignment.maxAttempts}
          </p>
        </div>
      )}
    </div>
  );
};

const Row: React.FC<{ order: DeliveryMonitorOrder; onAct: (order: DeliveryMonitorOrder, action: Action) => void; onSessionExpired: () => void }> = ({ order, onAct, onSessionExpired }) => {
  const acts = actionsFor(order);
  const a = order.assignment;
  const adminOwned = a.operator === 'ADMIN';
  const label: Record<Action, string> = { start: 'Start delivery', takeover: 'Take over from driver', verify: 'Enter customer code', fail: 'Report a problem', retry: 'Retry delivery', resume: 'Start delivery again' };
  const failed = order.status === 'DISPATCHED' && a.state === 'FAILED';
  return (
    <li data-testid="operate-row" data-order-number={order.orderNumber} className="bg-stone-900/70 border border-stone-800 rounded-2xl p-4 flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1 min-w-0">
        <p className="text-sm font-black text-white break-all">{order.orderNumber}</p>
        <p className="text-[11px] text-stone-400">
          {order.status === 'READY' ? `Ready ${formatDate(order.readyAt)}` : `Picked up ${formatDate(a.pickupTime)}`} · Area: {[order.area.city, order.area.postalCode].filter(Boolean).join(' ') || 'not recorded'}
        </p>
        <p className="text-xs text-stone-300">{order.items.map((i) => `${i.quantity} × ${i.title}`).join(', ')}</p>
        <div className="flex flex-wrap gap-2">
          {adminOwned ? <Chip tone="emerald">Operated by an administrator</Chip> : a.driver ? <Chip tone="amber">Driver: {a.driver.fullName} ({a.driver.employeeCode})</Chip> : <Chip>Not started</Chip>}
          {order.status === 'DISPATCHED' && <Chip>Attempt {a.attemptNumber} of {order.maxAttempts}</Chip>}
          {order.exception && <Chip tone="amber">Issue reported: {reasonLabel(order.exception.reasonCode)}</Chip>}
          {order.retryPending && <Chip tone="amber">Retry arranged: not started yet</Chip>}
        </div>
        {failed && !order.canRetry && adminOwned && (
          <p data-testid="attempt-limit" className="text-[11px] text-red-200">
            The maximum of {order.maxAttempts} delivery attempts has been reached: use Cancel &amp; Full Refund or the exceptional handover in the Delivery section.
          </p>
        )}
        {adminOwned && order.status === 'DISPATCHED' && <DetailsPanel order={order} onSessionExpired={onSessionExpired} />}
      </div>
      {acts.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="operate-actions">
          {acts.map((act, i) => (
            <button key={act} type="button" onClick={() => onAct(order, act)} aria-label={`${label[act]} ${order.orderNumber}`} data-testid={`act-${act}`} className={i === 0 ? primaryButton : secondaryButton}>
              {label[act]}
            </button>
          ))}
        </div>
      )}
    </li>
  );
};

/** SUPER_ADMIN operation of direct-order delivery for ONE branch. Every action asks for the password step-up proof and is confirmed by the server before any success is shown. */
export const OperateDirect: React.FC = () => {
  const reference = useAdminReference();
  const auth = useAuth();
  const { withStepUp } = useStepUp();
  const [branchId, setBranchId] = useState('');
  const monitor = useDeliveryMonitor({ branchId, onSessionExpired: () => void auth.logout() });
  const [active, setActive] = useState<{ order: DeliveryMonitorOrder; action: Action } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const data = monitor.data;
  const refresh = () => void monitor.refresh();
  const done = (message: string) => {
    setNotice(message);
    setActive(null);
    void monitor.refresh();
  };
  const close = () => setActive(null);
  const stale = () => void monitor.refresh();

  const sections = data
    ? ([
        { id: 'unclaimed', title: 'Ready for pickup', empty: 'No orders are waiting for pickup.', section: data.sections.unclaimed },
        { id: 'assigned', title: 'Ready, already owned', empty: 'No owned orders are waiting for pickup.', section: data.sections.assigned },
        { id: 'dispatched', title: 'Out for delivery', empty: 'Nothing is out for delivery.', section: data.sections.dispatched },
        { id: 'exceptions', title: 'Delivery problems', empty: 'No reported delivery problems.', section: data.sections.exceptions }
      ] as const)
    : [];

  const dialog = () => {
    if (!active) return null;
    const { order, action } = active;
    const n = order.orderNumber;
    const common = { onClose: close, onDone: done, onStale: stale };
    switch (action) {
      case 'start':
        return (
          <ConfirmDialog
            {...common}
            title={`Start delivery of ${n}`}
            body="Confirm the bag has been collected and the delivery is starting. The order moves to Out for delivery."
            confirmLabel="Start delivery"
            perform={async () => {
              const r = await withStepUp((proof) => DeliveryOperateService.dispatch(order.id, proof));
              return r.changed ? `Delivery of ${n} has started.` : `No change: ${n} was already started.`;
            }}
          />
        );
      case 'resume':
        return (
          <ConfirmDialog
            {...common}
            title={`Start the next attempt for ${n}`}
            body="The retry is arranged. Confirm the delivery is on the road again."
            confirmLabel="Start delivery again"
            perform={async () => {
              const r = await withStepUp((proof) => DeliveryOperateService.resume(order.id, proof));
              return r.changed ? `The next attempt for ${n} has started.` : `No change: ${n} is already on the road.`;
            }}
          />
        );
      case 'takeover':
        return (
          <ReasonDialog
            {...common}
            title={`Take over ${n}`}
            intro={`This delivery belongs to ${order.assignment.driver?.fullName ?? 'a driver'}${order.assignment.driver ? ` (${order.assignment.driver.employeeCode})` : ''}. Taking it over moves it to the administrators; its status, attempt and delivery code are not changed.`}
            submitLabel="Take over"
            textLabel="Reason"
            textHint="Recorded in the audit log (3–1000 characters)."
            minLength={3}
            maxLength={1000}
            perform={async ({ text }) => {
              const driverId = order.assignment.driver?.employeeId;
              if (!driverId) throw new Error('missing driver');
              const r = await withStepUp((proof) => DeliveryOperateService.takeover(order.id, { expectedDriverId: driverId, reason: text }, proof));
              return r.changed ? `${n} is now operated by the administrators.` : `No change: ${n} was already taken over.`;
            }}
          />
        );
      case 'verify':
        return (
          <CodeDialog
            {...common}
            title={`Confirm delivery of ${n}`}
            intro="Ask the customer for the 6-digit code shown in their order, then enter it. The delivery is only completed when the server accepts the code."
            codeLabel="Customer delivery code"
            submitLabel="Verify & complete delivery"
            perform={async (code) => {
              const r = await withStepUp((proof) => DeliveryOperateService.verify(order.id, code, proof));
              return r.changed ? `Delivery of ${n} was confirmed.` : `No change: ${n} was already confirmed.`;
            }}
          />
        );
      case 'fail':
        return (
          <ReasonDialog
            {...common}
            title={`Report a problem with ${n}`}
            intro="Use this when the delivery could not be completed. The order stays out for delivery; nothing is cancelled or refunded."
            submitLabel="Report problem"
            codes={FAILURE_REASONS}
            textLabel="Note (optional)"
            textHint="Up to 200 characters are kept."
            minLength={0}
            maxLength={1000}
            perform={async ({ code, text }) => {
              const r = await withStepUp((proof) => DeliveryOperateService.reportFailure(order.id, { reasonCode: code as FailureReasonCode, note: text || undefined }, proof));
              return r.changed ? `A problem was reported for ${n}.` : `No change: a problem was already reported for ${n}.`;
            }}
          />
        );
      case 'retry':
        return (
          <ReasonDialog
            {...common}
            title={`Retry delivery of ${n}`}
            intro={`Arranges attempt ${order.assignment.attemptNumber + 1} of ${order.maxAttempts}. The failed attempt is archived and the customer must use a new delivery code.`}
            submitLabel="Arrange retry"
            codes={RETRY_REASONS}
            textLabel="Note (optional)"
            textHint="Recorded in the audit log."
            minLength={0}
            maxLength={1000}
            perform={async ({ code, text }) => {
              const r = await withStepUp((proof) =>
                DeliveryOperateService.retry(order.id, { expectedAttemptNumber: order.assignment.attemptNumber, reasonCode: code as RetryReasonCode, note: text || undefined }, proof)
              );
              return `Attempt ${r.attemptNumber} of ${n} is arranged. Start it when the delivery is on the road.`;
            }}
          />
        );
    }
  };

  return (
    <section aria-label="Direct order delivery operations" data-testid="operate-direct" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-xs text-stone-400 max-w-xl">Start, hand over and resolve deliveries yourself. Cancel &amp; Full Refund and the exceptional handover remain in the Delivery section.</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="operate-branch" className="block text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-1">
              Branch
            </label>
            <select id="operate-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputClass}>
              <option value="">Select a branch…</option>
              {reference.activeBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>
          <button type="button" onClick={refresh} disabled={!branchId} className={secondaryButton} data-testid="operate-refresh">
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      {!branchId && <EmptyState message="Choose a branch to see its deliveries." />}
      <SuccessNotice message={notice} testId="operate-notice" />

      {branchId && monitor.stale && (
        <p role="alert" data-testid="operate-stale" className="text-xs text-amber-200 bg-amber-950/50 border border-amber-700 rounded-xl px-3 py-2">
          {monitor.loadError?.message ?? 'The list could not be refreshed.'} What you see may be out of date.
        </p>
      )}
      {branchId && monitor.loadState === 'loading' && !data && <Spinner label="Loading deliveries…" />}
      {branchId && monitor.loadState === 'error' && !data && (
        <div role="alert" data-testid="operate-load-error" className="flex items-center justify-between gap-3 bg-red-950/60 border border-red-500/40 text-red-200 text-xs rounded-2xl px-4 py-3">
          <span>{monitor.loadError?.message ?? 'The deliveries could not be loaded.'}</span>
          <button type="button" onClick={refresh} className="font-bold underline">
            Retry
          </button>
        </div>
      )}

      {data && (
        <div className="space-y-6">
          {sections.map(({ id, title, empty, section }) => (
            <div key={id} role="region" aria-labelledby={`operate-h-${id}`} data-testid={`operate-${id}`} className="space-y-2">
              <h3 id={`operate-h-${id}`} className="text-sm font-black text-white flex items-center gap-2">
                {title}
                <span className="text-xs font-bold text-stone-300 bg-stone-800 border border-stone-700 rounded-lg px-2 py-0.5">{section.total}</span>
              </h3>
              {section.items.length === 0 ? (
                <EmptyState message={empty} />
              ) : (
                <ul className="space-y-3" aria-label={title}>
                  {section.items.map((o) => (
                    <Row key={o.id} order={o} onAct={(order, action) => setActive({ order, action })} onSessionExpired={() => void auth.logout()} />
                  ))}
                </ul>
              )}
              {section.truncated && <p className="text-[11px] text-amber-200">Showing the first {section.items.length} of {section.total}.</p>}
            </div>
          ))}
        </div>
      )}
      {dialog()}
    </section>
  );
};
