import React, { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('../services/deliveryService', () => ({
  DeliveryService: { getQueue: vi.fn(), act: vi.fn(), reportFailure: vi.fn(), verifyDelivery: vi.fn(), overrideDelivery: vi.fn(), getMonitor: vi.fn(), listDrivers: vi.fn(), assign: vi.fn() }
}));

import { DeliveryService } from '../services/deliveryService';
import { ApiRequestError } from '../services/apiClient';
import { DELIVERY_BACKOFF_MS, DELIVERY_POLL_MS, useDeliveryQueue } from './useDeliveryQueue';
import { DB_B, areaOrder, driverQueue, ownedOrder } from '../test/deliveryFixtures';

const getQueue = vi.mocked(DeliveryService.getQueue);
const actApi = vi.mocked(DeliveryService.act);
const reportApi = vi.mocked(DeliveryService.reportFailure);

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
  getQueue.mockResolvedValue(driverQueue({ available: [areaOrder()] }));
});
afterEach(() => vi.useRealTimers());

describe('useDeliveryQueue polling', () => {
  it('loads once at start, then polls about every 10 seconds, and polling is GET-only (no action is ever sent)', async () => {
    renderHook(() => useDeliveryQueue());
    await advance(0);
    expect(getQueue).toHaveBeenCalledTimes(1);
    await advance(DELIVERY_POLL_MS);
    expect(getQueue).toHaveBeenCalledTimes(2);
    await advance(DELIVERY_POLL_MS * 3);
    expect(getQueue).toHaveBeenCalledTimes(5);
    expect(actApi).not.toHaveBeenCalled();
    expect(reportApi).not.toHaveBeenCalled();
  });

  it('pauses while the tab is hidden and refreshes immediately when it becomes visible again', async () => {
    renderHook(() => useDeliveryQueue());
    await advance(0);
    setHidden(true);
    await advance(DELIVERY_POLL_MS * 4);
    expect(getQueue).toHaveBeenCalledTimes(1);
    setHidden(false);
    await advance(0);
    expect(getQueue).toHaveBeenCalledTimes(2);
    await advance(DELIVERY_POLL_MS);
    expect(getQueue).toHaveBeenCalledTimes(3);
  });

  it('a page that LOADS in a hidden tab still fetches once (only the repeated polling pauses), then resumes when visible', async () => {
    hidden = true;
    const { result } = renderHook(() => useDeliveryQueue());
    await advance(0);
    expect(getQueue).toHaveBeenCalledTimes(1);
    expect(result.current.loadState).toBe('ready');
    await advance(DELIVERY_POLL_MS * 4);
    expect(getQueue).toHaveBeenCalledTimes(1);
    setHidden(false);
    await advance(0);
    expect(getQueue).toHaveBeenCalledTimes(2);
  });

  it('keeps ONE request in flight: a slow response is not overlapped by the next tick or a manual refresh (one trailing refresh follows)', async () => {
    let release!: () => void;
    getQueue.mockImplementationOnce(() => new Promise((res) => (release = () => res(driverQueue()))));
    const { result } = renderHook(() => useDeliveryQueue());
    await advance(0);
    await act(async () => void (await result.current.refresh()));
    await act(async () => void (await result.current.refresh()));
    expect(getQueue).toHaveBeenCalledTimes(1);
    await act(async () => release());
    await advance(0);
    expect(getQueue).toHaveBeenCalledTimes(2);
  });

  it('a failed refresh keeps the last list (stale) with safe copy and backs off to ~30 s', async () => {
    const { result } = renderHook(() => useDeliveryQueue());
    await advance(0);
    expect(result.current.queue).not.toBeNull();
    getQueue.mockRejectedValue(new ApiRequestError('boom <raw backend text>', 'INTERNAL_SERVER_ERROR', 500));
    await advance(DELIVERY_POLL_MS);
    expect(result.current.stale).toBe(true);
    expect(result.current.queue).not.toBeNull();
    expect(result.current.loadError?.message).not.toMatch(/raw backend/);
    await advance(DELIVERY_POLL_MS * 2);
    expect(getQueue).toHaveBeenCalledTimes(2);
    await advance(DELIVERY_BACKOFF_MS - DELIVERY_POLL_MS * 2 + 1);
    expect(getQueue).toHaveBeenCalledTimes(3);
    getQueue.mockResolvedValue(driverQueue());
    await advance(DELIVERY_BACKOFF_MS);
    expect(result.current.stale).toBe(false);
  });

  it('an initial failure shows an error state, a dead session stops polling and is reported once', async () => {
    getQueue.mockRejectedValue(new ApiRequestError('Token expired', 'INVALID_TOKEN', 401));
    const onSessionExpired = vi.fn();
    const { result } = renderHook(() => useDeliveryQueue({ onSessionExpired }));
    await advance(0);
    expect(result.current.loadState).toBe('error');
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    await advance(DELIVERY_BACKOFF_MS * 3);
    expect(getQueue).toHaveBeenCalledTimes(1);
  });

  it('works under React StrictMode', async () => {
    const { result } = renderHook(() => useDeliveryQueue(), { wrapper: ({ children }) => <StrictMode>{children}</StrictMode> });
    await advance(0);
    expect(result.current.loadState).toBe('ready');
    expect(result.current.queue?.sections.available.items).toHaveLength(1);
  });

  it('changing the branch resets the list and requests that branch only', async () => {
    const { result, rerender } = renderHook(({ branchId }: { branchId?: string }) => useDeliveryQueue({ branchId }), { initialProps: {} as { branchId?: string } });
    await advance(0);
    expect(getQueue).toHaveBeenLastCalledWith(undefined);
    rerender({ branchId: DB_B.id });
    await advance(0);
    expect(getQueue).toHaveBeenLastCalledWith(DB_B.id);
    expect(result.current.loadState).toBe('ready');
  });
});

