import { describe, expect, it } from 'vitest';
import app from '../app.js';

/**
 * Security regression: every API route must authenticate, except an explicit, reviewed list of public endpoints.
 * The check walks the real Express router tree (no database is contacted): a route is protected when a handler named `authenticateToken` runs before it,
 * either inside the route's own chain or as a router-level `router.use(authenticateToken)`.
 * A NEW public endpoint fails this test until it is added (with a reason) to PUBLIC.
 */
interface Layer {
  name?: string;
  handle: { name?: string; stack?: Layer[] };
  route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: { name?: string } }> };
  regexp?: RegExp;
}

function mountOf(layer: Layer): string {
  // express 4 stores the mount path as a regexp such as /^\/api\/v1\/auth\/?(?=\/|$)/i
  const src = layer.regexp?.source ?? '';
  return src.replace('^\\/', '/').replace('\\/?(?=\\/|$)', '').replace(/\\\//g, '/').replace(/\$$/, '') || '';
}

function walk(stack: Layer[], prefix: string, guarded: boolean, out: Array<{ method: string; path: string; guarded: boolean }>) {
  let guard = guarded;
  for (const layer of stack) {
    if (layer.route) {
      const own = layer.route.stack.some((s) => s.handle.name === 'authenticateToken');
      for (const m of Object.keys(layer.route.methods)) out.push({ method: m.toUpperCase(), path: `${prefix}${layer.route.path}`, guarded: guard || own });
    } else if (layer.handle?.stack) {
      walk(layer.handle.stack, `${prefix}${mountOf(layer)}`, guard, out);
    } else if (layer.handle?.name === 'authenticateToken') {
      guard = true; // router.use(authenticateToken) protects everything registered after it
    }
  }
}

const PUBLIC: Record<string, string> = {
  'GET /api/v1/health': 'liveness probe',
  'POST /api/v1/payments/webhook': 'provider webhook: authenticated by raw-body signature verification',
  'POST /api/v1/auth/register': 'customer self-registration',
  'POST /api/v1/auth/login': 'sign-in',
  'POST /api/v1/auth/refresh': 'refresh-token rotation (cookie / body token)',
  'POST /api/v1/auth/logout': 'revokes only the presented refresh token',
  'POST /api/v1/auth/forgot-password': 'generic response, rate limited',
  'POST /api/v1/auth/reset-password': 'single-use token',
  'POST /api/v1/auth/staff/accept-invite': 'single-use invitation token',
  'POST /api/v1/auth/mobile/register': 'mobile customer self-registration',
  'POST /api/v1/auth/mobile/login': 'mobile sign-in',
  'POST /api/v1/auth/mobile/refresh': 'mobile refresh-token rotation (body token)',
  'POST /api/v1/auth/mobile/logout': 'revokes only the presented refresh token',
  'GET /api/v1/products': 'public catalogue',
  'GET /api/v1/products/categories': 'public catalogue',
  'GET /api/v1/products/:slug': 'public catalogue',
  'GET /api/v1/mess/plans': 'public plan list (server-priced, no private data)',
  'GET /api/v1/recipes': 'public recipe catalogue (public projection only; staff fields are never returned)',
  'GET /api/v1/recipes/categories': 'public recipe catalogue',
  'GET /api/v1/recipes/:id': 'public recipe catalogue (public projection)',
  'POST /api/v1/mess/pause-meal': 'RETIRED: always answers 410, no side effect',
  'POST /api/v1/mess/verify-gatepass': 'RETIRED: always answers 410, no side effect',
  'POST /api/v1/mess/register': 'RETIRED: always answers 410, no side effect'
};

describe('every API route is authenticated unless reviewed as public', () => {
  const routes: Array<{ method: string; path: string; guarded: boolean }> = [];
  walk(((app as unknown as { _router: { stack: Layer[] } })._router).stack, '', false, routes);

  it('finds the route tree', () => {
    expect(routes.length).toBeGreaterThan(100);
  });

  it('has no unreviewed public route', () => {
    const unguarded = routes.filter((r) => !r.guarded).map((r) => `${r.method} ${r.path.replace(/\/$/, '') || '/'}`);
    const offenders = unguarded.filter((k) => !(k in PUBLIC));
    expect(offenders).toEqual([]);
  });

  it('the public list contains no stale entry (every listed route still exists and is still public)', () => {
    const unguarded = new Set(routes.filter((r) => !r.guarded).map((r) => `${r.method} ${r.path.replace(/\/$/, '') || '/'}`));
    const stale = Object.keys(PUBLIC).filter((k) => !unguarded.has(k));
    expect(stale).toEqual([]);
  });

  it('retired surfaces are not mounted (md, hrm, finance, cms, driver routes)', () => {
    const all = routes.map((r) => r.path);
    for (const prefix of ['/api/v1/md', '/api/v1/hrm', '/api/v1/finance', '/api/v1/cms']) expect(all.filter((p) => p.startsWith(prefix))).toEqual([]);
    expect(all).not.toContain('/api/v1/delivery/orders/:id/claim');
  });
});
