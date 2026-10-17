import React, { useRef, useState } from 'react';
import { isRazorpayNativeAvailable, openRazorpayCheckoutDiagnostic } from '../../payments/dev/razorpayDiagnostic';
import type { ErrorShape, PayloadPresence, DiagnosticOutcome as RazorpayOutcome } from '../../payments/dev/razorpayDiagnostic';
import { Body, Button, Notice, Screen, TextField, Title } from '../../ui/components';

/**
 * P11C-1 DEVELOPMENT-ONLY native harness. It exists to prove that the installed Razorpay native module opens on a real device and to show
 * the SHAPE of its callbacks. It is reachable only through a `__DEV__` branch in the Account screen, is not connected to carts, orders,
 * checkout or any backend request, and keeps its result in component memory only (gone when this panel closes).
 *
 * Only PUBLIC values can reach it: the key id below is a public EXPO_PUBLIC_* variable. A key that is not a TEST-mode key id is refused,
 * so this harness can never open a live-mode checkout. No payment id, order id or signature is ever displayed or stored: only booleans
 * for which fields arrived.
 */

/** Metro inlines only this literal form (it is replaced wherever it appears, including inside a function). */
const readKeyId = () => (process.env.EXPO_PUBLIC_P11C1_TEST_KEY_ID ?? '').trim();

/** Minor units (INR 1.00). An order created for the optional order-id path must use the same amount. */
const TEST_AMOUNT_MINOR = 100;
const ORDER_ID_PATTERN = /^[A-Za-z0-9_]{1,64}$/;

function isTestModeKeyId(key: string): boolean {
  const parts = key.split('_');
  return parts.length >= 3 && parts[0] === 'rzp' && parts[1] === 'test';
}

type Run = { n: number; outcome: RazorpayOutcome; presence: PayloadPresence | null; errorShape: ErrorShape | null };

const list = (v: string[] | null) => (v === null ? 'none' : v.length === 0 ? '(empty)' : v.join(', '));
const val = (v: string | null) => (v === null ? 'none' : v);

const yn = (v: boolean) => (v ? 'yes' : 'no');

function describe(outcome: RazorpayOutcome): string {
  switch (outcome.kind) {
    case 'SUCCESS':
      return 'SUCCESS: the callback carried a complete, well-formed payload.';
    case 'MALFORMED_RESULT':
      return 'RESOLVED WITH A PARTIAL PAYLOAD: the checkout reported completion but not every expected field arrived (see field presence).';
    case 'ERROR':
      return 'ERROR callback (failure, or the user closed the checkout).';
    case 'UNAVAILABLE':
      return 'UNAVAILABLE: the native module is not in this build.';
    case 'IN_PROGRESS':
      return 'IN PROGRESS: a checkout is already open.';
  }
}

export function RazorpayTestScreen({ onClose, keyId }: { onClose: () => void; keyId?: string }) {
  const [orderId, setOrderId] = useState('');
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const counter = useRef(0);
  const lock = useRef(false);

  const available = isRazorpayNativeAvailable();
  const KEY_ID = (keyId ?? readKeyId()).trim();
  const keyConfigured = KEY_ID.length > 0;
  const keyOk = keyConfigured && isTestModeKeyId(KEY_ID);
  const trimmedOrder = orderId.trim();
  const orderError = trimmedOrder && !ORDER_ID_PATTERN.test(trimmedOrder) ? 'Use letters, digits and underscores only.' : null;
  const canOpen = available && keyOk && !orderError && !running;

  async function open() {
    if (lock.current || !canOpen) return;
    lock.current = true;
    setRunning(true);
    try {
      const result = await openRazorpayCheckoutDiagnostic({
        key: KEY_ID,
        amount: TEST_AMOUNT_MINOR,
        currency: 'INR',
        name: 'Protein Bowl (test)',
        description: 'Native SDK test, not an order',
        ...(trimmedOrder ? { order_id: trimmedOrder } : {})
      });
      counter.current += 1;
      setRun({ n: counter.current, outcome: result.outcome, presence: result.presence, errorShape: result.errorShape });
    } finally {
      lock.current = false;
      setRunning(false);
    }
  }

  return (
    <Screen>
      <Title>P11C-1 Razorpay Test</Title>
      <Notice tone="info">Development build only. Not connected to orders, checkout or the backend. Test mode only. Nothing is stored.</Notice>
      <Body>Native bridge: {available ? 'AVAILABLE' : 'UNAVAILABLE (Expo Go or a build without the module)'}</Body>
      <Body>Test key id: {!keyConfigured ? 'MISSING (set the public test key id before starting Metro)' : keyOk ? 'configured (test mode)' : 'REFUSED: not a test-mode key id'}</Body>
      <Body muted>Amount: INR 1.00 ({TEST_AMOUNT_MINOR} minor units)</Body>
      <TextField
        label="Test order id (optional)"
        value={orderId}
        onChangeText={setOrderId}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="order_..."
        error={orderError}
      />
      <Body muted>Empty: order-less checkout (success returns a payment id only). With an order id created for INR 1.00, success also carries the order id and signature.</Body>
      <Button label="Open Razorpay Test Checkout" busy={running} disabled={!canOpen} onPress={open} />
      {run ? (
        <>
          <Body>Run {run.n}</Body>
          <Body>{describe(run.outcome)}</Body>
          {run.presence ? (
            <>
              <Body muted>paymentIdPresent: {yn(run.presence.paymentIdPresent)}</Body>
              <Body muted>orderIdPresent: {yn(run.presence.orderIdPresent)}</Body>
              <Body muted>signaturePresent: {yn(run.presence.signaturePresent)}</Body>
            </>
          ) : null}
          {run.outcome.kind === 'ERROR' && run.errorShape ? (
            <>
              <Body muted>{`payload keys: ${list(run.errorShape.topLevelKeys)}`}</Body>
              <Body muted>{`code: ${run.errorShape.code.type}${run.errorShape.code.value === null ? '' : ` = ${String(run.errorShape.code.value)}`}`}</Body>
              <Body muted>{`description: ${run.errorShape.descriptionKind}${run.errorShape.descriptionText ? ` = ${run.errorShape.descriptionText}` : ''}`}</Body>
              <Body muted>{`details keys: ${list(run.errorShape.detailsKeys)}`}</Body>
              {run.errorShape.nested ? (
                <>
                  <Body muted>{`nested keys: ${list(run.errorShape.nested.keys)}`}</Body>
                  <Body muted>{`nested code: ${val(run.errorShape.nested.code)}`}</Body>
                  <Body muted>{`nested source: ${val(run.errorShape.nested.source)}`}</Body>
                  <Body muted>{`nested step: ${val(run.errorShape.nested.step)}`}</Body>
                  <Body muted>{`nested reason: ${val(run.errorShape.nested.reason)}`}</Body>
                  <Body muted>{`nested metadata keys: ${list(run.errorShape.nested.metadataKeys)}`}</Body>
                  <Body muted>{`nested description: ${val(run.errorShape.nested.descriptionText)}`}</Body>
                </>
              ) : (
                <Body muted>nested error object: none</Body>
              )}
            </>
          ) : null}
          <Button label="Clear result" variant="secondary" onPress={() => setRun(null)} />
        </>
      ) : null}
      <Button label="Close" variant="secondary" onPress={onClose} />
    </Screen>
  );
}
