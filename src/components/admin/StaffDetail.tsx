import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Pencil, RefreshCw, ShieldOff, ShieldCheck } from 'lucide-react';
import { AdminService } from '../../services/adminService';
import type { InvitationHandoff, StaffMember } from '../../services/adminTypes';
import { useAuth } from '../../context/AuthContext';
import { AdminErrorInfo, describeAdminError } from './adminErrors';
import { useStepUp } from './StepUp';
import { useAdminAction } from './useAdminAction';
import { RoleManagement } from './RoleManagement';
import { StaffBranchAssignments } from './StaffBranchAssignments';
import { InvitationHandoffPanel } from './InvitationHandoff';
import { ErrorNotice, Field, Modal, Spinner, StatusBadge, dangerButton, formatDate, inputClass, primaryButton, secondaryButton } from './adminUi';

const PHONE_RE = /^\+?[0-9 ()-]{7,20}$/;

export const StaffDetail: React.FC<{ staffId: string; onBack: () => void }> = ({ staffId, onBack }) => {
  const auth = useAuth();
  const [staff, setStaff] = useState<StaffMember | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<AdminErrorInfo | null>(null);
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<'deactivate' | 'activate' | null>(null);
  // Transient secret: the reissued one-time link. Cleared on dismiss / navigation / reload; never persisted.
  const [handoff, setHandoff] = useState<InvitationHandoff | null>(null);
  const requestId = useRef(0);

  const isSelf = auth.user?.id === staffId;

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setStatus('loading');
    setLoadError(null);
    try {
      const result = await AdminService.getStaff(staffId);
      if (id !== requestId.current) return;
      setStaff(result);
      setStatus('ready');
    } catch (err) {
      if (id !== requestId.current) return;
      const info = describeAdminError(err);
      setLoadError(info);
      setStatus('error');
      if (info.kind === 'session-expired') void auth.logout();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** After any mutation the authoritative record is re-read from the backend (nothing is patched locally). */
  const reloadQuietly = useCallback(async () => {
    try {
      setStaff(await AdminService.getStaff(staffId));
    } catch {
      await load();
    }
  }, [staffId, load]);

  if (status === 'loading' && !staff) return <Spinner label="Loading staff member…" />;
  if (status === 'error' && !staff) {
    return (
      <div className="space-y-3">
        <button type="button" onClick={onBack} className={secondaryButton}>
          <ArrowLeft className="w-4 h-4" /> Back to staff
        </button>
        <ErrorNotice error={loadError} onRetry={load} />
      </div>
    );
  }
  if (!staff) return null;

  const canDeactivate = !isSelf && (staff.status === 'ACTIVE' || staff.status === 'PENDING');
  // Activation is only offered where the backend can allow it: an inactive account that completed setup (or never needed an invitation).
  const canActivate = !isSelf && (staff.status === 'DEACTIVATED' || staff.status === 'SUSPENDED') && (staff.invitation.state === 'USED' || staff.invitation.state === 'NONE');
  const canReissue = !isSelf && staff.status === 'PENDING';

  return (
    <section aria-label="Staff detail" className="space-y-5">
      <button type="button" onClick={onBack} className={secondaryButton}>
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to staff
      </button>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-white" data-testid="staff-detail-name">
            {staff.employeeProfile?.fullName ?? staff.email}
          </h2>
          <p className="text-xs text-stone-400">{staff.email}</p>
        </div>
        <StatusBadge status={staff.status} />
      </header>

      {handoff && <InvitationHandoffPanel handoff={handoff} reissued staffLabel={staff.employeeProfile?.fullName ?? staff.email} onDismiss={() => setHandoff(null)} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-5">
          <ProfileCard staff={staff} editing={editing} onEdit={() => setEditing(true)} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); void reloadQuietly(); }} />
          <StatusCard
            staff={staff}
            isSelf={isSelf}
            canDeactivate={canDeactivate}
            canActivate={canActivate}
            canReissue={canReissue}
            onDeactivate={() => setDialog('deactivate')}
            onActivate={() => setDialog('activate')}
            onReissued={(h) => { setHandoff(h); void reloadQuietly(); }}
          />
        </div>
        <div className="space-y-5 bg-stone-900/70 border border-stone-800 rounded-2xl p-4">
          <RoleManagement staff={staff} isSelf={isSelf} onChanged={reloadQuietly} />
          <hr className="border-stone-800" />
          <StaffBranchAssignments staff={staff} isSelf={isSelf} onChanged={reloadQuietly} />
        </div>
      </div>

      {dialog === 'deactivate' && <DeactivateDialog staff={staff} onClose={() => setDialog(null)} onDone={() => { setDialog(null); void reloadQuietly(); }} />}
      {dialog === 'activate' && <ActivateDialog staff={staff} onClose={() => setDialog(null)} onDone={() => { setDialog(null); void reloadQuietly(); }} />}
    </section>
  );
};

