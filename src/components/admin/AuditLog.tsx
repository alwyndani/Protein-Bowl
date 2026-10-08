import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AdminService } from '../../services/adminService';
import type { AuditEntry, Paginated } from '../../services/adminTypes';
import { useAuth } from '../../context/AuthContext';
import { AdminErrorInfo, describeAdminError } from './adminErrors';
import { EmptyState, ErrorNotice, Field, Pagination, Spinner, formatDate, inputClass, secondaryButton, primaryButton } from './adminUi';

const PAGE_SIZE = 25;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTION_RE = /^[A-Z0-9_]{2,64}$/;

interface Filters {
  actorUserId: string;
  action: string;
  entity: string;
  entityId: string;
  from: string;
  to: string;
}
const EMPTY: Filters = { actorUserId: '', action: '', entity: '', entityId: '', from: '', to: '' };

/** Read-only security audit history. Filtering and pagination happen on the server; there are no edit/delete controls. */
export const AuditLog: React.FC = () => {
  const auth = useAuth();
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<AuditEntry> | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<AdminErrorInfo | null>(null);
  const [nonce, setNonce] = useState(0);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setStatus('loading');
    setError(null);
    try {
      const result = await AdminService.listAudit({
        page,
        pageSize: PAGE_SIZE,
        actorUserId: applied.actorUserId,
        action: applied.action,
        entity: applied.entity,
        entityId: applied.entityId,
        from: applied.from ? new Date(`${applied.from}T00:00:00`).toISOString() : undefined,
        to: applied.to ? new Date(`${applied.to}T23:59:59.999`).toISOString() : undefined
      });
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
  }, [page, applied, nonce]);

  useEffect(() => {
    void load();
  }, [load]);

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    const problems: Record<string, string> = {};
    if (draft.actorUserId.trim() && !UUID_RE.test(draft.actorUserId.trim())) problems.actorUserId = 'Enter a valid user id (UUID).';
    if (draft.action.trim() && !ACTION_RE.test(draft.action.trim())) problems.action = 'Actions look like STAFF_CREATED (A–Z, 0–9, underscore).';
    if (draft.from && draft.to && draft.from > draft.to) problems.to = '"To" must not be before "From".';
    setClientErrors(problems);
    if (Object.keys(problems).length > 0) return;
    setPage(1);
    setApplied({ ...draft, actorUserId: draft.actorUserId.trim(), action: draft.action.trim(), entity: draft.entity.trim(), entityId: draft.entityId.trim() });
  };

  const reset = () => {
    setDraft(EMPTY);
    setApplied(EMPTY);
    setClientErrors({});
    setPage(1);
  };

  return (
    <section aria-label="Security audit log" className="space-y-4">
      <div>
        <h2 className="text-xl font-black text-white">Security audit log</h2>
        <p className="text-xs text-stone-400">A read-only record of administrative and security-relevant actions. Secrets are never recorded.</p>
      </div>

      <form onSubmit={apply} aria-label="Audit filters" className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-stone-900/70 border border-stone-800 rounded-2xl p-3">
        <Field label="Action" htmlFor="audit-action" error={clientErrors.action}>
          <input id="audit-action" className={inputClass} placeholder="STAFF_CREATED" value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} />
        </Field>
        <Field label="Entity" htmlFor="audit-entity">
          <input id="audit-entity" className={inputClass} placeholder="User" value={draft.entity} onChange={(e) => setDraft({ ...draft, entity: e.target.value })} />
        </Field>
        <Field label="Entity ID" htmlFor="audit-entityId">
          <input id="audit-entityId" className={inputClass} value={draft.entityId} onChange={(e) => setDraft({ ...draft, entityId: e.target.value })} />
        </Field>
        <Field label="Actor user ID" htmlFor="audit-actor" error={clientErrors.actorUserId}>
          <input id="audit-actor" className={inputClass} value={draft.actorUserId} onChange={(e) => setDraft({ ...draft, actorUserId: e.target.value })} />
        </Field>
        <Field label="From" htmlFor="audit-from">
          <input id="audit-from" type="date" className={inputClass} value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
        </Field>
        <Field label="To" htmlFor="audit-to" error={clientErrors.to}>
          <input id="audit-to" type="date" className={inputClass} value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
        </Field>
        <div className="md:col-span-3 flex items-center gap-3">
          <button type="submit" className={primaryButton}>
            Apply filters
          </button>
          <button type="button" onClick={reset} className={secondaryButton}>
            Reset
          </button>
        </div>
      </form>

      {status === 'loading' && <Spinner label="Loading audit history…" />}
      {status === 'error' && <ErrorNotice error={error} onRetry={() => setNonce((n) => n + 1)} />}
      {status === 'ready' && data && data.items.length === 0 && <EmptyState message="No audit entries match these filters." />}

      {status === 'ready' && data && data.items.length > 0 && (
        <>
          <div className="overflow-x-auto bg-stone-900/70 border border-stone-800 rounded-2xl">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Audit entries</caption>
              <thead className="text-[10px] uppercase tracking-wider text-stone-500 border-b border-stone-800">
                <tr>
                  <th scope="col" className="px-4 py-3">Time</th>
                  <th scope="col" className="px-4 py-3">Actor</th>
                  <th scope="col" className="px-4 py-3">Action</th>
                  <th scope="col" className="px-4 py-3">Entity</th>
                  <th scope="col" className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={a.id} className="border-b border-stone-800/60 last:border-0 align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-stone-300">{formatDate(a.createdAt)}</td>
                    <td className="px-4 py-3 text-stone-300">
                      {a.actor.email ?? <span className="text-stone-500">system / unauthenticated</span>}
                      {a.actor.role && <span className="block text-[10px] text-stone-500">{a.actor.role}</span>}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-amber-300">{a.action}</td>
                    <td className="px-4 py-3 text-stone-300">
                      {a.entity}
                      {a.entityId && <span className="block text-[10px] text-stone-500 break-all">{a.entityId}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {a.payload ? (
                        <details>
                          <summary className="cursor-pointer text-stone-400">View</summary>
                          <pre className="mt-1 max-w-xs sm:max-w-md overflow-x-auto whitespace-pre-wrap break-words text-[10px] text-stone-300 bg-stone-950 border border-stone-800 rounded-lg p-2">{JSON.stringify(a.payload, null, 2)}</pre>
                        </details>
                      ) : (
                        <span className="text-stone-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
        </>
      )}
    </section>
  );
};
