import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Search, UserPlus } from 'lucide-react';
import { AdminService } from '../../services/adminService';
import type { Paginated, StaffMember, StaffStatus } from '../../services/adminTypes';
import { AdminErrorInfo, describeAdminError } from './adminErrors';
import { useAdminReference } from './AdminReference';
import { Chip, EmptyState, ErrorNotice, Pagination, Spinner, StatusBadge, inputClass, primaryButton, secondaryButton } from './adminUi';
import { InviteStaff } from './InviteStaff';
import { useAuth } from '../../context/AuthContext';

const PAGE_SIZE = 20;
const STATUSES: StaffStatus[] = ['ACTIVE', 'PENDING', 'SUSPENDED', 'DEACTIVATED'];

interface Filters {
  q: string;
  status: StaffStatus | '';
  role: string;
  branchId: string;
}

/**
 * Staff list. Search, status, role, branch and pagination are ALL server-side query parameters of GET /admin/staff;
 * nothing is filtered locally.
 */
export const StaffManagement: React.FC<{ onOpen: (id: string) => void }> = ({ onOpen }) => {
  const reference = useAdminReference();
  const auth = useAuth();
  const [draftQ, setDraftQ] = useState('');
  const [filters, setFilters] = useState<Filters>({ q: '', status: '', role: '', branchId: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<StaffMember> | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<AdminErrorInfo | null>(null);
  const [nonce, setNonce] = useState(0);
  const [inviting, setInviting] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setStatus('loading');
    setError(null);
    try {
      const result = await AdminService.listStaff({ page, pageSize: PAGE_SIZE, q: filters.q, status: filters.status, role: filters.role, branchId: filters.branchId });
      if (id !== requestId.current) return; // a newer request superseded this one
      setData(result);
      setStatus('ready');
    } catch (err) {
      if (id !== requestId.current) return;
      const info = describeAdminError(err);
      setError(info);
      setStatus('error');
      if (info.kind === 'session-expired') void auth.logout();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filters, nonce]);

  useEffect(() => {
    void load();
  }, [load]);

  const applySearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setFilters((f) => ({ ...f, q: draftQ.trim() }));
  };

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setPage(1);
    setFilters((f) => ({ ...f, [key]: value }));
  };

  return (
    <section aria-label="Staff management" className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-white">Staff</h2>
          <p className="text-xs text-stone-400">Accounts, roles and branch access for everyone who works on the platform.</p>
        </div>
        <button type="button" onClick={() => setInviting(true)} className={primaryButton}>
          <UserPlus className="w-4 h-4" aria-hidden="true" />
          Invite staff
        </button>
      </div>

      <form onSubmit={applySearch} role="search" aria-label="Staff filters" className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-stone-900/70 border border-stone-800 rounded-2xl p-3">
        <div className="md:col-span-2 flex items-center gap-2">
          <label htmlFor="staff-search" className="sr-only">
            Search staff
          </label>
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input id="staff-search" value={draftQ} onChange={(e) => setDraftQ(e.target.value)} placeholder="Search name, email, code or phone" className={`${inputClass} pl-9`} />
          </div>
          <button type="submit" className={secondaryButton}>
            Search
          </button>
        </div>
        <div>
          <label htmlFor="staff-status" className="sr-only">
            Status
          </label>
          <select id="staff-status" value={filters.status} onChange={(e) => setFilter('status', e.target.value as StaffStatus | '')} className={inputClass}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="staff-role" className="sr-only">
            Role
          </label>
          <select id="staff-role" value={filters.role} onChange={(e) => setFilter('role', e.target.value)} className={inputClass}>
            <option value="">All roles</option>
            {(reference.catalogue?.roles ?? []).map((r) => (
              <option key={r.role} value={r.role}>
                {r.role}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="staff-branch" className="sr-only">
            Branch
          </label>
          <select id="staff-branch" value={filters.branchId} onChange={(e) => setFilter('branchId', e.target.value)} className={inputClass}>
            <option value="">All branches</option>
            {reference.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </form>

      {status === 'loading' && <Spinner label="Loading staff…" />}
      {status === 'error' && <ErrorNotice error={error} onRetry={() => setNonce((n) => n + 1)} />}

      {status === 'ready' && data && data.items.length === 0 && <EmptyState message="No staff match these filters." />}

      {status === 'ready' && data && data.items.length > 0 && (
        <>
          <div className="overflow-x-auto bg-stone-900/70 border border-stone-800 rounded-2xl">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Staff accounts</caption>
              <thead className="text-[10px] uppercase tracking-wider text-stone-500 border-b border-stone-800">
                <tr>
                  <th scope="col" className="px-4 py-3">Name</th>
                  <th scope="col" className="px-4 py-3">Code</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3">Roles</th>
                  <th scope="col" className="px-4 py-3">Branches</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => (
                  <tr key={s.id} className="border-b border-stone-800/60 last:border-0 hover:bg-stone-800/40">
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => onOpen(s.id)} className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded">
                        <span className="block font-black text-white">{s.employeeProfile?.fullName ?? s.email}</span>
                        <span className="block text-stone-400">{s.email}</span>
                        {s.employeeProfile && <span className="block text-stone-500">{s.employeeProfile.designation}</span>}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-stone-300">{s.employeeProfile?.employeeCode ?? '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {s.roles.map((r) => (
                          <Chip key={r.role} tone="amber">
                            {r.role}
                          </Chip>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {s.branches.length === 0 ? <span className="text-stone-500">—</span> : s.branches.map((b) => <Chip key={b.id}>{b.name}</Chip>)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
        </>
      )}

      {inviting && (
        <InviteStaff
          onClose={() => {
            setInviting(false);
            setNonce((n) => n + 1);
          }}
          onCreated={() => setNonce((n) => n + 1)}
        />
      )}
    </section>
  );
};
