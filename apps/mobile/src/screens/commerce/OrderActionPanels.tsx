import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatIstDateTime } from '../../commerce/dates';
import { qk } from '../../commerce/queryKeys';
import type { CustomerOrder } from '../../commerce/types';
import { CANCEL_REASONS, type CancelReasonCode, type CancelResult, type IssuedDeliveryCode } from '../../orders/orderActionsApi';
import { orderActionMessage, useOrderActionsApi } from '../../orders/useOrderActions';
import { Body, Button, colors, Notice } from '../../ui/components';

export function cancelResultCopy(r: Pick<CancelResult, 'refund'>): string {
  return r.refund.state === 'NO_REFUND'
    ? 'Your order was cancelled. No payment was taken.'
    : 'Your order was cancelled and a full refund has been started. Refunds usually reach your original payment method in 5–7 working days.';
}

/** Customer cancellation (server decides eligibility; the reason is a typed code; refunds are always the full amount, decided by the server). */
export function CancelOrderPanel({ order }: { order: CustomerOrder }) {
  const api = useOrderActionsApi();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<CancelReasonCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const lock = useRef(false);

  if (done) return <Notice tone="info">{done}</Notice>;
  if (!order.cancellation?.allowed) return null;

  const confirm = async () => {
    if (lock.current || !reason) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await api.cancel(order.id, reason);
      setDone(cancelResultCopy(result));
      void qc.invalidateQueries({ queryKey: qk.order(order.id) });
      void qc.invalidateQueries({ queryKey: qk.orders });
    } catch (e) {
      setError(orderActionMessage(e, 'cancel'));
      void qc.invalidateQueries({ queryKey: qk.order(order.id) }); // the server may have decided differently: show its state
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  if (!open) return <Button variant="secondary" label="Cancel order" onPress={() => setOpen(true)} />;
  return (
    <View style={styles.box} accessibilityLabel="Cancel this order">
      <Text style={styles.name}>Cancel this order?</Text>
      <Body muted>If you have already paid, the full amount is refunded. Choose a reason:</Body>
      {CANCEL_REASONS.map((r) => (
        <Button key={r.code} variant={reason === r.code ? 'primary' : 'secondary'} label={r.label} onPress={() => setReason(r.code)} disabled={busy} />
      ))}
      {error ? <Notice>{error}</Notice> : null}
      <Button label="Yes, cancel my order" onPress={() => void confirm()} disabled={!reason} busy={busy} />
      <Button variant="secondary" label="Keep my order" onPress={() => { setOpen(false); setReason(null); setError(null); }} disabled={busy} />
    </View>
  );
}

/**
 * Staff-reviewed cancellation for a PAID order the kitchen has already started. Never promises a cancellation or a refund: the customer asks,
 * a person decides, and any refund is shown through the normal refund state. Follows the server's cancellationRequest.state.
 */
export function CancellationRequestPanel({ order }: { order: CustomerOrder }) {
  const api = useOrderActionsApi();
  const qc = useQueryClient();
  const state = order.cancellationRequest?.state;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<CancelReasonCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);

  if (!state || order.status === 'CANCELLED') return null;
  if (state === 'REQUESTED') return <Notice tone="info">Cancellation requested. Our team is reviewing it. Your order continues until they decide; the outcome will appear here.</Notice>;
  if (state === 'DECLINED') {
    return <Notice tone="info">{`Your cancellation request could not be approved.${order.cancellationRequest?.declinedReason ? ` ${order.cancellationRequest.declinedReason}` : ''} Your order continues.`}</Notice>;
  }

  const send = async () => {
    if (lock.current || !reason) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await api.requestCancellation(order.id, reason);
      setOpen(false);
    } catch (e) {
      setError(orderActionMessage(e, 'cancel'));
    } finally {
      void qc.invalidateQueries({ queryKey: qk.order(order.id) }); // always show the server's state, also after a refusal
      void qc.invalidateQueries({ queryKey: qk.orders });
      lock.current = false;
      setBusy(false);
    }
  };

  if (!open) return <Button variant="secondary" label="Ask to cancel this order" onPress={() => setOpen(true)} />;
  return (
    <View style={styles.box} accessibilityLabel="Ask to cancel this order">
      <Text style={styles.name}>Ask to cancel this order?</Text>
      <Body muted>The kitchen has already started on it, so it cannot be cancelled automatically. Our team will review your request and we cannot promise it will be approved. If it is, you receive a full refund.</Body>
      {CANCEL_REASONS.map((r) => (
        <Button key={r.code} variant={reason === r.code ? 'primary' : 'secondary'} label={r.label} onPress={() => setReason(r.code)} disabled={busy} />
      ))}
      {error ? <Notice>{error}</Notice> : null}
      <Button label="Send request" onPress={() => void send()} disabled={!reason} busy={busy} />
      <Button variant="secondary" label="Keep my order" onPress={() => { setOpen(false); setReason(null); setError(null); }} disabled={busy} />
    </View>
  );
}

