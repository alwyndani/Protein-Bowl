import React, { useRef, useState } from 'react';
import { OrderService } from '../../services/orderService';
import { ApiOrder, CUSTOMER_CANCEL_REASON_CODES, CustomerCancelReasonCode } from '../../services/commerceTypes';
import { CANCEL_NOTE_MAX, CANCEL_REASON_LABELS } from '../../utils/orderLabels';
import { describeError } from '../../utils/paymentErrors';

interface Props {
  order: ApiOrder;
  /** Receives the order re-read from the backend after the request, so the screen shows the server's truth. */
  onOrder: (order: ApiOrder) => void;
  onSessionExpired?: () => void;
}

/**
 * Staff-reviewed cancellation for a PAID order the kitchen has already accepted or started. The wording never promises a cancellation or a
 * refund: the customer can only ASK, a person decides, and the refund (if approved) is shown through the normal refund state.
 * The panel follows the server's `cancellationRequest.state`; it never decides eligibility itself.
 */
export const CancellationRequestPanel: React.FC<Props> = ({ order, onOrder, onSessionExpired }) => {
  const state = order.cancellationRequest?.state;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<CustomerCancelReasonCode | ''>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);

  if (!state || order.status === 'CANCELLED') return null;

  if (state === 'REQUESTED') {
    return (
      <div role="status" data-testid="cancellation-requested" className="rounded-2xl border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-xs text-amber-100">
        <p className="font-black">Cancellation requested</p>
        <p className="mt-1">Our team is reviewing your request. Your order continues as normal until they decide. We will show the outcome here.</p>
      </div>
    );
  }
  if (state === 'DECLINED') {
    return (
      <div role="status" data-testid="cancellation-declined" className="rounded-2xl border border-stone-600 bg-stone-900/70 px-4 py-3 text-xs text-stone-200">
        <p className="font-black">Your cancellation request was reviewed and could not be approved</p>
        {order.cancellationRequest?.declinedReason && <p className="mt-1">{order.cancellationRequest.declinedReason}</p>}
        <p className="mt-1 text-stone-400">Your order continues. Please contact Protein Bowl support if you need help.</p>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await OrderService.requestCancellation(order.id, reason, note);
      setOpen(false);
    } catch (err) {
      const info = describeError(err);
      setError(info.message);
      if (info.action === 'SIGN_IN') onSessionExpired?.();
    }
    try {
      onOrder(await OrderService.getOrder(order.id)); // trust the backend, also after a refusal
    } catch (err) {
      if (describeError(err).action === 'SIGN_IN') onSessionExpired?.();
    }
    lock.current = false;
    setBusy(false);
  };

  if (!open) {
    return (
      <div>
        <button type="button" onClick={() => setOpen(true)} data-testid="request-cancellation-button" className="min-h-11 px-4 py-2 rounded-xl border border-red-500/50 text-red-300 hover:bg-red-950/40 text-xs font-bold">
          Ask to cancel this order
        </button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} aria-label="Request cancellation" className="space-y-3 rounded-2xl border border-stone-700 bg-stone-900/70 p-4 text-xs text-stone-200">
      <p className="font-black text-white">Ask to cancel order {order.orderNumber}</p>
      <p>The kitchen has already started on this order, so it cannot be cancelled automatically. Our team will review your request. <strong>We cannot promise it will be approved.</strong> If it is approved, you receive a full refund and the refund status appears on this page.</p>
      <label className="block space-y-1">
        <span className="font-bold">Why do you want to cancel?</span>
        <select required value={reason} onChange={(e) => setReason(e.target.value as CustomerCancelReasonCode | '')} disabled={busy} className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2.5 text-sm text-white">
          <option value="">Select a reason</option>
          {CUSTOMER_CANCEL_REASON_CODES.map((code) => (
            <option key={code} value={code}>{CANCEL_REASON_LABELS[code]}</option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="font-bold">Note (optional)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, CANCEL_NOTE_MAX))} maxLength={CANCEL_NOTE_MAX} rows={2} disabled={busy} className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-sm text-white" />
      </label>
      {error && <p role="alert" className="text-red-300">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={!reason || busy} className="min-h-11 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black disabled:opacity-50">{busy ? 'Sending…' : 'Send request'}</button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy} className="min-h-11 px-4 py-2 rounded-xl bg-stone-800 border border-stone-700 font-bold disabled:opacity-50">Keep my order</button>
      </div>
    </form>
  );
};
