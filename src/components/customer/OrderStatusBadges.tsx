import React from 'react';
import type { ApiOrder } from '../../services/commerceTypes';
import { Badge, orderBadge, paymentBadge, refundBadge, Tone } from '../../utils/orderLabels';

const TONE: Record<Tone, string> = {
  neutral: 'bg-stone-800 border-stone-700 text-stone-100',
  good: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200',
  warn: 'bg-amber-500/10 border-amber-500/40 text-amber-200',
  bad: 'bg-red-500/10 border-red-500/40 text-red-200'
};

const Item: React.FC<{ term: string; badge: Badge; testId: string }> = ({ term, badge, testId }) => (
  <div className={`px-3 py-1 rounded-full border text-xs ${TONE[badge.tone]}`}>
    {/* the word "Order / Payment / Refund" is always visible: colour is never the only indicator */}
    <dt className="inline text-[11px] opacity-80">{term}: </dt>
    <dd className="inline font-black" data-testid={testId}>
      {badge.label}
    </dd>
  </div>
);

/** Three separate state machines, three separate badges: order status, payment status, refund status (only when relevant). */
export const OrderStatusBadges: React.FC<{ order: ApiOrder }> = ({ order }) => {
  const refund = refundBadge(order);
  return (
    <dl aria-label="Order, payment and refund status" className="flex flex-wrap items-center gap-2">
      <Item term="Order" badge={orderBadge(order)} testId="badge-order" />
      <Item term="Payment" badge={paymentBadge(order)} testId="badge-payment" />
      {refund && <Item term="Refund" badge={refund} testId="badge-refund" />}
    </dl>
  );
};
