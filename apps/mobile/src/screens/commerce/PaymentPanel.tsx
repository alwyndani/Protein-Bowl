import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { usePaymentFlow } from '../../commerce/usePaymentFlow';
import { PAYMENT_REQUIRED_COPY } from '../../commerce/labels';
import { formatInr } from '../../commerce/money';
import type { CustomerOrder } from '../../commerce/types';
import { Button, colors } from '../../ui/components';
import { Row } from '../../ui/commerceUi';

/**
 * Customer payment card for ONE order. PRESENTATION ONLY: every rule (is payment allowed, is it being confirmed, is it paid, may a
 * checkout be opened) comes from the orchestration layer's presentation model, which itself only follows the backend order. This
 * component never builds checkout options, never passes an amount, currency, provider order or payment method anywhere, never talks to the
 * payment API or the native layer, and never starts anything on mount: the ONLY way a payment starts is the customer pressing "Pay Now".
 *
 * The amount shown is the order total the backend already returned. It is informational: the checkout amount comes only from the backend
 * payment session.
 */
export function PaymentPanel({ order }: { order: CustomerOrder }) {
  const { presentation: p, startPayment, retryVerification, checkPaymentStatus } = usePaymentFlow(order.id);

  // Nothing to show for an order without a payment summary, or one the backend says cannot be paid online (terminal / historical /
  // not payable) unless the problem is this build's missing secure payment window.
  if (!order.payment) return null;
  if (p.kind === 'UNAVAILABLE' && !p.nativeUnavailable) return null;

  const message =
    p.kind === 'READY_TO_PAY' ? PAYMENT_REQUIRED_COPY : p.kind === 'UNAVAILABLE' ? "Secure payment can't be opened on this app build or device. Please try again from the latest version of the app." : p.message;
  const inProgress = p.kind === 'STARTING' || p.kind === 'VERIFYING' || p.kind === 'CHECKING_PAYMENT' || p.kind === 'CHECKOUT_OPEN';
  const showAmount = p.kind === 'READY_TO_PAY' || p.kind === 'PAYMENT_NOT_COMPLETED';
  const heading = p.kind === 'PAYMENT_CONFIRMED' ? 'Payment confirmed' : 'Payment';

  return (
    <View style={styles.box} accessibilityLabel="Payment">
      <Text accessibilityRole="header" style={styles.heading}>
        {heading}
      </Text>
      <View accessibilityLiveRegion="polite" style={styles.row}>
        {inProgress ? <ActivityIndicator accessibilityLabel="In progress" color={colors.accent} /> : null}
        <Text style={styles.message}>{p.kind === 'PAYMENT_CONFIRMED' ? 'Your payment has been confirmed.' : message}</Text>
      </View>
      {showAmount ? <Row label="Amount due" value={formatInr(order.netAmount)} strong /> : null}
      {p.canStartPayment ? <Button label="Pay Now" onPress={() => void startPayment()} /> : null}
      {p.canRetryVerification ? <Button label="Retry verification" variant="secondary" onPress={() => void retryVerification()} /> : null}
      {p.canCheckStatus ? <Button label="Check payment status" variant="secondary" onPress={() => void checkPaymentStatus()} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 10 },
  heading: { color: colors.text, fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  message: { color: colors.text, fontSize: 14, flex: 1 }
});
