import React, { useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CommonActions } from '@react-navigation/native';
import { ApiError } from '../../api/ApiError';
import { useCheckoutAttempt, useCheckoutAttemptStore } from '../../commerce/checkoutAttempt';
import { commerceMessage, isAmbiguousOutcome, isOfflineError, OFFLINE_WRITE_COPY } from '../../commerce/commerceErrors';
import { useCheckoutPreview, useOrder, usePlaceOrder, useRefetchOnFocus } from '../../commerce/hooks';
import { formatInr, isZeroMoney } from '../../commerce/money';
import { previewSignature } from '../../commerce/previewSignature';
import { orderStatusLabel, paymentBadge, PAYMENT_REQUIRED_COPY } from '../../commerce/labels';
import { goToOrders } from '../../navigation/goToOrders';
import type { MenuStackParamList } from '../../navigation/types';
import { Body, Button, colors, Notice, Screen, TextField, Title } from '../../ui/components';
import { ErrorState, Pill, Row } from '../../ui/commerceUi';

type CheckoutProps = NativeStackScreenProps<MenuStackParamList, 'Checkout'>;
type PlacedProps = NativeStackScreenProps<MenuStackParamList, 'OrderPlaced'>;

export const DELIVERY_INSTRUCTIONS_MAX = 500; // the backend's limit

/**
 * Review and place the ONLINE order. Every figure comes from the server preview (no local pricing). Before the order is sent the
 * preview is requested again; if the server total changed the customer reviews the new total first. There is no payment-method
 * selector: the order is ONLINE by omission. After an ambiguous result the SAME key / address / instructions are kept and locked.
 */
