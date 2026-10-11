import React from 'react';
import type { ApiOrder } from '../../services/commerceTypes';
import { refundNoticeCopy } from '../../utils/orderLabels';

/**
 * Cancellation and refund are SEPARATE: "Order cancelled" never claims a refund; each refund sentence comes from the server's refund
 * state only. No provider ids, flags or failure detail exist in the data this component receives.
 */
export const RefundNotice: React.FC<{ order: ApiOrder }> = ({ order }) => {
  const cancelled = order.status === 'CANCELLED';
  const state = order.refund?.state ?? 'NO_REFUND';
  const copy = refundNoticeCopy(state, cancelled);
  if (!copy) return null;
  const tone = state === 'REFUND_REVIEW_REQUIRED' ? 'border-amber-500/40 bg-amber-950/40 text-amber-100' : state === 'REFUNDED' ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-100' : 'border-stone-700 bg-stone-950/60 text-stone-200';
  return (
    <div role="status" data-testid="refund-notice" data-refund-state={state} className={`rounded-2xl border px-4 py-3 text-xs ${tone}`}>
      {copy}
    </div>
  );
};