const group = (code: string) => code.replace(/(\d{3})(?=\d)/g, '$1 ');

/**
 * Delivery Code (only while the order is out for delivery). The code proves handover, never payment. The plaintext exists ONLY in this
 * component's memory after Get / New code; after a reload the customer sees "issued" but not the digits (they can create a new code).
 */
export function DeliveryCodePanel({ order }: { order: CustomerOrder }) {
  const api = useOrderActionsApi();
  const qc = useQueryClient();
  const active = order.delivery?.state === 'ON_THE_WAY';
  const state = useQuery({ queryKey: [...qk.order(order.id), 'deliveryCode'], queryFn: () => api.deliveryCode(order.id), enabled: active, staleTime: 0, refetchInterval: active ? 15_000 : false });
  const [code, setCode] = useState<IssuedDeliveryCode | null>(null);
  const [revealed, setRevealed] = useState(true);
  const [confirmNew, setConfirmNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);

  if (!active) return null;
  const view = code ?? state.data;
  if (!view) return state.isError ? <Notice>{orderActionMessage(state.error, 'code')}</Notice> : null;

  const run = async (fn: () => Promise<IssuedDeliveryCode>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      setCode(await fn());
      setRevealed(true);
      setConfirmNew(false);
      void qc.invalidateQueries({ queryKey: [...qk.order(order.id), 'deliveryCode'] });
    } catch (e) {
      setError(orderActionMessage(e, 'code'));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const s = view.state;
  return (
    <View style={styles.box} accessibilityLabel="Delivery code">
      <Text style={styles.name}>Delivery code</Text>
      {s === 'NOT_AVAILABLE' ? <Body muted>A delivery code is not available for this order right now.</Body> : null}
      {s === 'VERIFIED' ? <Body>Delivery confirmed. Thank you!</Body> : null}
      {s === 'NOT_ISSUED' ? (
        <>
          <Body muted>Give this code to the delivery person only when you receive your order. It proves the handover.</Body>
          <Button label="Get my delivery code" onPress={() => void run(api.issueDeliveryCode.bind(api, order.id))} busy={busy} />
        </>
      ) : null}
      {s === 'ISSUED' ? (
        <>
          {code ? (
            <>
              <Text accessibilityLabel={revealed ? `Your delivery code is ${code.code.split('').join(' ')}` : 'Delivery code hidden'} style={styles.code}>{revealed ? group(code.code) : '••• •••'}</Text>
              <Button variant="secondary" label={revealed ? 'Hide code' : 'Show code'} onPress={() => setRevealed((r) => !r)} />
            </>
          ) : (
            <Body muted>A code was created for this order. For your security it is not shown again. Create a new code if you need to see one.</Body>
          )}
          <Body muted>Only share it with the delivery person at your door.</Body>
          {confirmNew ? (
            <>
              <Notice tone="info">Your current code will stop working immediately.</Notice>
              <Button label="Create a new code" onPress={() => void run(api.regenerateDeliveryCode.bind(api, order.id))} busy={busy} />
              <Button variant="secondary" label="Keep current code" onPress={() => setConfirmNew(false)} disabled={busy} />
            </>
          ) : (
            <Button variant="secondary" label="Create a new code" onPress={() => setConfirmNew(true)} />
          )}
        </>
      ) : null}
      {s === 'LOCKED' ? <Notice tone="info">{`Too many wrong attempts. Delivery verification is paused${view.lockedUntil ? ` until ${formatIstDateTime(view.lockedUntil)}` : ' for a short while'}.`}</Notice> : null}
      {s === 'CODE_BLOCKED' ? (
        <>
          <Notice tone="info">This code has been blocked after too many wrong attempts. Create a new one to continue.</Notice>
          <Button label="Create a new code" onPress={() => void run(api.regenerateDeliveryCode.bind(api, order.id))} busy={busy} />
        </>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 10 },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  code: { color: colors.text, fontSize: 36, fontWeight: '800', letterSpacing: 4, textAlign: 'center', paddingVertical: 8 }
});
