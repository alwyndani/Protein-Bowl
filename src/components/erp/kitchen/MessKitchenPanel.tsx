import React, { useCallback, useRef, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { MessService } from '../../../services/messService';
import type { MessKitchenBatch, MessKitchenDemand, MessKitchenDemandGroup } from '../../../services/messTypes';
import { usePolledResource } from '../../../hooks/usePolledResource';
import { describeMessError, MessUserError } from '../../../utils/messErrors';

const SLOT_LABEL: Record<string, string> = { BREAKFAST: 'Breakfast', LUNCH: 'Lunch', DINNER: 'Dinner' };
type Data = { demand: MessKitchenDemand; batches: MessKitchenBatch[] };
const toPolled = (e: unknown) => {
  const info = describeMessError(e);
  return { ...info, action: info.action === 'SIGN_IN' ? ('SIGN_IN' as const) : ('NONE' as const) };
};

/**
 * Kerala Mess kitchen (P10B): aggregated demand and the PREPARING / READY batch workflow. Counts only: never a customer name, phone, room or student id.
 * CHEF: own branches, can start today's batches and mark them ready. `readOnly` (SUPER_ADMIN / MD, with an explicit `branchId`): the same data without any action.
 * Polling is GET-only (the P8 pattern); the server decides every outcome.
 */
export const MessKitchenPanel: React.FC<{ readOnly?: boolean; branchId?: string; onSessionExpired?: () => void }> = ({ readOnly = false, branchId, onSessionExpired }) => {
  const poll = usePolledResource<Data, ReturnType<typeof toPolled>>({
    fetcher: async () => {
      const [demand, b] = await Promise.all([MessService.kitchenDemand(branchId), MessService.kitchenBatches(branchId)]);
      return { demand, batches: b.batches };
    },
    resetKey: branchId ?? 'own',
    describeError: toPolled,
    enabled: readOnly ? !!branchId : true,
    onSessionExpired
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<MessUserError | null>(null);
  const inFlight = useRef(false);

  const run = useCallback(
    async (key: string, fn: () => Promise<unknown>) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(key);
      setError(null);
      try {
        await fn();
      } catch (err) {
        const info = describeMessError(err);
        if (info.action === 'SIGN_IN') poll.halt();
        setError(info);
      } finally {
        inFlight.current = false;
        setBusy(null);
        await poll.refresh();
      }
    },
    [poll]
  );

  if (readOnly && !branchId) return <p className="text-sm text-stone-400" data-testid="mess-kitchen-pick-branch">Choose a branch to see its Kerala Mess kitchen.</p>;
  if (poll.loadState === 'loading') {
    return (
      <div role="status" className="flex items-center gap-2 text-sm text-stone-400 py-6">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        Loading the Mess kitchen…
      </div>
    );
  }
  if (!poll.data) {
    return (
      <div role="alert" className="text-sm text-red-200 bg-red-950/50 border border-red-500/40 rounded-xl px-4 py-3">
        {poll.loadError?.message ?? 'The Mess kitchen could not be loaded.'}
      </div>
    );
  }

  const { demand, batches } = poll.data;
  const groupKey = (g: { branch: { id: string }; mealDate: string; slot: string }) => `${g.branch.id}|${g.mealDate}|${g.slot}`;
  const batchForGroup = (g: MessKitchenDemandGroup) => batches.find((b) => groupKey(b) === groupKey(g));

  return (
    <section aria-label="Kerala Mess kitchen" data-testid="mess-kitchen" className="space-y-5 text-white">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-stone-400">
          Business date <strong className="text-stone-200">{demand.today}</strong> (Asia/Kolkata). Preparation can be started only for today; later days are for planning.
          {readOnly ? ' This is a read-only view.' : ''}
        </p>
        <button type="button" onClick={() => void poll.refresh()} className="inline-flex items-center gap-2 text-xs font-bold bg-stone-800 border border-stone-700 rounded-lg px-3 py-1.5" aria-label="Refresh Mess kitchen">
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          Refresh
        </button>
      </div>
      {poll.stale && <p role="status" className="text-xs text-amber-200">Showing the last data we received; we are retrying.</p>}
      {error && (
        <div role="alert" data-testid="mess-kitchen-error" className="flex items-start gap-2 bg-red-950/60 border border-red-500/40 text-red-200 text-xs rounded-xl px-3 py-2.5">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p>{error.message}</p>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-black">Demand (scheduled meals)</h3>
        {demand.groups.length === 0 && <p className="text-xs text-stone-400" data-testid="mess-demand-empty">No scheduled meals in the next 7 days.</p>}
        <ul className="space-y-2">
          {demand.groups.map((g) => {
            const k = groupKey(g);
            return (
              <li key={k} data-testid={`mess-demand-${g.mealDate}-${g.slot}`} className="rounded-2xl border border-stone-800 bg-stone-900/70 p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-black">
                      {SLOT_LABEL[g.slot] ?? g.slot} · {g.mealDate}
                      {g.mealDate === demand.today ? ' (today)' : ''}
                    </p>
                    <p className="text-xs text-stone-400">{g.branch.name}</p>
                  </div>
                  <p className="text-lg font-black text-amber-300" data-testid="mess-demand-total">{g.total} meals</p>
                </div>
                <ul className="text-xs text-stone-300 space-y-0.5">
                  {g.servicePoints.map((s) => (
                    <li key={s.servicePoint.id}>
                      {s.servicePoint.name}
                      {s.servicePoint.gateLabel ? ` (${s.servicePoint.gateLabel})` : ''}: <strong>{s.mealCount}</strong>
                    </li>
                  ))}
                </ul>
                {!readOnly && g.canStart && !batchForGroup(g) && (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void run(k, () => MessService.startBatch({ branchId: g.branch.id, mealDate: g.mealDate, slot: g.slot }))}
                    className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black px-4 py-2 rounded-xl text-xs disabled:opacity-50"
                  >
                    {busy === k && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                    Start preparation
                  </button>
                )}
                {g.mealDate > demand.today && <p className="text-[11px] text-stone-500">Planning only: preparation cannot be started before the day.</p>}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-black">Batches</h3>
        {batches.length === 0 && <p className="text-xs text-stone-400" data-testid="mess-batches-empty">No batches yet.</p>}
        <ul className="space-y-2">
          {batches.map((b) => (
            <li key={b.id} data-testid={`mess-batch-${b.mealDate}-${b.slot}`} data-status={b.status} className="rounded-2xl border border-stone-800 bg-stone-900/70 p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-black">
                  {SLOT_LABEL[b.slot] ?? b.slot} · {b.mealDate} · {b.branch.name}
                </p>
                <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider ${b.status === 'READY' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/15 text-amber-300 border-amber-500/30'}`}>
                  {b.status === 'READY' ? 'Ready' : 'Preparing'}
                </span>
              </div>
              <p className="text-xs text-stone-300">
                <strong data-testid="mess-batch-count">{b.mealCount}</strong> meals frozen into this batch
              </p>
              <ul className="text-xs text-stone-300 space-y-0.5" data-testid="mess-batch-breakdown">
                {b.servicePoints.map((s) => (
                  <li key={s.servicePoint.id}>
                    {s.servicePoint.name}: <strong>{s.mealCount}</strong>
                  </li>
                ))}
              </ul>
              {!readOnly && b.status === 'PREPARING' && (
                <button type="button" disabled={!!busy} onClick={() => void run(b.id, () => MessService.markBatchReady(b.id))} className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black px-4 py-2 rounded-xl text-xs disabled:opacity-50">
                  {busy === b.id && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                  Mark ready
                </button>
              )}
              {b.status === 'READY' && <p className="text-[11px] text-stone-500">Prepared. Delivery to hostels is handled in a later phase; these meals are not marked as served.</p>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};
