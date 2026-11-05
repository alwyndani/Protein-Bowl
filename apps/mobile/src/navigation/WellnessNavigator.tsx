import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../ui/components';
import { WellnessHome } from '../screens/wellness/WellnessHome';
import { HealthProfileEditScreen, HealthProfileScreen } from '../screens/wellness/HealthScreens';
import { DietPlanDetailScreen, DietPlansScreen, DietRequestFormScreen } from '../screens/wellness/DietScreens';

export type WellnessStackParamList = {
  WellnessHome: undefined;
  HealthProfile: undefined;
  HealthProfileEdit: undefined;
  DietPlans: undefined;
  DietRequestForm: undefined;
  DietPlanDetail: { planId: string };
};

const Stack = createNativeStackNavigator<WellnessStackParamList>();

const stackOptions = { headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text, contentStyle: { backgroundColor: colors.bg } };

/**
 * Wellness stack: Health profile and Diet plan. `extraScreens` lets the host add the screens of further entries (for example
 * Workouts) to the same stack; register their landing entry with registerWellnessEntry (src/wellness/entries.ts).
 */
export function WellnessNavigator({ extraScreens }: { extraScreens?: React.ReactNode }) {
  return (
    <Stack.Navigator screenOptions={stackOptions} initialRouteName="WellnessHome">
      <Stack.Screen name="WellnessHome" component={WellnessHome} options={{ title: 'Wellness' }} />
      <Stack.Screen name="HealthProfile" component={HealthProfileScreen} options={{ title: 'Health profile' }} />
      <Stack.Screen name="HealthProfileEdit" component={HealthProfileEditScreen} options={{ title: 'Edit health profile' }} />
      <Stack.Screen name="DietPlans" component={DietPlansScreen} options={{ title: 'Diet plan' }} />
      <Stack.Screen name="DietRequestForm" component={DietRequestFormScreen} options={{ title: 'Request a diet plan' }} />
      <Stack.Screen name="DietPlanDetail" component={DietPlanDetailScreen} options={{ title: 'Your plan' }} />
      {extraScreens}
    </Stack.Navigator>
  );
}
