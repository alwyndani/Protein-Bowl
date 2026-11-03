import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from './apiClient';
import { DeliveryOperateService } from './deliveryOperateService';
import { MessOperateService } from './messOperateService';

const STEP_UP_HEADER = 'X-Step-Up-Token';
const ORDER = '0b9f2d6e-1c0e-4c53-9d1c-7a5e8b1a2c3d';
const RUN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STOP = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DRIVER = '11111111-1111-4111-8111-111111111111';

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe('SUPER_ADMIN delivery operation services (HTTP contract)', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { changed: true, order: { id: ORDER }, run: { id: RUN } } }));
    ApiClient.setAccessToken('admin-access-token');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    ApiClient.setAccessToken(null);
  });

  const last = () => {
    const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    const i = init as RequestInit & { headers: Record<string, string> };
    return { path: new URL(String(url)).pathname.replace(/^.*\/api\/v1/, ''), method: i.method ?? 'GET', headers: i.headers, body: i.body ? JSON.parse(String(i.body)) : undefined, raw: String(i.body ?? '') };
  };

  it('the read (delivery details) is a plain GET with NO step-up header', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: { order: { id: ORDER } } }));
    const order = await DeliveryOperateService.getOrder(ORDER);
    const c = last();
    expect(order).toEqual({ id: ORDER });
    expect(c.method).toBe('GET');
    expect(c.path).toBe(`/admin/delivery/orders/${ORDER}`);
    expect(c.headers[STEP_UP_HEADER]).toBeUndefined();
    expect(c.headers.Authorization).toBe('Bearer admin-access-token');
  });

  it('every direct-order write goes to the administrator route, sends the proof ONLY as X-Step-Up-Token and sends exactly the approved body fields', async () => {
    const calls: Array<[string, () => Promise<unknown>, string, object]> = [
      ['dispatch', () => DeliveryOperateService.dispatch(ORDER, 'PROOF-1'), `/admin/delivery/orders/${ORDER}/dispatch`, {}],
      ['takeover', () => DeliveryOperateService.takeover(ORDER, { expectedDriverId: DRIVER, reason: '  Driver is unavailable  ' }, 'PROOF-1'), `/admin/delivery/orders/${ORDER}/takeover`, { expectedDriverId: DRIVER, reason: 'Driver is unavailable' }],
      ['verify', () => DeliveryOperateService.verify(ORDER, '123456', 'PROOF-1'), `/admin/delivery/orders/${ORDER}/verify-delivery`, { code: '123456' }],
      ['report failure', () => DeliveryOperateService.reportFailure(ORDER, { reasonCode: 'WRONG_ADDRESS', note: ' door locked ' }, 'PROOF-1'), `/admin/delivery/orders/${ORDER}/report-failure`, { reasonCode: 'WRONG_ADDRESS', note: 'door locked' }],
      ['report failure without a note', () => DeliveryOperateService.reportFailure(ORDER, { reasonCode: 'OTHER', note: '   ' }, 'PROOF-1'), `/admin/delivery/orders/${ORDER}/report-failure`, { reasonCode: 'OTHER' }],
      ['retry', () => DeliveryOperateService.retry(ORDER, { expectedAttemptNumber: 2, reasonCode: 'ADDRESS_CORRECTED', note: ' new gate ' }, 'PROOF-1'), `/admin/delivery/orders/${ORDER}/retry`, { expectedAttemptNumber: 2, reasonCode: 'ADDRESS_CORRECTED', note: 'new gate' }],
      ['retry without a note', () => DeliveryOperateService.retry(ORDER, { expectedAttemptNumber: 1, reasonCode: 'OPERATIONAL_RETRY' }, 'PROOF-1'), `/admin/delivery/orders/${ORDER}/retry`, { expectedAttemptNumber: 1, reasonCode: 'OPERATIONAL_RETRY' }],
      ['resume', () => DeliveryOperateService.resume(ORDER, 'PROOF-1'), `/admin/delivery/orders/${ORDER}/resume`, {}]
    ];
    for (const [name, call, path, body] of calls) {
      fetchMock.mockClear();
      await call();
      const c = last();
      expect(c.method, name).toBe('POST');
      expect(c.path, name).toBe(path);
      expect(c.headers[STEP_UP_HEADER], name).toBe('PROOF-1');
      expect(c.body, name).toEqual(body);
      expect(c.raw, `${name}: the proof must never be in the body`).not.toContain('PROOF-1');
    }
  });

  it('every Mess write goes to the administrator route, sends the proof only as the header and exactly the approved body fields', async () => {
    const calls: Array<[string, () => Promise<unknown>, string, object]> = [
      ['claim', () => MessOperateService.claimRun(RUN, 'PROOF-2'), `/admin/mess/delivery/runs/${RUN}/claim`, {}],
      ['dispatch', () => MessOperateService.dispatchRun(RUN, 'PROOF-2'), `/admin/mess/delivery/runs/${RUN}/dispatch`, {}],
      ['takeover', () => MessOperateService.takeoverRun(RUN, { expectedEmployeeId: DRIVER, reason: '  Driver is unavailable  ' }, 'PROOF-2'), `/admin/mess/delivery/runs/${RUN}/takeover`, { expectedEmployeeId: DRIVER, reason: 'Driver is unavailable' }],
      ['verify', () => MessOperateService.verifyStop(RUN, STOP, '654321', 'PROOF-2'), `/admin/mess/delivery/runs/${RUN}/stops/${STOP}/verify`, { code: '654321' }],
      ['fail', () => MessOperateService.failStop(RUN, STOP, 'OTHER', ' gate shut ', 'PROOF-2'), `/admin/mess/delivery/runs/${RUN}/stops/${STOP}/fail`, { reasonCode: 'OTHER', note: 'gate shut' }],
      ['fail without a note', () => MessOperateService.failStop(RUN, STOP, 'VEHICLE_ISSUE', undefined, 'PROOF-2'), `/admin/mess/delivery/runs/${RUN}/stops/${STOP}/fail`, { reasonCode: 'VEHICLE_ISSUE' }],
      ['retry', () => MessOperateService.retryStop(RUN, STOP, 'PROOF-2'), `/admin/mess/delivery/runs/${RUN}/stops/${STOP}/retry`, {}]
    ];
    for (const [name, call, path, body] of calls) {
      fetchMock.mockClear();
      await call();
      const c = last();
      expect(c.method, name).toBe('POST');
      expect(c.path, name).toBe(path);
      expect(c.headers[STEP_UP_HEADER], name).toBe('PROOF-2');
      expect(c.body, name).toEqual(body);
      expect(c.raw, name).not.toContain('PROOF-2');
    }
  });

  it('ids are URL-encoded and a failing write rejects with the server code (never swallowed or retried)', async () => {
    fetchMock.mockClear();
    await DeliveryOperateService.dispatch('a/b?c', 'P');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/admin/delivery/orders/a%2Fb%3Fc/dispatch');

    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: false, message: 'x', error: 'DELIVERY_OWNED_BY_DRIVER' }, 409));
    await expect(DeliveryOperateService.dispatch(ORDER, 'P')).rejects.toMatchObject({ code: 'DELIVERY_OWNED_BY_DRIVER', status: 409 });
    expect(fetchMock).toHaveBeenCalledTimes(1); // no automatic retry
  });

  it('the Mess service exposes exactly the six administrator writes and no read of its own', () => {
    expect(Object.getOwnPropertyNames(MessOperateService).filter((n) => typeof (MessOperateService as never as Record<string, unknown>)[n] === 'function' && !['run', 'stop'].includes(n)).sort() /* run/stop = private URL helpers */).toEqual(['claimRun', 'dispatchRun', 'failStop', 'retryStop', 'takeoverRun', 'verifyStop']);
  });
});
