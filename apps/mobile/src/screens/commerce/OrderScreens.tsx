import React from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '../../api/ApiError';
import { commerceMessage } from '../../commerce/commerceErrors';
import { formatIstDateTime } from '../../commerce/dates';
import { useOrder, useOrders, useRefetchOnFocus } from '../../commerce/hooks';
import { cancellationNotice, deliveryNotice, orderBadge, orderStatusLabel, paymentBadge, PAYMENT_REQUIRED_COPY, refundBadge } from '../../commerce/labels';
import { formatInr, isZeroMoney } from '../../commerce/money';
import type { CustomerOrder } from '../../commerce/types';
import type { OrdersStackParamList } from '../../navigation/types';
import { Body, colors, Notice, Screen, Title } from '../../ui/components';
import { EmptyState, ErrorState, Pill, Row, StaleBanner } from '../../ui/commerceUi';

type ListProps = NativeStackScreenProps<OrdersStackParamList, 'Orders'>;
type DetailProps = NativeStackScreenProps<OrdersStackParamList, 'OrderDetail'>;

const needsPayment = (o: CustomerOrder) => o.status === 'PENDING' && o.paymentStatus !== 'PAID' && o.paymentStatus !== 'REFUNDED';

export function OrdersScreen({ navigation }: ListProps) {
  const orders = useOrders();
  useRefetchOnFocus(orders.refetch);

  if (orders.isPending) {
    return (
      <View accessibilityLabel="Loading your orders" style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }
  if (orders.isError && !orders.data) return <ErrorState message={commerceMessage(orders.error)} onRetry={() => void orders.refetch()} />;
  const list = orders.data ?? [];
  return (
    <View style={styles.flex}>
      {orders.isError ? <StaleBanner onRetry={() => void orders.refetch()} /> : null}
      {list.length === 0 ? (
        <EmptyState title="No orders yet" body="Your orders will appear here." />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={<RefreshControl refreshing={orders.isRefetching} onRefresh={() => void orders.refetch()} tintColor={colors.accent} />}
          renderItem={({ item }) => <OrderCard order={item} onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })} />}
        />
      )}
    </View>
  );
}

function OrderCard({ order, onPress }: { order: CustomerOrder; onPress: () => void }) {
  const status = orderBadge(order);
  const pay = paymentBadge(order);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Order ${order.orderNumber}, ${status.label}, ${formatInr(order.netAmount)}`} onPress={onPress} style={styles.card}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={styles.name}>{order.orderNumber}</Text>
        <Text style={styles.name}>{formatInr(order.netAmount)}</Text>
      </View>
      <Text style={styles.meta}>{formatIstDateTime(order.createdAt)}</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Pill label={status.label} tone={status.tone} />
        <Pill label={pay.label} tone={pay.tone} />
      </View>
    </Pressable>
  );
}

/** Read-only. No cancel, refund, payment or delivery-code control exists in P11B: those states are only DISPLAYED when meaningful. */
export function OrderDetailScreen({ route }: DetailProps) {
  const order = useOrder(route.params.orderId);
  useRefetchOnFocus(order.refetch);

  if (order.isPending) {
    return (
      <View accessibilityLabel="Loading order" style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }
  if (order.isError && !order.data) {
    const missing = order.error instanceof ApiError && order.error.status === 404;
    return <ErrorState message={missing ? 'We could not find this order.' : commerceMessage(order.error)} onRetry={missing ? undefined : () => void order.refetch()} />;
  }
  const o = order.data!;
  const status = orderBadge(o);
  const pay = paymentBadge(o);
  const refund = refundBadge(o);
  const delivery = deliveryNotice(o);
  const cancelled = cancellationNotice(o);
  const addr = o.deliveryAddressSnapshot;
  const addressLine = addr ? [addr.addressLine1, addr.addressLine2, addr.city, addr.state, addr.postalCode].filter(Boolean).join(', ') : null;

  return (
    <Screen>
      {order.isError ? <StaleBanner onRetry={() => void order.refetch()} /> : null}
      <Title>{`Order ${o.orderNumber}`}</Title>
      <Body muted>{formatIstDateTime(o.createdAt)}</Body>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Pill label={status.label} tone={status.tone} />
        <Pill label={pay.label} tone={pay.tone} />
        {refund ? <Pill label={refund.label} tone={refund.tone} /> : null}
      </View>
      {needsPayment(o) ? <Notice tone="info">{PAYMENT_REQUIRED_COPY}</Notice> : null}
      {cancelled ? <Notice tone="info">{cancelled}</Notice> : null}
      {delivery ? <Notice tone="info">{`${delivery.title}. ${delivery.body}`}</Notice> : null}

      <View style={styles.box}>
        {o.items.map((i) => (
          <View key={i.id} style={styles.itemRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{i.itemTitle}</Text>
              {i.variantName ? <Text style={styles.meta}>{i.variantName}</Text> : null}
              <Text style={styles.meta}>{`${i.quantity} × ${formatInr(i.unitPrice)}`}</Text>
            </View>
            <Text style={styles.name}>{formatInr(i.totalPrice)}</Text>
          </View>
        ))}
      </View>
      <View style={styles.box}>
        <Row label="Items" value={formatInr(o.totalAmount)} />
        <Row label="Tax" value={formatInr(o.taxAmount)} />
        {!isZeroMoney(o.containerDepositTotal) ? <Row label="Container deposit" value={formatInr(o.containerDepositTotal)} /> : null}
        {!isZeroMoney(o.packagingFee) ? <Row label="Packaging" value={formatInr(o.packagingFee)} /> : null}
        {!isZeroMoney(o.deliveryFee) ? <Row label="Delivery" value={formatInr(o.deliveryFee)} /> : null}
        {!isZeroMoney(o.discountAmount) ? <Row label="Discount" value={formatInr(o.discountAmount)} /> : null}
        <Row label="Total" value={formatInr(o.netAmount)} strong />
      </View>
      {addr && addressLine ? (
        <View style={styles.box}>
          <Text style={styles.name}>Delivery address</Text>
          {addr.recipientName ? <Text style={styles.meta}>{addr.recipientName}</Text> : null}
          <Text style={styles.meta}>{addressLine}</Text>
          {addr.deliveryInstructions ? <Text style={styles.meta}>{`Instructions: ${addr.deliveryInstructions}`}</Text> : null}
        </View>
      ) : null}
      {o.timeline && o.timeline.length > 0 ? (
        <View style={styles.box}>
          <Text style={styles.name}>Progress</Text>
          {o.timeline.map((t, idx) => (
            <Text key={`${t.toStatus}-${idx}`} style={styles.meta}>{`${orderStatusLabel(t.toStatus)} · ${formatIstDateTime(t.at)}`}</Text>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  card: { padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 8 },
  box: { padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 6 },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  meta: { color: colors.muted, fontSize: 13 },
  itemRow: { flexDirection: 'row', gap: 12, paddingVertical: 4 }
});
