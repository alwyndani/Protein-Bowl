import React, { useState } from 'react';
import { X } from 'lucide-react';
import { AdminService } from '../../services/adminService';
import type { StaffMember } from '../../services/adminTypes';
import { useAdminReference } from './AdminReference';
import { useStepUp } from './StepUp';
import { useAdminAction } from './useAdminAction';
import { Chip, ErrorNotice, inputClass, primaryButton } from './adminUi';

/**
 * Branch access for ONE staff member (assign / revoke - both require step-up). The primary/home branch is whatever the
 * backend reports (`isPrimary`); this component never edits or recomputes it - after every change the parent reloads the
 * authoritative record.
 */
export const StaffBranchAssignments: React.FC<{ staff: StaffMember; isSelf: boolean; onChanged: () => void }> = ({ staff, isSelf, onChanged }) => {
  const reference = useAdminReference();
  const { withStepUp } = useStepUp();
  const { run, pending, error, clearError } = useAdminAction();
  const [selected, setSelected] = useState('');

  const assignedIds = new Set(staff.branches.map((b) => b.id));
  const assignable = reference.activeBranches.filter((b) => !assignedIds.has(b.id));
  const noProfile = !staff.employeeProfile;

  const assign = async () => {
    if (!selected) return;
    const outcome = await run(() => withStepUp((proof) => AdminService.assignBranch(staff.id, selected, proof)));
    if (outcome.ok) {
      setSelected('');
      onChanged();
    }
  };

  const revoke = async (branchId: string) => {
    const outcome = await run(() => withStepUp((proof) => AdminService.revokeBranch(staff.id, branchId, proof)));
    if (outcome.ok) onChanged();
  };

  return (
    <section aria-label="Branch access" className="space-y-3">
      <h3 className="text-sm font-black text-white">Branch access</h3>
      {staff.branches.length === 0 ? (
        <p className="text-xs text-stone-500">No branches assigned.</p>
      ) : (
        <ul className="flex flex-wrap gap-2" aria-label="Assigned branches">
          {staff.branches.map((b) => (
            <li key={b.id}>
              <Chip tone={b.isPrimary ? 'emerald' : 'neutral'}>
                {b.name}
                {b.isPrimary && <span className="text-[10px] font-normal">· primary</span>}
                {!b.isActive && <span className="text-[10px] font-normal text-red-300">· inactive</span>}
                {!isSelf && !noProfile && (
                  <button
                    type="button"
                    onClick={() => revoke(b.id)}
                    disabled={pending}
                    aria-label={`Revoke branch ${b.name}`}
                    className="ml-1 rounded-full hover:bg-stone-700 p-0.5 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </Chip>
            </li>
          ))}
        </ul>
      )}

      {isSelf ? (
        <p className="text-xs text-stone-500">You cannot change your own branch assignments.</p>
      ) : noProfile ? (
        <p className="text-xs text-stone-500">This account has no employee profile, so branches cannot be assigned.</p>
      ) : reference.status !== 'ready' ? null : assignable.length === 0 ? (
        <p className="text-xs text-stone-500">No further active branches are available.</p>
      ) : (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor="add-branch" className="block text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-1">
              Assign branch
            </label>
            <select id="add-branch" value={selected} onChange={(e) => setSelected(e.target.value)} disabled={pending} className={inputClass}>
              <option value="">Select an active branch…</option>
              {assignable.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>
          <button type="button" onClick={assign} disabled={pending || !selected} className={primaryButton}>
            {pending ? 'Working…' : 'Assign branch'}
          </button>
        </div>
      )}

      <ErrorNotice error={error} onDismiss={clearError} />
    </section>
  );
};
