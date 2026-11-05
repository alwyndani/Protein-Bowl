import React, { useState } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { formatInr } from '../../commerce/money';
import { useMessAccount, usePlans, usePurchase } from '../../mess/hooks';
import { formatDay, isValidDay, slotsLabel, suggestedStartDay } from '../../mess/labels';
import { messMessage } from '../../mess/messErrors';
import type { MessStackParamList } from '../../navigation/MessNavigator';
import { Body, Button, Notice, Screen, TextField, Title } from '../../ui/components';
import { EmptyState, Row } from '../../ui/commerceUi';
import { FailureView, LoadingView, messStyles } from './messShared';

type Props = NativeStackScreenProps<MessStackParamList, 'MessSubscribe'>;

/**
 * Buy one plan. ONLINE payment only: the purchase creates an unpaid subscription and its payment order on the server, then the customer
 * is taken to the subscription where the existing payment panel handles the payment. The device sends only the plan id and the start date.
 */
export function SubscribeScreen({ route, navigation }: Props) {
  const { planId } = route.params;
  const account = useMessAccount();
  const spId = account.data?.servicePoint?.id ?? null;
  const plans = usePlans(account.isPending ? null : spId);
  const purchase = usePurchase();
  const plan = plans.data?.find((p) => p.id === planId) ?? null;
  const [startDate, setStartDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (account.isPending || plans.isPending) return <LoadingView label="Loading plan" />;
  if (account.isError && account.data === undefined) return <FailureView error={account.error} onRetry={() => void account.refetch()} />;
  if (plans.isError && plans.data === undefined) return <FailureView error={plans.error} onRetry={() => void plans.refetch()} />;
  if (!plan) return <EmptyState title="This plan is no longer on sale" body="Please choose another plan." />;

  const approved = account.data?.approvalStatus === 'APPROVED';
  const date = startDate ?? suggestedStartDay(plan.minStartLeadDays);

  const confirm = () => {
    if (purchase.isPending) return;
    if (!isValidDay(date)) {
      setError('Enter the start date as YYYY-MM-DD, for example 2026-11-20.');
      return;
    }
    setError(null);
    purchase.mutate(
      { planId: plan.id, startDate: date },
      { onSuccess: (out) => navigation.replace('MessSubscription', { subscriptionId: out.subscription.id }) }
    );
  };

  return (
    <Screen>
      <Title>{plan.name}</Title>
      {plan.description ? <Body muted>{plan.description}</Body> : null}
      <View style={messStyles.box}>
        <Row label="Duration" value={`${plan.durationDays} days`} />
        <Row label="Meals" value={`${plan.mealsIncluded} (${slotsLabel(plan.mealSlots)})`} />
        <Row label="Service point" value={account.data?.servicePoint?.name ?? 'Not provided'} />
        <Row label="Price" value={formatInr(plan.price?.subtotal)} />
        <Row label="Tax" value={formatInr(plan.price?.taxAmount)} />
        <Row label="Total" value={formatInr(plan.price?.total)} strong />
      </View>

      {!approved ? <Notice tone="info">You can subscribe once your hostel details are approved.</Notice> : null}
      <TextField
        label="Start date (YYYY-MM-DD)"
        value={date}
        onChangeText={(v) => {
          setStartDate(v);
          setError(null);
        }}
        editable={!purchase.ambiguous && !purchase.isPending}
        error={error}
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
        maxLength={10}
      />
      <Body muted>{`Earliest start for this plan: ${plan.minStartLeadDays} day${plan.minStartLeadDays === 1 ? '' : 's'} from today. ${isValidDay(date) ? `Starts ${formatDay(date)}.` : ''}`}</Body>
      <Body muted>You pay online in the next step. Your subscription is activated only after your payment is confirmed.</Body>

      {purchase.ambiguous ? (
        <Notice>We could not confirm whether your purchase was created. Retrying uses the same request, so it will not create a second purchase. You can also check My subscriptions.</Notice>
      ) : purchase.isError ? (
        <Notice>{messMessage(purchase.error)}</Notice>
      ) : null}

      <Button label={purchase.ambiguous ? 'Retry the same purchase' : 'Continue to payment'} onPress={confirm} busy={purchase.isPending} disabled={!approved} />
      {purchase.isError && !purchase.ambiguous ? <Button label="My subscriptions" variant="secondary" onPress={() => navigation.navigate('MessSubscriptions')} /> : null}
    </Screen>
  );
}
