import React from 'react';
import { CheckCircle2, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { usePaymentFlow } from '../../hooks/usePaymentFlow';
import type { ApiOrder } from '../../services/commerceTypes';
import { formatInr } from '../../utils/money';

interface Props {
  order: ApiOrder;
  fetchOrder: () => Promise<ApiOrder>;
  onOrder: (order: ApiOrder) => void;
  onSessionExpired?: () => void;
}

const STILL_CONFIRMING = 'Still confirming. This can take a little longer. Use "Refresh status", or check back later: your payment will be matched to this order automatically.';

/**
 * Pay for an online order. Everything shown follows the SERVER's payment summary (`order.payment`) and the answers of the verification
 * endpoint. Pay is enabled only when the server says canStartPayment === true and nothing is in flight locally; a provider callback
 * on its own never renders "paid".
 */
export const PaymentPanel: React.FC<Props> = ({ order, fetchOrder, onOrder, onSessionExpired }) => {
  const flow = usePaymentFlow({ orderId: order.id, order, fetchOrder, onOrder, onSessionExpired });
  const { phase, message, pollingStopped, busy, canPay } = flow;

  const confirming = phase === 'CONFIRMING';
  const text =
    phase === 'CONFIRMING' && pollingStopped ? STILL_CONFIRMING : message?.text ?? (confirming ? 'Payment is being confirmed. Please do not pay again yet.' : null);
  const isError = message?.kind === 'error' && !confirming;

  const buttonLabel =
    phase === 'PREPARING' ? 'Opening payment…' : phase === 'CHECKOUT_OPEN' ? 'Payment window open' : phase === 'VERIFYING' ? 'Verifying payment…' : phase === 'RETRYABLE' ? 'Try payment again' : `Pay ${formatInr(order.netAmount)}`;

  if (phase === 'CONFIRMED') {
    return (
      <div data-testid="payment-panel" data-phase={phase} className="rounded-2xl border border-emerald-500/40 bg-emerald-950/40 p-4 text-sm text-emerald-100 flex items-start gap-2">
        <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" aria-hidden="true" />
        <p role="status">Payment confirmed. Thank you! Your order is {order.payment?.state === 'PAID' ? 'confirmed' : 'being confirmed'}.</p>
      </div>
    );
  }

  return (
    <section aria-label="Payment" data-testid="payment-panel" data-phase={phase} className="rounded-2xl border border-stone-700 bg-stone-950/60 p-4 space-y-3">
      <div className="flex items-center gap-2 text-xs text-stone-300">
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
        <span>Payments are processed securely by Razorpay. Your payment is confirmed by our server, not by your browser.</span>
      </div>

      {/* live region: payment status changes are announced to screen readers */}
      <div role="status" aria-live="polite" data-testid="payment-status-text" className={`text-xs ${isError ? 'hidden' : 'text-stone-200'}`}>
        {!isError && text}
      </div>
      {isError && (
        <div role="alert" className="bg-red-950/60 border border-red-500/40 text-red-200 text-xs rounded-2xl px-4 py-3">
          {text}
        </div>
      )}

      {phase === 'BLOCKED' && !text && <p className="text-xs text-stone-400">This order cannot be paid right now.</p>}

      <div className="flex flex-wrap items-center gap-2">
        {(phase === 'IDLE' || phase === 'RETRYABLE' || busy) && (
          <button
            type="button"
            disabled={!canPay}
            aria-disabled={!canPay}
            onClick={() => void flow.startPayment()}
            data-testid="pay-button"
            className="min-h-11 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black px-5 py-2.5 rounded-2xl text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {buttonLabel}
          </button>
        )}
        {(confirming || phase === 'ERROR') && (
          <button
            type="button"
            onClick={() => void flow.refreshStatus()}
            data-testid="refresh-payment-status"
            className="min-h-11 inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-xs font-bold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${confirming && !pollingStopped ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh status
          </button>
        )}
      </div>
    </section>
  );
};
