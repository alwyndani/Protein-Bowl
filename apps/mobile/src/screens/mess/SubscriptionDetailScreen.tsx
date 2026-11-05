import React from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '../../api/ApiError';
import { useRefetchOnFocus } from '../../commerce/hooks';
import { refundBadge } from '../../commerce/labels';
import { formatIstDateTime } from '../../commerce/dates';
import { formatInr } from '../../commerce/money';
import { useSubscription } from '../../mess/hooks';
import { formatDay, NOT_PROVIDED, slotsLabel, subscriptionBadge, subscriptionPaymentBadge } from '../../mess/labels';
import type { MessStackParamList } from '../../navigation/MessNavigator';
import { Body, Button, Notice, Screen, Title } from '../../ui/components';
import { ErrorState, Pill, Row, StaleBanner } from '../../ui/commerceUi';
import { CancelSubscriptionPanel, RefundSummary } from './CancelSubscriptionPanel';
import { MessPaymentSection } from './MessPaymentSection';
import { FailureView, LoadingView, messStyles } from './messShared';

type Props = NativeStackScreenProps<MessStackParamList, 'MessSubscription'>;

/** One subscription, exactly as the server reports it (status, payment, refund, whether it may still be cancelled). */
export function SubscriptionDetailScreen({ route, navigation }: Props) {
  const { subscriptionId } = route.params;
  const query = useSubscription(subscriptionId);
  useRefetchOnFocus(query.refetch);

  if (query.isPending) return <LoadingView label="Loading subscription" />;
  if (query.isError && query.data === undefined) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return missing ? <ErrorState message="We could not find this subscription." /> : <FailureView error={query.error} onRetry={() => void query.refetch()} />;
  }
  const s = query.data!;
  const status = subscriptionBadge(s);
  const pay = subscriptionPaymentBadge(s);
  const refund = refundBadge(s);
  const sp = s.servicePoint;
  const awaitingPayment = s.status === 'PENDING_PAYMENT' && !!s.purchaseOrder;
  const showRefund = s.status === 'CANCELLED' || (s.refund?.state !== undefined && s.refund.state !== 'NO_REFUND');

  return (
    <Screen>
      {query.isError ? <StaleBanner onRetry={() => void query.refetch()} /> : null}
      <Title>{s.plan.name}</Title>
      <Body muted>{s.purchaseOrder ? `Order ${s.purchaseOrder.orderNumber}` : `Created ${formatIstDateTime(s.createdAt)}`}</Body>
      <View style={messStyles.pills}>
        <Pill label={status.label} tone={status.tone} />
        {pay ? <Pill label={pay.label} tone={pay.tone} /> : null}
        {refund ? <Pill label={refund.label} tone={refund.tone} /> : null}
      </View>

      {awaitingPayment ? <MessPaymentSection subscriptionId={s.id} orderId={s.purchaseOrder!.id} startDate={s.startDate} /> : null}
      {s.status === 'PENDING_PAYMENT' && !s.purchaseOrder ? <Notice tone="info">Payment is required before your subscription starts.</Notice> : null}
      {s.status === 'CANCELLED' ? <Notice tone="info">This subscription was cancelled.</Notice> : null}

      <View style={messStyles.box} accessibilityLabel="Subscription details">
        <Row label="Starts" value={formatDay(s.startDate)} />
        <Row label="Ends" value={formatDay(s.endDate)} />
        <Row label="Meals included" value={String(s.mealsIncluded)} />
        <Row label="Meal slots" value={slotsLabel(s.plan.mealSlots)} />
        <Row label="Service point" value={sp ? sp.name : NOT_PROVIDED} />
        {sp ? <Text style={messStyles.meta}>{[sp.gateLabel, sp.city].filter(Boolean).join(' · ')}</Text> : null}
        {s.activatedAt ? <Row label="Activated" value={formatIstDateTime(s.activatedAt)} /> : null}
        {s.cancelledAt ? <Row label="Cancelled" value={formatIstDateTime(s.cancelledAt)} /> : null}
      </View>

      <View style={messStyles.box} accessibilityLabel="Price">
        <Row label="Price" value={formatInr(s.price?.subtotal)} />
        <Row label="Tax" value={formatInr(s.price?.taxAmount)} />
        <Row label="Total" value={formatInr(s.price?.total)} strong />
      </View>

      {showRefund ? <RefundSummary refundState={s.refund?.state} total={s.price?.total} /> : null}

      {s.status === 'ACTIVE' || s.status === 'COMPLETED' ? <Button label="Meal calendar" onPress={() => navigation.navigate('MessCalendar', { subscriptionId: s.id })} /> : null}
      <CancelSubscriptionPanel subscription={s} />
    </Screen>
  );
}
