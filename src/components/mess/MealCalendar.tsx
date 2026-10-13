import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { MessService } from '../../services/messService';
import type { MessCalendarMeal, MessMealCalendar } from '../../services/messTypes';
import { describeMessError, MessUserError } from '../../utils/messErrors';
import { AccessibleDialog } from '../common/AccessibleDialog';

const SLOT_LABEL: Record<string, string> = { BREAKFAST: 'Breakfast', LUNCH: 'Lunch', DINNER: 'Dinner' };
const REASON_TEXT: Record<string, string> = {
  MEAL_FROZEN: 'Preparation has started',
  PAUSE_CUTOFF_PASSED: 'Cut-off passed',
  PAUSE_LIMIT_REACHED: 'No pauses left',
  SUBSCRIPTION_NOT_ACTIVE: 'Subscription not active',
  MEAL_CANCELLED: 'Cancelled',
  NOT_SCHEDULED: 'Not available'
};
const KITCHEN_TEXT: Record<string, string> = { NOT_STARTED: 'Not started', IN_PREPARATION: 'Being prepared', READY: 'Prepared' };
const timeFmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
const dayFmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });

const card = 'rounded-xl border border-stone-800 bg-stone-950/60 p-3';
const secondary = 'inline-flex items-center justify-center gap-2 bg-stone-800 hover:bg-stone-700 text-stone-100 border border-stone-700 font-bold px-3 py-1.5 rounded-lg text-xs disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300';

/**
 * The meal calendar of one ACTIVE subscription (P10B). Real backend data only: date, slot, service time, status, kitchen state and whether pause / resume is
 * available (decided by the SERVER, with a reason). A paused meal is FORFEITED: the dialog says so before anything is sent.
 */
