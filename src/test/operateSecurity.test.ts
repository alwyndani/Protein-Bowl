import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const read = (rel: string) => strip(readFileSync(join(SRC, rel), 'utf8'));

const SERVICES = ['services/deliveryOperateService.ts', 'services/messOperateService.ts'];
const UI = ['components/admin/DeliveryOperations.tsx', 'components/admin/OperateDirect.tsx', 'components/admin/OperateMess.tsx', 'components/admin/operateUi.tsx', 'components/admin/useOperateAction.ts'];
const ALL = [...SERVICES, ...UI, 'utils/operateErrors.ts'];

describe('SUPER_ADMIN delivery operations: security properties (static)', () => {
  it('every write method requires the step-up proof as an argument and sends it only through the header helper', () => {
    for (const rel of SERVICES) {
      const text = read(rel);
      const writes = [...text.matchAll(/public static async (\w+)\(([^)]*)\)/g)].filter(([, name]) => !/^(getOrder)$/.test(name));
      expect(writes.length, rel).toBeGreaterThan(0);
      for (const [, name, params] of writes) expect(params, `${rel}: ${name} must take the proof`).toMatch(/\bproof: string\b/);
      expect(text, rel).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
      // the proof is only ever placed in the header map, never in a body
      for (const m of text.matchAll(/JSON\.stringify\(([^)]*)\)/g)) expect(m[1], rel).not.toMatch(/proof/);
    }
  });

  it('the services call exactly the administrator endpoints and none of the legacy driver endpoints', () => {
    const direct = read('services/deliveryOperateService.ts');
    const mess = read('services/messOperateService.ts');
    expect([...direct.matchAll(/['"`](\/admin\/[^'"`$]*)/g)].map((m) => m[1]).sort()).toEqual(['/admin/delivery/orders/']);
    expect([...direct.matchAll(/this\.path\(orderId(?:, '([^']*)')?\)/g)].map((m) => m[1] ?? '').sort()).toEqual(['', '/dispatch', '/report-failure', '/resume', '/retry', '/takeover', '/verify-delivery']);
    expect([...mess.matchAll(/['"`](\/admin\/[^'"`$]*)/g)].map((m) => m[1]).sort()).toEqual(['/admin/mess/delivery/runs/']);
    expect([...mess.matchAll(/this\.(?:run|stop)\([^)]*?, ?'([^']*)'\)/g)].map((m) => m[1]).sort()).toEqual(['/claim', '/dispatch', '/fail', '/retry', '/takeover', '/verify']);
    for (const rel of ALL) {
      expect(read(rel), rel).not.toMatch(/['"`]\/delivery\/orders|['"`]\/mess\/delivery\/runs|DeliveryService\.(act|reportFailure|verifyDelivery|assign|overrideDelivery)|MessService\.(claimRun|dispatchRun|verifyStop|failStop|retryStop)/);
    }
  });

  it('the UI never reads or writes browser storage, logs, or renders raw server text', () => {
    for (const rel of ALL) {
      const text = read(rel);
      expect(text, rel).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|console\./);
    }
    expect(read('components/admin/OperateDirect.tsx') + read('components/admin/OperateMess.tsx')).not.toMatch(/err\.message|error\.message/);
  });

  it('the operation UI has no payment, cash, wallet, price or refund controls', () => {
    for (const rel of UI) {
      const text = read(rel);
      expect(text, rel).not.toMatch(/\bcod\b|cash|wallet|paymentMethod|totalAmount|netAmount|unitPrice|₹/i);
      expect(text, rel).not.toMatch(/PaymentService|OrderService|refundService|from\s+['"][^'"]*(paymentService|orderService|cartService)['"]/);
    }
  });

  it('every state-changing action in the UI goes through the step-up wrapper', () => {
    const direct = read('components/admin/OperateDirect.tsx');
    const mess = read('components/admin/OperateMess.tsx');
    expect([...direct.matchAll(/DeliveryOperateService\.(dispatch|takeover|verify|reportFailure|retry|resume)\(/g)].length).toBe(6);
    expect([...direct.matchAll(/withStepUp\(\(proof\) =>\s*\n?\s*DeliveryOperateService\./g)].length).toBe(6);
    expect([...mess.matchAll(/MessOperateService\.(claimRun|dispatchRun|takeoverRun|verifyStop|failStop|retryStop)\(/g)].length).toBe(6);
    expect([...mess.matchAll(/withStepUp\(\(proof\) => MessOperateService\./g)].length).toBe(6);
    // the only un-wrapped call is the READ of the delivery details
    expect(direct).toMatch(/await DeliveryOperateService\.getOrder\(/);
  });

  it('the section is mounted only inside the SUPER_ADMIN workspace and nowhere else', () => {
    const consumers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(SRC, dir), { withFileTypes: true })) {
        const rel = dir ? `${dir}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) && rel !== 'components/admin/DeliveryOperations.tsx' && /\bDeliveryOperations\b/.test(readFileSync(join(SRC, rel), 'utf8'))) consumers.push(rel);
      }
    };
    walk('');
    expect(consumers.sort()).toEqual(['components/admin/AdminWorkspace.tsx']);
  });
});
