import React from 'react';
import { AppRoot } from './src/AppRoot';
import { ConfigError, clientHeader, getAppConfig } from './src/config/appConfig';
import { SessionManager } from './src/auth/sessionManager';
import { secureSessionStorage } from './src/auth/secureSession';
import { ConfigErrorScreen } from './src/screens/SessionScreens';

let config: ReturnType<typeof getAppConfig> | null = null;
try {
  config = getAppConfig();
} catch (e) {
  if (!(e instanceof ConfigError)) throw e;
}

const createManager = (onSessionCleared: () => void) =>
  new SessionManager({
    storage: secureSessionStorage,
    baseUrl: config!.apiBaseUrl,
    clientHeader: clientHeader(config!),
    onSessionCleared
  });

export default function App() {
  if (!config) return <ConfigErrorScreen />;
  return <AppRoot createManager={createManager} />;
}