export const MealCalendar: React.FC<{ subscriptionId: string; onSessionExpired?: () => void }> = ({ subscriptionId, onSessionExpired }) => {
  const [data, setData] = useState<MessMealCalendar | null>(null);
  const [error, setError] = useState<MessUserError | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<MessCalendarMeal | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const mounted = useRef(true);

  const handle = useCallback(
    (err: unknown): MessUserError => {
      const info = describeMessError(err);
      if (info.action === 'SIGN_IN') onSessionExpired?.();
      return info;
    },
    [onSessionExpired]
  );

  const load = useCallback(async (keepError = false) => {
    try {
      const next = await MessService.getMeals(subscriptionId);
      if (mounted.current) {
        setData(next);
        if (!keepError) setError(null); // a refresh after a refused action must not erase the explanation
      }
    } catch (err) {
      if (mounted.current) setError(handle(err));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [subscriptionId, handle]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const act = async (meal: MessCalendarMeal, action: 'pause' | 'resume') => {
    if (busyId) return;
    setBusyId(meal.id);
    setError(null);
    try {
      await MessService.changeMeal(subscriptionId, meal.id, action);
    } catch (err) {
      if (mounted.current) setError(handle(err));
    } finally {
      if (mounted.current) setBusyId(null);
      setConfirm(null);
      await load(true); // the server's state is the only truth: always re-read
    }
  };

  if (loading) {
    return (
      <div role="status" className="flex items-center gap-2 text-xs text-stone-400 py-3">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        Loading your meals…
      </div>
    );
  }

  const byDate = new Map<string, MessCalendarMeal[]>();
  for (const m of data?.meals ?? []) byDate.set(m.date, [...(byDate.get(m.date) ?? []), m]);
  const sub = data?.subscription;

  return (
    <section aria-label="Meal calendar" data-testid="meal-calendar" className="space-y-3">
      {error && (
        <div role="alert" data-testid="meal-error" className="flex items-start gap-2 bg-red-950/60 border border-red-500/40 text-red-200 text-xs rounded-xl px-3 py-2.5">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p>{error.message}</p>
        </div>
      )}
      {sub && !sub.mealsReady && (
        <p role="status" data-testid="meals-not-ready" className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
          Your meal schedule is being set up. Please contact Protein Bowl support if it does not appear soon.
        </p>
      )}
      {sub && sub.mealsReady && (
        <div className="space-y-1">
          <p className="text-xs text-stone-300" data-testid="pause-allowance">
            Pauses used: <strong>{sub.pausesUsed}</strong> of <strong>{sub.maxPauses ?? 0}</strong>. Resuming a meal does not give a pause back.
          </p>
          <p className="text-[11px] text-stone-500" data-testid="forfeit-note">
            A paused meal will not be prepared or delivered, and it is not refunded, replaced or added to the end of your subscription.
            {sub.pauseCutoffHours !== null ? ` You can pause or resume until ${sub.pauseCutoffHours} hour${sub.pauseCutoffHours === 1 ? '' : 's'} before the service time.` : ''}
          </p>
        </div>
      )}
      {data && data.meals.length === 0 && sub?.mealsReady && <p className="text-xs text-stone-400">No upcoming meals in this window.</p>}
      <ul className="space-y-2">
        {[...byDate.entries()].map(([date, meals]) => (
          <li key={date} className={card}>
            <h4 className="text-xs font-black text-stone-200 mb-2">{dayFmt.format(new Date(`${date}T00:00:00Z`))}</h4>
            <ul className="space-y-1.5">
              {meals.map((m) => (
                <li key={m.id} data-testid={`meal-${m.date}-${m.slot}`} data-status={m.status} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-stone-100 font-bold">
                    {SLOT_LABEL[m.slot] ?? m.slot} · {timeFmt.format(new Date(m.serviceAt))}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider ${m.status === 'PAUSED' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : m.status === 'CANCELLED' ? 'bg-stone-700/40 text-stone-300 border-stone-600' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'}`}>
                      {m.status === 'PAUSED' ? 'Paused (forfeited)' : m.status === 'SCHEDULED' ? 'Scheduled' : m.status === 'CANCELLED' ? 'Cancelled' : 'Served'}
                    </span>
                    {m.status === 'SCHEDULED' && <span className="text-[11px] text-stone-400">{KITCHEN_TEXT[m.kitchenState]}</span>}
                    {m.canPause && (
                      <button type="button" className={secondary} disabled={!!busyId} onClick={() => setConfirm(m)}>
                        Pause…
                      </button>
                    )}
                    {m.canResume && (
                      <button type="button" className={secondary} disabled={!!busyId} onClick={() => void act(m, 'resume')}>
                        {busyId === m.id ? 'Working…' : 'Resume'}
                      </button>
                    )}
                    {!m.canPause && !m.canResume && m.reason && m.status !== 'CANCELLED' && <span className="text-[11px] text-stone-500">{REASON_TEXT[m.reason] ?? ''}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {confirm && <PauseDialog meal={confirm} pausesLeft={sub && sub.maxPauses !== null ? sub.maxPauses - sub.pausesUsed : 0} busy={busyId === confirm.id} onClose={() => setConfirm(null)} onConfirm={() => void act(confirm, 'pause')} />}
    </section>
  );
};

const PauseDialog: React.FC<{ meal: MessCalendarMeal; pausesLeft: number; busy: boolean; onClose: () => void; onConfirm: () => void }> = ({ meal, pausesLeft, busy, onClose, onConfirm }) => {
  const titleId = useId();
  return (
    <AccessibleDialog labelledBy={titleId} onClose={onClose} closeDisabled={busy}>
      <div className="p-5 space-y-4" data-testid="pause-dialog">
        <h2 id={titleId} className="text-base font-black text-white">
          Pause {SLOT_LABEL[meal.slot] ?? meal.slot} on {dayFmt.format(new Date(`${meal.date}T00:00:00Z`))}?
        </h2>
        <p className="text-xs text-stone-300">
          This meal will <strong>not be prepared or delivered</strong>. It is <strong>not refunded, replaced or added to the end of your subscription</strong>, and your end date does not change.
        </p>
        <p className="text-xs text-stone-400">
          This uses one of your pauses ({pausesLeft} left). If you resume it later, the pause is still counted.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className={secondary} onClick={onClose} disabled={busy}>
            Keep the meal
          </button>
          <button type="button" className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black px-4 py-2 rounded-xl text-sm disabled:opacity-50" onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            Pause this meal
          </button>
        </div>
      </div>
    </AccessibleDialog>
  );
};
