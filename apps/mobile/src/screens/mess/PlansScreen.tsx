import React from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { formatInr } from '../../commerce/money';
import { useMessAccount, usePlans, useServicePoints } from '../../mess/hooks';
import { hhmm, slotLabel, slotsLabel } from '../../mess/labels';
import type { MessPlan } from '../../mess/types';
import type { MessStackParamList } from '../../navigation/MessNavigator';
import { Body, Button, Notice, Screen, Title } from '../../ui/components';
import { EmptyState, Row } from '../../ui/commerceUi';
import { FailureView, LoadingView, messStyles } from './messShared';

type Props = NativeStackScreenProps<MessStackParamList, 'MessPlans'>;

export function PlanCard({ plan, onSubscribe, canSubscribe }: { plan: MessPlan; onSubscribe: () => void; canSubscribe: boolean }) {
  const times = plan.slotTimes ? plan.mealSlots.map((s) => `${slotLabel(s)} ${hhmm(plan.slotTimes?.[s])}`).join(' · ') : null;
  return (
    <View style={messStyles.box} accessibilityLabel={`Plan ${plan.name}`}>
      <Text accessibilityRole="header" style={messStyles.name}>
        {plan.name}
      </Text>
      {plan.description ? <Text style={messStyles.meta}>{plan.description}</Text> : null}
      <Row label="Duration" value={`${plan.durationDays} days`} />
      <Row label="Meals" value={`${plan.mealsPerDay} per day, ${plan.mealsIncluded} in total`} />
      <Row label="Meal slots" value={slotsLabel(plan.mealSlots)} />
      {times ? <Text style={messStyles.meta}>{times}</Text> : null}
      <Row label="Price" value={formatInr(plan.price?.subtotal)} />
      <Row label="Tax" value={formatInr(plan.price?.taxAmount)} />
      <Row label="Total" value={formatInr(plan.price?.total)} strong />
      <Button label={`Subscribe to ${plan.name}`} onPress={onSubscribe} disabled={!canSubscribe} />
    </View>
  );
}

/** Plans on sale at the customer's service point (the server filters), plus the service points. Price figures are the server's. */
export function PlansScreen({ navigation }: Props) {
  const account = useMessAccount();
  const spId = account.data?.servicePoint?.id ?? null;
  const plans = usePlans(account.isPending ? null : spId);
  const points = useServicePoints();

  if (account.isPending || plans.isPending) return <LoadingView label="Loading plans" />;
  if (account.isError && account.data === undefined) return <FailureView error={account.error} onRetry={() => void account.refetch()} />;
  if (plans.isError && plans.data === undefined) return <FailureView error={plans.error} onRetry={() => void plans.refetch()} />;

  const approved = account.data?.approvalStatus === 'APPROVED';
  const list = plans.data ?? [];

  return (
    <Screen>
      <Title>Plans</Title>
      <Body muted>Payment is online only. Your subscription starts once your payment is confirmed.</Body>
      {!approved ? (
        <Notice tone="info">{account.data ? 'You can subscribe once your hostel details are approved.' : 'Add your hostel details to subscribe.'}</Notice>
      ) : null}
      {!account.data ? <Button label="Add hostel details" variant="secondary" onPress={() => navigation.navigate('MessAccount')} /> : null}

      {list.length === 0 ? (
        <EmptyState title="No plans on sale" body={spId ? 'No plans are on sale for your hostel right now.' : 'No plans are on sale right now.'} />
      ) : (
        list.map((p) => <PlanCard key={p.id} plan={p} canSubscribe={approved} onSubscribe={() => navigation.navigate('MessSubscribe', { planId: p.id })} />)
      )}

      <View style={messStyles.box} accessibilityLabel="Service points">
        <Text accessibilityRole="header" style={messStyles.heading}>
          Service points
        </Text>
        {points.isPending ? (
          <Text style={messStyles.meta}>Loading service points…</Text>
        ) : points.isError ? (
          <Text style={messStyles.meta}>Service points could not be loaded.</Text>
        ) : (points.data ?? []).length === 0 ? (
          <Text style={messStyles.meta}>No service points are listed right now.</Text>
        ) : (
          (points.data ?? []).map((sp) => (
            <View key={sp.id}>
              <Text style={messStyles.name}>{sp.name}</Text>
              <Text style={messStyles.meta}>{[sp.gateLabel, sp.city].filter(Boolean).join(' · ')}</Text>
            </View>
          ))
        )}
      </View>
    </Screen>
  );
}