// ------------------------------------------------------------------ profile
const ProfileCard: React.FC<{ staff: StaffMember; editing: boolean; onEdit: () => void; onCancel: () => void; onSaved: () => void }> = ({ staff, editing, onEdit, onCancel, onSaved }) => {
  const { run, pending, error, clearError } = useAdminAction();
  const profile = staff.employeeProfile;
  const [form, setForm] = useState({ fullName: profile?.fullName ?? '', phone: staff.phone ?? '', designation: profile?.designation ?? '', shiftTiming: profile?.shiftTiming ?? '' });
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (editing) setForm({ fullName: profile?.fullName ?? '', phone: staff.phone ?? '', designation: profile?.designation ?? '', shiftTiming: profile?.shiftTiming ?? '' });
  }, [editing, profile, staff.phone]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const problems: Record<string, string> = {};
    if (profile && form.fullName.trim().length < 2) problems.fullName = 'Enter the full name (at least 2 characters).';
    if (profile && form.designation.trim().length < 2) problems.designation = 'Enter the designation (at least 2 characters).';
    if (form.phone.trim() && !PHONE_RE.test(form.phone.trim())) problems.phone = 'Enter a valid phone number.';
    setClientErrors(problems);
    if (Object.keys(problems).length > 0) return;

    // Ordinary profile changes: NO step-up required (role/branch/status changes use their own explicit endpoints).
    const outcome = await run(() =>
      AdminService.updateStaff(staff.id, {
        ...(profile && { fullName: form.fullName.trim(), designation: form.designation.trim(), shiftTiming: form.shiftTiming.trim() || null }),
        phone: form.phone.trim() || null
      })
    );
    if (outcome.ok) onSaved();
  };

  const fe = (name: string) => clientErrors[name] ?? error?.fieldErrors[name];

  return (
    <section aria-label="Profile" className="bg-stone-900/70 border border-stone-800 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-white">Profile</h3>
        {!editing && (
          <button type="button" onClick={onEdit} className={secondaryButton}>
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" /> Edit profile
          </button>
        )}
      </div>

      {!editing ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <Row label="Employee code" value={profile?.employeeCode} />
          <Row label="Designation" value={profile?.designation} />
          <Row label="Phone" value={staff.phone} />
          <Row label="Shift" value={profile?.shiftTiming} />
          <Row label="Last sign-in" value={formatDate(staff.lastLoginAt)} />
          <Row label="Created" value={formatDate(staff.createdAt)} />
        </dl>
      ) : (
        <form onSubmit={submit} noValidate aria-label="Edit profile" className="space-y-3">
          {profile && (
            <>
              <Field label="Full name" htmlFor="edit-fullName" error={fe('fullName')}>
                <input id="edit-fullName" className={inputClass} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} disabled={pending} />
              </Field>
              <Field label="Designation" htmlFor="edit-designation" error={fe('designation')}>
                <input id="edit-designation" className={inputClass} value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} disabled={pending} />
              </Field>
              <Field label="Shift timing" htmlFor="edit-shift" error={fe('shiftTiming')}>
                <input id="edit-shift" className={inputClass} value={form.shiftTiming} onChange={(e) => setForm({ ...form, shiftTiming: e.target.value })} disabled={pending} />
              </Field>
            </>
          )}
          <Field label="Phone" htmlFor="edit-phone" error={fe('phone')}>
            <input id="edit-phone" className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={pending} />
          </Field>
          <ErrorNotice error={error} onDismiss={clearError} />
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pending} className={primaryButton}>
              {pending ? 'Saving…' : 'Save profile'}
            </button>
            <button type="button" onClick={onCancel} disabled={pending} className={secondaryButton}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
};

const Row: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => (
  <div>
    <dt className="text-[10px] uppercase tracking-wider text-stone-500">{label}</dt>
    <dd className="text-stone-200">{value || '—'}</dd>
  </div>
);

