import React, { useState } from 'react';
import { X } from 'lucide-react';
import { AdminService } from '../../services/adminService';
import type { StaffMember } from '../../services/adminTypes';
import { useAdminReference } from './AdminReference';
import { useStepUp } from './StepUp';
import { useAdminAction } from './useAdminAction';
import { Chip, ErrorNotice, inputClass, primaryButton } from './adminUi';

/**
 * Role assignment/revocation for ONE staff member. Both actions require step-up. Only roles the backend marks
 * `assignableThroughAdminApi` can be added; SUPER_ADMIN is shown but never removable. The backend enforces every guardrail
 * (LAST_ROLE, ROLE_NOT_ASSIGNABLE, MIXED_IDENTITY, self-change) and its message is shown verbatim-friendly.
 */
export const RoleManagement: React.FC<{ staff: StaffMember; isSelf: boolean; onChanged: () => void }> = ({ staff, isSelf, onChanged }) => {
  const reference = useAdminReference();
  const { withStepUp } = useStepUp();
  const { run, pending, error, clearError } = useAdminAction();
  const [selected, setSelected] = useState('');

  const held = new Set(staff.roles.map((r) => r.role));
  const assignableByAdmin = new Set(reference.assignableRoles.map((r) => r.role));
  const addable = reference.assignableRoles.filter((r) => !held.has(r.role));
  const canEdit = !isSelf;

  const assign = async () => {
    if (!selected) return;
    const outcome = await run(() => withStepUp((proof) => AdminService.assignRole(staff.id, selected, proof)));
    if (outcome.ok) {
      setSelected('');
      onChanged();
    }
  };

  const revoke = async (role: string) => {
    const outcome = await run(() => withStepUp((proof) => AdminService.revokeRole(staff.id, role, proof)));
    if (outcome.ok) onChanged();
  };

  return (
    <section aria-label="Roles" className="space-y-3">
      <h3 className="text-sm font-black text-white">Roles</h3>
      <ul className="flex flex-wrap gap-2" aria-label="Current roles">
        {staff.roles.map((r) => {
          const removable = canEdit && assignableByAdmin.has(r.role) && staff.roles.length > 1;
          return (
            <li key={r.role}>
              <Chip tone="amber">
                {r.role}
                <span className="text-[10px] text-stone-400 font-normal">· {r.scope.toLowerCase().replace('_', ' ')}</span>
                {removable && (
                  <button
                    type="button"
                    onClick={() => revoke(r.role)}
                    disabled={pending}
                    aria-label={`Revoke role ${r.role}`}
                    className="ml-1 rounded-full hover:bg-stone-700 p-0.5 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </Chip>
            </li>
          );
        })}
      </ul>

      {isSelf ? (
        <p className="text-xs text-stone-500">You cannot change your own roles.</p>
      ) : reference.status !== 'ready' ? null : addable.length === 0 ? (
        <p className="text-xs text-stone-500">No further roles can be assigned.</p>
      ) : (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor="add-role" className="block text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-1">
              Add role
            </label>
            <select id="add-role" value={selected} onChange={(e) => setSelected(e.target.value)} disabled={pending} className={inputClass}>
              <option value="">Select a role…</option>
              {addable.map((r) => (
                <option key={r.role} value={r.role}>
                  {r.role}
                </option>
              ))}
            </select>
          </div>
          <button type="button" onClick={assign} disabled={pending || !selected} className={primaryButton}>
            {pending ? 'Working…' : 'Assign role'}
          </button>
        </div>
      )}

      <ErrorNotice error={error} onDismiss={clearError} />
    </section>
  );
};
