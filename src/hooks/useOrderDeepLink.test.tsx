import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useOrderDeepLink } from './useOrderDeepLink';
import { orderPath, parseOrderRoute } from '../utils/orderRoute';

const open = vi.fn();
const close = vi.fn();
const requireAuth = vi.fn();
let api: ReturnType<typeof useOrderDeepLink>;

function Probe({ authLoading, signedIn, authenticated = false }: { authLoading: boolean; signedIn: boolean; authenticated?: boolean }) {
  api = useOrderDeepLink({
    authLoading,
    isAuthenticated: authenticated,
    open,
    close,
    requireAuth: (action) => {
      requireAuth();
      if (signedIn) action(); // signed out: the host would show the sign-in flow and run the action AFTER a successful sign-in
    }
  });
  return null;
}

const go = (path: string) => window.history.replaceState({}, '', path);

beforeEach(() => {
  vi.clearAllMocks();
  go('/');
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => go('/'));

describe('order deep links (/orders/<orderNumber>) without a router', () => {
  it('parses only well-formed order paths', () => {
    expect(parseOrderRoute('/orders/PB-261010-ABC123')).toBe('PB-261010-ABC123');
    expect(parseOrderRoute('/orders/PB-261010-ABC123/')).toBe('PB-261010-ABC123');
    for (const bad of ['/', '/orders', '/orders/', '/orders/a', '/orders/x/y', '/staff/accept-invite', '/orders/../etc', '/orders/PB 1', '/orders/%3Cscript%3E']) expect(parseOrderRoute(bad), bad).toBeNull();
    expect(orderPath('PB-1-2')).toBe('/orders/PB-1-2');
  });

  it('waits for the session restoration, THEN opens the order from the URL (signed in)', () => {
    go('/orders/PB-100-200');
    const { rerender } = render(<Probe authLoading signedIn />);
    expect(open).not.toHaveBeenCalled();
    expect(requireAuth).not.toHaveBeenCalled();
    rerender(<Probe authLoading={false} signedIn />);
    expect(requireAuth).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('PB-100-200');
  });

  it('signed out: the sign-in flow is requested and the order is NOT opened without authentication', () => {
    go('/orders/PB-100-200');
    render(<Probe authLoading={false} signedIn={false} />);
    expect(requireAuth).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
  });

  it('signed out, sign-in flow dismissed after authenticating (its pending action never runs): the linked order still opens once the session exists (found in the browser E2E)', () => {
    go('/orders/PB-100-200');
    const { rerender } = render(<Probe authLoading={false} signedIn={false} authenticated={false} />);
    expect(open).not.toHaveBeenCalled();
    rerender(<Probe authLoading={false} signedIn={false} authenticated />);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('PB-100-200');
    rerender(<Probe authLoading={false} signedIn={false} authenticated />);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('a link that was waiting is NOT opened after the customer has navigated away from it', () => {
    go('/orders/PB-100-200');
    const { rerender } = render(<Probe authLoading={false} signedIn={false} authenticated={false} />);
    go('/');
    rerender(<Probe authLoading={false} signedIn={false} authenticated />);
    expect(open).not.toHaveBeenCalled();
  });

  it('when the sign-in flow DOES complete, the order opens exactly once (no double open from the authenticated effect)', () => {
    go('/orders/PB-100-200');
    let pending: (() => void) | undefined;
    function Host({ authenticated }: { authenticated: boolean }) {
      useOrderDeepLink({ authLoading: false, open, close, isAuthenticated: authenticated, requireAuth: (action) => (authenticated ? action() : void (pending = action)) });
      return null;
    }
    const { rerender } = render(<Host authenticated={false} />);
    act(() => pending!());
    expect(open).toHaveBeenCalledTimes(1);
    rerender(<Host authenticated />);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('does nothing for non-order URLs and handles the initial URL only once (a re-render never reopens it)', () => {
    go('/');
    const { rerender } = render(<Probe authLoading={false} signedIn />);
    rerender(<Probe authLoading={false} signedIn />);
    expect(open).not.toHaveBeenCalled();

    go('/orders/PB-100-200');
    rerender(<Probe authLoading={false} signedIn />);
    expect(open).not.toHaveBeenCalled(); // the initial URL was already handled; navigation is popstate's job
  });

  it('browser back/forward: an order URL opens it, any other URL closes the order UI', () => {
    render(<Probe authLoading={false} signedIn />);
    go('/orders/PB-300-400');
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(open).toHaveBeenCalledWith('PB-300-400');
    go('/');
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('pushOrder adds the order URL (once); clearOrder leaves it without adding history', () => {
    render(<Probe authLoading={false} signedIn />);
    const length = window.history.length;
    act(() => api.pushOrder('PB-500-600'));
    expect(window.location.pathname).toBe('/orders/PB-500-600');
    expect(window.history.length).toBe(length + 1);
    act(() => api.pushOrder('PB-500-600'));
    expect(window.history.length).toBe(length + 1);
    act(() => api.clearOrder());
    expect(window.location.pathname).toBe('/');
    expect(window.history.length).toBe(length + 1);
    act(() => api.clearOrder()); // already clear: no-op
    expect(window.location.pathname).toBe('/');
  });

  it('nothing is persisted: no localStorage / sessionStorage entry is ever written, and only the order NUMBER is in the URL', () => {
    go('/orders/PB-100-200');
    render(<Probe authLoading={false} signedIn />);
    act(() => api.pushOrder('PB-900-901'));
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('');
  });
});
