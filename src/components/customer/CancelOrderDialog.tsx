import React, { useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AccessibleDialog } from '../common/AccessibleDialog';
import { useCancelOrder } from '../../hooks/useCancelOrder';
import { ApiOrder, CUSTOMER_CANCEL_REASON_CODES, CustomerCancelReasonCode } from '../../services/commerceTypes';
import { CANCEL_NOTE_MAX, CANCEL_REASON_LABELS } from '../../utils/orderLabels';

interface Props {
  order: ApiOrder;
  onClose: () => void;
  /** Receives the order re-read from the backend after the request (also after a rejection, so the screen shows the server's truth). */
  onOrder: (order: ApiOrder) => void;
  onSessionExpired?: () => void;
}

/**
 * Accessible confirmation dialog. It is only ever opened when the SERVER said CANCELLATION_AVAILABLE; whether the cancellation is
 * actually accepted is again the server's decision. The request body is { reasonCode, note? } and nothing else.
 */
export const CancelOrderDialog: React.FC<Props> = ({ order, onClose, onOrder, onSessionExpired }) => {
  const titleId = useId();
  const reasonId = useId();
  const noteId = useId();
  const [reason, setReason] = useState<CustomerCancelReasonCode | ''>('');
  const [note, setNote] = useState('');
  const { status, error, submit } = useCancelOrder({ order, onOrder, onSessionExpired });
  const submitting = status === 'submitting';
  const paid = order.paymentStatus === 'PAID';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return;
    const ok = await submit(reason, note);
    if (ok) onClose();
  };

  return (
    <AccessibleDialog labelledBy={titleId} onClose={onClose} closeDisabled={submitting}>
      <form onSubmit={handleSubmit} className="p-5 space-y-4" data-testid="cancel-dialog">
        <h2 id={titleId} className="text-base font-black text-white">
          Cancel order {order.orderNumber}?
        </h2>
        <p className="text-xs text-stone-300">
          {paid
            ? 'Cancelling a paid order requests a refund of your payment. The refund is processed separately and shown on this page.'
            : 'No payment has been taken for this order.'}
        </p>

        <div className="space-y-1">
          <label htmlFor={reasonId} className="block text-xs font-bold text-stone-200">
            Why are you cancelling?
          </label>
          <select
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value as CustomerCancelReasonCode | '')}
            required
            disabled={submitting}
            className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2.5 text-sm text-white"
          >
            <option value="">Select a reason</option>
            {CUSTOMER_CANCEL_REASON_CODES.map((code) => (
              <option key={code} value={code}>
                {CANCEL_REASON_LABELS[code]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor={noteId} className="block text-xs font-bold text-stone-200">
            Note (optional)
          </label>
          <textarea
            id={noteId}
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, CANCEL_NOTE_MAX))}
            maxLength={CANCEL_NOTE_MAX}
            rows={3}
            disabled={submitting}
            className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-sm text-white"
          />
          <div className="text-[11px] text-stone-500 text-right" aria-hidden="true">
            {note.length}/{CANCEL_NOTE_MAX}
          </div>
        </div>

        {error && (
          <div role="alert" className="bg-red-950/60 border border-red-500/40 text-red-200 text-xs rounded-2xl px-4 py-3">
            {error.message}
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
          <button type="button" onClick={onClose} disabled={submitting} className="min-h-11 px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-sm font-bold disabled:opacity-50">
            Keep order
          </button>
          <button
            type="submit"
            disabled={!reason || submitting}
            className="min-h-11 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-black disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {submitting ? 'Cancelling…' : 'Cancel order'}
          </button>
        </div>
      </form>
    </AccessibleDialog>
  );
};
