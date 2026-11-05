import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMessAccount, useSaveAccount, useServicePoints } from '../../mess/hooks';
import { approvalBadge, rejectionCopy } from '../../mess/labels';
import { messMessage } from '../../mess/messErrors';
import type { MessStackParamList } from '../../navigation/MessNavigator';
import { Body, Button, colors, Notice, Screen, TextField, Title } from '../../ui/components';
import { EmptyState, Pill } from '../../ui/commerceUi';
import { FailureView, LoadingView, messStyles } from './messShared';

type Props = NativeStackScreenProps<MessStackParamList, 'MessAccount'>;

const ROOM_MAX = 20;
const ID_MAX = 40;

/** Hostel details form. Which service point and room the customer picks is theirs; whether it is approved is only ever the server's answer. */
export function MessAccountScreen({ navigation }: Props) {
  const account = useMessAccount();
  const points = useServicePoints();
  const save = useSaveAccount();
  const [servicePointId, setServicePointId] = useState<string | null>(null);
  const [room, setRoom] = useState('');
  const [idCard, setIdCard] = useState('');
  const [errors, setErrors] = useState<{ sp?: string; room?: string; id?: string }>({});
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (seeded || account.data === undefined) return;
    const a = account.data;
    if (a) {
      setServicePointId(a.servicePoint?.id ?? null);
      setRoom(a.roomNumber);
      setIdCard(a.studentIdCard ?? '');
    }
    setSeeded(true);
  }, [account.data, seeded]);

  if (account.isPending || points.isPending) return <LoadingView label="Loading hostel details" />;
  if (account.isError && account.data === undefined) return <FailureView error={account.error} onRetry={() => void account.refetch()} />;
  if (points.isError) return <FailureView error={points.error} onRetry={() => void points.refetch()} />;

  const list = points.data ?? [];
  const current = account.data ?? null;
  const saved = save.data?.account ?? null;
  const shown = saved ?? current;

  const submit = () => {
    if (save.isPending) return;
    const next: typeof errors = {};
    if (!servicePointId) next.sp = 'Choose your hostel service point.';
    const r = room.replace(/\s+/g, ' ').trim();
    if (!r) next.room = 'Enter your room number.';
    else if (r.length > ROOM_MAX) next.room = `Use at most ${ROOM_MAX} characters.`;
    const id = idCard.replace(/\s+/g, ' ').trim();
    if (id.length > ID_MAX) next.id = `Use at most ${ID_MAX} characters.`;
    setErrors(next);
    if (next.sp || next.room || next.id) return;
    save.mutate({ servicePointId: servicePointId!, roomNumber: r, ...(id ? { studentIdCard: id } : {}) });
  };

  return (
    <Screen>
      <Title>Hostel details</Title>
      <Body muted>Your meals are delivered to your hostel service point. Details are checked before you can subscribe.</Body>

      {shown ? (
        <View style={messStyles.pills} accessibilityLabel="Approval status">
          <Pill label={approvalBadge(shown).label} tone={approvalBadge(shown).tone} />
        </View>
      ) : null}
      {shown?.approvalStatus === 'REJECTED' ? <Notice>{rejectionCopy(shown.rejectionReasonCode)}</Notice> : null}
      {save.isSuccess ? <Notice tone="info">{save.data.changed ? 'Your hostel details were saved.' : 'No change: your details are already saved.'}</Notice> : null}
      {save.isError ? <Notice>{messMessage(save.error)}</Notice> : null}

      <View accessibilityRole="radiogroup" accessibilityLabel="Hostel service point" style={{ gap: 8 }}>
        <Text style={styles.label}>Hostel / service point</Text>
        {list.length === 0 ? (
          <EmptyState title="No service points available" body="Please try again later." />
        ) : (
          list.map((sp) => {
            const selected = sp.id === servicePointId;
            return (
              <Pressable
                key={sp.id}
                accessibilityRole="radio"
                accessibilityLabel={`${sp.name}, ${sp.city}`}
                accessibilityState={{ selected }}
                onPress={() => setServicePointId(sp.id)}
                style={[styles.option, selected && styles.optionSelected]}
              >
                <Text style={messStyles.name}>{sp.name}</Text>
                <Text style={messStyles.meta}>{[sp.gateLabel, sp.city].filter(Boolean).join(' · ')}</Text>
              </Pressable>
            );
          })
        )}
        {errors.sp ? (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {errors.sp}
          </Text>
        ) : null}
      </View>

      <TextField label="Room number" value={room} onChangeText={setRoom} error={errors.room} maxLength={ROOM_MAX} autoCapitalize="characters" />
      <TextField label="Student ID card (optional)" value={idCard} onChangeText={setIdCard} error={errors.id} maxLength={ID_MAX} autoCapitalize="characters" />

      <Button label={current ? 'Save hostel details' : 'Submit hostel details'} onPress={submit} busy={save.isPending} />
      <Button label="Back to Kerala Mess" variant="secondary" onPress={() => navigation.navigate('MessHome')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.muted, fontSize: 13 },
  option: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 2 },
  optionSelected: { borderColor: colors.accent },
  error: { color: colors.danger, fontSize: 13 }
});
