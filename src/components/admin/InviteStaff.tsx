import React, { useMemo, useState } from 'react';
import { AdminService } from '../../services/adminService';
import type { InvitationHandoff, StaffMember } from '../../services/adminTypes';
import { useAdminReference } from './AdminReference';
import { useStepUp } from './StepUp';
import { useAdminAction } from './useAdminAction';
import { ErrorNotice, Field, Modal, Spinner, inputClass, primaryButton, secondaryButton } from './adminUi';
import { InvitationHandoffPanel } from './InvitationHandoff';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9 ()-]{7,20}$/;
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9-]{2,30}$/;

interface FormState {
  fullName: string;
  email: string;
  phone: string;
  designation: string;
  employeeCode: string;
  shiftTiming: string;
  roles: string[];
  branchIds: string[];
}

const EMPTY: FormState = { fullName: '', email: '', phone: '', designation: '', employeeCode: '', shiftTiming: '', roles: [], branchIds: [] };

/** Invite a new staff member through the real P6B onboarding (PENDING account + one-time manual invitation). */
export const InviteStaff: React.FC<{ onClose: () => void; onCreated: (staff: StaffMember) => void }> = ({ onClose, onCreated }) => {
  const reference = useAdminReference();
  const { withStepUp } = useStepUp();
  const { run, pending, error, clearError } = useAdminAction();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  // Transient secret state: lives only while this dialog is open.
  const [result, setResult] = useState<{ staff: StaffMember; invitation: InvitationHandoff } | null>(null);

  const branchScopedSelected = useMemo(
    () => reference.assignableRoles.some((r) => form.roles.includes(r.role) && (r.scope === 'BRANCH' || r.scope === 'BRANCH_SELF')),
    [reference.assignableRoles, form.roles]
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggle = (key: 'roles' | 'branchIds', value: string) =>
    setForm((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value] }));

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (form.fullName.trim().length < 2) e.fullName = 'Enter the full name (at least 2 characters).';
    if (!EMAIL_RE.test(form.email.trim())) e.email = 'Enter a valid email address.';
    if (form.phone.trim() && !PHONE_RE.test(form.phone.trim())) e.phone = 'Enter a valid phone number.';
    if (form.designation.trim().length < 2) e.designation = 'Enter the designation (at least 2 characters).';
    if (form.employeeCode.trim() && !CODE_RE.test(form.employeeCode.trim())) e.employeeCode = 'Use 3–31 characters: letters, digits, hyphen.';
    if (form.roles.length === 0) e.roles = 'Select at least one role.';
    if (branchScopedSelected && form.branchIds.length === 0) e.branchIds = 'Select at least one branch for branch-scoped roles.';
    return e;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (pending) return;
    const problems = validate();
    setClientErrors(problems);
    if (Object.keys(problems).length > 0) return;

    const outcome = await run(() =>
      withStepUp((proof) =>
        AdminService.createStaff(
          {
            fullName: form.fullName.trim(),
            email: form.email.trim().toLowerCase(),
            designation: form.designation.trim(),
            roles: form.roles,
            branchIds: form.branchIds,
            ...(form.phone.trim() && { phone: form.phone.trim() }),
            ...(form.employeeCode.trim() && { employeeCode: form.employeeCode.trim() }),
            ...(form.shiftTiming.trim() && { shiftTiming: form.shiftTiming.trim() })
          },
          proof
        )
      )
    );
    if (outcome.ok) {
      setResult(outcome.value);
      onCreated(outcome.value.staff);
    }
  };

  const fieldError = (name: string) => clientErrors[name] ?? error?.fieldErrors[name];

  // ---------------------------------------------------------------- success: manual hand-off
  if (result) {
    return (
      <Modal title="Staff invited" onClose={onClose} wide>
        <InvitationHandoffPanel handoff={result.invitation} staffLabel={result.staff.employeeProfile?.fullName ?? result.staff.email} onDismiss={onClose} />
      </Modal>
    );
  }

  return (
    <Modal title="Invite staff member" onClose={onClose} closeDisabled={pending} wide>
      {reference.status === 'loading' && <Spinner label="Loading roles and branches…" />}
      {reference.status === 'error' && <ErrorNotice error={reference.error} onRetry={reference.reload} />}
      {reference.status === 'ready' && (
        <form onSubmit={submit} noValidate aria-label="Invite staff" className="space-y-4">
          <p className="text-xs text-stone-400">
            The account is created as <strong>PENDING</strong>. The staff member sets their own password through a one-time invitation link. You will confirm your password before it is created.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Full name" htmlFor="invite-fullName" error={fieldError('fullName')}>
              <input id="invite-fullName" className={inputClass} value={form.fullName} onChange={(e) => set('fullName', e.target.value)} disabled={pending} />
            </Field>
            <Field label="Email" htmlFor="invite-email" error={fieldError('email')}>
              <input id="invite-email" type="email" className={inputClass} value={form.email} onChange={(e) => set('email', e.target.value)} disabled={pending} />
            </Field>
            <Field label="Designation" htmlFor="invite-designation" error={fieldError('designation')}>
              <input id="invite-designation" className={inputClass} value={form.designation} onChange={(e) => set('designation', e.target.value)} disabled={pending} />
            </Field>
            <Field label="Phone (optional)" htmlFor="invite-phone" error={fieldError('phone')}>
              <input id="invite-phone" className={inputClass} value={form.phone} onChange={(e) => set('phone', e.target.value)} disabled={pending} />
            </Field>
            <Field label="Employee code (optional)" htmlFor="invite-code" error={fieldError('employeeCode')} hint="Generated automatically when left empty.">
              <input id="invite-code" className={inputClass} value={form.employeeCode} onChange={(e) => set('employeeCode', e.target.value)} disabled={pending} />
            </Field>
            <Field label="Shift timing (optional)" htmlFor="invite-shift" error={fieldError('shiftTiming')}>
              <input id="invite-shift" className={inputClass} value={form.shiftTiming} onChange={(e) => set('shiftTiming', e.target.value)} disabled={pending} />
            </Field>
          </div>

          <fieldset className="space-y-2" aria-describedby="invite-roles-hint">
            <legend className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Roles</legend>
            <p id="invite-roles-hint" className="text-[11px] text-stone-500">
              Only roles that may be assigned through administration are listed. SUPER_ADMIN and customer roles are never assignable here.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {reference.assignableRoles.map((r) => (
                <label key={r.role} className="flex items-center gap-2 text-xs bg-stone-950 border border-stone-800 rounded-xl px-3 py-2">
                  <input type="checkbox" checked={form.roles.includes(r.role)} onChange={() => toggle('roles', r.role)} disabled={pending} />
                  <span>{r.role}</span>
                </label>
              ))}
            </div>
            {fieldError('roles') && (
              <p role="alert" className="text-[11px] text-red-300">
                {fieldError('roles')}
              </p>
            )}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Branches {branchScopedSelected && <span className="text-amber-300">(required for the selected roles)</span>}</legend>
            {reference.activeBranches.length === 0 ? (
              <p className="text-xs text-stone-500">No active branches exist yet. Create one in the Branches section first.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {reference.activeBranches.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 text-xs bg-stone-950 border border-stone-800 rounded-xl px-3 py-2">
                    <input type="checkbox" checked={form.branchIds.includes(b.id)} onChange={() => toggle('branchIds', b.id)} disabled={pending} />
                    <span>
                      {b.name} <span className="text-stone-500">({b.code})</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            {fieldError('branchIds') && (
              <p role="alert" className="text-[11px] text-red-300">
                {fieldError('branchIds')}
              </p>
            )}
          </fieldset>

          <ErrorNotice error={error} onDismiss={clearError} />

          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={onClose} disabled={pending} className={secondaryButton}>
              Cancel
            </button>
            <button type="submit" disabled={pending} className={primaryButton}>
              {pending ? 'Creating…' : 'Create invitation'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};
