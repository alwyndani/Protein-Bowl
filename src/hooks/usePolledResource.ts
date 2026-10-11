import { useCallback, useEffect, useRef, useState } from 'react';

/** UX values (not business rules): normal polling interval and the slower interval used after a failed refresh. */
export const POLL_MS = 10_000;
export const POLL_BACKOFF_MS = 30_000;

export interface PolledError {
  action: 'SIGN_IN' | 'REFRESH' | 'NONE';
  message: string;
}

interface Options<T, E extends PolledError> {
  /** One GET. Polling NEVER calls anything else. */
  fetcher: () => Promise<T>;
  /** A change of this key (e.g. the selected branch) resets the data and reloads. */
  resetKey: string;
  describeError: (err: unknown) => E;
  enabled?: boolean;
  onSessionExpired?: () => void;
  serverTimeOf?: (data: T) => string;
  intervalMs?: number;
  backoffMs?: number;
}

/**
 * A polled, read-only server resource (the P8 pattern, shared by the delivery workspace and the delivery monitor).
 * One request is in flight at a time; the FIRST load always happens (even in a hidden tab) while later polling pauses while hidden and
 * refreshes immediately when the tab is visible again; a failed refresh keeps the last data on screen (flagged stale) and slows polling.
 * The database decides every outcome: nothing here is a concurrency control.
 */
export function usePolledResource<T, E extends PolledError>({ fetcher, resetKey, describeError, enabled = true, onSessionExpired, serverTimeOf, intervalMs = POLL_MS, backoffMs = POLL_BACKOFF_MS }: Options<T, E>) {
  const [data, setData] = useState<T | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<E | null>(null);
  const [stale, setStale] = useState(false);
  const [lastUpdatedMs, setLastUpdatedMs] = useState<number | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);

  const mounted = useRef(true);
  const refreshing = useRef(false);
  const trailing = useRef(false);
  const failures = useRef(0);
  const halted = useRef(false);
  const latest = useRef({ fetcher, describeError, onSessionExpired, serverTimeOf, hasData: false });
  latest.current = { fetcher, describeError, onSessionExpired, serverTimeOf, hasData: data !== null };

  useEffect(() => {
    mounted.current = true; // StrictMode runs setup -> cleanup -> setup
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async (): Promise<boolean> => {
    if (halted.current) return false;
    if (refreshing.current) {
      trailing.current = true; // run once more after the in-flight request (e.g. right after an action)
      return false;
    }
    refreshing.current = true;
    try {
      const next = await latest.current.fetcher();
      if (!mounted.current) return false;
      failures.current = 0;
      setData(next);
      setLoadState('ready');
      setLoadError(null);
      setStale(false);
      setLastUpdatedMs(Date.now());
      const serverTime = latest.current.serverTimeOf?.(next);
      if (serverTime) setClockOffsetMs(new Date(serverTime).getTime() - Date.now());
      return true;
    } catch (err) {
      const info = latest.current.describeError(err);
      failures.current += 1;
      if (info.action === 'SIGN_IN') {
        halted.current = true; // stop polling a dead session
        latest.current.onSessionExpired?.();
      }
      if (mounted.current) {
        if (latest.current.hasData) setStale(true);
        else setLoadState('error');
        setLoadError(info);
      }
      return false;
    } finally {
      refreshing.current = false;
      if (trailing.current && mounted.current && !halted.current) {
        trailing.current = false;
        void refresh();
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    halted.current = false;
    failures.current = 0;
    setLoadState('loading');
    setData(null);
    setStale(false);
    setLoadError(null);

    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const schedule = () => {
      clear();
      if (cancelled || halted.current) return;
      timer = setTimeout(() => void tick(), failures.current > 0 ? backoffMs : intervalMs);
    };
    const tick = async () => {
      timer = null;
      if (cancelled || halted.current) return;
      if (document.hidden) return; // paused while hidden: the visibility listener resumes it
      await refresh();
      if (!cancelled) schedule();
    };
    const onVisible = () => {
      if (document.hidden || cancelled || halted.current) return;
      clear();
      void tick(); // refresh immediately when the tab is visible again
    };

    document.addEventListener('visibilitychange', onVisible);
    // The FIRST load always happens (a page opened in a background tab must not sit on "Loading"); only the repeated polling pauses while hidden.
    void refresh().then(() => {
      if (!cancelled) schedule();
    });
    return () => {
      cancelled = true;
      clear();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, resetKey, intervalMs, backoffMs, refresh]);

  /** Used by action wrappers when the session died during an action. */
  const halt = useCallback(() => {
    halted.current = true;
    latest.current.onSessionExpired?.();
  }, []);

  return { data, loadState, loadError, stale, lastUpdatedMs, clockOffsetMs, refresh, halt, isMounted: mounted };
}