export function CheckoutScreen({ route, navigation }: CheckoutProps) {
  const { addressId } = route.params;
  const preview = useCheckoutPreview(addressId);
  const place = usePlaceOrder();
  const attempt = useCheckoutAttempt();
  const store = useCheckoutAttemptStore();
  const [instructions, setInstructions] = useState('');
  const [notice, setNotice] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const lock = useRef(false);
  useRefetchOnFocus(preview.refetch);

  const frozen = !!attempt?.ambiguous;
  const shownInstructions = frozen ? attempt!.deliveryInstructions : instructions;
  const effectiveAddressId = frozen ? attempt!.addressId : addressId;

  async function submit() {
    if (lock.current || place.isPending) return;
    lock.current = true;
    setNotice(null);
    try {
      const result = await place.mutateAsync({
        addressId: effectiveAddressId,
        deliveryInstructions: shownInstructions,
        reviewedSignature: frozen || !preview.data ? null : previewSignature(preview.data)
      });
      if (result.kind === 'review_changed') {
        const unmet = result.preview.minimumOrder.enabled && !result.preview.minimumOrder.met;
        setNotice({ tone: 'info', text: unmet ? 'Your order is below the minimum order amount. Please update your cart.' : 'Your order details have been updated. Please review them and place your order again.' });
        return;
      }
      navigation.dispatch(CommonActions.reset({ index: 1, routes: [{ name: 'Catalog' }, { name: 'OrderPlaced', params: { orderId: result.order.id } }] }));
    } catch (e) {
      if (isAmbiguousOutcome(e)) return; // the frozen-attempt UI below explains the unknown outcome; nothing is shown as "failed"
      setNotice({ tone: 'error', text: isOfflineError(e) ? OFFLINE_WRITE_COPY : commerceMessage(e) });
    } finally {
      lock.current = false;
    }
  }

  if (preview.isPending && !frozen) {
    return (
      <View accessibilityLabel="Preparing your order summary" style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }
  if ((preview.isError || !preview.data) && !frozen) {
    const empty = preview.error instanceof ApiError && preview.error.code === 'EMPTY_CART';
    return <ErrorState message={commerceMessage(preview.error)} onRetry={empty ? () => navigation.navigate('Catalog') : () => void preview.refetch()} />;
  }
  const data = preview.data;
  const minimumUnmet = !!data && data.minimumOrder.enabled && !data.minimumOrder.met;

  return (
    <Screen>
      <Title>Review your order</Title>
      {frozen ? (
        <Notice tone="info">
          {'We could not confirm whether your order was placed. To be safe, retry the same order, or check My orders first.'}
        </Notice>
      ) : null}
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      {data ? (
        <>
          {data.items.map((i) => (
            <View key={`${i.productId}:${i.variantId ?? ''}`} style={styles.line}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{i.title}</Text>
                {i.variantName ? <Text style={styles.meta}>{i.variantName}</Text> : null}
                <Text style={styles.meta}>{`${i.quantity} × ${formatInr(i.unitPrice)}`}</Text>
              </View>
              <Text style={styles.name}>{formatInr(i.totalPrice)}</Text>
            </View>
          ))}
          <View style={styles.box}>
            <Row label="Items" value={formatInr(data.summary.itemsSubtotal)} />
            <Row label="Tax" value={formatInr(data.summary.totalTax)} />
            {!isZeroMoney(data.summary.containerDepositTotal) ? <Row label="Container deposit" value={formatInr(data.summary.containerDepositTotal)} /> : null}
            {!isZeroMoney(data.summary.packagingFee) ? <Row label="Packaging" value={formatInr(data.summary.packagingFee)} /> : null}
            {!isZeroMoney(data.summary.deliveryFee) ? <Row label="Delivery" value={formatInr(data.summary.deliveryFee)} /> : null}
            {!isZeroMoney(data.summary.discountAmount) ? <Row label="Discount" value={formatInr(data.summary.discountAmount)} /> : null}
            <Row label="Total" value={formatInr(data.summary.netAmount)} strong />
          </View>
          {minimumUnmet ? <Notice tone="info">{`The minimum order is ${formatInr(data.minimumOrder.requiredAmount)}. Add ${formatInr(data.minimumOrder.shortfall)} more to continue.`}</Notice> : null}
          {data.deliveryAddress ? (
            <View style={styles.box}>
              <Text style={styles.name}>{`Deliver to ${data.deliveryAddress.recipientName}`}</Text>
              <Text style={styles.meta}>
                {[data.deliveryAddress.addressLine1, data.deliveryAddress.addressLine2, data.deliveryAddress.city, data.deliveryAddress.state, data.deliveryAddress.postalCode].filter(Boolean).join(', ')}
              </Text>
            </View>
          ) : null}
        </>
      ) : null}
      <TextField
        label="Delivery instructions (optional)"
        value={shownInstructions}
        onChangeText={(t) => setInstructions(t.slice(0, DELIVERY_INSTRUCTIONS_MAX))}
        editable={!frozen && !place.isPending}
        multiline
        maxLength={DELIVERY_INSTRUCTIONS_MAX}
      />
      <Body muted>Payment is online only.</Body>
      <Button
        label={frozen ? 'Retry the same order' : 'Place order'}
        onPress={submit}
        busy={place.isPending}
        disabled={!frozen && (!data || minimumUnmet)}
      />
      {frozen ? (
        <>
          <Button label="Check my orders" variant="secondary" onPress={() => goToOrders(navigation)} disabled={place.isPending} />
          <Button label="Start over" variant="secondary" onPress={() => store.clear()} disabled={place.isPending} />
        </>
      ) : (
        <Button label="Change address" variant="secondary" onPress={() => navigation.goBack()} disabled={place.isPending} />
      )}
    </Screen>
  );
}

/** Shown after an order was created. It is NOT confirmed and NOT paid, and it offers no payment action in P11B. */
export function OrderPlacedScreen({ route, navigation }: PlacedProps) {
  const order = useOrder(route.params.orderId);
  if (order.isPending) {
    return (
      <View accessibilityLabel="Loading your order" style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }
  if (order.isError || !order.data) return <ErrorState message={commerceMessage(order.error)} onRetry={() => void order.refetch()} />;
  const o = order.data;
  const pay = paymentBadge(o);
  return (
    <Screen>
      <Title>Order placed</Title>
      <Body>{`Order ${o.orderNumber}`}</Body>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Pill label={orderStatusLabel(o.status)} tone="neutral" />
        <Pill label={pay.label} tone={pay.tone} />
      </View>
      <View style={styles.box}>
        <Row label="Total" value={formatInr(o.netAmount)} strong />
      </View>
      <Notice tone="info">{PAYMENT_REQUIRED_COPY}</Notice>
      <Button label="View this order" onPress={() => goToOrders(navigation, o.id)} />
      <Button label="Back to the menu" variant="secondary" onPress={() => navigation.popToTop()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  line: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  box: { padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 4 },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  meta: { color: colors.muted, fontSize: 13 }
});
