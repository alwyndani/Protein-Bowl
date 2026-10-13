import React, { useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Body, Button, Notice, Screen, Spinner, Title } from '../ui/components';

export function SessionRestoringScreen() {
  return <Spinner label="Restoring your session" />;
}

/**
 * Shown when a refresh was sent but its outcome is unknown. No authenticated UI is shown. "Try again" is a deliberate USER action
 * (never automatic): if the server had already rotated the stored credential the retry can end the session, in which case the user
 * is signed out and asked to sign in again.
 */
export function SessionRecoveryScreen() {
  const { manager } = useAuth();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  async function run(action: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>We could not reconnect</Title>
      <Notice tone="info">We could not confirm your session because the connection was interrupted. Check your connection and try again, or sign in again.</Notice>
      <Body muted>For your security we do not retry this automatically.</Body>
      <Button label="Try again" busy={busy} onPress={() => run(() => manager.restore())} />
      <Button label="Sign in again" variant="secondary" disabled={busy} onPress={() => run(() => manager.abandonSession())} />
    </Screen>
  );
}

export function ConfigErrorScreen() {
  return (
    <Screen>
      <Title>App not configured</Title>
      <Notice>This build of the app is missing its server configuration. Please install an official version of Protein Bowl.</Notice>
    </Screen>
  );
}
