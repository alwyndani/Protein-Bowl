import { useCallback, useEffect, useRef, useState } from 'react';
import { KitchenService } from '../services/kitchenService';
import type { KitchenAction, KitchenQueue } from '../services/kitchenTypes';
import { describeKitchenError, type KitchenErrorInfo } from '../utils/kitchenErrors';

/** UX values (not business rules): normal polling interval and the slower interval used after a failed refresh. */
export const KITCHEN_POLL_MS = 10_000;
export const KITCHEN_BACKOFF_MS = 30_000;

interface Options {
  /** Only a branch the server authorized for this account (the selector is built from the server's own `branches`). */
  branchId?: string;
  enabled?: boolean;
  onSessionExpired?: () => void;
  intervalMs?: number;
  backoffMs?: number;
}

export interface OrderActionState {
  pending: boolean;
  error: string | null;
}

/**
 * The kitchen queue with polling. Every background refresh is a GET of the queue and nothing else. One request is in flight at a time,
 * polling pauses while the tab is hidden and refreshes immediately when it is visible again; after a successful action the queue is
 * refreshed. A failed refresh keeps the last queue on screen (flagged stale) and slows polling to ~30 s.
 * The database decides every outcome: a disabled button is a convenience, never the protection (a stale card gets a clean 409 / no-op).
 */
export function useKitchenQueue({ branchId, enabled = true, onSessionExpired, intervalMs = KITCHEN_POLL_MS, backoffMs = KITCHEN_BACKOFF_MS }: Options = {}) {
  const [queue, setQueue] = useState<KitchenQueue | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<KitchenErrorInfo | null>(null);
  const [stale, setStale] = useState(false);
  const [lastUpdatedMs, setLastUpdatedMs] = useState<number | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [actions, setActions] = useState<Record<string, OrderActionState>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const mounted = useRef(true);
  const refreshing = useRef(false);
  const trailing = useRef(false);
  const failures = useRef(0);
  const halted = useRef(false);
  const actionBusy = useRef(new Set<string>());
  const latest = useRef({ branchId, onSessionExpired, hasQueue: false });
  latest.current = { branchId, onSessionExpired, hasQueue: queue !== null };

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
      const data = await KitchenService.getQueue(latest.current.branchId);
      if (!mounted.current) return false;
      failures.current = 0;
      setQueue(data);
      setLoadState('ready');
      setLoadError(null);
      setStale(false);
      setLastUpdatedMs(Date.now());
      setClockOffsetMs(new Date(data.serverTime).getTime() - Date.now());
      return true;
    } catch (err) {
      const info = describeKitchenError(err);
      failures.current += 1;
      if (info.action === 'SIGN_IN') {
        halted.current = true; // stop polling a dead session
        latest.current.onSessionExpired?.();
      }
      if (mounted.current) {
        if (latest.current.hasQueue) setStale(true);
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

  // initial load + polling (reset when the selected branch changes)
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    halted.current = false;
    failures.current = 0;
    setLoadState('loading');
    setQueue(null);
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
  }, [enabled, branchId, intervalMs, backoffMs, refresh]);

  const act = useCallback(
    async (orderId: string, action: KitchenAction): Promise<void> => {
      if (actionBusy.current.has(orderId)) return; // synchronous guard against double clicks / double taps
      actionBusy.current.add(orderId);
      setNotice(null);
      setActions((prev) => ({ ...prev, [orderId]: { pending: true, error: null } }));
      try {
        const result = await KitchenService.act(orderId, action);
        if (!mounted.current) return;
        setActions((prev) => ({ ...prev, [orderId]: { pending: false, error: null } }));
        if (!result.changed) setNotice('That order was already in that step. The queue has been refreshed.');
        void refresh();
      } catch (err) {
        const info = describeKitchenError(err);
        if (info.action === 'SIGN_IN') {
          halted.current = true;
          latest.current.onSessionExpired?.();
        }
        if (mounted.current) {
          setActions((prev) => ({ ...prev, [orderId]: { pending: false, error: info.message } }));
          if (info.action === 'REFRESH') void refresh();
        }
      } finally {
        actionBusy.current.delete(orderId);
      }
    },
    [refresh]
  );

  const dismissActionError = useCallback((orderId: string) => {
    setActions((prev) => ({ ...prev, [orderId]: { pending: false, error: null } }));
  }, []);

  return { queue, loadState, loadError, stale, lastUpdatedMs, clockOffsetMs, actions, notice, refresh, act, dismissActionError };
}
