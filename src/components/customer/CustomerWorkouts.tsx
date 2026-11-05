import React, { useState } from 'react';
import { TrainerService, type WorkoutPlan } from '../../services/trainerService';
import { errorText, useLoad } from '../staff/staffUi';

const field = 'border border-stone-300 rounded-lg px-2 py-1.5 text-sm bg-white text-stone-900';

const PlanView: React.FC<{ plan: WorkoutPlan }> = ({ plan }) => {
  const logs = useLoad(() => TrainerService.myLogs(plan.id), [plan.id]);
  const [form, setForm] = useState({ dayId: '', completed: true, effort: '', weight: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await TrainerService.logProgress(plan.id, {
        workoutDayId: form.dayId || undefined,
        completed: form.completed,
        perceivedEffort: form.effort ? Number(form.effort) : undefined,
        bodyWeightKg: form.weight ? Number(form.weight) : undefined,
        notes: form.notes.trim() || undefined
      });
      setMsg({ ok: 'Progress saved.' });
      setForm({ dayId: '', completed: true, effort: '', weight: '', notes: '' });
      void logs.reload();
    } catch (err) {
      setMsg({ error: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="bg-white border border-stone-200 rounded-2xl p-5 space-y-3 text-stone-900">
      <header>
        <h3 className="font-black text-lg">{plan.title}</h3>
        <p className="text-xs text-stone-500">{plan.goal} · {plan.durationWeeks} weeks · {plan.status}</p>
        {plan.notes && <p className="text-sm mt-1">{plan.notes}</p>}
      </header>
      <ul className="space-y-2">
        {plan.workoutDays.map((d) => (
          <li key={d.id} className="text-sm">
            <b>{d.dayOfWeek} — {d.title}</b> <span className="text-stone-500">({d.focusArea})</span>
            <ul className="list-disc ml-5 text-stone-700">{d.exercises.map((x) => <li key={x.id}>{x.name}: {x.sets} × {x.reps}, rest {x.restSeconds}s{x.notes ? ` — ${x.notes}` : ''}</li>)}</ul>
          </li>
        ))}
      </ul>
      {plan.status === 'ACTIVE' && (
        <form onSubmit={submit} className="grid sm:grid-cols-5 gap-2 items-end border-t border-stone-200 pt-3" aria-label="Log progress">
          <label className="text-xs space-y-1 block">Session
            <select className={field + ' w-full'} value={form.dayId} onChange={(e) => setForm({ ...form, dayId: e.target.value })}>
              <option value="">General</option>{plan.workoutDays.map((d) => <option key={d.id} value={d.id}>{d.dayOfWeek} — {d.title}</option>)}
            </select></label>
          <label className="text-xs space-y-1 block">Effort (1–10)<input type="number" min={1} max={10} className={field + ' w-full'} value={form.effort} onChange={(e) => setForm({ ...form, effort: e.target.value })} /></label>
          <label className="text-xs space-y-1 block">Weight (kg)<input type="number" min={20} max={500} step="0.1" className={field + ' w-full'} value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} /></label>
          <label className="text-xs space-y-1 block">Notes<input maxLength={500} className={field + ' w-full'} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          <div className="flex items-center gap-2">
            <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={form.completed} onChange={(e) => setForm({ ...form, completed: e.target.checked })} />Completed</label>
            <button disabled={busy} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black rounded-lg px-3 py-2">Save</button>
          </div>
        </form>
      )}
      {msg.error && <p role="alert" className="text-xs text-red-700">{msg.error}</p>}
      {msg.ok && <p role="status" className="text-xs text-emerald-700">{msg.ok}</p>}
      {logs.data && logs.data.length > 0 && (
        <ul className="text-xs text-stone-600 space-y-0.5">
          {logs.data.slice(0, 8).map((l) => <li key={l.id}>{new Date(l.loggedOn).toLocaleDateString()} · {l.completed ? 'done' : 'skipped'}{l.perceivedEffort ? ` · effort ${l.perceivedEffort}/10` : ''}{l.bodyWeightKg ? ` · ${l.bodyWeightKg} kg` : ''}{l.notes ? ` · ${l.notes}` : ''}</li>)}
        </ul>
      )}
    </article>
  );
};

/** The signed-in customer's own workout plans (created by their assigned trainer) and progress log. Real API data only. */
export const CustomerWorkouts: React.FC = () => {
  const plans = useLoad(() => TrainerService.myPlans(), []);
  return (
    <section className="space-y-4" data-testid="customer-workouts">
      <h2 className="text-xl font-black text-stone-900">My workout plans</h2>
      {plans.loading && <p className="text-sm text-stone-500">Loading…</p>}
      {plans.error && <p role="alert" className="text-sm text-red-700">{plans.error}</p>}
      {plans.data?.length === 0 && <p className="text-sm text-stone-600 bg-white border border-dashed border-stone-300 rounded-2xl p-6">You have no workout plan yet. Once a trainer is assigned to you, their plan will appear here.</p>}
      {plans.data?.map((p) => <PlanView key={p.id} plan={p} />)}
    </section>
  );
};
