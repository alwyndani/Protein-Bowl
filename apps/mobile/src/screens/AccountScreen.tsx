import React, { useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../auth/AuthProvider';
import { Body, Button, Screen, Title } from '../ui/components';

/**
 * P11C-1 development-only native harness. `__DEV__` is a compile-time constant: in a production bundle this is `null` and the harness
 * module is not part of the bundle at all. It is not a navigation route and never touches orders or checkout.
 */
const RazorpayTestScreen: React.ComponentType<{ onClose: () => void }> | null = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('./dev/RazorpayTestScreen') as typeof import('./dev/RazorpayTestScreen')).RazorpayTestScreen
  : null;

/** Account: identity, delivery addresses and sign out. Kerala Mess and payment screens belong to later subphases. */
export function AccountScreen() {
  const { manager, state } = useAuth();
  const navigation = useNavigation<{ navigate: (name: string, params?: object) => void }>();
  const [busy, setBusy] = useState(false);
  const [showHarness, setShowHarness] = useState(false);
  const lock = useRef(false);
  if (state.status !== 'signedIn') return null;

  async function signOut() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await manager.signOut();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  if (RazorpayTestScreen && showHarness) return <RazorpayTestScreen onClose={() => setShowHarness(false)} />;

  return (
    <Screen>
      <Title>Account</Title>
      {state.user.fullName ? <Body>{state.user.fullName}</Body> : null}
      <Body muted>{state.user.email}</Body>
      <Button label="Delivery addresses" variant="secondary" onPress={() => navigation.navigate('Menu', { screen: 'Addresses', params: { mode: 'manage' } })} />
      {RazorpayTestScreen ? <Button label="P11C-1 Razorpay Test" variant="secondary" onPress={() => setShowHarness(true)} /> : null}
      <Button label="Sign out" variant="secondary" busy={busy} onPress={signOut} />
    </Screen>
  );
}
