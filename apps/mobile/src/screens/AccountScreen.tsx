import React, { useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Body, Button, Screen, Title } from '../ui/components';

/** P11A customer shell: identity + sign out. Commerce, Kerala Mess and payment screens belong to later subphases. */
export function AccountScreen() {
  const { manager, state } = useAuth();
  const [busy, setBusy] = useState(false);
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

  return (
    <Screen>
      <Title>Account</Title>
      {state.user.fullName ? <Body>{state.user.fullName}</Body> : null}
      <Body muted>{state.user.email}</Body>
      <Button label="Sign out" variant="secondary" busy={busy} onPress={signOut} />
    </Screen>
  );
}
