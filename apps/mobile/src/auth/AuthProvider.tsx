import React, { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { SessionManager } from './sessionManager';
import { AuthState } from './authTypes';

interface AuthContextValue {
  manager: SessionManager;
  state: AuthState;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Exposes the session (access token / user / status) to the tree. State lives in the framework-free SessionManager; this is only the
 * subscription glue. Session restoration starts once on mount.
 */
export function AuthProvider({ manager, children }: { manager: SessionManager; children: React.ReactNode }) {
  const state = useSyncExternalStore(manager.subscribe, manager.getState, manager.getState);
  useEffect(() => {
    void manager.restore();
  }, [manager]);
  const value = useMemo(() => ({ manager, state }), [manager, state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
