import React from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useRefetchOnFocus } from '../../commerce/hooks';
import { refundBadge } from '../../commerce/labels';
import { formatInr } from '../../commerce/money';
import { useSubscriptions } from '../../mess/hooks';
import { formatDay, subscriptionBadge, subscriptionPaymentBadge } from '../../mess/labels';
import type { MessSubscription } from '../../mess/types';
import type { MessStackParamList } from '../../navigation/MessNavigator';
import { Button, colors } from '../../ui/components';
import { EmptyState, Pill, StaleBanner } from '../../ui/commerceUi';
import { FailureView, LoadingView, messStyles } from './messShared';

type Props = NativeStackScreenProps<MessStackParamList, 'MessSubscriptions'>;

function SubscriptionCard({ s, onPress }: { s: MessSubscription; onPress: () => void }) {
  const status = subscriptionBadge(s);
  const pay = subscriptionPaymentBadge(s);
  const refund = refundBadge(s);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${s.plan.name}, ${status.label}, ${formatDay(s.startDate)} to ${formatDay(s.endDate)}`}
      onPress={onPress}
      style={messStyles.box}
    >
      <View style={messStyles.between}>
        <Text style={messStyles.name}>{s.plan.name}</Text>
        <Text style={messStyles.name}>{formatInr(s.price?.total)}</Text>
      </View>
      <Text style={messStyles.meta}>{`${formatDay(s.startDate)} to ${formatDay(s.endDate)}`}</Text>
      <View style={messStyles.pills}>
        <Pill label={status.label} tone={status.tone} />
        {pay ? <Pill label={pay.label} tone={pay.tone} /> : null}
        {refund ? <Pill label={refund.label} tone={refund.tone} /> : null}
      </View>
    </Pressable>
  );
}

export function SubscriptionsScreen({ navigation }: Props) {
  const subs = useSubscriptions();
  useRefetchOnFocus(subs.refetch);

  if (subs.isPending) return <LoadingView label="Loading your subscriptions" />;
  if (subs.isError && subs.data === undefined) return <FailureView error={subs.error} onRetry={() => void subs.refetch()} />;
  const list = subs.data ?? [];
  return (
    <View style={messStyles.flex}>
      {subs.isError ? <StaleBanner onRetry={() => void subs.refetch()} /> : null}
      {list.length === 0 ? (
        <View>
          <EmptyState title="No subscriptions yet" body="Your Kerala Mess subscriptions will appear here." />
          <View style={{ padding: 16 }}>
            <Button label="View plans" onPress={() => navigation.navigate('MessPlans')} />
          </View>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={<RefreshControl refreshing={subs.isRefetching} onRefresh={() => void subs.refetch()} tintColor={colors.accent} />}
          renderItem={({ item }) => <SubscriptionCard s={item} onPress={() => navigation.navigate('MessSubscription', { subscriptionId: item.id })} />}
        />
      )}
    </View>
  );
}
