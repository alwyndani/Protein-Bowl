import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '../../api/ApiError';
import { commerceMessage, isOfflineError, OFFLINE_WRITE_COPY } from '../../commerce/commerceErrors';
import { useCart, useCartWrites, useCategories, useProduct, useProducts } from '../../commerce/hooks';
import { formatInr, isZeroMoney } from '../../commerce/money';
import type { Product, ProductVariant } from '../../commerce/types';
import type { MenuStackParamList } from '../../navigation/types';
import { Body, Button, colors, Notice, Screen, Title } from '../../ui/components';
import { EmptyState, ErrorState, ProductImage, StaleBanner, Stepper } from '../../ui/commerceUi';

type CatalogProps = NativeStackScreenProps<MenuStackParamList, 'Catalog'>;
type ProductProps = NativeStackScreenProps<MenuStackParamList, 'Product'>;

/** Active variants only, as the server returned them. The default (else the first active) is preselected. NO stock is inferred. */
export function activeVariants(product: Product): ProductVariant[] {
  return product.variants.filter((v) => v.isActive);
}
export function defaultVariant(product: Product): ProductVariant | null {
  const active = activeVariants(product);
  return active.find((v) => v.isDefault) ?? active[0] ?? null;
}

export function CartHeaderButton({ onPress }: { onPress: () => void }) {
  const cart = useCart();
  const count = cart.data ? cart.data.items.reduce((n, i) => n + i.quantity, 0) : 0; // a unit COUNT (not money)
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={count > 0 ? `Cart, ${count} items` : 'Cart'} onPress={onPress} style={styles.cartBtn}>
      <Text style={styles.cartBtnText}>{count > 0 ? `Cart (${count})` : 'Cart'}</Text>
    </Pressable>
  );
}

export function CatalogScreen({ navigation }: CatalogProps) {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const categories = useCategories();
  const products = useProducts(categoryId);

  useLayoutEffect(() => {
    navigation.setOptions({ headerRight: () => <CartHeaderButton onPress={() => navigation.navigate('Cart')} /> });
  }, [navigation]);

  const list = products.data ?? [];
  return (
    <View style={styles.flex}>
      {products.isError && products.data ? <StaleBanner onRetry={() => void products.refetch()} /> : null}
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="All" active={categoryId === null} onPress={() => setCategoryId(null)} />
          {(categories.data ?? []).map((c) => (
            <Chip key={c.id} label={c.name} active={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
          ))}
        </ScrollView>
      </View>
      {products.isPending ? (
        <View accessibilityLabel="Loading menu" style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : products.isError && !products.data ? (
        <ErrorState message={commerceMessage(products.error)} onRetry={() => void products.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState title="Nothing on the menu here yet" body="Please check again soon." />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={<RefreshControl refreshing={products.isRefetching} onRefresh={() => void products.refetch()} tintColor={colors.accent} />}
          renderItem={({ item }) => <ProductCard product={item} onPress={() => navigation.navigate('Product', { slug: item.slug })} />}
        />
      )}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && { color: colors.accentText }]}>{label}</Text>
    </Pressable>
  );
}

function ProductCard({ product, onPress }: { product: Product; onPress: () => void }) {
  const variant = defaultVariant(product);
  const price = variant ? variant.price : null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${product.name}${price !== null ? `, ${formatInr(price)}` : ''}`} onPress={onPress} style={styles.card}>
      <ProductImage uri={product.image} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.cardTitle}>{product.name}</Text>
        <Text style={styles.cardMeta}>{product.category.name}</Text>
        <Text style={styles.cardPrice}>{price !== null ? formatInr(price) : 'Not available'}</Text>
      </View>
    </Pressable>
  );
}

export function ProductScreen({ route, navigation }: ProductProps) {
  const query = useProduct(route.params.slug);
  const writes = useCartWrites();
  const [variantId, setVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [feedback, setFeedback] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const lock = useRef(false);

  const product = query.data;
  const variants = useMemo(() => (product ? activeVariants(product) : []), [product]);
  const selected = product ? variants.find((v) => v.id === variantId) ?? defaultVariant(product) : null;

  useEffect(() => {
    navigation.setOptions({ title: product?.name ?? 'Item' });
  }, [navigation, product?.name]);

  if (query.isPending) {
    return (
      <View accessibilityLabel="Loading item" style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }
  if (query.isError || !product) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return <ErrorState message={missing ? 'This item is no longer available.' : commerceMessage(query.error)} onRetry={missing ? undefined : () => void query.refetch()} />;
  }

  async function addToCart() {
    if (lock.current || writes.isLocked() || !selected) return;
    lock.current = true;
    setFeedback(null);
    try {
      await writes.add.mutateAsync({ productId: product!.id, variantId: selected.id, quantity });
      setFeedback({ tone: 'info', text: 'Added to your cart.' });
    } catch (e) {
      setFeedback({ tone: 'error', text: isOfflineError(e) ? OFFLINE_WRITE_COPY : commerceMessage(e) });
    } finally {
      lock.current = false;
    }
  }

  const macros = selected
    ? [
        selected.calories !== null ? `${selected.calories} kcal` : null,
        selected.protein !== null ? `${selected.protein} g protein` : null,
        selected.carbs !== null ? `${selected.carbs} g carbs` : null,
        selected.fat !== null ? `${selected.fat} g fat` : null
      ].filter(Boolean)
    : [];

  return (
    <Screen>
      <View style={{ alignItems: 'center' }}>
        <ProductImage uri={product.image} size={160} />
      </View>
      <Title>{product.name}</Title>
      <Text style={styles.cardMeta}>{product.category.name}</Text>
      <Body>{product.description}</Body>
      {macros.length > 0 ? <Body muted>{macros.join(' · ')}</Body> : null}
      {variants.length > 1 ? (
        <View style={{ gap: 8 }}>
          <Text style={styles.cardMeta}>Choose an option</Text>
          {variants.map((v) => (
            <Pressable key={v.id} accessibilityRole="radio" accessibilityLabel={`${v.name}, ${formatInr(v.price)}`} accessibilityState={{ selected: selected?.id === v.id }} onPress={() => setVariantId(v.id)} style={[styles.option, selected?.id === v.id && styles.optionActive]}>
              <Text style={styles.cardTitle}>{v.name}</Text>
              <Text style={styles.cardPrice}>{formatInr(v.price)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {selected ? (
        <>
          <Text style={styles.price}>{formatInr(selected.price)}</Text>
          {!isZeroMoney(selected.containerDeposit) ? (
            <Body muted>{`Container deposit ${formatInr(selected.containerDeposit)}`}</Body>
          ) : null}
          <Stepper label={product.name} value={quantity} onMinus={() => setQuantity((q) => Math.max(1, q - 1))} onPlus={() => setQuantity((q) => q + 1)} disabled={writes.busy} />
        </>
      ) : (
        <Notice tone="info">This item has no available option right now.</Notice>
      )}
      {feedback ? <Notice tone={feedback.tone}>{feedback.text}</Notice> : null}
      <Button label="Add to cart" onPress={addToCart} disabled={!selected} busy={writes.busy} />
      <Button label="View cart" variant="secondary" onPress={() => navigation.navigate('Cart')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  chips: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontWeight: '600' },
  card: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  cardMeta: { color: colors.muted, fontSize: 13 },
  cardPrice: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  price: { color: colors.accent, fontSize: 24, fontWeight: '700' },
  option: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  optionActive: { borderColor: colors.accent },
  cartBtn: { paddingHorizontal: 12, minHeight: 44, justifyContent: 'center' },
  cartBtnText: { color: colors.accent, fontWeight: '700' }
});
