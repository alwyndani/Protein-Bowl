import React, { useState } from 'react';
import { Dumbbell } from 'lucide-react';
import { TrainerService, toPlanInput, type WorkoutDay, type WorkoutPlan, type PlanInput } from '../../services/trainerService';
import { Card, Field, Notice, btnCls, errorText, ghostBtnCls, inputCls, useLoad } from './staffUi';

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const emptyDay = (): WorkoutDay => ({ dayOfWeek: 'MONDAY', title: '', focusArea: '', exercises: [{ name: '', sets: 3, reps: '10', restSeconds: 60 }] });
const emptyPlan = (): PlanInput => ({ title: '', goal: '', durationWeeks: 4, notes: '', days: [emptyDay()] });

const PlanEditor: React.FC<{ initial: PlanInput; submitLabel: string; onSubmit: (p: PlanInput) => Promise<void>; onCancel: () => void }> = ({ initial, submitLabel, onSubmit, onCancel }) => {
  const [plan, setPlan] = useState<PlanInput>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setDay = (i: number, d: WorkoutDay) => setPlan({ ...plan, days: plan.days.map((x, j) => (j === i ? d : x)) });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await onSubmit({ ...plan, notes: plan.notes?.trim() || undefined });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Workout plan editor">
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Title"><input required maxLength={120} className={inputCls} value={plan.title} onChange={(e) => setPlan({ ...plan, title: e.target.value })} /></Field>
        <Field label="Goal"><input required maxLength={200} className={inputCls} value={plan.goal} onChange={(e) => setPlan({ ...plan, goal: e.target.value })} /></Field>
        <Field label="Weeks"><input required type="number" min={1} max={52} className={inputCls} value={plan.durationWeeks} onChange={(e) => setPlan({ ...plan, durationWeeks: Number(e.target.value) })} /></Field>
      </div>
      <Field label="Notes (optional)"><textarea maxLength={1000} className={inputCls} value={plan.notes ?? ''} onChange={(e) => setPlan({ ...plan, notes: e.target.value })} /></Field>

      {plan.days.map((d, i) => (
        <div key={i} className="border border-stone-800 rounded-xl p-3 space-y-2">
          <div className="grid sm:grid-cols-4 gap-2 items-end">
            <Field label="Day"><select className={inputCls} value={d.dayOfWeek} onChange={(e) => setDay(i, { ...d, dayOfWeek: e.target.value })}>{DAYS.map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Session title"><input required maxLength={120} className={inputCls} value={d.title} onChange={(e) => setDay(i, { ...d, title: e.target.value })} /></Field>
            <Field label="Focus"><input required maxLength={120} className={inputCls} value={d.focusArea} onChange={(e) => setDay(i, { ...d, focusArea: e.target.value })} /></Field>
            <button type="button" className={ghostBtnCls} disabled={plan.days.length === 1} onClick={() => setPlan({ ...plan, days: plan.days.filter((_, j) => j !== i) })}>Remove day</button>
          </div>
          {d.exercises.map((x, k) => (
            <div key={k} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
              <div className="col-span-2"><Field label="Exercise"><input required maxLength={120} className={inputCls} value={x.name} onChange={(e) => setDay(i, { ...d, exercises: d.exercises.map((y, m) => (m === k ? { ...y, name: e.target.value } : y)) })} /></Field></div>
              <Field label="Sets"><input required type="number" min={1} max={20} className={inputCls} value={x.sets} onChange={(e) => setDay(i, { ...d, exercises: d.exercises.map((y, m) => (m === k ? { ...y, sets: Number(e.target.value) } : y)) })} /></Field>
              <Field label="Reps"><input required maxLength={40} className={inputCls} value={x.reps} onChange={(e) => setDay(i, { ...d, exercises: d.exercises.map((y, m) => (m === k ? { ...y, reps: e.target.value } : y)) })} /></Field>
              <Field label="Rest (s)"><input required type="number" min={0} max={1800} className={inputCls} value={x.restSeconds} onChange={(e) => setDay(i, { ...d, exercises: d.exercises.map((y, m) => (m === k ? { ...y, restSeconds: Number(e.target.value) } : y)) })} /></Field>
              <button type="button" className={ghostBtnCls} disabled={d.exercises.length === 1} onClick={() => setDay(i, { ...d, exercises: d.exercises.filter((_, m) => m !== k) })}>Remove</button>
            </div>
          ))}
          <button type="button" className={ghostBtnCls} onClick={() => setDay(i, { ...d, exercises: [...d.exercises, { name: '', sets: 3, reps: '10', restSeconds: 60 }] })}>Add exercise</button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={ghostBtnCls} disabled={plan.days.length >= 7} onClick={() => setPlan({ ...plan, days: [...plan.days, emptyDay()] })}>Add day</button>
        <button type="submit" className={btnCls} disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        <button type="button" className={ghostBtnCls} onClick={onCancel}>Cancel</button>
      </div>
      <Notice error={error} />
    </form>
  );
};

const PlanCard: React.FC<{ plan: WorkoutPlan; onChanged: () => void; onEdit: () => void }> = ({ plan, onChanged, onEdit }) => {
  const logs = useLoad(() => TrainerService.logs(plan.id), [plan.id]);
  const [error, setError] = useState<string | null>(null);
  const setStatus = async (s: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED') => {
    try { await TrainerService.setStatus(plan.id, s); onChanged(); } catch (e) { setError(errorText(e)); }
  };
  const completed = logs.data?.filter((l) => l.completed).length ?? 0;
  return (
    <Card title={`${plan.title} · ${plan.status}`}>
      <p className="text-xs text-stone-400">{plan.goal} · {plan.durationWeeks} weeks</p>
      <ul className="text-xs text-stone-300 space-y-1">
        {plan.workoutDays.map((d) => <li key={d.id}><b>{d.dayOfWeek}</b> {d.title} ({d.focusArea}) — {d.exercises.map((e) => `${e.name} ${e.sets}×${e.reps}`).join(', ')}</li>)}
      </ul>
      <p className="text-xs text-stone-400">Progress: {logs.loading ? '…' : `${completed} completed session${completed === 1 ? '' : 's'} logged`}</p>
      {logs.data && logs.data.slice(0, 5).map((l) => (
        <p key={l.id} className="text-[11px] text-stone-500">{new Date(l.loggedOn).toLocaleDateString()} · {l.completed ? 'done' : 'skipped'}{l.perceivedEffort ? ` · effort ${l.perceivedEffort}/10` : ''}{l.bodyWeightKg ? ` · ${l.bodyWeightKg} kg` : ''}{l.notes ? ` · ${l.notes}` : ''}</p>
      ))}
      <div className="flex flex-wrap gap-2">
        <button className={ghostBtnCls} onClick={onEdit}>Edit</button>
        {plan.status !== 'ACTIVE' && <button className={ghostBtnCls} onClick={() => setStatus('ACTIVE')}>Reactivate</button>}
        {plan.status === 'ACTIVE' && <button className={ghostBtnCls} onClick={() => setStatus('COMPLETED')}>Mark completed</button>}
        {plan.status !== 'ARCHIVED' && <button className={ghostBtnCls} onClick={() => setStatus('ARCHIVED')}>Archive</button>}
      </div>
      <Notice error={error} />
    </Card>
  );
};

/** Trainer workspace: real API data only. A trainer sees just the customers an administrator assigned (name + workout data, no health data). */
export const TrainerWorkspace: React.FC = () => {
  const clients = useLoad(() => TrainerService.clients(), []);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<{ kind: 'none' } | { kind: 'create' } | { kind: 'edit'; plan: WorkoutPlan }>({ kind: 'none' });
  const plans = useLoad(() => (selected ? TrainerService.plansFor(selected) : Promise.resolve([] as WorkoutPlan[])), [selected]);
  const client = clients.data?.find((c) => c.customerProfileId === selected);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 text-white space-y-4" data-testid="trainer-workspace">
      <h1 className="text-2xl font-black flex items-center gap-2"><Dumbbell className="w-6 h-6 text-amber-400" aria-hidden="true" />Trainer workspace</h1>
      <Notice error={clients.error} />
      <div className="grid md:grid-cols-[260px_1fr] gap-4">
        <Card title="My clients">
          {clients.loading && <p className="text-xs text-stone-400">Loading…</p>}
          {clients.data?.length === 0 && <p className="text-xs text-stone-400">No clients are assigned to you yet. A Super Admin assigns clients.</p>}
          <ul className="space-y-1">
            {clients.data?.map((c) => (
              <li key={c.assignmentId}>
                <button className={`w-full text-left text-sm rounded-lg px-3 py-2 border ${selected === c.customerProfileId ? 'border-amber-500 bg-amber-500/10' : 'border-stone-800'}`} onClick={() => { setSelected(c.customerProfileId); setMode({ kind: 'none' }); }}>
                  {c.fullName}<span className="block text-[11px] text-stone-500">{c.plans.length} plan{c.plans.length === 1 ? '' : 's'}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <div className="space-y-4">
          {!client && <p className="text-sm text-stone-400">Select a client to manage their workout plans.</p>}
          {client && mode.kind === 'none' && (
            <>
              <div className="flex items-center justify-between"><h2 className="font-black">{client.fullName}</h2><button className={btnCls} onClick={() => setMode({ kind: 'create' })}>New plan</button></div>
              <Notice error={plans.error} />
              {plans.data?.length === 0 && <p className="text-sm text-stone-400">No plans yet.</p>}
              {plans.data?.map((p) => <PlanCard key={p.id} plan={p} onChanged={() => { void plans.reload(); void clients.reload(); }} onEdit={() => setMode({ kind: 'edit', plan: p })} />)}
            </>
          )}
          {client && mode.kind === 'create' && (
            <Card title={`New plan for ${client.fullName}`}>
              <PlanEditor initial={emptyPlan()} submitLabel="Create plan" onCancel={() => setMode({ kind: 'none' })}
                onSubmit={async (p) => { await TrainerService.createPlan(client.customerProfileId, p); setMode({ kind: 'none' }); void plans.reload(); void clients.reload(); }} />
            </Card>
          )}
          {client && mode.kind === 'edit' && (
            <Card title={`Edit ${mode.plan.title}`}>
              <PlanEditor initial={toPlanInput(mode.plan)} submitLabel="Save changes" onCancel={() => setMode({ kind: 'none' })}
                onSubmit={async (p) => { await TrainerService.updatePlan(mode.plan.id, p); setMode({ kind: 'none' }); void plans.reload(); }} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
