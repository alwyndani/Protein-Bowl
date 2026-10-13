import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** P10A: the separate mock Mess workspace and its unsafe behaviours are gone; Kerala Mess is real, API-backed and lives in the CUSTOMER portal. */
const SRC = join(__dirname, '..');
const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
};
const files = walk(SRC);

describe('P10A web: retired mock Mess experience', () => {
  it('no source defines or uses a separate "mess_customer" UI role or workspace', () => {
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/['"]mess_customer['"]/);
  });

  it('the mock MessCustomerPortal component no longer exists and nothing imports it', () => {
    expect(existsSync(join(SRC, 'components', 'mess', 'MessCustomerPortal.tsx'))).toBe(false);
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/MessCustomerPortal/);
  });

  it('the real Mess screen, service and admin never import mock data', () => {
    for (const rel of ['components/mess/KeralaMessSection.tsx', 'services/messService.ts', 'services/messTypes.ts', 'components/admin/MessAdmin.tsx']) {
      expect(readFileSync(join(SRC, rel), 'utf8'), rel).not.toMatch(/mockKeralaMessData|mockData|data\//);
    }
  });

  it('the Mess client has no pause-meal, gate-pass or legacy register call and no wallet concept', () => {
    const svc = readFileSync(join(SRC, 'services', 'messService.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, ''); // code only: the doc comment names the retired endpoints
    expect(svc).not.toMatch(/pause-meal|verify-gatepass|\/mess\/register|wallet/i);
    const ui = readFileSync(join(SRC, 'components', 'mess', 'KeralaMessSection.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(ui).not.toMatch(/wallet|gate\s*pass|tracking(?!-)/i); // (tracking-wider is a Tailwind class)
    // P10B: the meal calendar exists and is operational only: no money, no menu, no delivery
    const cal = readFileSync(join(SRC, 'components', 'mess', 'MealCalendar.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(cal).not.toMatch(/wallet|gate\s*pass|credit|mockKeralaMessData|\bmenu\b|\bdish\b|cash|\bCOD\b/i);
  });

  it('the customer purchase never sends a price, tax, status, branch or payment method', () => {
    const svc = readFileSync(join(SRC, 'services', 'messService.ts'), 'utf8');
    const purchase = svc.slice(svc.indexOf('public static async purchase'), svc.indexOf('public static async cancel'));
    expect(purchase).toContain('planId: input.planId, startDate: input.startDate');
    expect(purchase).not.toMatch(/price|tax|status|branch|paymentMethod|amount/i);
  });

  it('P10B: the Mess kitchen is a REAL production Chef tab (not dev-only), has no delivery / fulfilment / money code, and imports no mock data', () => {
    const chef = readFileSync(join(SRC, 'components', 'erp', 'ChefDashboard.tsx'), 'utf8');
    expect(chef).toContain("{ id: 'mess_kitchen', label: 'Kerala Mess kitchen', icon: ChefHat }"); // outside the isDev spread
    expect(chef).toMatch(/activeTab === 'mess_kitchen' && \(/);
    const panel = readFileSync(join(SRC, 'components', 'erp', 'kitchen', 'MessKitchenPanel.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(panel).not.toMatch(/mockKeralaMessData|mockData|wallet|refund|\bCOD\b|cash|deliveryService|DeliveryWorkspace|handover|fulfil/i);
    const svc = readFileSync(join(SRC, 'services', 'messService.ts'), 'utf8');
    const kitchen = svc.slice(svc.indexOf('public static async kitchenDemand'), svc.indexOf('// ----', svc.indexOf('public static async markBatchReady')));
    expect(kitchen).toContain("body: JSON.stringify({})"); // ready: empty body
    expect(kitchen).not.toMatch(/mealCount|status|fulfil|delivered/i);
  });

  it('registration offers no Mess role (the only requestable role is customer)', () => {
    expect(readFileSync(join(SRC, 'services', 'authService.ts'), 'utf8')).toMatch(/requestedRole\?: 'customer';/);
  });

  it('Kerala Mess is a tab of the customer portal (activeTab), not a role', () => {
    const app = readFileSync(join(SRC, 'App.tsx'), 'utf8');
    expect(app).toMatch(/activeTab === 'kerala_mess'/);
    expect(app).toContain('<KeralaMessSection');
    expect(app).not.toMatch(/INITIAL_MESS_ACCOUNTS|INITIAL_MESS_DAILY_ORDERS|handlePauseMeal/);
  });
});
