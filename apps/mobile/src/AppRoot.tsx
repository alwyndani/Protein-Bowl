import React, { useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthProvider';
import { SessionManager } from './auth/sessionManager';
import { RootNavigator } from './navigation/RootNavigator';
import { colors } from './ui/components';

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, text: colors.text, border: colors.border, primary: colors.accent } };

/**
 * Composition root. The QueryClient is in-memory only (never persisted in P11A) and is cleared whenever the session ends, so no
 * authenticated server data outlives a sign-out. The manager is injected so tests can supply fakes.
 */
export function AppRoot({ createManager }: { createManager: (onSessionCleared: () => void) => SessionManager }) {
  const { queryClient, manager } = useMemo(() => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return { queryClient, manager: createManager(() => queryClient.clear()) };
  }, [createManager]);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider manager={manager}>
          <NavigationContainer theme={theme}>
            <RootNavigator />
          </NavigationContainer>
        </AuthProvider>
      </QueryClientProvider>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
