import React, { useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { commerceMessage, isOfflineError, OFFLINE_WRITE_COPY } from '../../commerce/commerceErrors';
import { useCart, useCartWrites, useRefetchOnFocus } from '../../commerce/hooks';
import { formatInr, isZeroMoney } from '../../commerce/money';
import type { CartItem } from '../../commerce/types';
import type { MenuStackParamList } from '../../navigation/types';
import { Body, Button, colors, Notice, Title } from '../../ui/components';
import { EmptyState, ErrorState, ProductImage, Row, StaleBanner, Stepper } from '../../ui/commerceUi';

type Props = NativeStackScreenProps<MenuStackParamList, 'Cart'>;

/**
 * The cart is the SERVER cart: every figure below (unit price, line total, subtotal, tax, deposit, fees, discount, net, minimum-order
 * state, quantity issues) is displayed exactly as returned. Nothing is calculated here.
 */
export function CartScreen({ navigation }: Props) {
  const cart = useCart();
  const writes = useCartWrites();
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const lock = useRef(false);
  useRefetchOnFocus(cart.refetch);

  async function run(action: () => Promise<unknown>) {
    if (lock.current || writes.isLocked()) return;
    lock.current = true;
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(isOfflineError(e) ? OFFLINE_WRITE_COPY : commerceMessage(e));
    } finally {
      lock.current = false;
    }
  }

  if (cart.isPending) {
    return (
      <View accessibilityLabel="Loading cart" style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }
  if (cart.isError && !cart.data) return <ErrorState message={commerceMessage(cart.error)} onRetry={() => void cart.refetch()} />;
  const data = cart.data!;
  if (data.items.length === 0) {
    return (
      <View style={styles.flex}>
        <EmptyState title="Your cart is empty" body="Add something from the menu to get started." />
        <View style={{ padding: 16 }}>
          <Button label="Browse the menu" onPress={() => navigation.navigate('Catalog')} />
        </View>
      </View>
    );
  }

  const issueIds = new Set(data.quantityIssues.map((i) => i.itemId));
  const minimumUnmet = data.minimumOrder.enabled && !data.minimumOrder.met;
  const blocked = data.quantityIssues.length > 0 || minimumUnmet;

  return (
    <View style={styles.flex}>
      {cart.isError ? <StaleBanner onRetry={() => void cart.refetch()} /> : null}
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Title>Your cart</Title>
        {error ? <Notice>{error}</Notice> : null}
        {data.quantityIssues.length > 0 ? <Notice>Some quantities are not allowed. Please adjust or remove those items.</Notice> : null}
        {data.items.map((item) => (
          <CartLine key={item.id} item={item} flagged={issueIds.has(item.id)} busy={writes.busy} onQuantity={(q) => run(() => writes.setQuantity.mutateAsync({ itemId: item.id, quantity: q }))} onRemove={() => run(() => writes.remove.mutateAsync(item.id))} />
        ))}
        <View style={styles.totals}>
          <Row label="Items" value={formatInr(data.itemsSubtotal)} />
          <Row label="Tax" value={formatInr(data.totalTax)} />
          {!isZeroMoney(data.containerDepositTotal) ? <Row label="Container deposit" value={formatInr(data.containerDepositTotal)} /> : null}
          {!isZeroMoney(data.packagingFee) ? <Row label="Packaging" value={formatInr(data.packagingFee)} /> : null}
          {!isZeroMoney(data.deliveryFee) ? <Row label="Delivery" value={formatInr(data.deliveryFee)} /> : null}
          {!isZeroMoney(data.discountAmount) ? <Row label="Discount" value={formatInr(data.discountAmount)} /> : null}
          <Row label="Total" value={formatInr(data.netAmount)} strong />
        </View>
        {minimumUnmet ? (
          <Notice tone="info">{`The minimum order is ${formatInr(data.minimumOrder.requiredAmount)}. Add ${formatInr(data.minimumOrder.shortfall)} more to continue.`}</Notice>
        ) : null}
        <Button label="Continue to checkout" onPress={() => navigation.navigate('Addresses', { mode: 'select' })} disabled={blocked || writes.busy} />
        {confirmClear ? (
          <View style={{ gap: 8 }}>
            <Body muted>Remove everything from your cart?</Body>
            <Button
              label="Yes, clear my cart"
              variant="secondary"
              busy={writes.busy}
              onPress={() => {
                setConfirmClear(false);
                void run(() => writes.clear.mutateAsync());
              }}
            />
            <Button label="Keep my cart" variant="secondary" onPress={() => setConfirmClear(false)} />
          </View>
        ) : (
          <Button label="Clear cart" variant="secondary" onPress={() => setConfirmClear(true)} disabled={writes.busy} />
        )}
      </ScrollView>
    </View>
  );
}

function CartLine({ item, flagged, busy, onQuantity, onRemove }: { item: CartItem; flagged: boolean; busy: boolean; onQuantity: (q: number) => void; onRemove: () => void }) {
  return (
    <View style={[styles.line, flagged && { borderColor: colors.danger }]}>
      <ProductImage uri={item.image} size={56} />
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={styles.name}>{item.name}</Text>
        {item.variantName ? <Text style={styles.meta}>{item.variantName}</Text> : null}
        <Text style={styles.meta}>{`${formatInr(item.unitPrice)} each`}</Text>
        <Stepper label={item.name} value={item.quantity} disabled={busy} onMinus={() => onQuantity(item.quantity - 1)} onPlus={() => onQuantity(item.quantity + 1)} />
        <Button label={`Remove ${item.name}`} variant="secondary" onPress={onRemove} disabled={busy} />
      </View>
      <Text style={styles.lineTotal}>{formatInr(item.lineTotal)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  line: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  meta: { color: colors.muted, fontSize: 13 },
  lineTotal: { color: colors.text, fontWeight: '700' },
  totals: { padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 2 }
});