describe('useDeliveryQueue actions', () => {
  it('a double click sends ONE claim (the second tap is ignored synchronously) and success refreshes the list', async () => {
    const order = areaOrder();
    getQueue.mockResolvedValue(driverQueue({ available: [order] }));
    let finish!: () => void;
    actApi.mockImplementation(() => new Promise((res) => (finish = () => res({ changed: true, order: ownedOrder({ id: order.id }) }))));
    const { result } = renderHook(() => useDeliveryQueue());
    await advance(0);
    await act(async () => {
      void result.current.act(order.id, 'claim');
      void result.current.act(order.id, 'claim');
      void result.current.act(order.id, 'claim');
    });
    expect(actApi).toHaveBeenCalledTimes(1);
    expect(actApi).toHaveBeenCalledWith(order.id, 'claim');
    expect(result.current.actions[order.id].pending).toBe(true);
    const before = getQueue.mock.calls.length;
    await act(async () => finish());
    await advance(0);
    expect(result.current.actions[order.id].pending).toBe(false);
    expect(getQueue.mock.calls.length).toBeGreaterThan(before);
  });

  it('a double dispatch is one request too, and a no-op (already done in another tab) is a notice, not an error', async () => {
    const order = ownedOrder();
    actApi.mockResolvedValue({ changed: false, order });
    const { result } = renderHook(() => useDeliveryQueue());
    await advance(0);
    await act(async () => {
      void result.current.act(order.id, 'dispatch');
      void result.current.act(order.id, 'dispatch');
    });
    expect(actApi).toHaveBeenCalledTimes(1);
    expect(result.current.notice).toMatch(/already in that step/i);
    expect(result.current.actions[order.id].error).toBeNull();
  });

  it('a stale card (another driver claimed it) shows safe mapped copy - never the raw message - and refreshes the list', async () => {
    const order = areaOrder();
    actApi.mockRejectedValue(new ApiRequestError('This order has already been claimed by driver 22222222', 'ALREADY_CLAIMED', 409));
    const { result } = renderHook(() => useDeliveryQueue());
    await advance(0);
    const before = getQueue.mock.calls.length;
    await act(async () => void (await result.current.act(order.id, 'claim')));
    await advance(0);
    const error = result.current.actions[order.id].error!;
    expect(error).toMatch(/another driver has already claimed/i);
    expect(error).not.toMatch(/22222222/);
    expect(getQueue.mock.calls.length).toBeGreaterThan(before);
  });

  it('a 404 (foreign branch / not owned / gone) is one safe copy; an expired session during an action is reported', async () => {
    const onSessionExpired = vi.fn();
    actApi.mockRejectedValueOnce(new ApiRequestError('Order not found', 'ORDER_NOT_FOUND', 404));
    const { result } = renderHook(() => useDeliveryQueue({ onSessionExpired }));
    await advance(0);
    await act(async () => void (await result.current.act('o1', 'dispatch')));
    expect(result.current.actions.o1.error).toMatch(/no longer available/i);
    actApi.mockRejectedValueOnce(new ApiRequestError('jwt expired', 'INVALID_TOKEN', 401));
    await act(async () => void (await result.current.act('o2', 'claim')));
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('report-failure sends the structured reason only and shares the per-order double-click guard', async () => {
    const order = outOrderLike();
    reportApi.mockResolvedValue({ changed: true, order });
    const { result } = renderHook(() => useDeliveryQueue());
    await advance(0);
    await act(async () => {
      void result.current.reportFailure(order.id, { reasonCode: 'WRONG_ADDRESS', note: 'No such number' });
      void result.current.reportFailure(order.id, { reasonCode: 'WRONG_ADDRESS', note: 'No such number' });
    });
    expect(reportApi).toHaveBeenCalledTimes(1);
    expect(reportApi).toHaveBeenCalledWith(order.id, { reasonCode: 'WRONG_ADDRESS', note: 'No such number' });
  });

  it('two tabs converge: an order claimed and dispatched elsewhere simply moves between sections on the next refresh', async () => {
    const order = areaOrder();
    getQueue.mockResolvedValueOnce(driverQueue({ available: [order] }));
    const { result } = renderHook(() => useDeliveryQueue());
    await advance(0);
    expect(result.current.queue?.sections.available.items).toHaveLength(1);
    getQueue.mockResolvedValue(driverQueue({ mine: [ownedOrder({ id: order.id })] }));
    await advance(DELIVERY_POLL_MS);
    expect(result.current.queue?.sections.available.items).toHaveLength(0);
    expect(result.current.queue?.sections.mine.items).toHaveLength(1);
  });
});

function outOrderLike() {
  return ownedOrder({ status: 'DISPATCHED', assignment: { state: 'FAILED', pickupTime: '2026-10-11T09:05:00.000Z', issueReported: true, attemptNumber: 1, maxAttempts: 3 } });
}
