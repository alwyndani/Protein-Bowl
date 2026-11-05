import React from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useRefetchOnFocus } from '../../commerce/hooks';
import { useMessAccount } from '../../mess/hooks';
import { approvalBadge, rejectionCopy } from '../../mess/labels';
import type { MessStackParamList } from '../../navigation/MessNavigator';
import { Body, Button, Notice, Screen, Title } from '../../ui/components';
import { Pill, Row, StaleBanner } from '../../ui/commerceUi';
import { FailureView, LoadingView, messStyles } from './messShared';

type Props = NativeStackScreenProps<MessStackParamList, 'MessHome'>;

/** Entry screen: shows the server's approval state for the hostel details and links to plans and subscriptions. */
export function MessHomeScreen({ navigation }: Props) {
  const account = useMessAccount();
  useRefetchOnFocus(account.refetch);

  if (account.isPending) return <LoadingView label="Loading Kerala Mess" />;
  if (account.isError && account.data === undefined) return <FailureView error={account.error} onRetry={() => void account.refetch()} />;
  const a = account.data ?? null;
  const badge = a ? approvalBadge(a) : null;

  return (
    <Screen>
      {account.isError ? <StaleBanner onRetry={() => void account.refetch()} /> : null}
      <Title>Kerala Mess</Title>
      <Body muted>Hostel meal subscriptions. Payment is online only.</Body>

      <View style={messStyles.box} accessibilityLabel="Hostel details">
        <Text accessibilityRole="header" style={messStyles.heading}>
          Hostel details
        </Text>
        {a && badge ? (
          <>
            <View style={messStyles.pills}>
              <Pill label={badge.label} tone={badge.tone} />
            </View>
            <Row label="Hostel" value={a.hostelName || 'Not provided'} />
            <Row label="Service point" value={a.servicePoint?.name ?? 'Not provided'} />
            <Row label="Room" value={a.roomNumber || 'Not provided'} />
            {a.approvalStatus === 'REJECTED' ? <Notice>{rejectionCopy(a.rejectionReasonCode)}</Notice> : null}
            {a.approvalStatus === 'PENDING' ? <Notice tone="info">Your details are waiting for approval. You can browse plans, but you can subscribe only once they are approved.</Notice> : null}
          </>
        ) : (
          <Notice tone="info">Tell us where you stay to subscribe to a Kerala Mess plan.</Notice>
        )}
        <Button label={a ? 'Update hostel details' : 'Add hostel details'} variant="secondary" onPress={() => navigation.navigate('MessAccount')} />
      </View>

      <Button label="View plans" onPress={() => navigation.navigate('MessPlans')} />
      <Button label="My subscriptions" variant="secondary" onPress={() => navigation.navigate('MessSubscriptions')} />
    </Screen>
  );
}
