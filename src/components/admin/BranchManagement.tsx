import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, Plus } from 'lucide-react';
import { AdminService } from '../../services/adminService';
import type { BranchRecord, Paginated } from '../../services/adminTypes';
import { useAuth } from '../../context/AuthContext';
import { AdminErrorInfo, describeAdminError } from './adminErrors';
import { useAdminReference } from './AdminReference';
import { useAdminAction } from './useAdminAction';
import { Chip, EmptyState, ErrorNotice, Field, Modal, Pagination, Spinner, dangerButton, inputClass, primaryButton, secondaryButton } from './adminUi';

const PAGE_SIZE = 20;
const CODE_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;

type ActiveFilter = '' | 'true' | 'false';

/** Branch administration (list / create / edit / activate-deactivate). Branches are never deleted. Mutation UI is SUPER_ADMIN-only. */
export const BranchManagement: React.FC = () => {
  const auth = useAuth();
  const reference = useAdminReference();
  const [filter, setFilter] = useState<ActiveFilter>('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<BranchRecord> | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<AdminErrorInfo | null>(null);
  const [nonce, setNonce] = useState(0);
  const [editing, setEditing] = useState<BranchRecord | 'new' | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setStatus('loading');
    setError(null);
    try {
      const result = await AdminService.listBranches({ page, pageSize: PAGE_SIZE, isActive: filter === '' ? undefined : filter === 'true' });
      if (id !== requestId.current) return;
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
  }, [page, filter, nonce]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = () => {
    setNonce((n) => n + 1);
    void reference.reloadBranches();
  };

  return (
    <section aria-label="Branch management" className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-white">Branches</h2>
          <p className="text-xs text-stone-400">Kitchen branches that staff can be assigned to. Branches are deactivated, never deleted.</p>
        </div>
        <div className="flex items-center gap-3">
          <div>
            <label htmlFor="branch-active-filter" className="sr-only">
              Show
            </label>
            <select id="branch-active-filter" value={filter} onChange={(e) => { setPage(1); setFilter(e.target.value as ActiveFilter); }} className={inputClass}>
              <option value="">All branches</option>
              <option value="true">Active only</option>
              <option value="false">Inactive only</option>
            </select>
          </div>
          <button type="button" onClick={() => setEditing('new')} className={primaryButton}>
            <Plus className="w-4 h-4" aria-hidden="true" /> New branch
          </button>
        </div>
      </div>

      {status === 'loading' && <Spinner label="Loading branches…" />}
      {status === 'error' && <ErrorNotice error={error} onRetry={() => setNonce((n) => n + 1)} />}
      {status === 'ready' && data && data.items.length === 0 && <EmptyState message="No branches match this filter." />}

      {status === 'ready' && data && data.items.length > 0 && (
        <>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3" aria-label="Branches">
            {data.items.map((b) => (
              <li key={b.id} className="bg-stone-900/70 border border-stone-800 rounded-2xl p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-black text-white">{b.name}</h3>
                    <p className="text-[11px] text-stone-500">Code: {b.code}</p>
                  </div>
                  <Chip tone={b.isActive ? 'emerald' : 'neutral'}>{b.isActive ? 'Active' : 'Inactive'}</Chip>
                </div>
                <p className="text-xs text-stone-300 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-stone-500" aria-hidden="true" /> {b.address}, {b.city}
                </p>
                <p className="text-xs text-stone-400">
                  Assigned staff (active/pending): <strong className="text-stone-200">{b.staffCount}</strong>
                </p>
                <button type="button" onClick={() => setEditing(b)} className={secondaryButton} aria-label={`Edit ${b.name}`}>
                  Edit
                </button>
              </li>
            ))}
          </ul>
          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
        </>
      )}

      {editing && <BranchDialog branch={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
    </section>
  );
};

const BranchDialog: React.FC<{ branch: BranchRecord | null; onClose: () => void; onSaved: () => void }> = ({ branch, onClose, onSaved }) => {
  const { run, pending, error, clearError } = useAdminAction();
  const [form, setForm] = useState({
    code: branch?.code ?? '',
    name: branch?.name ?? '',
    address: branch?.address ?? '',
    city: branch?.city ?? '',
    latitude: branch?.latitude?.toString() ?? '',
    longitude: branch?.longitude?.toString() ?? ''
  });
  const [isActive, setIsActive] = useState(branch?.isActive ?? true);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  const deactivating = !!branch && branch.isActive && !isActive;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const problems: Record<string, string> = {};
    if (!branch && !CODE_RE.test(form.code.trim().toLowerCase())) problems.code = 'Use 2–31 characters: a–z, 0–9, hyphen.';
    if (form.name.trim().length < 2) problems.name = 'Enter the branch name.';
    if (form.address.trim().length < 3) problems.address = 'Enter the address.';
    if (form.city.trim().length < 2) problems.city = 'Enter the city.';
    const lat = form.latitude.trim() === '' ? null : Number(form.latitude);
    const lon = form.longitude.trim() === '' ? null : Number(form.longitude);
    if (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) problems.latitude = 'Latitude must be between -90 and 90.';
    if (lon !== null && (!Number.isFinite(lon) || lon < -180 || lon > 180)) problems.longitude = 'Longitude must be between -180 and 180.';
    if (deactivating && !confirmDeactivate) problems.isActive = 'Confirm that you want to deactivate this branch.';
    setClientErrors(problems);
    if (Object.keys(problems).length > 0) return;

    const outcome = await run(() =>
      branch
        ? AdminService.updateBranch(branch.id, {
            name: form.name.trim(),
            address: form.address.trim(),
            city: form.city.trim(),
            latitude: lat,
            longitude: lon,
            isActive
          })
        : AdminService.createBranch({
            code: form.code.trim().toLowerCase(),
            name: form.name.trim(),
            address: form.address.trim(),
            city: form.city.trim(),
            ...(lat !== null && { latitude: lat }),
            ...(lon !== null && { longitude: lon })
          })
    );
    if (outcome.ok) onSaved();
  };

  const fe = (n: string) => clientErrors[n] ?? error?.fieldErrors[n];

  return (
    <Modal title={branch ? `Edit ${branch.name}` : 'New branch'} onClose={onClose} closeDisabled={pending}>
      <form onSubmit={submit} noValidate aria-label={branch ? 'Edit branch' : 'New branch'} className="space-y-3">
        <Field label="Code" htmlFor="branch-code" error={fe('code')} hint={branch ? 'The code cannot be changed.' : 'Lowercase identifier, e.g. kochi-central.'}>
          <input id="branch-code" className={inputClass} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={pending || !!branch} />
        </Field>
        <Field label="Name" htmlFor="branch-name" error={fe('name')}>
          <input id="branch-name" className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={pending} />
        </Field>
        <Field label="Address" htmlFor="branch-address" error={fe('address')}>
          <input id="branch-address" className={inputClass} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} disabled={pending} />
        </Field>
        <Field label="City" htmlFor="branch-city" error={fe('city')}>
          <input id="branch-city" className={inputClass} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} disabled={pending} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude (optional)" htmlFor="branch-lat" error={fe('latitude')}>
            <input id="branch-lat" className={inputClass} value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} disabled={pending} />
          </Field>
          <Field label="Longitude (optional)" htmlFor="branch-lon" error={fe('longitude')}>
            <input id="branch-lon" className={inputClass} value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} disabled={pending} />
          </Field>
        </div>

        {branch && (
          <div className="space-y-2 border-t border-stone-800 pt-3">
            <label className="flex items-center gap-2 text-xs text-stone-200">
              <input type="checkbox" checked={isActive} onChange={(e) => { setIsActive(e.target.checked); setConfirmDeactivate(false); }} disabled={pending} />
              <span>Branch is active</span>
            </label>
            {deactivating && (
              <div className="space-y-2">
                <p role="note" className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
                  A branch with active or pending staff cannot be deactivated. Reassign them first if the server refuses.
                </p>
                <label className="flex items-center gap-2 text-xs text-stone-200">
                  <input type="checkbox" checked={confirmDeactivate} onChange={(e) => setConfirmDeactivate(e.target.checked)} disabled={pending} />
                  <span>Yes, deactivate this branch</span>
                </label>
                {fe('isActive') && (
                  <p role="alert" className="text-[11px] text-red-300">
                    {fe('isActive')}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <ErrorNotice error={error} onDismiss={clearError} />
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={pending} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" disabled={pending} className={deactivating ? dangerButton : primaryButton}>
            {pending ? 'Saving…' : branch ? (deactivating ? 'Deactivate branch' : 'Save branch') : 'Create branch'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
