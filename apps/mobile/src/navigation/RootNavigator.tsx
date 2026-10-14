import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthProvider';
import { RegisterScreen, SignInScreen, WelcomeScreen } from '../screens/AuthScreens';
import { SessionRecoveryScreen, SessionRestoringScreen } from '../screens/SessionScreens';
import { colors } from '../ui/components';
import { MainTabs } from './MainTabs';
import type { AuthStackParamList } from './types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();

const screenOptions = { headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text, contentStyle: { backgroundColor: colors.bg } };

/**
 * Navigation guard by CONDITIONAL RENDERING: a route that is not rendered cannot be navigated to, so the authenticated shell does not
 * exist while the session is restoring, signed out or in recovery. Customer routes only - there is no staff, KDS or role-switch route.
 * (Frontend gating is UX; the backend authorizes every call.)
 */
export function RootNavigator() {
  const { state } = useAuth();
  switch (state.status) {
    case 'restoring':
      return <SessionRestoringScreen />;
    case 'recovery':
      return <SessionRecoveryScreen />;
    case 'signedIn':
      return <MainTabs />;
    default:
      return (
        <AuthStack.Navigator screenOptions={screenOptions} initialRouteName="Welcome">
          <AuthStack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
          <AuthStack.Screen name="SignIn" component={SignInScreen} options={{ title: 'Sign in' }} />
          <AuthStack.Screen name="Register" component={RegisterScreen} options={{ title: 'Create account' }} />
        </AuthStack.Navigator>
      );
  }
}
