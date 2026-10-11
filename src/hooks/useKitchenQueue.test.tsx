import React, { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('../services/kitchenService', () => ({
  KitchenService: { getQueue: vi.fn(), act: vi.fn(), listRouting: vi.fn(), assignBranch: vi.fn() }
}));

import { KitchenService } from '../services/kitchenService';
import { ApiRequestError } from '../services/apiClient';
import { KITCHEN_BACKOFF_MS, KITCHEN_POLL_MS, useKitchenQueue } from './useKitchenQueue';
import { KB_A, KB_B, kitchenOrder, kitchenQueue } from '../test/kitchenFixtures';

const getQueue = vi.mocked(KitchenService.getQueue);
const actApi = vi.mocked(KitchenService.act);

let hidden = false;
const setHidden = (value: boolean) => {
  hidden = value;
  document.dispatchEvent(new Event('visibilitychange'));
};
const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  vi.clearAllMocks();
  hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  getQueue.mockResolvedValue(kitchenQueue({ CONFIRMED: [kitchenOrder()] }));
});
afterEach(() => vi.useRealTimers());

describe('useKitchenQueue polling', () => {
  it('loads once at start, then polls about every 10 seconds, and polling is GET-only (no action is ever sent)', async () => {
    renderHook(() => useKitchenQueue());
    await advance(0);
    expect(getQueue).toHaveBeenCalledTimes(1);
    await advance(KITCHEN_POLL_MS);
    expect(getQueue).toHaveBeenCalledTimes(2);
    await advance(KITCHEN_POLL_MS * 3);
    expect(getQueue).toHaveBeenCalledTimes(5);
    expect(actApi).not.toHaveBeenCalled();
    expect(KitchenService.assignBranch).not.toHaveBeenCalled();
  });

  it('pauses while the tab is hidden and refreshes immediately when it becomes visible again', async () => {
    renderHook(() => useKitchenQueue());
    await advance(0);
    setHidden(true);
    await advance(KITCHEN_POLL_MS * 4);
    expect(getQueue).toHaveBeenCalledTimes(1); // nothing while hidden
    setHidden(false);
    await advance(0);
    expect(getQueue).toHaveBeenCalledTimes(2); // immediate refresh on return
    await advance(KITCHEN_POLL_MS);
    expect(getQueue).toHaveBeenCalledTimes(3); // and polling resumed
  });

  it('found in the browser E2E: a page that LOADS in a hidden tab still fetches the queue once (only repeated polling pauses), then resumes when visible', async () => {
    hidden = true;
    const { result } = renderHook(() => useKitchenQueue());
    await advance(0);
    expect(getQueue).toHaveBeenCalledTimes(1);
    expect(result.current.loadState).toBe('ready');
    await advance(KITCHEN_POLL_MS * 4);
    expect(getQueue).toHaveBeenCalledTimes(1); // no polling while hidden
    setHidden(false);
    await advance(0);
    expect(getQueue).toHaveBeenCalledTimes(2);
  });

  it('keeps ONE request in flight: a slow response is not overlapped by the next tick or a manual refresh (a single trailing refresh follows)', async () => {
    let release!: () => void;
    getQueue.mockImplementationOnce(() => new Promise((res) => (release = () => res(kitchenQueue()))));
    const { result } = renderHook(() => useKitchenQueue());
    await advance(0);
    expect(getQueue).toHaveBeenCalledTimes(1);
    await act(async () => void (await result.current.refresh()));
    await act(async () => void (await result.current.refresh()));
    expect(getQueue).toHaveBeenCalledTimes(1);
    await act(async () => release());
    await advance(0);
    expect(getQueue).toHaveBeenCalledTimes(2); // exactly one trailing refresh
  });

  it('a failed refresh keeps the last queue on screen (stale) and backs off to ~30 s', async () => {
    const { result } = renderHook(() => useKitchenQueue());
    await advance(0);
    expect(result.current.queue).not.toBeNull();
    getQueue.mockRejectedValue(new ApiRequestError('boom <raw backend text>', 'INTERNAL_SERVER_ERROR', 500));
    await advance(KITCHEN_POLL_MS);
    expect(getQueue).toHaveBeenCalledTimes(2);
    expect(result.current.stale).toBe(true);
    expect(result.current.queue).not.toBeNull();
    expect(result.current.loadError?.message).not.toMatch(/raw backend/);
    await advance(KITCHEN_POLL_MS * 2);
    expect(getQueue).toHaveBeenCalledTimes(2); // still waiting: the backoff is longer than 10 s
    await advance(KITCHEN_BACKOFF_MS - KITCHEN_POLL_MS * 2 + 1);
    expect(getQueue).toHaveBeenCalledTimes(3);
    getQueue.mockResolvedValue(kitchenQueue());
    await advance(KITCHEN_BACKOFF_MS);
    expect(result.current.stale).toBe(false);
  });

  it('an initial failure shows an error state (no queue), a dead session stops polling and is reported once', async () => {
    getQueue.mockRejectedValue(new ApiRequestError('Token expired', 'INVALID_TOKEN', 401));
    const onSessionExpired = vi.fn();
    const { result } = renderHook(() => useKitchenQueue({ onSessionExpired }));
    await advance(0);
    expect(result.current.loadState).toBe('error');
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    await advance(KITCHEN_BACKOFF_MS * 3);
    expect(getQueue).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('works under React StrictMode (state updates are not dropped by the simulated unmount)', async () => {
    const { result } = renderHook(() => useKitchenQueue(), { wrapper: ({ children }) => <StrictMode>{children}</StrictMode> });
    await advance(0);
    expect(result.current.loadState).toBe('ready');
    expect(result.current.queue?.sections.CONFIRMED.items).toHaveLength(1);
  });

  it('changing the branch resets the queue and requests that branch only', async () => {
    const { result, rerender } = renderHook(({ branchId }: { branchId?: string }) => useKitchenQueue({ branchId }), { initialProps: {} as { branchId?: string } });
    await advance(0);
    expect(getQueue).toHaveBeenLastCalledWith(undefined);
    rerender({ branchId: KB_B.id });
    await advance(0);
    expect(getQueue).toHaveBeenLastCalledWith(KB_B.id);
    expect(result.current.loadState).toBe('ready');
  });
});

describe('useKitchenQueue actions', () => {
  it('a double click sends ONE action; success refreshes the queue; the action carries no body fields (the service sends none)', async () => {
    const order = kitchenOrder();
    getQueue.mockResolvedValue(kitchenQueue({ CONFIRMED: [order] }));
    let finish!: () => void;
    actApi.mockImplementation(() => new Promise((res) => (finish = () => res({ changed: true, order: { ...order, status: 'ACCEPTED' } }))));
    const { result } = renderHook(() => useKitchenQueue());
    await advance(0);
    await act(async () => {
      void result.current.act(order.id, 'accept');
      void result.current.act(order.id, 'accept');
      void result.current.act(order.id, 'accept');
    });
    expect(actApi).toHaveBeenCalledTimes(1);
    expect(actApi).toHaveBeenCalledWith(order.id, 'accept');
    expect(result.current.actions[order.id].pending).toBe(true);
    const before = getQueue.mock.calls.length;
    await act(async () => finish());
    await advance(0);
    expect(result.current.actions[order.id].pending).toBe(false);
    expect(getQueue.mock.calls.length).toBeGreaterThan(before);
  });

  it('a no-op (already done by another chef) shows a notice, not an error', async () => {
    const order = kitchenOrder();
    actApi.mockResolvedValue({ changed: false, order });
    const { result } = renderHook(() => useKitchenQueue());
    await advance(0);
    await act(async () => void (await result.current.act(order.id, 'accept')));
    expect(result.current.notice).toMatch(/already in that step/i);
    expect(result.current.actions[order.id].error).toBeNull();
  });

  it('a stale-card 409 shows safe mapped copy (never the raw message) and refreshes the queue', async () => {
    const order = kitchenOrder();
    actApi.mockRejectedValue(new ApiRequestError('An order that is CANCELLED cannot become ACCEPTED', 'INVALID_ORDER_TRANSITION', 409));
    const { result } = renderHook(() => useKitchenQueue());
    await advance(0);
    const before = getQueue.mock.calls.length;
    await act(async () => void (await result.current.act(order.id, 'accept')));
    await advance(0);
    const error = result.current.actions[order.id].error!;
    expect(error).toMatch(/already moved on|cancelled/i);
    expect(error).not.toMatch(/CANCELLED cannot become|ACCEPTED/);
    expect(getQueue.mock.calls.length).toBeGreaterThan(before);
  });

  it('a 404 (foreign branch / unrouted / unavailable) is the same safe copy and an expired session is reported', async () => {
    const order = kitchenOrder();
    const onSessionExpired = vi.fn();
    actApi.mockRejectedValueOnce(new ApiRequestError('Order not found', 'ORDER_NOT_FOUND', 404));
    const { result } = renderHook(() => useKitchenQueue({ onSessionExpired }));
    await advance(0);
    await act(async () => void (await result.current.act(order.id, 'start-preparing')));
    expect(result.current.actions[order.id].error).toMatch(/no longer available/i);
    actApi.mockRejectedValueOnce(new ApiRequestError('jwt expired', 'INVALID_TOKEN', 401));
    await act(async () => void (await result.current.act('other', 'mark-ready')));
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('multiple tabs converge: the same order moved by another tab simply shows up in the next refresh', async () => {
    const order = kitchenOrder();
    getQueue.mockResolvedValueOnce(kitchenQueue({ CONFIRMED: [order] }));
    const { result } = renderHook(() => useKitchenQueue());
    await advance(0);
    expect(result.current.queue?.sections.CONFIRMED.items).toHaveLength(1);
    getQueue.mockResolvedValue(kitchenQueue({ ACCEPTED: [{ ...order, status: 'ACCEPTED' }] })); // another tab accepted it
    await advance(KITCHEN_POLL_MS);
    expect(result.current.queue?.sections.CONFIRMED.items).toHaveLength(0);
    expect(result.current.queue?.sections.ACCEPTED.items).toHaveLength(1);
  });
});
