import React, { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOrder } from '../../commerce/hooks';
import { START_DATE_PASSED_COPY, startDatePassed } from '../../mess/labels';
import { mk } from '../../mess/queryKeys';
import { Notice } from '../../ui/components';
import { PaymentPanel } from '../commerce/PaymentPanel';
import { FailureView, LoadingView } from './messShared';

/**
 * Pays for a Kerala Mess subscription through the EXISTING online payment flow: the purchase created a normal payment order on the server
 * (`purchaseOrder.id`), so the existing order query + PaymentPanel + orchestration do everything (create attempt, open the secure window,
 * verify, status check). Nothing here builds a payment, passes an amount or decides whether money moved. When the ORDER's paid / status
 * fields change (a verified payment) the subscription is re-read, because the server activates it as part of settlement.
 */
export function MessPaymentSection({ subscriptionId, orderId, startDate }: { subscriptionId: string; orderId: string; startDate?: string }) {
  const order = useOrder(orderId);
  const qc = useQueryClient();
  const seen = useRef<string | null>(null);

  const o = order.data;
  const signature = o ? `${o.status}|${o.paymentStatus}|${o.payment?.state ?? ''}` : null;
  useEffect(() => {
    if (signature === null) return;
    if (seen.current !== null && seen.current !== signature) {
      void qc.invalidateQueries({ queryKey: mk.subscription(subscriptionId) });
      void qc.invalidateQueries({ queryKey: mk.subscriptions });
      void qc.invalidateQueries({ queryKey: mk.calendar(subscriptionId) });
    }
    seen.current = signature;
  }, [signature, qc, subscriptionId]);

  if (order.isPending) return <LoadingView label="Loading payment" />;
  if (order.isError && !o) return <FailureView error={order.error} onRetry={() => void order.refetch()} />;
  if (!o) return null;
  if (!o.payment) return <Notice tone="info">Payment is required before your subscription starts. It is not active yet.</Notice>;
  // The server refuses to take payment for a term whose start date has passed (409 MESS_START_DATE_PASSED). The shared payment flow deliberately
  // never shows backend codes, so say it here, once, above the unchanged payment panel (guidance only: the server remains the authority).
  return (
    <>
      {startDatePassed(startDate) ? <Notice tone="info">{START_DATE_PASSED_COPY}</Notice> : null}
      <PaymentPanel order={o} />
    </>
  );
}
