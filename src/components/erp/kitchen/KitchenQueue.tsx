import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChefHat, Clock, Loader2, RefreshCw } from 'lucide-react';
import { useKitchenQueue } from '../../../hooks/useKitchenQueue';
import type { KitchenAction, KitchenBranchRef, KitchenOrder, KitchenStatus } from '../../../services/kitchenTypes';
import { KITCHEN_STATUSES } from '../../../services/kitchenTypes';

interface SectionConfig {
  title: string;
  empty: string;
  action: { kind: KitchenAction; label: string } | null;
  /** Non-colour status text shown on every card. */
  badge: string;
}

const SECTIONS: Record<KitchenStatus, SectionConfig> = {
  CONFIRMED: { title: 'New orders', empty: 'No new orders.', action: { kind: 'accept', label: 'Accept order' }, badge: 'New' },
  ACCEPTED: { title: 'Accepted', empty: 'Nothing accepted and waiting.', action: { kind: 'start-preparing', label: 'Start preparing' }, badge: 'Accepted' },
  PREPARING: { title: 'Preparing', empty: 'Nothing is being prepared.', action: { kind: 'mark-ready', label: 'Mark ready' }, badge: 'Preparing' },
  READY: { title: 'Ready', empty: 'No orders are ready.', action: null, badge: 'Ready' }
};

function elapsedText(fromIso: string | null, nowMs: number): string | null {
  if (!fromIso) return null;
  const mins = Math.max(0, Math.floor((nowMs - new Date(fromIso).getTime()) / 60_000));
  if (mins < 1) return 'less than a minute';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return `${h} h ${mins % 60} min`;
}

/** The reference time for "waiting" per state: when the order entered it. */
function sinceFor(order: KitchenOrder): string | null {
  if (order.status === 'READY') return order.readyAt ?? order.confirmedAt;
  if (order.status === 'PREPARING') return order.preparingAt ?? order.acceptedAt ?? order.confirmedAt;
  if (order.status === 'ACCEPTED') return order.acceptedAt ?? order.confirmedAt;
  return order.confirmedAt;
}

const OrderCard: React.FC<{
  order: KitchenOrder;
  config: SectionConfig;
  nowMs: number;
  showBranch: boolean;
  pending: boolean;
  error: string | null;
  onAct: (orderId: string, action: KitchenAction) => void;
  onDismissError: (orderId: string) => void;
}> = ({ order, config, nowMs, showBranch, pending, error, onAct, onDismissError }) => {
  const waiting = elapsedText(sinceFor(order), nowMs);
  return (
    <article aria-label={`Order ${order.orderNumber}`} data-testid="kitchen-card" data-order-number={order.orderNumber} className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm space-y-3">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-black text-stone-900 break-all">{order.orderNumber}</h4>
          {showBranch && order.branch && <p className="text-[11px] text-stone-500">Branch: {order.branch.name}</p>}
        </div>
        <span className="shrink-0 text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-lg border border-stone-300 bg-stone-50 text-stone-800">{config.badge}</span>
      </header>

      {waiting && (
        <p className="flex items-center gap-1 text-[11px] text-stone-600">
          <Clock className="w-3 h-3" aria-hidden="true" />
          <span>{order.status === 'CONFIRMED' ? `Waiting ${waiting}` : `In this step ${waiting}`}</span>
        </p>
      )}

      <ul className="space-y-2" aria-label="Items to prepare">
        {order.items.map((item) => (
          <li key={item.id} className="text-xs text-stone-800">
            <p className="font-bold">
              {item.quantity} × {item.title}
              {item.variantName ? <span className="font-normal text-stone-600"> ({item.variantName})</span> : null}
            </p>
            {item.recipe && (
              <p className="mt-0.5 text-[11px] text-stone-600 leading-snug">
                Prep {item.recipe.prepTimeMins} min · Cook {item.recipe.cookTimeMins} min · {item.recipe.dietaryTag}
                {item.recipe.spiceLevel ? ` · Spice: ${item.recipe.spiceLevel}` : ''}
                {item.recipe.chefInstructions ? <span className="block mt-0.5 text-stone-700">Chef note: {item.recipe.chefInstructions}</span> : null}
              </p>
            )}
          </li>
        ))}
      </ul>

      {config.action ? (
        <button
          type="button"
          onClick={() => onAct(order.id, config.action!.kind)}
          disabled={pending}
          aria-busy={pending}
          aria-label={`${config.action.label} ${order.orderNumber}`}
          data-testid="kitchen-action"
          className="w-full min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-orange-950 hover:bg-orange-900 text-white text-sm font-black px-4 py-2 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          {pending ? 'Working…' : config.action.label}
        </button>
      ) : (
        <p className="text-[11px] font-bold text-stone-600">Ready. The next step (dispatch) is handled separately.</p>
      )}

      {error && (
        <div role="alert" className="text-[11px] text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-start justify-between gap-2">
          <span>{error}</span>
          <button type="button" onClick={() => onDismissError(order.id)} className="font-bold underline shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
            Dismiss
          </button>
        </div>
      )}
    </article>
  );
};

