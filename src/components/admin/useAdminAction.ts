import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { AdminErrorInfo, describeAdminError } from './adminErrors';

/**
 * Runs ONE administrative request at a time (duplicate clicks are ignored while it is in flight), exposes pending state,
 * and converts every failure into a safe, user-facing AdminErrorInfo. A 401 ends the session via AuthContext.
 * A step-up cancellation is not an error and produces no message.
 */
export function useAdminAction() {
  const auth = useAuth();
  const authRef = useRef(auth);
  authRef.current = auth;
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AdminErrorInfo | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> => {
    if (inFlight.current) return { ok: false };
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      return { ok: true, value: await fn() };
    } catch (err) {
      const info = describeAdminError(err);
      if (mounted.current) setError(info.kind === 'cancelled' ? null : info);
      if (info.kind === 'session-expired') void authRef.current.logout();
      return { ok: false };
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);
  return { run, pending, error, clearError };
}
