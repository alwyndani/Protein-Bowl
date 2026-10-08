import React from 'react';
import { Info } from 'lucide-react';
import type { RoleScopeName } from '../../services/adminTypes';
import { useAdminReference } from './AdminReference';
import { Chip, ErrorNotice, Spinner } from './adminUi';

const SCOPE_LABELS: Record<RoleScopeName, { label: string; description: string }> = {
  GLOBAL: { label: 'Global', description: 'Platform-wide read and write.' },
  GLOBAL_READ: { label: 'Global read', description: 'Platform-wide visibility, read-only. No operational changes, no administration.' },
  BRANCH: { label: 'Branch', description: 'Only the branches the staff member is assigned to.' },
  BRANCH_SELF: { label: 'Branch + self', description: 'Assigned branches, and only the person\'s own work items.' },
  ASSIGNMENT: { label: 'Assignment', description: 'Only explicitly assigned customers (not branch-based).' },
  CUSTOMER: { label: 'Customer', description: 'A customer identity, not a staff scope.' }
};

/**
 * Read-only reference built from the backend's DESCRIPTIVE catalogue. It explains who can do what; it does not grant
 * anything - the backend authorizes every request regardless of what is displayed here.
 */
export const PermissionsView: React.FC = () => {
  const reference = useAdminReference();

  return (
    <section aria-label="Roles and permissions" className="space-y-4">
      <div>
        <h2 className="text-xl font-black text-white">Roles &amp; permissions</h2>
        <p className="text-xs text-stone-400">What each staff role can reach and how far its access extends.</p>
      </div>

      <div role="note" className="flex items-start gap-3 bg-stone-900/70 border border-stone-800 rounded-2xl p-3 text-xs text-stone-300">
        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
        <p data-testid="permissions-disclaimer">{reference.catalogue?.note ?? 'Informational only. Authorization is always enforced by the server.'}</p>
      </div>

      {reference.status === 'loading' && <Spinner label="Loading permissions…" />}
      {reference.status === 'error' && <ErrorNotice error={reference.error} onRetry={reference.reload} />}

      {reference.status === 'ready' && reference.catalogue && (
        <>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs" aria-label="Scope legend">
            {(Object.keys(SCOPE_LABELS) as RoleScopeName[])
              .filter((s) => s !== 'CUSTOMER')
              .map((s) => (
                <div key={s} className="bg-stone-900/50 border border-stone-800 rounded-xl px-3 py-2">
                  <dt className="font-black text-stone-100">{SCOPE_LABELS[s].label}</dt>
                  <dd className="text-stone-400">{SCOPE_LABELS[s].description}</dd>
                </div>
              ))}
          </dl>

          <div className="overflow-x-auto bg-stone-900/70 border border-stone-800 rounded-2xl">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Role permission reference</caption>
              <thead className="text-[10px] uppercase tracking-wider text-stone-500 border-b border-stone-800">
                <tr>
                  <th scope="col" className="px-4 py-3">Role</th>
                  <th scope="col" className="px-4 py-3">Scope</th>
                  <th scope="col" className="px-4 py-3">Permissions</th>
                  <th scope="col" className="px-4 py-3">Assignable by administrators</th>
                </tr>
              </thead>
              <tbody>
                {reference.catalogue.roles.map((r) => (
                  <tr key={r.role} className="border-b border-stone-800/60 last:border-0 align-top">
                    <th scope="row" className="px-4 py-3 font-black text-white">{r.role}</th>
                    <td className="px-4 py-3">
                      <Chip tone="amber">{SCOPE_LABELS[r.scope]?.label ?? r.scope}</Chip>
                    </td>
                    <td className="px-4 py-3">
                      {r.permissions.length === 0 ? (
                        <span className="text-stone-500">Module-specific rules (no platform permissions)</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {r.permissions.map((p) => (
                            <Chip key={p}>{p}</Chip>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-stone-300">{r.assignableThroughAdminApi ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
};
