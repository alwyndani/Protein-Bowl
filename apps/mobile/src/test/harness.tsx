import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRoot } from '../AppRoot';
import { AuthProvider } from '../auth/AuthProvider';
import { CheckoutAttemptProvider, CheckoutAttemptStore } from '../commerce/checkoutAttempt';
import { CheckoutScreen, OrderPlacedScreen } from '../screens/commerce/CheckoutScreens';
import { SessionManager } from '../auth/sessionManager';
import { secureSessionStorage } from '../auth/secureSession';
import type { FakeBackend } from './fakeBackend';

export const BASE = 'https://api.test/api/v1';
export const CLIENT = 'protein-bowl-mobile/1.0.0 (android)';

/** Put a valid credential into the (mock) keychain exactly as a previous run would have, then forget the traffic. */
export async function seedDevice(backend: FakeBackend, email = 'cust@b.test') {
  if (!backend.users.has(email)) backend.addUser({ email, fullName: 'Asha Rao' });
  const m = new SessionManager({ storage: secureSessionStorage, baseUrl: BASE, clientHeader: CLIENT, fetchImpl: backend.fetch as unknown as typeof fetch });
  await m.signIn(email, 'Password-123');
  backend.log.length = 0;
}

export function mountApp(backend: FakeBackend, opts: { timeoutMs?: number } = {}) {
  let manager!: SessionManager;
  const createManager = (onCleared: () => void) => {
    manager = new SessionManager({
      storage: secureSessionStorage,
      baseUrl: BASE,
      clientHeader: CLIENT,
      timeoutMs: opts.timeoutMs ?? 200,
      fetchImpl: backend.fetch as unknown as typeof fetch,
      onSessionCleared: onCleared
    });
    return manager;
  };
  const view = render(<AppRoot createManager={createManager} />);
  return { getManager: () => manager, unmount: view.unmount };
}

export const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));
export const pressAsync = async (name: string) => fireEvent.press(await screen.findByRole('button', { name }));
export const tab = async (label: 'Menu' | 'Orders' | 'Account') => fireEvent.press(await screen.findByLabelText(`${label} tab`));

const DirectStack = createNativeStackNavigator<any>();

/** Mount the REAL CheckoutScreen directly for an arbitrary route address, with a caller-supplied (possibly pre-frozen) attempt store. */
export async function mountCheckoutDirect(backend: FakeBackend, store: CheckoutAttemptStore, addressId: string) {
  await seedDevice(backend, 'cust@b.test');
  const manager = new SessionManager({ storage: secureSessionStorage, baseUrl: BASE, clientHeader: CLIENT, timeoutMs: 200, fetchImpl: backend.fetch as unknown as typeof fetch });
  await manager.restore();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, networkMode: 'always' }, mutations: { retry: false, networkMode: 'always' } } });
  const Catalog = () => null;
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider manager={manager}>
        <CheckoutAttemptProvider store={store}>
          <NavigationContainer>
            <DirectStack.Navigator initialRouteName="Checkout">
              <DirectStack.Screen name="Catalog" component={Catalog} />
              <DirectStack.Screen name="Checkout" component={CheckoutScreen as never} initialParams={{ addressId }} />
              <DirectStack.Screen name="OrderPlaced" component={OrderPlacedScreen as never} />
            </DirectStack.Navigator>
          </NavigationContainer>
        </CheckoutAttemptProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
