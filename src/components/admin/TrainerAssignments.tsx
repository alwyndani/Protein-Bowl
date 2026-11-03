import React, { useState } from 'react';
import { AdminService } from '../../services/adminService';
import { TrainerService } from '../../services/trainerService';
import { Card, Field, Notice, btnCls, errorText, ghostBtnCls, inputCls, useLoad } from '../staff/staffUi';

/** SUPER_ADMIN: which customers each trainer may coach. A trainer sees only customers listed here. */
export const TrainerAssignments: React.FC = () => {
  const trainers = useLoad(() => AdminService.listStaff({ role: 'TRAINER', status: 'ACTIVE', pageSize: 100 }), []);
  const rows = useLoad(() => TrainerService.assignments(), []);
  const [trainerId, setTrainerId] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); setMsg({ ok }); void rows.reload(); } catch (e) { setMsg({ error: errorText(e) }); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4 text-white" data-testid="trainer-assignments">
      <Card title="Assign a trainer to a customer">
        <form className="grid sm:grid-cols-3 gap-2 items-end" onSubmit={(e) => { e.preventDefault(); void run(() => TrainerService.assign(trainerId, email.trim()), 'Trainer assigned.').then(() => setEmail('')); }}>
          <Field label="Trainer"><select required className={inputCls} value={trainerId} onChange={(e) => setTrainerId(e.target.value)}><option value="">Choose…</option>{trainers.data?.items.map((t) => <option key={t.id} value={t.id}>{t.employeeProfile?.fullName ?? t.email}</option>)}</select></Field>
          <Field label="Customer email"><input required type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <button className={btnCls} disabled={busy}>Assign</button>
        </form>
        <Notice error={msg.error ?? trainers.error} ok={msg.ok} />
      </Card>
      <Card title="Assignments">
        <Notice error={rows.error} />
        {rows.data?.length === 0 && <p className="text-xs text-stone-400">No assignments yet.</p>}
        <ul className="text-sm divide-y divide-stone-800">{rows.data?.map((a) => (
          <li key={a.id} className="py-2 flex items-center justify-between gap-2">
            <span>{a.trainer.email} → {a.customerProfile.fullName} <b className="text-xs text-stone-500">{a.status}</b></span>
            {a.status === 'ACTIVE' && <button className={ghostBtnCls} disabled={busy} onClick={() => void run(() => TrainerService.endAssignment(a.id), 'Assignment ended.')}>End</button>}
          </li>
        ))}</ul>
      </Card>
    </div>
  );
};
