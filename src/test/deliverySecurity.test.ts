import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApiClient, ApiRequestError } from '../services/apiClient';
import { DeliveryService } from '../services/deliveryService';
import { describeDeliveryError } from '../utils/deliveryErrors';
import { isUiRoleAllowed } from '../utils/roleGuard';
import { orderStatusLabel } from '../utils/orderLabels';

const SRC = join(__dirname, '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const read = (rel: string) => strip(readFileSync(join(SRC, rel), 'utf8'));

/** B2a: the driver workspace, queue hook and driver service calls were removed with the DELIVERY role; these are the remaining delivery web files. */
const DELIVERY_FILES = ['services/deliveryService.ts', 'services/deliveryTypes.ts', 'hooks/usePolledResource.ts', 'hooks/useDeliveryMonitor.ts', 'utils/deliveryErrors.ts'];
const ALL_FILES = [...DELIVERY_FILES, 'components/admin/DeliveryMonitor.tsx'];

describe('P9A delivery web security / data minimization (static)', () => {
  it('the delivery web code has no payment, refund, COD, cash, price, email or health vocabulary (no payment collection exists)', () => {
    for (const rel of DELIVERY_FILES) {
      expect(read(rel), rel).not.toMatch(/refund|\bcod\b|cash|payment|paymentStatus|paymentMethod|pay on delivery|netAmount|totalAmount|unitPrice|price|health|lab report|allerg|\bemail\b/i);
    }
  });

  it('no delivery UI code can mark an order delivered, collect proof, or show tracking / maps (all later phases)', () => {
    for (const rel of ALL_FILES) {
      const text = read(rel);
      expect(text, rel).not.toMatch(/\bdelivered\b|mark[- ]?delivered|proof[- ]of[- ]delivery|\bpod\b|\botp\b|\bpin\b|signature|photo/i);
      expect(text, rel).not.toMatch(/geolocation|google\.maps|mapbox|leaflet|maps\.googleapis|watchPosition|\bgps\b/i);
      expect(text, rel).not.toMatch(/\bcod\b|cash/i);
    }
  });

  it('the delivery code never imports the customer commerce, payment, refund or other admin services', () => {
    for (const rel of ALL_FILES) {
      expect(read(rel), rel).not.toMatch(/from\s+['"][^'"]*(orderService|paymentService|cartService|addressService|dietService|kitchenService|adminService)['"]/);
    }
  });

  it('nothing is persisted, logged or rendered raw: no storage, no console, no err.message in any delivery file', () => {
    for (const rel of ALL_FILES) {
      const text = read(rel);
      expect(text, rel).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|console\.(log|info|warn|error|debug)/);
      expect(text, rel).not.toMatch(/\b(err|error|e|ex|exception)\??\.message\b/);
    }
  });

  it('the removed driver code cannot come back: no driver workspace, queue hook, driver service call or assignment call exists', () => {
    for (const rel of ['components/erp/delivery', 'hooks/useDeliveryQueue.ts']) expect(existsSync(join(SRC, rel)), rel).toBe(false);
    for (const rel of ALL_FILES) expect(read(rel), rel).not.toMatch(/DeliveryService\.(act|reportFailure|getQueue|verifyDelivery|assign|listDrivers)|listDrivers|delivery-assignment|\/delivery\/orders/);
    expect(Object.getOwnPropertyNames(DeliveryService).sort()).toEqual(['getMonitor', 'length', 'name', 'overrideDelivery', 'prototype']);
  });

  it('polling only ever calls the injected GET fetcher; nothing mutating is reachable from the timer or visibility code', () => {
    const hook = readFileSync(join(SRC, 'hooks/usePolledResource.ts'), 'utf8');
    const start = hook.indexOf('const refresh = useCallback');
    const end = hook.indexOf('/** Used by action wrappers');
    const polling = strip(hook.slice(start, end));
    expect(polling.length).toBeGreaterThan(800);
    expect(polling).toContain('latest.current.fetcher()');
    expect(polling).not.toMatch(/DeliveryService|\.act\(|assign|reportFailure|method:\s*['"](POST|PUT|PATCH|DELETE)/);
    // the monitor hook wires the fetcher to the GET read only
    expect(read('hooks/useDeliveryMonitor.ts')).toContain('fetcher: () => DeliveryService.getMonitor(branchId)');
  });

  it('the retired DeliveryDashboard is either deleted or an empty stub: it imports no service, API client or auth code, so it can grant no access to any delivery operation', () => {
    if (!existsSync(join(SRC, 'components/erp/DeliveryDashboard.tsx'))) return; // deleted: nothing to check
    const mock = read('components/erp/DeliveryDashboard.tsx');
    expect(mock).not.toMatch(/from\s+['"][^'"]*(services\/|apiClient|AuthContext|hooks\/)/);
    expect(mock).not.toMatch(/fetch\(|ApiClient|DeliveryService|verifyDelivery|\/delivery\//);
  });

  it('production gating: the App no longer renders any delivery-role workspace or mock delivery dashboard', () => {
    const app = readFileSync(join(SRC, 'App.tsx'), 'utf8');
    expect(app).not.toMatch(/DeliveryDashboard|DeliveryHome|DeliveryWorkspace/);
    expect(app).not.toMatch(/currentRole === 'delivery'/);
  });

  it('the customer tracking UI shows the order status text only: no delivery PIN / OTP / proof / fake tracking', () => {
    for (const rel of ['components/customer/DirectOrderTrackingModal.tsx', 'utils/orderLabels.ts']) {
      expect(read(rel), rel).not.toMatch(/delivery pin|\botp\b|mark delivered|proof of delivery|live tracking|track your driver|driver location/i);
    }
  });
});

describe('DeliveryService request shapes (SUPER_ADMIN only)', () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  beforeEach(() => {
    calls.length = 0;
    vi.spyOn(ApiClient, 'requestData').mockImplementation(async (path: string, init?: RequestInit) => {
      calls.push({ path, init });
      return {} as never;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('the monitor is a plain GET; the exceptional handover is a POST carrying the step-up proof header and only the approved body', async () => {
    await DeliveryService.getMonitor('branch-1');
    expect(calls[0].path).toBe('/delivery/monitor?branchId=branch-1');
    expect(calls[0].init).toBeUndefined();

    calls.length = 0;
    await DeliveryService.overrideDelivery('o 1', { reasonCode: 'CUSTOMER_CANNOT_ACCESS_CODE', note: '  Phone died  ' }, 'PROOF');
    expect(calls[0].path).toBe('/admin/orders/o%201/delivery-override');
    expect(calls[0].init?.method).toBe('POST');
    expect((calls[0].init?.headers as Record<string, string>)['X-Step-Up-Token']).toBe('PROOF');
    expect(JSON.parse(calls[0].init!.body as string)).toEqual({ reasonCode: 'CUSTOMER_CANNOT_ACCESS_CODE', note: 'Phone died', confirm: true });
  });
});

describe('delivery error mapping (safe copy, never raw text)', () => {
  const cases: Array<[number | undefined, string, string, 'SIGN_IN' | 'REFRESH' | 'NONE']> = [
    [401, 'INVALID_TOKEN', 'session has expired', 'SIGN_IN'],
    [403, 'FORBIDDEN', 'not allowed', 'NONE'],
    [403, 'NO_BRANCH_ASSIGNMENT', 'not assigned to a branch', 'NONE'],
    [403, 'BRANCH_FORBIDDEN', 'do not have access to that branch', 'REFRESH'],
    [404, 'ORDER_NOT_FOUND', 'no longer available', 'REFRESH'],
    [409, 'ALREADY_CLAIMED', 'another driver has already claimed', 'REFRESH'],
    [409, 'ORDER_NOT_CLAIMABLE', 'not ready for pickup', 'REFRESH'],
    [409, 'DELIVERY_ASSIGNMENT_CHANGED', 'changed', 'REFRESH'],
    [409, 'ORDER_NOT_ASSIGNABLE', 'only be assigned while the order is ready', 'REFRESH'],
    [409, 'INVALID_ORDER_TRANSITION', 'already moved on', 'REFRESH'],
    [409, 'ORDER_NOT_OPERATIONALLY_ELIGIBLE', 'cannot be taken for delivery right now', 'REFRESH'],
    [409, 'SOMETHING_NEW', 'changed in the meantime', 'REFRESH'],
    [422, 'DRIVER_INVALID', 'cannot be assigned', 'NONE'],
    [422, 'INVALID_DELIVERY_CODE', 'code is not correct', 'REFRESH'],
    [422, 'INVALID_DELIVERY_CODE_FORMAT', '6-digit', 'NONE'],
    [409, 'DELIVERY_CODE_NOT_ISSUED', 'has not generated a delivery code', 'REFRESH'],
    [409, 'DELIVERY_CODE_LOCKED', 'locked', 'REFRESH'],
    [409, 'DELIVERY_CODE_BLOCKED', 'blocked', 'REFRESH'],
    [409, 'DELIVERY_CODE_CHANGED', 'new delivery code', 'REFRESH'],
    [409, 'DELIVERY_IN_EXCEPTION', 'problem was reported', 'REFRESH'],
    [409, 'ALREADY_DELIVERED', 'already been completed', 'REFRESH'],
    [409, 'DELIVERY_CODE_ALREADY_ISSUED', 'already generated', 'REFRESH'],
    [409, 'DELIVERY_CODE_REGENERATION_LIMIT', 'limit for new delivery codes', 'NONE'],
    [429, 'DELIVERY_CODE_REGENERATE_LIMIT', 'several new codes', 'REFRESH'],
    [422, 'VALIDATION_ERROR', 'not valid', 'NONE'],
    [429, 'TOO_MANY_REQUESTS', 'too many requests', 'NONE'],
    [500, 'INTERNAL_SERVER_ERROR', 'server could not complete', 'NONE'],
    [503, 'SERVICE_UNAVAILABLE', 'server could not complete', 'NONE'],
    [undefined, 'NETWORK_ERROR', 'could not reach the server', 'NONE']
  ];
  it.each(cases)('%s %s -> safe copy', (status, code, copy, action) => {
    const info = describeDeliveryError(new ApiRequestError('RAW SERVER TEXT select * from orders', code, status));
    expect(info.message.toLowerCase()).toContain(copy);
    expect(info.message).not.toMatch(/RAW|select|orders from/);
    expect(info.action).toBe(action);
  });
  it('unknown errors are generic', () => {
    expect(describeDeliveryError(new Error('kaboom')).message).toBe('Something went wrong. Please try again.');
  });
});

describe('role guard and customer-visible state', () => {
  it('in production no session is presented a delivery workspace any more (UX only: the backend refuses a DELIVERY-only account at sign-in)', () => {
    for (const roles of [['DELIVERY'], ['CHEF'], ['SUPER_ADMIN'], ['MD'], ['CUSTOMER'], [], undefined]) expect(isUiRoleAllowed('delivery' as never, roles as string[] | undefined, false), JSON.stringify(roles)).toBe(false);
  });

  it('customers see READY as "Ready" and DISPATCHED as "Out for delivery"; the status vocabulary carries no PIN or tracking concept', () => {
    expect(orderStatusLabel('READY')).toBe('Ready');
    expect(orderStatusLabel('DISPATCHED')).toBe('Out for delivery');
    expect(orderStatusLabel('SOMETHING_ELSE')).toBe('Status updating');
  });
});
