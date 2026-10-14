import React, { useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthProvider';
import { SessionManager } from './auth/sessionManager';
import { CheckoutAttemptProvider, CheckoutAttemptStore } from './commerce/checkoutAttempt';
import { RootNavigator } from './navigation/RootNavigator';
import { colors } from './ui/components';

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, text: colors.text, border: colors.border, primary: colors.accent } };

/**
 * Composition root. The QueryClient is in-memory only (never persisted in P11A) and is cleared whenever the session ends, so no
 * authenticated server data outlives a sign-out. The manager is injected so tests can supply fakes.
 */
export function AppRoot({ createManager }: { createManager: (onSessionCleared: () => void) => SessionManager }) {
  const { queryClient, manager, attempts } = useMemo(() => {
    // networkMode 'always': a request is really attempted (and fails honestly offline) instead of being silently paused; nothing is retried.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, networkMode: 'always' }, mutations: { retry: false, networkMode: 'always' } } });
    const attempts = new CheckoutAttemptStore();
    return {
      queryClient,
      attempts,
      manager: createManager(() => {
        queryClient.clear();
        attempts.clear(); // the idempotency key / checkout attempt never outlives the session
      })
    };
  }, [createManager]);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider manager={manager}>
          <CheckoutAttemptProvider store={attempts}>
            <NavigationContainer theme={theme}>
              <RootNavigator />
            </NavigationContainer>
          </CheckoutAttemptProvider>
        </AuthProvider>
      </QueryClientProvider>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
