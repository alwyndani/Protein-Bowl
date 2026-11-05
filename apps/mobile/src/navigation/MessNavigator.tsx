import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MessAccountScreen } from '../screens/mess/MessAccountScreen';
import { MessHomeScreen } from '../screens/mess/MessHomeScreen';
import { MealCalendarScreen } from '../screens/mess/MealCalendarScreen';
import { PlansScreen } from '../screens/mess/PlansScreen';
import { SubscribeScreen } from '../screens/mess/SubscribeScreen';
import { SubscriptionDetailScreen } from '../screens/mess/SubscriptionDetailScreen';
import { SubscriptionsScreen } from '../screens/mess/SubscriptionsScreen';
import { colors } from '../ui/components';

export type MessStackParamList = {
  MessHome: undefined;
  MessAccount: undefined;
  MessPlans: undefined;
  MessSubscribe: { planId: string };
  MessSubscriptions: undefined;
  MessSubscription: { subscriptionId: string };
  MessCalendar: { subscriptionId: string };
};

const Stack = createNativeStackNavigator<MessStackParamList>();

const stackOptions = { headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text, contentStyle: { backgroundColor: colors.bg } };

/** The Kerala Mess customer stack. The coordinator mounts it (a tab or a Menu entry); it owns no tab itself. */
export function MessNavigator({ initialRouteName = 'MessHome' }: { initialRouteName?: keyof MessStackParamList }) {
  return (
    <Stack.Navigator screenOptions={stackOptions} initialRouteName={initialRouteName}>
      <Stack.Screen name="MessHome" component={MessHomeScreen} options={{ title: 'Kerala Mess' }} />
      <Stack.Screen name="MessAccount" component={MessAccountScreen} options={{ title: 'Hostel details' }} />
      <Stack.Screen name="MessPlans" component={PlansScreen} options={{ title: 'Plans' }} />
      <Stack.Screen name="MessSubscribe" component={SubscribeScreen} options={{ title: 'Subscribe' }} />
      <Stack.Screen name="MessSubscriptions" component={SubscriptionsScreen} options={{ title: 'My subscriptions' }} />
      <Stack.Screen name="MessSubscription" component={SubscriptionDetailScreen} options={{ title: 'Subscription' }} />
      <Stack.Screen name="MessCalendar" component={MealCalendarScreen} options={{ title: 'Meal calendar' }} />
    </Stack.Navigator>
  );
}
