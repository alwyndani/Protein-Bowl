import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApiRequestError } from '../services/apiClient';
import { describeKitchenError } from '../utils/kitchenErrors';

const SRC = join(__dirname, '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const read = (rel: string) => strip(readFileSync(join(SRC, rel), 'utf8'));
const KITCHEN_FILES = ['services/kitchenService.ts', 'services/kitchenTypes.ts', 'hooks/useKitchenQueue.ts', 'utils/kitchenErrors.ts', 'components/erp/kitchen/KitchenQueue.tsx'];

describe('P8 kitchen web security / data minimization (static)', () => {
  it('the Chef workspace code has no payment, refund, COD, cash, price, contact, address or health vocabulary', () => {
    for (const rel of KITCHEN_FILES) {
      const text = read(rel);
      expect(text, rel).not.toMatch(/refund|\bcod\b|cash|payment|paymentStatus|paymentMethod|pay on delivery|netAmount|totalAmount|unitPrice|phone|email|deliveryAddress|customerName|fullName|health|lab report|allerg/i);
    }
  });

  it('the Chef code never imports the customer commerce, payment, refund or admin services', () => {
    for (const rel of KITCHEN_FILES) {
      const text = read(rel);
      expect(text, rel).not.toMatch(/from\s+['"][^'"]*(orderService|paymentService|cartService|adminService|addressService|dietService)['"]/);
    }
  });

  it('Chef actions send an EMPTY body: no status, payment, amount, customer or branch override can be submitted', () => {
    const svc = read('services/kitchenService.ts');
    const act = svc.slice(svc.indexOf('public static async act'), svc.indexOf('public static async listRouting'));
    expect(act).toContain("body: JSON.stringify({})");
    expect(act).not.toMatch(/status|paymentStatus|paymentMethod|amount|customer|branch/i);
    // the only action paths are the three approved ones
    expect(svc).not.toMatch(/dispatch|deliver|cancel|reject/i);
  });

  it('polling only ever calls the GET queue read; nothing mutating is reachable from the timer or visibility code', () => {
    const hook = readFileSync(join(SRC, 'hooks/useKitchenQueue.ts'), 'utf8');
    const start = hook.indexOf('// initial load + polling');
    const end = hook.indexOf('const act = useCallback');
    const polling = strip(hook.slice(start, end));
    expect(polling.length).toBeGreaterThan(300);
    expect(polling).toContain('refresh()');
    expect(polling).not.toMatch(/KitchenService\.(act|assignBranch)|\bact\(|assign/);
    expect(strip(hook)).toContain('KitchenService.getQueue(');
  });

  it('only the routing screen uses the step-up proof and the routing mutation; the Chef queue has neither', () => {
    expect(read('components/erp/kitchen/KitchenQueue.tsx')).not.toMatch(/useStepUp|assignBranch|listRouting|StepUp/);
    expect(read('hooks/useKitchenQueue.ts')).not.toMatch(/useStepUp|assignBranch|listRouting/);
  });

  it('nothing is persisted or logged by the kitchen code, and raw server messages are never rendered', () => {
    for (const rel of KITCHEN_FILES) {
      const text = read(rel);
      expect(text, rel).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|console\.(log|info|warn|error|debug)/);
      expect(text, rel).not.toMatch(/\b(err|error|e|ex|exception)\??\.message\b/); // user-visible text comes only from describeKitchenError's fixed copy
    }
  });

  it('the Chef UI never asserts a state itself: statuses shown come from the server DTO', () => {
    const ui = read('components/erp/kitchen/KitchenQueue.tsx');
    expect(ui).not.toMatch(/status\s*[:=]\s*['"](ACCEPTED|PREPARING|READY|CONFIRMED)['"]\s*[,}]/); // no optimistic local status writes
  });
});

describe('kitchen error mapping (safe copy, never raw text)', () => {
  const cases: Array<[number | undefined, string, string, 'SIGN_IN' | 'REFRESH' | 'NONE']> = [
    [401, 'INVALID_TOKEN', 'session has expired', 'SIGN_IN'],
    [403, 'FORBIDDEN', 'not allowed', 'NONE'],
    [403, 'NO_BRANCH_ASSIGNMENT', 'not assigned to a kitchen branch', 'NONE'],
    [404, 'ORDER_NOT_FOUND', 'no longer available', 'REFRESH'],
    [409, 'INVALID_ORDER_TRANSITION', 'already moved on', 'REFRESH'],
    [409, 'ORDER_STATE_CONFLICT', 'same time', 'REFRESH'],
    [409, 'ORDER_NOT_OPERATIONALLY_ELIGIBLE', 'cannot be worked on', 'REFRESH'],
    [409, 'ORDER_NOT_ROUTABLE', 'can no longer be routed', 'REFRESH'],
    [409, 'KITCHEN_BRANCH_CHANGED', 'changed', 'REFRESH'],
    [422, 'VALIDATION_ERROR', 'not valid', 'NONE'],
    [429, 'TOO_MANY_REQUESTS', 'too many requests', 'NONE'],
    [500, 'INTERNAL_SERVER_ERROR', 'server could not complete', 'NONE'],
    [503, 'SERVICE_UNAVAILABLE', 'server could not complete', 'NONE'],
    [undefined, 'NETWORK_ERROR', 'could not reach the server', 'NONE']
  ];
  it.each(cases)('%s %s -> safe copy', (status, code, copy, action) => {
    const info = describeKitchenError(new ApiRequestError('RAW SERVER TEXT select * from orders', code, status));
    expect(info.message.toLowerCase()).toContain(copy);
    expect(info.message).not.toMatch(/RAW|select|orders from/);
    expect(info.action).toBe(action);
  });

  it('unknown errors are generic', () => {
    expect(describeKitchenError(new Error('kaboom')).message).toBe('Something went wrong. Please try again.');
  });
});
