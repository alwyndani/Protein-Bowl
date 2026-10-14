import React, { useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '../../api/ApiError';
import { commerceMessage, isOfflineError, OFFLINE_WRITE_COPY } from '../../commerce/commerceErrors';
import { useAddresses, useAddressWrites, useRefetchOnFocus } from '../../commerce/hooks';
import type { Address } from '../../commerce/types';
import type { MenuStackParamList } from '../../navigation/types';
import { Body, Button, colors, Notice, Screen, TextField, Title } from '../../ui/components';
import { EmptyState, ErrorState, StaleBanner } from '../../ui/commerceUi';

type ListProps = NativeStackScreenProps<MenuStackParamList, 'Addresses'>;
type FormProps = NativeStackScreenProps<MenuStackParamList, 'AddressForm'>;

const line = (a: Address) => [a.addressLine1, a.addressLine2, a.city, a.state, a.postalCode].filter(Boolean).join(', ');

export function AddressesScreen({ route, navigation }: ListProps) {
  const { mode } = route.params;
  const addresses = useAddresses();
  const writes = useAddressWrites();
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const lock = useRef(false);
  useRefetchOnFocus(addresses.refetch);

  useLayoutEffect(() => {
    navigation.setOptions({ title: mode === 'select' ? 'Choose delivery address' : 'Delivery addresses' });
  }, [navigation, mode]);

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

  if (addresses.isPending) {
    return (
      <View accessibilityLabel="Loading addresses" style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }
  if (addresses.isError && !addresses.data) return <ErrorState message={commerceMessage(addresses.error)} onRetry={() => void addresses.refetch()} />;
  const list = addresses.data ?? [];

  return (
    <View style={styles.flex}>
      {addresses.isError ? <StaleBanner onRetry={() => void addresses.refetch()} /> : null}
      {error ? (
        <View style={{ padding: 16 }}>
          <Notice>{error}</Notice>
        </View>
      ) : null}
      {list.length === 0 ? (
        <EmptyState title="No delivery addresses yet" body="Add an address to continue." />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={styles.title}>{item.title}</Text>
                {item.isDefault ? <Text style={styles.badge}>Default</Text> : null}
              </View>
              <Text style={styles.meta}>{line(item)}</Text>
              {mode === 'select' ? <Button label={`Deliver to ${item.title}`} onPress={() => navigation.navigate('Checkout', { addressId: item.id })} disabled={writes.busy} /> : null}
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <View style={{ flexGrow: 1 }}>
                  <Button label={`Edit ${item.title}`} variant="secondary" onPress={() => navigation.navigate('AddressForm', { addressId: item.id, mode })} disabled={writes.busy} />
                </View>
                {!item.isDefault ? (
                  <View style={{ flexGrow: 1 }}>
                    <Button label={`Make ${item.title} default`} variant="secondary" disabled={writes.busy} onPress={() => run(() => writes.update.mutateAsync({ id: item.id, input: { isDefault: true } }))} />
                  </View>
                ) : null}
              </View>
              {confirmId === item.id ? (
                <View style={{ gap: 8 }}>
                  <Body muted>Delete this address?</Body>
                  <Button
                    label={`Yes, delete ${item.title}`}
                    variant="secondary"
                    busy={writes.busy}
                    onPress={() => {
                      setConfirmId(null);
                      void run(() => writes.remove.mutateAsync(item.id));
                    }}
                  />
                  <Button label="Keep it" variant="secondary" onPress={() => setConfirmId(null)} />
                </View>
              ) : (
                <Button label={`Delete ${item.title}`} variant="secondary" onPress={() => setConfirmId(item.id)} disabled={writes.busy} />
              )}
            </View>
          )}
          ListFooterComponent={<View style={{ height: 8 }} />}
        />
      )}
      <View style={{ padding: 16 }}>
        <Button label="Add a new address" onPress={() => navigation.navigate('AddressForm', { mode })} disabled={writes.busy} />
      </View>
    </View>
  );
}