/**
 * The production Chef workspace: a backend-derived queue (NEW / ACCEPTED / PREPARING / READY). Everything shown comes from the server's
 * kitchen DTO (no customer, money or payment data). Buttons offer only the next valid step, but the SERVER decides every transition.
 */
export const KitchenQueue: React.FC<{ onSessionExpired?: () => void }> = ({ onSessionExpired }) => {
  const [branchId, setBranchId] = useState('');
  const { queue, loadState, loadError, stale, lastUpdatedMs, clockOffsetMs, actions, notice, refresh, act, dismissActionError } = useKitchenQueue({ branchId: branchId || undefined, onSessionExpired });

  // the selector only ever offers branches the SERVER reported for this account
  const [knownBranches, setKnownBranches] = useState<KitchenBranchRef[]>([]);
  useEffect(() => {
    if (queue && queue.branches.length > 0) setKnownBranches(queue.branches);
  }, [queue]);

  // coarse clock for the "waiting" labels (server-time based, so clock skew does not matter)
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const serverNowMs = nowMs + clockOffsetMs;

  // announce new orders to assistive technology
  const seenNew = useRef<Set<string> | null>(null);
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    if (!queue) return;
    const current = new Set(queue.sections.CONFIRMED.items.map((o) => o.id));
    if (seenNew.current) {
      const fresh = [...current].filter((id) => !seenNew.current!.has(id)).length;
      if (fresh > 0) setAnnouncement(`${fresh} new ${fresh === 1 ? 'order' : 'orders'} received.`);
    }
    seenNew.current = current;
  }, [queue]);

  // An action error normally shows on its card; when the card has already left the queue (cancelled / moved by someone else) it would vanish
  // with the card, so those errors are shown here instead.
  const numbers = useRef(new Map<string, string>());
  const orphanErrors = useMemo(() => {
    if (!queue) return [];
    const present = new Set<string>();
    for (const status of KITCHEN_STATUSES) for (const o of queue.sections[status].items) {
      present.add(o.id);
      numbers.current.set(o.id, o.orderNumber);
    }
    return (Object.entries(actions) as Array<[string, { pending: boolean; error: string | null }]>)
      .filter(([id, a]) => a.error && !present.has(id))
      .map(([id, a]) => ({ id, orderNumber: numbers.current.get(id) ?? "An order", text: a.error as string }));
  }, [queue, actions]);

  const totals = useMemo(() => (queue ? KITCHEN_STATUSES.reduce((n, s) => n + queue.sections[s].total, 0) : 0), [queue]);
  const multiBranch = knownBranches.length > 1;

  return (
    <section aria-label="Kitchen queue" data-testid="kitchen-queue" className="bg-white text-stone-900 border border-stone-200 rounded-3xl p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-stone-900 flex items-center gap-2">
            <ChefHat className="w-5 h-5 text-orange-700" aria-hidden="true" />
            Kitchen queue
          </h2>
          <p className="text-xs text-stone-600">Paid, routed orders for your kitchen. The queue refreshes automatically.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {multiBranch && (
            <div>
              <label htmlFor="kitchen-branch" className="block text-[11px] font-bold uppercase tracking-wide text-stone-600 mb-1">
                Branch
              </label>
              <select id="kitchen-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} className="min-h-11 rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
                <option value="">All my branches</option>
                {knownBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button type="button" onClick={() => void refresh()} data-testid="kitchen-refresh" className="min-h-11 inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-sm font-bold text-stone-800 hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      {/* live region: meaningful updates only */}
      <div role="status" aria-live="polite" data-testid="kitchen-announcement" className="sr-only">
        {announcement}
      </div>

      {notice && (
        <p role="status" data-testid="kitchen-notice" className="text-xs text-stone-800 bg-stone-100 border border-stone-200 rounded-xl px-3 py-2">
          {notice}
        </p>
      )}

      {orphanErrors.map((e) => (
        <div key={e.id} role="alert" data-testid="kitchen-orphan-error" className="flex items-start justify-between gap-3 text-xs text-red-900 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          <span>
            <strong>{e.orderNumber}:</strong> {e.text}
          </span>
          <button type="button" onClick={() => dismissActionError(e.id)} className="font-bold underline shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
            Dismiss
          </button>
        </div>
      ))}

      {stale && (
        <p role="alert" data-testid="kitchen-stale" className="flex items-start gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-300 rounded-xl px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            {loadError?.message ?? 'The queue could not be refreshed.'} The orders below may be out of date
            {lastUpdatedMs ? ` (last updated ${new Date(lastUpdatedMs).toLocaleTimeString()})` : ''}.
          </span>
        </p>
      )}

      {loadState === 'loading' && !queue && (
        <p role="status" data-testid="kitchen-loading" className="flex items-center gap-2 text-sm text-stone-700">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Loading the kitchen queue…
        </p>
      )}

      {loadState === 'error' && !queue && (
        <div role="alert" data-testid="kitchen-error" className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-900 space-y-2">
          <p>{loadError?.message ?? 'The kitchen queue could not be loaded.'}</p>
          {loadError?.action !== 'SIGN_IN' && (
            <button type="button" onClick={() => void refresh()} className="min-h-11 rounded-xl bg-red-900 text-white font-bold px-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
              Try again
            </button>
          )}
        </div>
      )}

      {queue && totals === 0 && (
        <p data-testid="kitchen-empty" className="text-sm text-stone-700 bg-white border border-dashed border-stone-300 rounded-2xl p-6 text-center">
          No orders are waiting in your kitchen right now.
        </p>
      )}

      {queue && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {KITCHEN_STATUSES.map((status) => {
            const section = queue.sections[status];
            const config = SECTIONS[status];
            return (
              <div key={status} data-testid={`kitchen-section-${status}`} aria-labelledby={`kitchen-h-${status}`} role="region" className="bg-stone-50 border border-stone-200 rounded-2xl p-3 space-y-3 min-w-0">
                <h3 id={`kitchen-h-${status}`} className="text-sm font-black text-stone-900 flex items-center justify-between">
                  <span>{config.title}</span>
                  <span className="text-xs font-bold text-stone-700 bg-white border border-stone-300 rounded-lg px-2 py-0.5">{section.total}</span>
                </h3>
                {section.truncated && (
                  <p data-testid={`kitchen-truncated-${status}`} className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                    Showing {status === 'READY' ? 'the latest' : 'the first'} {section.items.length} of {section.total}.
                  </p>
                )}
                {section.items.length === 0 ? (
                  <p className="text-xs text-stone-600">{config.empty}</p>
                ) : (
                  section.items.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      config={config}
                      nowMs={serverNowMs}
                      showBranch={multiBranch}
                      pending={actions[order.id]?.pending ?? false}
                      error={actions[order.id]?.error ?? null}
                      onAct={(id, a) => void act(id, a)}
                      onDismissError={dismissActionError}
                    />
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
