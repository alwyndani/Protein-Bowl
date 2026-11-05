import React, { useCallback, useEffect, useState } from 'react';
import { CancellationReviewService, type CancellationRequestPage, type CancellationRequestRow } from '../../services/cancellationReviewService';
import { useStepUp } from './StepUp';
import { useAdminAction } from './useAdminAction';
import { describeAdminError } from './adminErrors';
import type { AdminErrorInfo } from './adminErrors';
import { Chip, EmptyState, ErrorNotice, Field, Modal, Pagination, Spinner, formatDate, inputClass, primaryButton, secondaryButton } from './adminUi';

type Filter = 'PENDING' | 'APPROVED' | 'DECLINED' | '';
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'PENDING', label: 'Waiting' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'DECLINED', label: 'Declined' },
  { id: '', label: 'All' }
];

/** Codes after which the row the administrator was looking at is out of date. */
const STALE_CODES = ['CANCELLATION_REQUEST_DECIDED', 'CANCELLATION_NOT_ALLOWED', 'ORDER_STATE_CONFLICT', 'CANCELLATION_STATE_NOT_SUPPORTED'];

const money = (v: string) => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const DecisionDialog: React.FC<{ row: CancellationRequestRow; mode: 'approve' | 'decline'; onClose: () => void; onDone: () => void; onStale: () => void }> = ({ row, mode, onClose, onDone, onStale }) => {
  const { withStepUp } = useStepUp();
  const { run, pending, error } = useAdminAction();
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const declining = mode === 'decline';
  const noteOk = !declining || note.trim().length >= 3;

  useEffect(() => {
    if (error?.code && STALE_CODES.includes(error.code)) onStale();
  }, [error, onStale]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!noteOk) return;
    const outcome = await run(() => withStepUp<unknown>((proof) => (declining ? CancellationReviewService.decline(row.id, note, proof) : CancellationReviewService.approve(row.id, note, proof))));
    if (outcome.ok) onDone();
  };

  return (
    <Modal title={declining ? `Decline cancellation of ${row.order.orderNumber}` : `Approve cancellation of ${row.order.orderNumber}`} onClose={onClose} closeDisabled={pending}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {declining ? (
          <p className="text-xs text-stone-400">The order continues. The explanation below is shown to the customer.</p>
        ) : (
          <p className="text-xs text-amber-200" data-testid="approve-warning">
            Approving cancels the order (currently {row.order.status}) and starts a FULL refund of {money(row.order.netAmount)} to the customer's payment method. This cannot be undone. The refund status is tracked under Refunds; a provider failure moves it to review and is never hidden.
          </p>
        )}
        <Field label={declining ? 'Explanation for the customer' : 'Internal note (optional)'} htmlFor="decision-note" hint={declining ? 'At least 3 characters, up to 200.' : 'Recorded in the audit log.'} error={touched && !noteOk ? 'Enter an explanation of at least 3 characters.' : undefined}>
          <textarea id="decision-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} rows={3} disabled={pending} className={inputClass} aria-invalid={touched && !noteOk} />
        </Field>
        <ErrorNotice error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending} className={secondaryButton}>Cancel</button>
          <button type="submit" disabled={pending} className={primaryButton}>{pending ? 'Working…' : declining ? 'Decline request' : 'Approve and refund in full'}</button>
        </div>
      </form>
    </Modal>
  );
};

/** SUPER_ADMIN queue of customer requests to cancel PAID orders the kitchen has already started. Decisions need a fresh password step-up. */
export const CancellationReview: React.FC = () => {
  const [filter, setFilter] = useState<Filter>('PENDING');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CancellationRequestPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AdminErrorInfo | null>(null);
  const [dialog, setDialog] = useState<{ row: CancellationRequestRow; mode: 'approve' | 'decline' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await CancellationReviewService.list(filter, page));
      setError(null);
    } catch (err) {
      setError(describeAdminError(err));
    } finally {
      setLoading(false);
    }
  }, [filter, page]);
  useEffect(() => { void load(); }, [load]);

  return (
    <section aria-label="Cancellation requests" className="space-y-4 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">Cancellation requests</h2>
          <p className="text-xs text-stone-400">Customers ask to cancel paid orders the kitchen already started. Nothing was promised to them; you decide.</p>
        </div>
        <div className="flex gap-2" role="tablist" aria-label="Filter">
          {FILTERS.map((f) => (
            <button key={f.label} role="tab" aria-selected={filter === f.id} onClick={() => { setFilter(f.id); setPage(1); }} className={`${filter === f.id ? primaryButton : secondaryButton}`}>{f.label}</button>
          ))}
        </div>
      </div>
      <ErrorNotice error={error} onRetry={() => void load()} />
      {loading && !data ? <Spinner /> : null}
      {data && data.items.length === 0 && <EmptyState message="No cancellation requests." />}
      <ul className="space-y-3">
        {data?.items.map((row) => (
          <li key={row.id} className="border border-stone-800 rounded-2xl p-4 bg-stone-900/70 space-y-2" data-testid="cancellation-row">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-black">{row.order.orderNumber} <span className="text-xs text-stone-400">{money(row.order.netAmount)}</span></p>
              <div className="flex gap-2"><Chip tone="amber">{row.order.status}</Chip><Chip tone={row.status === 'PENDING' ? 'neutral' : 'emerald'}>{row.status}</Chip></div>
            </div>
            <p className="text-xs text-stone-300">Reason: <b>{row.reasonCode}</b>{row.note ? ` — “${row.note}”` : ''} · asked {formatDate(row.createdAt)}</p>
            {row.status !== 'PENDING' && <p className="text-xs text-stone-400">Decided {formatDate(row.decidedAt)}{row.decisionNote ? ` — ${row.decisionNote}` : ''}</p>}
            {row.status === 'PENDING' && (
              <div className="flex gap-2">
                <button type="button" className={primaryButton} onClick={() => setDialog({ row, mode: 'approve' })}>Approve…</button>
                <button type="button" className={secondaryButton} onClick={() => setDialog({ row, mode: 'decline' })}>Decline…</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {data && data.totalPages > 1 && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} disabled={loading} />}
      {dialog && <DecisionDialog row={dialog.row} mode={dialog.mode} onClose={() => setDialog(null)} onDone={() => { setDialog(null); void load(); }} onStale={() => void load()} />}
    </section>
  );
};