// ------------------------------------------------------------------ status + invitation
const StatusCard: React.FC<{
  staff: StaffMember;
  isSelf: boolean;
  canDeactivate: boolean;
  canActivate: boolean;
  canReissue: boolean;
  onDeactivate: () => void;
  onActivate: () => void;
  onReissued: (h: InvitationHandoff) => void;
}> = ({ staff, isSelf, canDeactivate, canActivate, canReissue, onDeactivate, onActivate, onReissued }) => {
  const { withStepUp } = useStepUp();
  const { run, pending, error, clearError } = useAdminAction();

  const reissue = async () => {
    const outcome = await run(() => withStepUp((proof) => AdminService.reissueInvitation(staff.id, proof)));
    if (outcome.ok) onReissued(outcome.value.invitation);
  };

  return (
    <section aria-label="Account status" className="bg-stone-900/70 border border-stone-800 rounded-2xl p-4 space-y-3">
      <h3 className="text-sm font-black text-white">Account status</h3>
      <p className="text-xs text-stone-300">
        Status: <strong>{staff.status}</strong> · Invitation: <strong data-testid="invitation-state">{staff.invitation.state}</strong>
        {staff.invitation.state === 'ACTIVE' && staff.invitation.expiresAt && <> (expires {formatDate(staff.invitation.expiresAt)})</>}
      </p>

      {isSelf && <p className="text-xs text-stone-500">You cannot change your own status.</p>}

      <div className="flex flex-wrap gap-2">
        {canReissue && (
          <button type="button" onClick={reissue} disabled={pending} className={secondaryButton}>
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> {pending ? 'Reissuing…' : 'Reissue invitation'}
          </button>
        )}
        {canDeactivate && (
          <button type="button" onClick={onDeactivate} className={dangerButton}>
            <ShieldOff className="w-3.5 h-3.5" aria-hidden="true" /> Deactivate…
          </button>
        )}
        {canActivate && (
          <button type="button" onClick={onActivate} className={primaryButton}>
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" /> Activate…
          </button>
        )}
      </div>
      {(staff.status === 'DEACTIVATED' || staff.status === 'SUSPENDED') && !canActivate && !isSelf && (
        <p className="text-xs text-stone-500">This account never completed password setup, so it cannot be reactivated. Create a new invitation instead.</p>
      )}
      {staff.status === 'PENDING' && <p className="text-xs text-stone-500">Waiting for the staff member to accept the invitation. Pending accounts cannot be activated manually.</p>}

      <ErrorNotice error={error} onDismiss={clearError} />
    </section>
  );
};

// ------------------------------------------------------------------ dialogs
const DeactivateDialog: React.FC<{ staff: StaffMember; onClose: () => void; onDone: () => void }> = ({ staff, onClose, onDone }) => {
  const { withStepUp } = useStepUp();
  const { run, pending, error, clearError } = useAdminAction();
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'DEACTIVATED' | 'SUSPENDED'>('DEACTIVATED');
  const [confirmed, setConfirmed] = useState(false);

  const valid = reason.trim().length >= 3 && confirmed;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || pending) return;
    const outcome = await run(() => withStepUp((proof) => AdminService.deactivateStaff(staff.id, { reason: reason.trim(), status: mode }, proof)));
    if (outcome.ok) onDone();
  };

  return (
    <Modal title={`Deactivate ${staff.employeeProfile?.fullName ?? staff.email}`} onClose={onClose} closeDisabled={pending}>
      <form onSubmit={submit} aria-label="Deactivate staff" className="space-y-4">
        <div role="note" className="text-xs bg-red-950/50 border border-red-500/40 text-red-100 rounded-xl px-3 py-2">
          All active sessions of this person will be revoked immediately and they will lose access on their next request.
        </div>
        <Field label="Reason (recorded in the audit log)" htmlFor="deactivate-reason" error={error?.fieldErrors.reason}>
          <textarea id="deactivate-reason" rows={3} className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} disabled={pending} />
        </Field>
        <Field label="Action" htmlFor="deactivate-mode">
          <select id="deactivate-mode" className={inputClass} value={mode} onChange={(e) => setMode(e.target.value as 'DEACTIVATED' | 'SUSPENDED')} disabled={pending}>
            <option value="DEACTIVATED">Deactivate</option>
            <option value="SUSPENDED">Suspend</option>
          </select>
        </Field>
        <label className="flex items-start gap-2 text-xs text-stone-200">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={pending} className="mt-0.5" />
          <span>I understand that this revokes the account&apos;s sessions immediately.</span>
        </label>
        <ErrorNotice error={error} onDismiss={clearError} />
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={pending} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" disabled={!valid || pending} className={dangerButton}>
            {pending ? 'Working…' : mode === 'SUSPENDED' ? 'Suspend account' : 'Deactivate account'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const ActivateDialog: React.FC<{ staff: StaffMember; onClose: () => void; onDone: () => void }> = ({ staff, onClose, onDone }) => {
  const { withStepUp } = useStepUp();
  const { run, pending, error, clearError } = useAdminAction();
  const [reason, setReason] = useState('');
  const valid = reason.trim().length >= 3;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || pending) return;
    const outcome = await run(() => withStepUp((proof) => AdminService.activateStaff(staff.id, { reason: reason.trim() }, proof)));
    if (outcome.ok) onDone();
  };

  return (
    <Modal title={`Activate ${staff.employeeProfile?.fullName ?? staff.email}`} onClose={onClose} closeDisabled={pending}>
      <form onSubmit={submit} aria-label="Activate staff" className="space-y-4">
        <Field label="Reason (recorded in the audit log)" htmlFor="activate-reason" error={error?.fieldErrors.reason}>
          <textarea id="activate-reason" rows={3} className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} disabled={pending} />
        </Field>
        <ErrorNotice error={error} onDismiss={clearError} />
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={pending} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" disabled={!valid || pending} className={primaryButton}>
            {pending ? 'Working…' : 'Activate account'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