export function AddressFormScreen({ route, navigation }: FormProps) {
  const { addressId, mode } = route.params;
  const addresses = useAddresses();
  const writes = useAddressWrites();
  const existing = addressId ? addresses.data?.find((a) => a.id === addressId) : undefined;
  const [title, setTitle] = useState(existing?.title ?? 'Home');
  const [line1, setLine1] = useState(existing?.addressLine1 ?? '');
  const [line2, setLine2] = useState(existing?.addressLine2 ?? '');
  const [city, setCity] = useState(existing?.city ?? '');
  const [stateName, setStateName] = useState(existing?.state ?? 'Kerala');
  const [postal, setPostal] = useState(existing?.postalCode ?? '');
  const [isDefault, setIsDefault] = useState(existing?.isDefault ?? addresses.data?.length === 0);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const lock = useRef(false);
  const l2 = useRef<TextInput>(null);
  const cityRef = useRef<TextInput>(null);
  const postalRef = useRef<TextInput>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: addressId ? 'Edit address' : 'New address' });
  }, [navigation, addressId]);

  if (addressId && addresses.isPending) {
    return (
      <View accessibilityLabel="Loading address" style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }
  if (addressId && !existing) return <ErrorState message="We could not find that address." />;

  async function save() {
    if (lock.current || writes.isLocked()) return;
    // Mirrors the BACKEND minimums only (line 1 >= 3, city >= 2, postal code >= 4); the server stays authoritative.
    const next = {
      line1: line1.trim().length >= 3 ? null : 'Enter the first line of the address.',
      city: city.trim().length >= 2 ? null : 'Enter the city.',
      postal: postal.trim().length >= 4 ? null : 'Enter the postal code.'
    };
    setErrors(next);
    setFormError(null);
    if (next.line1 || next.city || next.postal) return;
    lock.current = true;
    const input = {
      title: title.trim() || 'Home',
      addressLine1: line1.trim(),
      addressLine2: line2.trim() || null,
      city: city.trim(),
      state: stateName.trim() || 'Kerala',
      postalCode: postal.trim(),
      isDefault
    };
    try {
      if (addressId) await writes.update.mutateAsync({ id: addressId, input });
      else await writes.create.mutateAsync(input);
      navigation.goBack();
    } catch (e) {
      const notFound = e instanceof ApiError && e.status === 404;
      setFormError(isOfflineError(e) ? OFFLINE_WRITE_COPY : notFound ? 'That address no longer exists.' : commerceMessage(e));
    } finally {
      lock.current = false;
    }
  }
  void mode;

  return (
    <Screen>
      {formError ? <Notice>{formError}</Notice> : null}
      <TextField label="Label (for example Home)" value={title} onChangeText={setTitle} returnKeyType="next" editable={!writes.busy} />
      <TextField label="Address line 1" value={line1} onChangeText={setLine1} error={errors.line1} autoComplete="address-line1" returnKeyType="next" onSubmitEditing={() => l2.current?.focus()} editable={!writes.busy} />
      <TextField ref={l2} label="Address line 2 (optional)" value={line2} onChangeText={setLine2} autoComplete="address-line2" returnKeyType="next" onSubmitEditing={() => cityRef.current?.focus()} editable={!writes.busy} />
      <TextField ref={cityRef} label="City" value={city} onChangeText={setCity} error={errors.city} returnKeyType="next" onSubmitEditing={() => postalRef.current?.focus()} editable={!writes.busy} />
      <TextField label="State" value={stateName} onChangeText={setStateName} returnKeyType="next" editable={!writes.busy} />
      <TextField ref={postalRef} label="Postal code" value={postal} onChangeText={setPostal} error={errors.postal} keyboardType="number-pad" autoComplete="postal-code" returnKeyType="done" editable={!writes.busy} />
      <Pressable accessibilityRole="switch" accessibilityLabel="Use as my default address" accessibilityState={{ checked: isDefault }} onPress={() => setIsDefault((v) => !v)} style={styles.switchRow}>
        <Text style={styles.title}>Use as my default address</Text>
        <Switch value={isDefault} onValueChange={setIsDefault} />
      </Pressable>
      <Button label="Save address" onPress={save} busy={writes.busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  card: { padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 8 },
  title: { color: colors.text, fontSize: 16, fontWeight: '600' },
  meta: { color: colors.muted, fontSize: 14 },
  badge: { color: colors.accent, fontWeight: '700' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48 }
});
