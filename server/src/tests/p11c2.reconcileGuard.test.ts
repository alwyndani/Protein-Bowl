// TEMPORARY-H1-DO-NOT-MERGE
// Tests for the temporary reconciliation target guard (P11C-2 isolated reconciliation test). Nothing here touches a real database:
// in-process tests inject fakes, and the subprocess tests (group K, which documents exactly what each one executes) run the real entry point
// (refusals only) or a test fixture entry, always with a stub Prisma client preloaded through NODE_OPTIONS and a DATABASE_URL that is absent or
// points at a loopback tripwire. Run them with a vitest config WITHOUT src/tests/setup.ts
// (that setup connects to the shared test database); see the H1 report.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  RECONCILE_EXPECTED_DATABASE_ENV as ENV,
  RECONCILE_REQUIRED_DATABASE as NAME,
  RECONCILE_REQUIRED_MARKER as MARKER,
  captureProcessTarget,
  checkDatabaseUrl,
  checkReconcileExpectation,
  verifyConnectedIdentity,
  verifyReconcileTarget,
  type CapturedTarget,
  type ConnectedIdentity,
  type ReconcileGuardResult
} from '../modules/payment/reconcileTargetGuard.js';
import {
  bootstrapReconcile,
  createShutdownOwner,
  installShutdownHandlers,
  runReconcileCli,
  runReconcileMain,
  safeDiagnostic,
  type ReconcileCliDeps,
  type ProcLike
} from '../modules/payment/reconcileCli.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '..', '..');
const repoRoot = path.resolve(serverDir, '..');

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ------------------------------------------------------------------------------------------------ helpers
interface FakeProc extends ProcLike {
  exits: number[];
  emit(event: string, ...args: unknown[]): void;
}
function fakeProc(argv: string[] = [], env: Record<string, string | undefined> = { [ENV]: NAME }): FakeProc {
  const handlers = new Map<string, Array<(...a: unknown[]) => void>>();
  const p: FakeProc = {
    argv: ['node', 'reconcilePayments.ts', ...argv],
    env,
    pid: 4242,
    exitCode: undefined,
    exits: [],
    on(event, listener) {
      handlers.set(event, [...(handlers.get(event) ?? []), listener]);
      return p;
    },
    exit(code) {
      p.exits.push(code as number);
      return undefined;
    },
    emit(event, ...args) {
      for (const h of handlers.get(event) ?? []) h(...args);
    }
  };
  return p;
}
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};

const GOOD_ID: ConnectedIdentity = { db: NAME, addr: '127.0.0.1', port: '5432', marker: MARKER };
const OK_URL: ReconcileGuardResult = { ok: true };
/** A captured operator target that passed every pre-import check (what the real process snapshot looks like for a correct Pass B start). */
const okTarget = (): CapturedTarget => ({ expectation: NAME, urlCheck: OK_URL, urlUnchanged: () => true });

interface HarnessOpts {
  argv?: string[];
  env?: Record<string, string | undefined>;
  /** Shortcut: the connected database NAME (everything else in the identity is correct). */
  currentDatabase?: () => Promise<string | null | undefined>;
  /** Full control of the identity row the connected server reports. */
  identity?: () => Promise<ConnectedIdentity | null>;
  urlCheck?: ReconcileGuardResult;
  targetUnchanged?: () => boolean;
  runOnce?: (o: { workerId: string; limit?: number }) => Promise<unknown>;
  reviewReport?: () => Promise<{ total: number }>;
  sleep?: (ms: number) => Promise<void>;
  disconnect?: () => Promise<unknown>;
  guardDeadlineMs?: number;
  disconnectMs?: number;
  onGuardPassed?: () => void;
}
function harness(o: HarnessOpts = {}) {
  const proc = fakeProc(o.argv ?? [], o.env ?? { [ENV]: NAME });
  const out: string[] = [];
  const err: string[] = [];
  const order: string[] = [];
  const calls = { currentDatabase: 0, runOnce: [] as unknown[], reviewReport: 0, sleep: [] as number[], disconnect: 0, onGuardPassed: 0, now: 0 };
  const owner = createShutdownOwner({
    proc,
    error: (l) => err.push(l),
    disconnectMs: o.disconnectMs,
    disconnect: () => {
      calls.disconnect += 1;
      order.push('disconnect');
      return (o.disconnect ?? (async () => undefined))();
    }
  });
  const deps: ReconcileCliDeps = {
    expectation: proc.env[ENV],
    urlCheck: o.urlCheck ?? OK_URL,
    targetUnchanged: o.targetUnchanged,
    argv: proc.argv,
    pid: proc.pid,
    queryIdentity: () => {
      calls.currentDatabase += 1;
      order.push('currentDatabase');
      if (o.identity) return o.identity();
      if (o.currentDatabase) return o.currentDatabase().then((s) => (typeof s === 'string' ? { ...GOOD_ID, db: s } : null));
      return Promise.resolve(GOOD_ID);
    },
    runOnce: (opts) => {
      calls.runOnce.push(opts);
      order.push('runOnce');
      return (o.runOnce ?? (async () => ({ workerId: opts.workerId })))(opts);
    },
    reviewReport: () => {
      calls.reviewReport += 1;
      order.push('reviewReport');
      return (o.reviewReport ?? (async () => ({ total: 0 })))();
    },
    sleep: (ms) => {
      calls.sleep.push(ms);
      return (o.sleep ?? (async () => undefined))(ms);
    },
    owner,
    now: () => {
      calls.now += 1;
      return new Date('2026-10-22T10:00:00.000Z');
    },
    log: (l) => out.push(l),
    error: (l) => err.push(l),
    onGuardPassed: () => {
      calls.onGuardPassed += 1;
      order.push('onGuardPassed');
      o.onGuardPassed?.();
    },
    guardDeadlineMs: o.guardDeadlineMs
  };
  return { proc, owner, deps, out, err, calls, order, run: () => runReconcileCli(deps) };
}
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

// ------------------------------------------------------------------------------------------------ A. guard unit tests
describe('A. expectation, URL grammar and connected-identity checks (pure)', () => {
  const expectationCases: Array<[string, string | undefined, string]> = [
    ['missing', undefined, 'EXPECTATION_MISSING'],
    ['empty', '', 'EXPECTATION_EMPTY'],
    ['blank', '   ', 'EXPECTATION_EMPTY'],
    ['dev database', 'protein_bowl_db', 'EXPECTATION_NOT_ALLOWED'],
    ['scratch database', 'protein_bowl_p11c_test', 'EXPECTATION_NOT_ALLOWED'],
    ['suite database', 'protein_bowl_test_db', 'EXPECTATION_NOT_ALLOWED'],
    ['upper case', NAME.toUpperCase(), 'EXPECTATION_NOT_ALLOWED'],
    ['leading space', ` ${NAME}`, 'EXPECTATION_NOT_ALLOWED'],
    ['trailing space', `${NAME} `, 'EXPECTATION_NOT_ALLOWED'],
    ['truncated', NAME.slice(0, -1), 'EXPECTATION_NOT_ALLOWED'],
    ['suffixed', `${NAME};`, 'EXPECTATION_NOT_ALLOWED'],
    ['url', `postgresql://u:p@localhost/${NAME}`, 'EXPECTATION_NOT_ALLOWED']
  ];
  it.each(expectationCases)('expectation %s is refused without database access', async (_n, value, reason) => {
    expect(checkReconcileExpectation(value)).toEqual({ ok: false, reason });
    const query = vi.fn(async () => GOOD_ID);
    expect(await verifyReconcileTarget(value, OK_URL, query)).toEqual({ ok: false, reason });
    expect(query).not.toHaveBeenCalled();
  });

  const U = (host: string, port: string, db: string, tail = '') => `postgresql://pbuser:p%40ss-w0rd@${host}:${port}/${db}${tail}`;
  const urlAccepted: Array<[string, string]> = [
    ['localhost', U('localhost', '5432', NAME)],
    ['127.0.0.1', U('127.0.0.1', '5432', NAME)],
    ['?schema=public', U('127.0.0.1', '5432', NAME, '?schema=public')]
  ];
  it.each(urlAccepted)('DATABASE_URL %s is accepted', (_n, url) => {
    expect(checkDatabaseUrl(url)).toEqual({ ok: true });
  });
  const urlRefused: Array<[string, string | undefined, string]> = [
    ['undefined', undefined, 'DATABASE_URL_MISSING'],
    ['empty', '', 'DATABASE_URL_MISSING'],
    ['remote host', U('db.example.com', '5432', NAME), 'DATABASE_URL_NOT_ALLOWED'],
    ['private address', U('10.0.0.5', '5432', NAME), 'DATABASE_URL_NOT_ALLOWED'],
    ['ipv6 loopback', U('[::1]', '5432', NAME), 'DATABASE_URL_NOT_ALLOWED'],
    ['other port', U('127.0.0.1', '5433', NAME), 'DATABASE_URL_NOT_ALLOWED'],
    ['missing port', `postgresql://pbuser:pw@localhost/${NAME}`, 'DATABASE_URL_NOT_ALLOWED'],
    ['dev database', U('127.0.0.1', '5432', 'protein_bowl_db'), 'DATABASE_URL_NOT_ALLOWED'],
    ['scratch database', U('127.0.0.1', '5432', 'protein_bowl_p11c_test'), 'DATABASE_URL_NOT_ALLOWED'],
    ['suite database', U('127.0.0.1', '5432', 'protein_bowl_test_db'), 'DATABASE_URL_NOT_ALLOWED'],
    ['another dated copy', U('127.0.0.1', '5432', 'pb_p11c_recon_20261023'), 'DATABASE_URL_NOT_ALLOWED'],
    ['upper case name', U('127.0.0.1', '5432', NAME.toUpperCase()), 'DATABASE_URL_NOT_ALLOWED'],
    ['percent-encoded name', U('127.0.0.1', '5432', '%70b_p11c_recon_20261022'), 'DATABASE_URL_NOT_ALLOWED'],
    ['suffixed name', U('127.0.0.1', '5432', `${NAME}x`), 'DATABASE_URL_NOT_ALLOWED'],
    ['host override', U('127.0.0.1', '5432', NAME, '?host=/tmp'), 'DATABASE_URL_NOT_ALLOWED'],
    ['hostaddr override', U('127.0.0.1', '5432', NAME, '?schema=public&hostaddr=10.0.0.5'), 'DATABASE_URL_NOT_ALLOWED'],
    ['sslmode option', U('127.0.0.1', '5432', NAME, '?sslmode=disable'), 'DATABASE_URL_NOT_ALLOWED'],
    ['other schema', U('127.0.0.1', '5432', NAME, '?schema=other'), 'DATABASE_URL_NOT_ALLOWED'],
    ['wrong scheme', `postgres://pbuser:pw@localhost:5432/${NAME}`, 'DATABASE_URL_NOT_ALLOWED'],
    ['no credentials', `postgresql://localhost:5432/${NAME}`, 'DATABASE_URL_NOT_ALLOWED'],
    ['trailing newline', `${U('127.0.0.1', '5432', NAME)}\n`, 'DATABASE_URL_NOT_ALLOWED'],
    ['leading space', ` ${U('127.0.0.1', '5432', NAME)}`, 'DATABASE_URL_NOT_ALLOWED'],
    ['second host after @', `postgresql://pbuser:pw@evil.example:5432@127.0.0.1:5432/${NAME}`, 'DATABASE_URL_NOT_ALLOWED']
  ];
  it.each(urlRefused)('DATABASE_URL %s is refused', async (_n, url, reason) => {
    const r = checkDatabaseUrl(url);
    expect(r).toEqual({ ok: false, reason });
    expect(JSON.stringify(r)).not.toMatch(/pbuser|p%40ss|postgresql|example|@/); // the reason never contains any part of the URL
    const query = vi.fn(async () => GOOD_ID);
    expect(await verifyReconcileTarget(NAME, r, query)).toEqual({ ok: false, reason });
    expect(query).not.toHaveBeenCalled();
  });

  const identityCases: Array<[string, ConnectedIdentity | null, string | null]> = [
    ['correct (127.0.0.1)', GOOD_ID, null],
    ['correct (::1)', { ...GOOD_ID, addr: '::1' }, null],
    ['null identity', null, 'CONNECTED_DATABASE_UNKNOWN'],
    ['null database', { ...GOOD_ID, db: null }, 'CONNECTED_DATABASE_UNKNOWN'],
    ['empty database', { ...GOOD_ID, db: '' }, 'CONNECTED_DATABASE_UNKNOWN'],
    ['dev database', { ...GOOD_ID, db: 'protein_bowl_db' }, 'CONNECTED_DATABASE_MISMATCH'],
    ['scratch database', { ...GOOD_ID, db: 'protein_bowl_p11c_test' }, 'CONNECTED_DATABASE_MISMATCH'],
    ['suite database', { ...GOOD_ID, db: 'protein_bowl_test_db' }, 'CONNECTED_DATABASE_MISMATCH'],
    ['upper case database', { ...GOOD_ID, db: NAME.toUpperCase() }, 'CONNECTED_DATABASE_MISMATCH'],
    ['remote server address', { ...GOOD_ID, addr: '10.1.2.3' }, 'CONNECTED_HOST_MISMATCH'],
    ['unix socket (null address)', { ...GOOD_ID, addr: null }, 'CONNECTED_HOST_MISMATCH'],
    ['address with a mask', { ...GOOD_ID, addr: '127.0.0.1/32' }, 'CONNECTED_HOST_MISMATCH'],
    ['other port', { ...GOOD_ID, port: '5433' }, 'CONNECTED_PORT_MISMATCH'],
    ['null port', { ...GOOD_ID, port: null }, 'CONNECTED_PORT_MISMATCH'],
    ['missing marker', { ...GOOD_ID, marker: null }, 'CONNECTED_MARKER_MISMATCH'],
    ['wrong marker', { ...GOOD_ID, marker: 'DISPOSABLE reconciliation test copy' }, 'CONNECTED_MARKER_MISMATCH'],
    ['marker with a suffix', { ...GOOD_ID, marker: `${MARKER} ` }, 'CONNECTED_MARKER_MISMATCH']
  ];
  it.each(identityCases)('connected identity %s', async (_n, id, reason) => {
    const expected = reason ? { ok: false, reason } : { ok: true };
    expect(verifyConnectedIdentity(id)).toEqual(expected);
    expect(await verifyReconcileTarget(NAME, OK_URL, async () => id)).toEqual(expected);
  });
  it('a thrown query or an unusable answer is UNKNOWN and never rejects', async () => {
    const unknown = { ok: false, reason: 'CONNECTED_DATABASE_UNKNOWN' };
    expect(await verifyReconcileTarget(NAME, OK_URL, async () => null)).toEqual(unknown);
    expect(await verifyReconcileTarget(NAME, OK_URL, async () => undefined)).toEqual(unknown);
    expect(await verifyReconcileTarget(NAME, OK_URL, async () => { throw new Error('x'); })).toEqual(unknown);
    expect(await verifyReconcileTarget(NAME, OK_URL, () => { throw new Error('sync'); })).toEqual(unknown);
  });
  it('the required target is exactly the disposable database, port 5432 and the copy marker', () => {
    expect(NAME).toBe('pb_p11c_recon_20261022');
    expect(MARKER).toBe('DISPOSABLE reconciliation test copy of protein_bowl_p11c_test (P11C-2); safe to drop');
  });

  it('captureProcessTarget copies the operator expectation, checks the URL, detects a change, and holds no URL text or digest', () => {
    const url = 'postgresql://leakuser:LEAKSECRET@127.0.0.1:5432/pb_p11c_recon_20261022';
    const env: Record<string, string | undefined> = { [ENV]: NAME, DATABASE_URL: url };
    const t = captureProcessTarget(env);
    expect(t.expectation).toBe(NAME);
    expect(t.urlCheck).toEqual({ ok: true });
    expect(t.urlUnchanged(env)).toBe(true);
    expect(t.urlUnchanged({ ...env })).toBe(true);
    expect(t.urlUnchanged({ ...env, DATABASE_URL: `${url}?schema=public` })).toBe(false);
    expect(t.urlUnchanged({ ...env, DATABASE_URL: undefined })).toBe(false);
    for (const dump of [JSON.stringify(t), Object.keys(t).join(','), JSON.stringify(Object.getOwnPropertyDescriptors(t), (_k, v) => (typeof v === 'function' ? 'fn' : v))]) {
      expect(dump).not.toMatch(/leakuser|LEAKSECRET|postgresql|[0-9a-f]{40}/);
    }
    const bad = captureProcessTarget({ [ENV]: NAME, DATABASE_URL: 'postgresql://leakuser:LEAKSECRET@evil.example:5432/protein_bowl_db' });
    expect(bad.urlCheck).toEqual({ ok: false, reason: 'DATABASE_URL_NOT_ALLOWED' });
    expect(JSON.stringify(bad)).not.toMatch(/leakuser|LEAKSECRET|evil/);
    expect(captureProcessTarget({}).expectation).toBeUndefined();
    expect(captureProcessTarget({}).urlCheck).toEqual({ ok: false, reason: 'DATABASE_URL_MISSING' });
  });
});

// ------------------------------------------------------------------------------------------------ B. matching target permits work
describe('B. a matching target permits reconciliation; a stop request before work prevents it', () => {
  it('runs exactly one pass, in order, and prints the exact summary line (exit 0)', async () => {
    const h = harness();
    const r = await h.run();
    expect(r).toEqual({ code: 0, queryUnresolved: false });
    expect(h.calls.runOnce).toEqual([{ workerId: 'cli-4242', limit: undefined }]);
    expect(h.calls.reviewReport).toBe(1);
    expect(h.order).toEqual(['currentDatabase', 'onGuardPassed', 'runOnce', 'reviewReport', 'disconnect']);
    expect(h.out).toHaveLength(1);
    expect(h.out[0]).toBe(JSON.stringify({ at: '2026-10-22T10:00:00.000Z', stats: { workerId: 'cli-4242' }, review: { total: 0 } }));
    expect(Object.keys(JSON.parse(h.out[0]))).toEqual(['at', 'stats', 'review']);
    expect(h.calls.disconnect).toBe(1);
    expect(h.owner.stop.requested).toBe(false);
  });
  it('exit 2 when the review report has items', async () => {
    const h = harness({ reviewReport: async () => ({ total: 3 }) });
    expect((await h.run()).code).toBe(2);
  });
  it('a stop requested before start performs no query and no work (exit 1)', async () => {
    const h = harness();
    h.owner.stop.request();
    const r = await h.run();
    expect(r).toEqual({ code: 1, queryUnresolved: false });
    expect(h.calls.currentDatabase).toBe(0);
    expect(h.calls.runOnce).toEqual([]);
    expect(h.calls.reviewReport).toBe(0);
    expect(h.calls.disconnect).toBe(0);
  });
  it('a stop requested while the guard query is pending waits for it, then does no work', async () => {
    const q = deferred<string>();
    const h = harness({ currentDatabase: () => q.promise });
    const run = h.run();
    await flush();
    h.owner.stop.request();
    await flush();
    expect(h.calls.disconnect).toBe(0);
    q.resolve(NAME);
    const r = await run;
    expect(r.code).toBe(1);
    expect(h.calls.runOnce).toEqual([]);
    expect(h.calls.reviewReport).toBe(0);
    expect(h.order).toEqual(['currentDatabase', 'disconnect']);
  });
  it('a stop requested inside onGuardPassed prevents the first pass', async () => {
    const h = harness({ onGuardPassed: () => h.owner.stop.request() });
    const r = await h.run();
    expect(r.code).toBe(1);
    expect(h.calls.runOnce).toEqual([]);
    expect(h.calls.reviewReport).toBe(0);
  });
  it('a stop during a pass lets the pass finish and report, then stops (exit 0)', async () => {
    const h = harness({ argv: ['--loop'], runOnce: async () => { h.owner.stop.request(); return {}; } });
    const r = await h.run();
    expect(r.code).toBe(0);
    expect(h.calls.runOnce).toHaveLength(1);
    expect(h.out).toHaveLength(1);
  });
  it('a stop during sleep ends the loop without another pass', async () => {
    const h = harness({ argv: ['--loop', '--interval', '5'], sleep: async () => h.owner.stop.request() });
    const r = await h.run();
    expect(r.code).toBe(0);
    expect(h.calls.runOnce).toHaveLength(1);
    expect(h.calls.sleep).toEqual([5000]);
  });
});

// ------------------------------------------------------------------------------------------------ C. refusals
describe('C. every refusal path returns 3 and never reaches reconciliation work', () => {
  const expectationRefusals: Array<[string, string | undefined]> = [
    ['missing', undefined], ['empty', ''], ['blank', '   '], ['dev database', 'protein_bowl_db'], ['scratch database', 'protein_bowl_p11c_test'],
    ['suite database', 'protein_bowl_test_db'], ['upper case', NAME.toUpperCase()], ['padded', ` ${NAME}`], ['truncated', NAME.slice(0, -1)],
    ['suffixed', `${NAME};`], ['url', `postgresql://leakuser:LEAKSECRET@h/${NAME}`]
  ];
  const queryRefusals: Array<[string, () => Promise<string | null | undefined>]> = [
    ['connected to the dev database', async () => 'protein_bowl_db'], ['connected to the suite database', async () => 'protein_bowl_test_db'],
    ['null answer', async () => null], ['empty answer', async () => ''],
    ['query throws', async () => { throw new Error('postgresql://leakuser:LEAKSECRET@127.0.0.1/db password=hunter2'); }]
  ];
  for (const withLoop of [false, true]) {
    const argv = withLoop ? ['--loop', '--interval', '5'] : [];
    it.each(expectationRefusals)(`expectation ${withLoop ? 'with --loop ' : ''}%s`, async (_n, value) => {
      const h = harness({ argv, env: value === undefined ? {} : { [ENV]: value } });
      const r = await h.run();
      expect(r).toEqual({ code: 3, queryUnresolved: false });
      expect(h.calls.currentDatabase).toBe(0);
      expect(h.calls.runOnce).toEqual([]);
      expect(h.calls.reviewReport).toBe(0);
      expect(h.calls.sleep).toEqual([]);
      expect(h.calls.onGuardPassed).toBe(0);
      expect(h.calls.now).toBe(0);
      expect(h.out).toEqual([]);
      expect(h.calls.disconnect).toBe(0);
      expect(h.err).toHaveLength(1);
      expect(h.err[0]).toMatch(/^payments:reconcile refused \(EXPECTATION_[A-Z_]+\): no reconciliation work was performed$/);
      expect(h.err.join('\n')).not.toMatch(/LEAKSECRET|leakuser|postgresql:\/\//);
    });
    it.each(queryRefusals)(`${withLoop ? 'with --loop ' : ''}%s`, async (_n, q) => {
      const h = harness({ argv, currentDatabase: q });
      const r = await h.run();
      expect(r).toEqual({ code: 3, queryUnresolved: false });
      expect(h.calls.currentDatabase).toBe(1);
      expect(h.calls.runOnce).toEqual([]);
      expect(h.calls.reviewReport).toBe(0);
      expect(h.calls.sleep).toEqual([]);
      expect(h.calls.onGuardPassed).toBe(0);
      expect(h.out).toEqual([]);
      expect(h.order).toEqual(['currentDatabase', 'disconnect']);
      expect(h.err).toHaveLength(1);
      expect(h.err[0]).toMatch(/^payments:reconcile refused \(CONNECTED_DATABASE_(MISMATCH|UNKNOWN)\): no reconciliation work was performed$/);
      expect(h.err.join('\n')).not.toMatch(/LEAKSECRET|leakuser|postgresql:\/\/|hunter2/);
    });
  }
});

// ------------------------------------------------------------------------------------------------ C2. URL and connected-identity refusals
describe('C2. URL, URL-change and connected-identity refusals return 3 and never reach reconciliation work', () => {
  const noWork = (h: ReturnType<typeof harness>) => {
    expect(h.calls.runOnce).toEqual([]);
    expect(h.calls.reviewReport).toBe(0);
    expect(h.calls.sleep).toEqual([]);
    expect(h.calls.onGuardPassed).toBe(0);
    expect(h.calls.now).toBe(0);
    expect(h.out).toEqual([]);
  };
  const urlRefusals: Array<[string, ReconcileGuardResult]> = [
    ['DATABASE_URL_MISSING', { ok: false, reason: 'DATABASE_URL_MISSING' }],
    ['DATABASE_URL_NOT_ALLOWED', { ok: false, reason: 'DATABASE_URL_NOT_ALLOWED' }]
  ];
  for (const withLoop of [false, true]) {
    const argv = withLoop ? ['--loop', '--interval', '5'] : [];
    it.each(urlRefusals)(`${withLoop ? 'with --loop ' : ''}URL check %s: no query, no Prisma touch, no work`, async (reason, urlCheck) => {
      const h = harness({ argv, urlCheck });
      expect(await h.run()).toEqual({ code: 3, queryUnresolved: false });
      expect(h.calls.currentDatabase).toBe(0);
      expect(h.calls.disconnect).toBe(0);
      noWork(h);
      expect(h.err).toEqual([`payments:reconcile refused (${reason}): no reconciliation work was performed`]);
    });
    it(`${withLoop ? 'with --loop ' : ''}a changed DATABASE_URL is refused before any query`, async () => {
      const h = harness({ argv, targetUnchanged: () => false });
      expect(await h.run()).toEqual({ code: 3, queryUnresolved: false });
      expect(h.calls.currentDatabase).toBe(0);
      expect(h.calls.disconnect).toBe(0);
      noWork(h);
      expect(h.err).toEqual(['payments:reconcile refused (DATABASE_URL_CHANGED): no reconciliation work was performed']);
    });
    const identityRefusals: Array<[string, ConnectedIdentity | null, string]> = [
      ['database mismatch', { ...GOOD_ID, db: 'protein_bowl_db' }, 'CONNECTED_DATABASE_MISMATCH'],
      ['scratch database', { ...GOOD_ID, db: 'protein_bowl_p11c_test' }, 'CONNECTED_DATABASE_MISMATCH'],
      ['suite database', { ...GOOD_ID, db: 'protein_bowl_test_db' }, 'CONNECTED_DATABASE_MISMATCH'],
      ['remote server address', { ...GOOD_ID, addr: '10.1.2.3' }, 'CONNECTED_HOST_MISMATCH'],
      ['unix socket', { ...GOOD_ID, addr: null }, 'CONNECTED_HOST_MISMATCH'],
      ['other port', { ...GOOD_ID, port: '5433' }, 'CONNECTED_PORT_MISMATCH'],
      ['missing marker', { ...GOOD_ID, marker: null }, 'CONNECTED_MARKER_MISMATCH'],
      ['wrong marker', { ...GOOD_ID, marker: 'something else' }, 'CONNECTED_MARKER_MISMATCH'],
      ['null identity', null, 'CONNECTED_DATABASE_UNKNOWN']
    ];
    it.each(identityRefusals)(`${withLoop ? 'with --loop ' : ''}connected identity: %s fails closed`, async (_n, id, reason) => {
      const h = harness({ argv, identity: async () => id });
      expect(await h.run()).toEqual({ code: 3, queryUnresolved: false });
      expect(h.calls.currentDatabase).toBe(1);
      expect(h.order).toEqual(['currentDatabase', 'disconnect']);
      noWork(h);
      expect(h.err).toEqual([`payments:reconcile refused (${reason}): no reconciliation work was performed`]);
    });
  }
  it('the correct identity on a loopback IPv6 server address permits the first pass', async () => {
    const h = harness({ identity: async () => ({ ...GOOD_ID, addr: '::1' }) });
    expect((await h.run()).code).toBe(0);
    expect(h.calls.runOnce).toHaveLength(1);
  });
});

// ------------------------------------------------------------------------------------------------ D. unresolved query
describe('D. a guard query still pending at the deadline', () => {
  it('abandons the client: exit 1, no work, no disconnect; late resolve cannot resume work', async () => {
    vi.useFakeTimers();
    const q = deferred<string>();
    const h = harness({ currentDatabase: () => q.promise });
    const run = h.run();
    await vi.advanceTimersByTimeAsync(14_999);
    expect(h.owner.abandoned).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const r = await run;
    expect(r).toEqual({ code: 1, queryUnresolved: true });
    expect(h.owner.abandoned).toBe(true);
    expect(h.err).toEqual(['payments:reconcile failed: target guard did not complete']);
    expect(h.calls.disconnect).toBe(0);
    q.resolve(NAME); // the dangerous late answer
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.calls.runOnce).toEqual([]);
    expect(h.calls.reviewReport).toBe(0);
    expect(h.calls.sleep).toEqual([]);
    expect(h.calls.onGuardPassed).toBe(0);
    expect(h.calls.disconnect).toBe(0);
    expect(h.out).toEqual([]);
  });
  it('a late rejection with a secret-bearing error is swallowed (no work, no output, no disconnect)', async () => {
    vi.useFakeTimers();
    const q = deferred<string>();
    const h = harness({ currentDatabase: () => q.promise });
    const run = h.run();
    await vi.advanceTimersByTimeAsync(15_000);
    expect((await run).queryUnresolved).toBe(true);
    q.reject(new Error('postgresql://leakuser:LEAKSECRET@127.0.0.1/db'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.calls.runOnce).toEqual([]);
    expect(h.calls.disconnect).toBe(0);
    expect(h.err.join('\n')).not.toMatch(/LEAKSECRET|leakuser/);
  });
  it('the guard deadline is bounded even with a stop request pending', async () => {
    vi.useFakeTimers();
    const h = harness({ currentDatabase: () => new Promise<string>(() => undefined) });
    const run = h.run();
    await vi.advanceTimersByTimeAsync(1_000);
    h.owner.stop.request();
    await vi.advanceTimersByTimeAsync(14_000);
    expect(await run).toEqual({ code: 1, queryUnresolved: true });
    expect(h.calls.disconnect).toBe(0);
  });
  it('real wiring: exactly one exit(1), no disconnect, no service call', async () => {
    vi.useFakeTimers();
    const proc = fakeProc();
    const out: string[] = [];
    const err: string[] = [];
    const db = { $queryRaw: vi.fn(() => new Promise(() => undefined)), $disconnect: vi.fn(async () => undefined) };
    const service = { runOnce: vi.fn(async () => ({})), reviewReport: vi.fn(async () => ({ total: 0 })) };
    const p = runReconcileMain({ proc, console: { log: (l) => out.push(l), error: (l) => err.push(l) }, db, service, target: okTarget() });
    await vi.advanceTimersByTimeAsync(15_000);
    await p;
    expect(proc.exits).toEqual([1]);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(db.$disconnect).not.toHaveBeenCalled();
    expect(service.runOnce).not.toHaveBeenCalled();
    expect(service.reviewReport).not.toHaveBeenCalled();
    expect(out).toEqual([]);
    expect(err).toEqual(['payments:reconcile failed: target guard did not complete']);
    // a signal or fatal error arriving now cannot cause a second exit or any cleanup
    proc.emit('SIGINT');
    proc.emit('SIGINT');
    proc.emit('uncaughtException', new Error('LEAKSECRET'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(proc.exits).toEqual([1]);
    expect(db.$disconnect).not.toHaveBeenCalled();
    expect(err.join('\n')).not.toContain('LEAKSECRET');
  });
});

// ------------------------------------------------------------------------------------------------ E. shutdown ownership
describe('E. a single shutdown owner', () => {
  it('concurrent disconnectOnce calls run one disconnect', async () => {
    const h = harness();
    await Promise.all([1, 2, 3, 4, 5].map(() => h.owner.disconnectOnce()));
    expect(h.calls.disconnect).toBe(1);
  });
  it('a hanging disconnect is bounded; the exit code is unchanged and a fixed warning is printed', async () => {
    vi.useFakeTimers();
    const h = harness({ disconnect: () => new Promise(() => undefined), disconnectMs: 5000 });
    const run = h.run();
    await vi.advanceTimersByTimeAsync(4_999);
    let settled = false;
    void run.then(() => { settled = true; });
    await flush();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const r = await run;
    expect(r.code).toBe(0);
    expect(h.err).toEqual(['payments:reconcile warning: database disconnect did not complete']);
  });
  it('a rejected disconnect after success is exit 1 (as before); after a refusal it stays 3', async () => {
    const ok = harness({ disconnect: async () => { throw new Error('LEAKSECRET'); } });
    expect((await ok.run()).code).toBe(1);
    expect(ok.err).toEqual(['payments:reconcile failed: database disconnect failed']);
    const refused = harness({ currentDatabase: async () => 'protein_bowl_db', disconnect: async () => { throw new Error('x'); } });
    expect((await refused.run()).code).toBe(3);
  });
  it('a synchronously throwing disconnect is handled the same way', async () => {
    const h = harness({ disconnect: () => { throw new Error('LEAKSECRET'); } });
    expect((await h.run()).code).toBe(1);
    expect(h.err.join('\n')).not.toContain('LEAKSECRET');
  });
  it('markCliDone runs once, after the disconnect, and whenCliDone resolves', async () => {
    const h = harness();
    let done = false;
    void h.owner.whenCliDone().then(() => { done = true; });
    expect(h.owner.phase).toBe('start');
    await h.run();
    await flush();
    expect(done).toBe(true);
    expect(h.owner.phase).toBe('done');
    h.owner.markCliDone();
    expect(h.owner.phase).toBe('done');
  });
  it('signal and fatal handlers never disconnect', async () => {
    vi.useFakeTimers();
    const h = harness({ currentDatabase: () => new Promise<string>(() => undefined) });
    installShutdownHandlers({ proc: h.proc, owner: h.owner, error: (l) => h.err.push(l) });
    const run = h.run();
    await vi.advanceTimersByTimeAsync(100);
    h.proc.emit('SIGINT');
    h.proc.emit('SIGTERM');
    h.proc.emit('uncaughtException', new Error('x'));
    await vi.advanceTimersByTimeAsync(60_000);
    await run;
    expect(h.calls.disconnect).toBe(0);
  });
  it('exitWith is latched and applies the fatal override', () => {
    const proc = fakeProc();
    const owner = createShutdownOwner({ proc, error: () => undefined, disconnect: async () => undefined });
    owner.exitWith(0);
    owner.exitWith(2);
    expect(proc.exits).toEqual([0]);
    const proc2 = fakeProc();
    const owner2 = createShutdownOwner({ proc: proc2, error: () => undefined, disconnect: async () => undefined });
    owner2.markFatal();
    expect(proc2.exitCode).toBe(1);
    owner2.exitWith(0);
    expect(proc2.exits).toEqual([1]);
  });
});

// ------------------------------------------------------------------------------------------------ F. signals
describe('F. signals', () => {
  function sigHarness() {
    vi.useFakeTimers();
    const proc = fakeProc();
    const err: string[] = [];
    let disconnects = 0;
    const owner = createShutdownOwner({ proc, error: (l) => err.push(l), disconnect: async () => { disconnects += 1; } });
    installShutdownHandlers({ proc, owner, error: (l) => err.push(l) });
    return { proc, owner, err, disconnects: () => disconnects };
  }
  it.each(['SIGINT', 'SIGTERM'])('first %s requests a stop and does not exit', async (sig) => {
    const s = sigHarness();
    s.proc.emit(sig);
    expect(s.owner.stop.requested).toBe(true);
    expect(s.proc.exits).toEqual([]);
  });
  it('the CLI finishing before the grace period means no emergency exit', async () => {
    const s = sigHarness();
    s.owner.setPhase('work');
    s.proc.emit('SIGINT');
    s.owner.markCliDone();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(s.proc.exits).toEqual([]);
  });
  it('work still running at the grace limit gives exactly one emergency exit(1) without disconnecting', async () => {
    const s = sigHarness();
    s.owner.setPhase('work');
    s.proc.emit('SIGINT');
    await vi.advanceTimersByTimeAsync(19_999);
    expect(s.proc.exits).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(s.proc.exits).toEqual([1]);
    expect(s.err).toEqual(['payments:reconcile terminated by emergency exit']);
    expect(s.disconnects()).toBe(0);
  });
  it('bounded cleanup is not cut short by the grace timer', async () => {
    const s = sigHarness();
    s.owner.setPhase('cleanup');
    s.proc.emit('SIGINT');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(s.proc.exits).toEqual([]);
  });
  it('a second signal is an immediate emergency exit', () => {
    const s = sigHarness();
    s.proc.emit('SIGINT');
    s.proc.emit('SIGTERM');
    expect(s.proc.exits).toEqual([1]);
    expect(s.disconnects()).toBe(0);
  });
});

// ------------------------------------------------------------------------------------------------ G. fatal errors
describe('G. fatal errors can never produce a 0, 2 or 3 exit', () => {
  const SECRET = new Error('postgresql://leakuser:LEAKSECRET@h/db password=hunter2 rzp_test_AbCdEf123456');
  for (const event of ['uncaughtException', 'unhandledRejection']) {
    for (const phase of ['guard', 'work', 'cleanup'] as const) {
      for (const cliCode of [0, 2, 3]) {
        it(`${event} during ${phase} with CLI code ${cliCode} exits 1`, async () => {
          vi.useFakeTimers();
          const proc = fakeProc();
          const err: string[] = [];
          const owner = createShutdownOwner({ proc, error: (l) => err.push(l), disconnect: async () => undefined });
          installShutdownHandlers({ proc, owner, error: (l) => err.push(l) });
          owner.setPhase(phase);
          proc.emit(event, SECRET);
          expect(proc.exitCode).toBe(1);
          expect(owner.fatalSeen).toBe(true);
          expect(owner.stop.requested).toBe(true);
          owner.exitWith(cliCode); // the normal exit arrives after the fatal error
          expect(proc.exits).toEqual([1]);
          owner.markCliDone();
          await vi.advanceTimersByTimeAsync(10_000);
          expect(proc.exits).toEqual([1]);
          expect(err).toHaveLength(1);
          expect(err[0]).toMatch(/^payments:reconcile failed: (uncaught exception|unhandled promise rejection)$/);
          expect(err.join('\n')).not.toMatch(/LEAKSECRET|leakuser|hunter2|rzp_test/);
        });
      }
    }
  }
  it('a fatal error exits 1 after the CLI finishes, or at the 3 s backstop if it never does; a second fatal does nothing', async () => {
    vi.useFakeTimers();
    const proc = fakeProc();
    const err: string[] = [];
    const owner = createShutdownOwner({ proc, error: (l) => err.push(l), disconnect: async () => undefined });
    installShutdownHandlers({ proc, owner, error: (l) => err.push(l) });
    proc.emit('uncaughtException', SECRET);
    proc.emit('unhandledRejection', SECRET);
    await vi.advanceTimersByTimeAsync(2_999);
    expect(proc.exits).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(proc.exits).toEqual([1]);
    expect(err).toEqual(['payments:reconcile failed: uncaught exception', 'payments:reconcile terminated by emergency exit']);
  });
});

// ------------------------------------------------------------------------------------------------ H. exit code exclusivity
describe('H. exit code 3 is reserved for guard refusals', () => {
  const scenarios: Array<[string, () => Promise<number>]> = [
    ['runOnce throws', async () => (await harness({ runOnce: async () => { throw new Error('x'); } }).run()).code],
    ['reviewReport throws', async () => (await harness({ reviewReport: async () => { throw new Error('x'); } }).run()).code],
    ['stop before start', async () => { const h = harness(); h.owner.stop.request(); return (await h.run()).code; }],
    ['stop before the first pass', async () => { const h = harness({ onGuardPassed: () => h.owner.stop.request() }); return (await h.run()).code; }],
    ['disconnect fails after success', async () => (await harness({ disconnect: async () => { throw new Error('x'); } }).run()).code],
    ['guard deadline', async () => {
      vi.useFakeTimers();
      const h = harness({ currentDatabase: () => new Promise<string>(() => undefined) });
      const run = h.run();
      await vi.advanceTimersByTimeAsync(15_000);
      const code = (await run).code;
      vi.useRealTimers();
      return code;
    }]
  ];
  it.each(scenarios)('%s is exit 1', async (_n, run) => {
    expect(await run()).toBe(1);
  });
});

// ------------------------------------------------------------------------------------------------ I. safe diagnostics
describe('I. diagnostics never contain secrets', () => {
  const LEAK =
    'boom postgresql://leakuser:LEAKSECRET1@127.0.0.1:5432/db password=hunter2 Authorization: Bearer abc.def.ghi rzp_test_AbCdEf123456 whsec_SECRETSECRET1 eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl\nSELECT * FROM users';
  const noLeak = (s: string) => expect(s).not.toMatch(/LEAKSECRET|leakuser|hunter2|Bearer|rzp_test|whsec_|eyJ|SELECT|postgresql:|SECRETCODE|SECRETNAME|SECRET[0-9]/);
  function bad(): Error {
    const e = Object.assign(new Error(LEAK), { code: 'ESECRETCODE', errorCode: 'PSECRETCODE', meta: { k: 'SECRET3' } });
    (e as { cause?: unknown }).cause = new Error('cause SECRET2');
    e.stack = `Error: ${LEAK}\n at SECRET4`;
    return e;
  }
  it('runOnce and reviewReport failures print only an allow-listed class', async () => {
    const a = harness({ runOnce: async () => { throw bad(); } });
    expect((await a.run()).code).toBe(1);
    expect(a.err).toEqual(['payments:reconcile failed: Error']);
    noLeak(a.err.join('\n'));
    const b = harness({ reviewReport: async () => { throw bad(); } });
    await b.run();
    expect(b.err).toEqual(['payments:reconcile failed: Error']);
    noLeak(b.err.join('\n'));
  });
  it('unknown class names collapse to Error; non-allow-listed codes are dropped; known ones are kept', () => {
    class SECRETNAME extends Error {}
    expect(safeDiagnostic(new SECRETNAME(LEAK))).toBe('Error');
    const named = new Error('x');
    named.name = 'ZodError';
    expect(safeDiagnostic(named)).toBe('ZodError');
    expect(safeDiagnostic(bad())).toBe('Error');
    expect(safeDiagnostic(Object.assign(new Error('x'), { code: 'P2002' }))).toBe('Error (P2002)');
    expect(safeDiagnostic(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))).toBe('Error (ECONNREFUSED)');
    expect(safeDiagnostic(Object.assign(new Error('x'), { code: 'EXXXXSECRETXXXX' }))).toBe('Error');
    expect(safeDiagnostic('a string LEAKSECRET')).toBe('Error');
    expect(safeDiagnostic(null)).toBe('Error');
    expect(safeDiagnostic(undefined)).toBe('Error');
  });
  it('a hostile object whose getters throw cannot make diagnostics throw or leak', () => {
    const hostile = new Proxy({}, { get() { throw new Error('LEAKSECRET'); }, getPrototypeOf() { throw new Error('LEAKSECRET'); } });
    expect(safeDiagnostic(hostile)).toBe('Error');
    const e = new Error('x');
    Object.defineProperty(e, 'code', { get() { throw new Error('LEAKSECRET'); } });
    Object.defineProperty(e, 'name', { get() { throw new Error('LEAKSECRET'); } });
    expect(safeDiagnostic(e)).toBe('Error');
  });
  it('the guard query error text never reaches output (refusal path)', async () => {
    const h = harness({ currentDatabase: async () => { throw bad(); } });
    expect((await h.run()).code).toBe(3);
    noLeak(h.err.join('\n'));
  });
});

// ------------------------------------------------------------------------------------------------ J. compatibility with the actual HEAD implementation
const LEGACY_REV = 'f8e28631dac070d751c1cb29d094848295799dd3';
const LEGACY_BLOB = 'f587f689c81311a2934f8aae106a0b91bbb42553';
const LEGACY_SHA256 = '32b9b0347405874ad28174c6607012ba163bc21dd2bee125acb8f3b0d4478682';

function git(args: string[]): Buffer {
  return execFileSync('git', args, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });
}
function loadLegacy() {
  const revBlob = git(['rev-parse', `${LEGACY_REV}:server/scripts/reconcilePayments.ts`]).toString('utf8').trim();
  const bytes = git(['cat-file', 'blob', LEGACY_BLOB]);
  const text = bytes.toString('utf8');
  const start = text.indexOf('function arg(');
  const endMatch = /\r?\nmain\(\)\r?\n/.exec(text);
  const region = start >= 0 && endMatch ? text.slice(start, endMatch.index) : '';
  return { revBlob, sha: createHash('sha256').update(bytes).digest('hex'), text, region };
}

describe('J. compatibility with the existing implementation (actual HEAD source)', () => {
  const legacy = loadLegacy();

  it('the legacy source is exactly the pinned revision', () => {
    expect(legacy.revBlob).toBe(LEGACY_BLOB);
    expect(legacy.sha).toBe(LEGACY_SHA256);
    for (const piece of ['function arg(name: string)', 'const flag = (name: string)', 'let stopping = false;', 'async function sleepInterruptible(ms: number)', 'async function main(): Promise<number>', 'do {', '} while (!stopping);']) {
      expect(legacy.region).toContain(piece);
    }
    // behaviour outside the extracted region that the new CLI deliberately changes (documented deviations 2 and 3)
    expect(legacy.text).toContain("console.error('payments:reconcile failed:', (err as Error).message);");
    expect(legacy.text).toMatch(/\.then\(async \(code\) => \{\s*await prisma\.\$disconnect\(\);\s*process\.exit\(code\);/);
  });

  const js = ts.transpileModule(legacy.region, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const legacyFactory = new Function('process', 'PaymentReconciliationService', 'console', `${js}\nreturn { main };`) as (
    p: unknown,
    s: unknown,
    c: unknown
  ) => { main: () => Promise<number> };

  interface Scenario {
    name: string;
    argv: string[];
    totals?: number[]; // review total per pass (last repeats)
    stopAfterPass?: number; // a SIGINT is delivered while this pass runs
  }
  const scenarios: Scenario[] = [
    { name: 'default single pass', argv: [] },
    { name: 'review items', argv: [], totals: [3] },
    { name: 'worker and limit', argv: ['--worker', 'w1', '--limit', '7'] },
    { name: 'limit not a number', argv: ['--limit', 'abc'] },
    { name: 'limit zero', argv: ['--limit', '0'] },
    { name: 'limit without a value', argv: ['--limit'] },
    { name: 'limit swallows the next flag', argv: ['--limit', '--loop'], stopAfterPass: 2 },
    { name: 'worker swallows the next flag', argv: ['--worker', '--loop'], stopAfterPass: 1 },
    { name: 'loop interval 5', argv: ['--loop', '--interval', '5'], stopAfterPass: 2 },
    { name: 'loop interval below the floor', argv: ['--loop', '--interval', '1'], stopAfterPass: 2 },
    { name: 'loop interval not a number', argv: ['--loop', '--interval', 'abc'], stopAfterPass: 3 },
    { name: 'loop fractional interval', argv: ['--loop', '--interval', '7.25'], stopAfterPass: 2 },
    { name: 'loop stopped during the first pass', argv: ['--loop', '--interval', '5'], stopAfterPass: 1 },
    { name: 'review items persist across passes', argv: ['--loop', '--interval', '5'], totals: [2, 0, 0], stopAfterPass: 3 }
  ];
  const show = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === 'number' && Number.isNaN(x) ? 'NaN' : x === undefined ? '__undefined__' : x));
  const normalizeAt = (line: string) => line.replace(/"at":"[^"]+"/, '"at":"<ISO>"');

  interface Observed {
    runOnceArgs: string[];
    logs: string[];
    exit: number | undefined;
    sleeps: number[];
    atIso: boolean;
  }
  async function drive(p: Promise<unknown>) {
    let done = false;
    void p.then(() => { done = true; }, () => { done = true; });
    for (let i = 0; i < 4000 && !done; i++) await vi.advanceTimersByTimeAsync(500);
    await p;
  }
  function makeService(s: Scenario, emitSignal: () => void, observed: Observed) {
    let pass = 0;
    return {
      runOnce: async (args: unknown) => {
        pass += 1;
        observed.runOnceArgs.push(show(args));
        if (s.stopAfterPass === pass) emitSignal();
        return { workerId: 'w' };
      },
      reviewReport: async () => ({ total: (s.totals ?? [0])[Math.min(pass - 1, (s.totals ?? [0]).length - 1)] })
    };
  }
  async function runLegacy(s: Scenario): Promise<Observed> {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-22T10:00:00.000Z'));
    const observed: Observed = { runOnceArgs: [], logs: [], exit: undefined, sleeps: [], atIso: true };
    const spy = vi.spyOn(globalThis, 'setTimeout');
    const handlers: Array<() => void> = [];
    const proc = { argv: ['node', 'reconcilePayments.ts', ...s.argv], pid: 4242, on: (_e: string, h: () => void) => { handlers.push(h); } };
    const service = makeService(s, () => handlers.forEach((h) => h()), observed);
    const cons = { log: (l: string) => observed.logs.push(l), error: () => undefined };
    const api = legacyFactory(proc, service, cons);
    const p = api.main().then((c) => { observed.exit = c; });
    await drive(p);
    observed.sleeps = spy.mock.calls.map((c) => c[1] as number).filter((d) => d <= 500);
    vi.useRealTimers();
    vi.restoreAllMocks();
    return observed;
  }
  async function runNew(s: Scenario): Promise<Observed> {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-22T10:00:00.000Z'));
    const observed: Observed = { runOnceArgs: [], logs: [], exit: undefined, sleeps: [], atIso: true };
    const spy = vi.spyOn(globalThis, 'setTimeout');
    const proc = fakeProc(s.argv);
    const service = makeService(s, () => proc.emit('SIGINT'), observed);
    const db = { $queryRaw: async () => [GOOD_ID], $disconnect: async () => undefined };
    const p = runReconcileMain({ proc, console: { log: (l) => observed.logs.push(l), error: () => undefined }, db, service, target: okTarget() });
    await drive(p);
    observed.exit = proc.exits[0];
    observed.sleeps = spy.mock.calls.map((c) => c[1] as number).filter((d) => d <= 500);
    vi.useRealTimers();
    vi.restoreAllMocks();
    return observed;
  }

  it.each(scenarios.map((s) => [s.name, s] as const))('%s: same runOnce arguments, summary lines, exit code and sleep behaviour', async (_n, s) => {
    const a = await runLegacy(s);
    const b = await runNew(s);
    expect(b.exit).toBe(a.exit);
    expect(b.runOnceArgs).toEqual(a.runOnceArgs);
    expect(b.sleeps).toEqual(a.sleeps);
    expect(b.logs.map(normalizeAt)).toEqual(a.logs.map(normalizeAt));
    for (const line of [...a.logs, ...b.logs]) {
      expect(Object.keys(JSON.parse(line))).toEqual(['at', 'stats', 'review']);
      expect(JSON.parse(line).at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
    expect(b.logs[0]).toBe(a.logs[0]); // the first pass is logged at the frozen time: byte-identical, including "at"
  });

  it('sleep slices: interval 5 is ten 500 ms slices; the 5 s floor applies; NaN never sleeps', async () => {
    const five = await runNew({ name: 'x', argv: ['--loop', '--interval', '5'], stopAfterPass: 2 });
    expect(five.sleeps).toEqual(Array(10).fill(500));
    const floor = await runNew({ name: 'x', argv: ['--loop', '--interval', '1'], stopAfterPass: 2 });
    expect(floor.sleeps).toEqual(Array(10).fill(500));
    const nan = await runNew({ name: 'x', argv: ['--loop', '--interval', 'abc'], stopAfterPass: 3 });
    expect(nan.sleeps).toEqual([]);
  });

  // ---- documented deviations (each shows legacy and new behaviour side by side)
  it('deviation 1: a stop before the first pass - legacy still runs one pass, the new CLI runs none (exit 1)', async () => {
    vi.useFakeTimers();
    const handlers: Array<() => void> = [];
    const legacyCalls: unknown[] = [];
    const api = legacyFactory(
      { argv: ['node', 'x'], pid: 1, on: (_e: string, h: () => void) => { handlers.push(h); } },
      { runOnce: async (a: unknown) => { legacyCalls.push(a); return {}; }, reviewReport: async () => ({ total: 0 }) },
      { log: () => undefined, error: () => undefined }
    );
    handlers.forEach((h) => h());
    expect(await api.main()).toBe(0);
    expect(legacyCalls).toHaveLength(1);
    vi.useRealTimers();
    const h = harness();
    h.owner.stop.request();
    const r = await h.run();
    expect(r.code).toBe(1);
    expect(h.calls.runOnce).toEqual([]);
  });
  it('deviation 2: errors print only a class (legacy printed the raw message)', async () => {
    const h = harness({ runOnce: async () => { throw new Error('raw message LEAKSECRET'); } });
    await h.run();
    expect(h.err).toEqual(['payments:reconcile failed: Error']);
  });
  it('deviation 3: a rejected disconnect after success is still exit 1 (preserved); a hung disconnect is bounded (new)', async () => {
    const h = harness({ disconnect: async () => { throw new Error('x'); } });
    expect((await h.run()).code).toBe(1);
  });
  // Deviations 4-7 are not re-tested here (the legacy has no equivalent behaviour to compare). They are verified by:
  //   4 signals: grace timer, second signal, fatal handlers  -> F (handler units), G (fatal override), M (competing events through the real wiring), K fatal subprocess tests
  //   5 exit code 3 for guard refusals only                  -> C (refusal matrix), H (exit-code exclusivity), K (subprocess refusals)
  //   6 fixed single-string stderr lines                     -> C, D, I, K (exact stderr comparisons)
  //   7 unresolved guard query exits 1 without disconnecting -> D (fake timers, real wiring), K U1/U2/U3 (real process)
});

// ------------------------------------------------------------------------------------------------ K. subprocess tests
// WHAT EACH SUBPROCESS TEST EXECUTES (every child gets an explicit environment, an empty temp working directory, the stub Prisma preload
// through NODE_OPTIONS, and a DATABASE_URL that is either absent or points at a loopback tripwire - never at the real cluster on port 5432):
//   REAL ENTRY    node tsx scripts/reconcilePayments.ts   - the production entry point of this branch, unmodified. These tests only drive paths
//                 that refuse BEFORE configuration or Prisma is imported. The stub proves it: config/database.ts never reads the prismaGlobal hook
//                 (no PRISMA_GLOBAL_READ) and @prisma/client is not in the module cache at exit (PRISMA_MODULE_LOADED=false). The fixture runs below are
//                 the positive control (both are present there). NOTE: importing @prisma/client loads server/.env into process.env (non-overriding), which
//                 is exactly why the operator's target is captured and checked before that import.
//   FIXTURE ENTRY node tsx src/tests/fixtures/reconcileTestEntry.ts - identical wiring except it injects an already-passed DATABASE_URL check
//                 (the real entry pins localhost:5432). Configuration IS imported here, against the stub Prisma client, so the identity query, the
//                 unresolved-query path, late results and fatal events can be exercised without any database.
// The real entry's success path (valid URL + valid identity -> reconciliation) is deliberately NOT run in a subprocess: it would aim at the real
// local cluster if the stub failed to load.
const tsxCli = path.join(serverDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const realEntry = path.join(serverDir, 'scripts', 'reconcilePayments.ts');
const fixtureEntry = path.join(serverDir, 'src', 'tests', 'fixtures', 'reconcileTestEntry.ts');
const stubPath = path.join(serverDir, 'src', 'tests', 'fixtures', 'reconcileStubPrisma.cjs');

interface CliRun {
  code: number | null;
  stdout: string;
  stderr: string;
  ms: number;
  log: string[];
  connections: number;
}
interface RunOpts {
  entry: 'real' | 'fixture';
  /** Value of PAYMENTS_RECONCILE_EXPECT_DATABASE in the PROCESS environment; null = not set. */
  expect: string | null;
  /** DATABASE_URL in the process environment. Default: a sentinel to the loopback tripwire. null = not set. "{PORT}" is replaced by the tripwire port. */
  url?: string | null;
  /** Content of a `.env` file placed in the child's working directory ("{PORT}" replaced). */
  dotenv?: string;
  mode?: 'NEVER' | 'LATE_RESOLVE' | 'LATE_REJECT' | 'DB';
  /** Extra child environment variables (stub controls PB_STUB_*, or application settings such as CORS_ALLOWED_ORIGINS). */
  stub?: Record<string, string>;
  patchExit?: boolean;
  fatal?: 'exception' | 'rejection';
  timeoutMs: number;
}
async function runCli(o: RunOpts): Promise<CliRun> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-h1-'));
  const logFile = path.join(tmp, 'stub.log');
  let connections = 0;
  const trip = net.createServer((s) => { connections += 1; s.destroy(); });
  await new Promise<void>((r) => trip.listen(0, '127.0.0.1', () => r()));
  const port = (trip.address() as net.AddressInfo).port;
  const fill = (s: string) => s.split('{PORT}').join(String(port));
  const env: Record<string, string> = {
    NODE_ENV: 'test',
    PAYMENT_PROVIDER: 'mock',
    NODE_OPTIONS: `--require=${stubPath.replace(/\\/g, '/')}`,
    PB_STUB_LOG: logFile,
    PB_STUB_MODE: o.mode ?? 'DB',
    PB_STUB_PATCH_EXIT: o.patchExit ? '1' : '0',
    PB_STUB_DB: NAME
  };
  env.JWT_ACCESS_SECRET = 'h1-test-access-secret-0123456789';
  env.JWT_REFRESH_SECRET = 'h1-test-refresh-secret-0123456789';
  const url = o.url === undefined ? 'postgresql://stub:stub@127.0.0.1:{PORT}/stub_sentinel' : o.url;
  if (url !== null) env.DATABASE_URL = fill(url);
  if (o.expect !== null) env[ENV] = o.expect;
  for (const [k, v] of Object.entries(o.stub ?? {})) env[k] = v;
  if (o.fatal) env.PB_STUB_FATAL = o.fatal;
  for (const k of ['SystemRoot', 'PATH', 'TEMP', 'TMP', 'ComSpec', 'PATHEXT']) if (process.env[k]) env[k] = process.env[k] as string;
  if (o.dotenv !== undefined) fs.writeFileSync(path.join(tmp, '.env'), fill(o.dotenv));
  // isolation preconditions: no PG* variable, nothing but the tripwire as a connection target, never the real cluster port
  for (const [k, v] of Object.entries(env)) {
    expect(/^PG/i.test(k), k).toBe(false);
    if (!k.startsWith('PB_STUB_') && k !== ENV && k !== 'DATABASE_URL' && k !== 'PATH') expect(v.includes('protein_bowl'), k).toBe(false);
  }
  if (env.DATABASE_URL) expect(env.DATABASE_URL).toContain(`127.0.0.1:${port}/`);
  if (o.dotenv !== undefined) expect(fill(o.dotenv)).not.toMatch(/:5432\b/);
  const started = Date.now();
  try {
    return await new Promise<CliRun>((resolve, reject) => {
      const child = spawn(process.execPath, [tsxCli, o.entry === 'real' ? realEntry : fixtureEntry], { cwd: tmp, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (b) => { stdout += b.toString(); });
      child.stderr.on('data', (b) => { stderr += b.toString(); });
      const killer = setTimeout(() => child.kill(), o.timeoutMs);
      child.on('error', reject);
      child.on('close', (code) => {
        clearTimeout(killer);
        const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean) : [];
        resolve({ code, stdout, stderr, ms: Date.now() - started, log, connections });
      });
    });
  } finally {
    trip.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
const count = (log: string[], prefix: string) => log.filter((l) => l.startsWith(prefix)).length;
const pidOf = (line: string) => /pid=(\d+)/.exec(line)?.[1];
const refusalText = (reason: string) => `payments:reconcile refused (${reason}): no reconciliation work was performed`;
/** The stub was preloaded before any @prisma module and is the process that answered the query; the loopback sentinel saw nothing. */
function expectIsolated(r: CliRun, expectQuery: boolean) {
  const loaded = r.log.filter((l) => l.startsWith('LOADED'));
  expect(loaded.length).toBeGreaterThan(0);
  for (const l of loaded) expect(l).toContain('prismaAlreadyLoaded=false');
  if (expectQuery) {
    const q = r.log.find((l) => l.startsWith('QUERY'));
    expect(q).toBeDefined();
    expect(loaded.map(pidOf)).toContain(pidOf(q as string));
  }
  expect(count(r.log, 'UNEXPECTED')).toBe(0);
  expect(r.connections).toBe(0);
}
/** A refusal taken BEFORE configuration / Prisma were imported: exact exit 3, exact single stderr line (no env.ts output), empty stdout, no query, no disconnect. */
function expectNoPrismaImport(label: string, r: CliRun) {
  expect(count(r.log, 'PRISMA_GLOBAL_READ'), label).toBe(0); // config/database.ts never evaluated
  const exits = r.log.filter((l) => l.startsWith('PRISMA_MODULE_LOADED'));
  expect(exits.length, label).toBeGreaterThan(0);
  for (const l of exits) expect(l, label).toContain('PRISMA_MODULE_LOADED=false'); // @prisma/client never loaded (so its .env loading never ran)
}
function expectRefusedBeforeImport(label: string, r: CliRun, reason: string) {
  expect(r.code, `${label}: ${r.stderr}`).toBe(3);
  expect(r.stdout, label).toBe('');
  expect(r.stderr.trim(), label).toBe(refusalText(reason));
  expectIsolated(r, false);
  expectNoPrismaImport(label, r);
  expect(count(r.log, 'QUERY'), label).toBe(0);
  expect(count(r.log, 'DISCONNECT'), label).toBe(0);
}

describe('K. the entry points in isolated subprocesses (stub Prisma, loopback tripwire)', () => {
  it('REAL ENTRY: a missing, empty or wrong operator expectation is refused before configuration or Prisma is imported', { timeout: 120_000 }, async () => {
    const cases: Array<[string, string | null, string]> = [
      ['missing', null, 'EXPECTATION_MISSING'],
      ['empty', '', 'EXPECTATION_EMPTY'],
      ['wrong', 'protein_bowl_db', 'EXPECTATION_NOT_ALLOWED']
    ];
    const runs = await Promise.all(cases.map(([, expect_]) => runCli({ entry: 'real', expect: expect_, timeoutMs: 100_000 })));
    runs.forEach((r, i) => expectRefusedBeforeImport(cases[i][0], r, cases[i][2]));
  });

  it('REAL ENTRY: a .env file alone can never satisfy the explicit target confirmation or supply the connection string', { timeout: 120_000 }, async () => {
    const dotenvBoth = `${ENV}=${NAME}\nDATABASE_URL=postgresql://stub:stub@127.0.0.1:{PORT}/stub_sentinel\n`;
    const dotenvUrl = 'DATABASE_URL=postgresql://stub:stub@127.0.0.1:{PORT}/stub_sentinel\n';
    const cases: Array<{ label: string; opts: Omit<RunOpts, 'entry' | 'timeoutMs'>; reason: string }> = [
      { label: '.env holds the expectation and the URL, the process holds neither', opts: { expect: null, url: null, dotenv: dotenvBoth }, reason: 'EXPECTATION_MISSING' },
      { label: 'expectation in the process, URL only in .env', opts: { expect: NAME, url: null, dotenv: dotenvUrl }, reason: 'DATABASE_URL_MISSING' },
      { label: 'wrong process expectation, right one in .env', opts: { expect: 'protein_bowl_db', url: null, dotenv: dotenvBoth }, reason: 'EXPECTATION_NOT_ALLOWED' },
      { label: 'URL that is not the disposable target (sentinel)', opts: { expect: NAME }, reason: 'DATABASE_URL_NOT_ALLOWED' },
      { label: 'URL naming protein_bowl_db', opts: { expect: NAME, url: 'postgresql://stub:stub@127.0.0.1:{PORT}/protein_bowl_db' }, reason: 'DATABASE_URL_NOT_ALLOWED' },
      { label: 'URL naming protein_bowl_p11c_test', opts: { expect: NAME, url: 'postgresql://stub:stub@127.0.0.1:{PORT}/protein_bowl_p11c_test' }, reason: 'DATABASE_URL_NOT_ALLOWED' },
      { label: 'URL naming protein_bowl_test_db', opts: { expect: NAME, url: 'postgresql://stub:stub@127.0.0.1:{PORT}/protein_bowl_test_db' }, reason: 'DATABASE_URL_NOT_ALLOWED' },
      { label: 'the right database name on a non-5432 port', opts: { expect: NAME, url: `postgresql://stub:stub@127.0.0.1:{PORT}/${NAME}` }, reason: 'DATABASE_URL_NOT_ALLOWED' }
    ];
    const runs = await Promise.all(cases.map((c) => runCli({ entry: 'real', timeoutMs: 100_000, ...c.opts })));
    runs.forEach((r, i) => expectRefusedBeforeImport(cases[i].label, r, cases[i].reason));
  });

  it('FIXTURE ENTRY: a configuration IMPORT failure is sanitized (class only, exit 1) and nothing is queried', { timeout: 120_000 }, async () => {
    // config/env.ts throws at import for an invalid origin list and puts the offending value in its message: it must never reach our output
    const r = await runCli({ entry: 'fixture', expect: NAME, stub: { CORS_ALLOWED_ORIGINS: 'postgresql://leakuser:LEAKSECRET@h/db' }, timeoutMs: 100_000 });
    expect(r.code, r.stderr).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr.trim()).toBe('payments:reconcile failed while loading configuration: Error');
    expect(r.stderr).not.toMatch(/LEAKSECRET|leakuser|postgresql:|stub:stub|Invalid origin/);
    expectIsolated(r, false);
    expect(count(r.log, 'QUERY')).toBe(0);
    expect(count(r.log, 'DISCONNECT')).toBe(0);
  });

  it('FIXTURE ENTRY (positive control): with the correct identity the guard permits work - configuration and Prisma ARE loaded and the service reaches the stub', { timeout: 120_000 }, async () => {
    const r = await runCli({ entry: 'fixture', expect: NAME, timeoutMs: 100_000 });
    // the stub client has no models, so the first service call ends the run with a sanitized TypeError (exit 1): the point is that work BEGAN
    expect(r.code, r.stderr).toBe(1);
    expect(r.stderr.trim()).toBe('payments:reconcile failed: TypeError');
    expect(r.stdout).toBe('');
    expect(count(r.log, 'PRISMA_GLOBAL_READ')).toBeGreaterThan(0);
    expect(r.log.some((l) => l.startsWith('PRISMA_MODULE_LOADED=true'))).toBe(true);
    expect(count(r.log, 'QUERY')).toBeGreaterThanOrEqual(2); // the identity query, then the reconciliation worker's first claim query
    expect(r.log.some((l) => l.startsWith('UNEXPECTED paymentWebhookEvent'))).toBe(true);
    expect(count(r.log, 'DISCONNECT')).toBe(1);
    expect(r.connections).toBe(0);
  });

  it('FIXTURE ENTRY: every connected-identity mismatch is refused (exit 3) after exactly one query and one disconnect', { timeout: 120_000 }, async () => {
    const cases: Array<[string, Record<string, string>, string]> = [
      ['other database', { PB_STUB_ID_DB: 'protein_bowl_db' }, 'CONNECTED_DATABASE_MISMATCH'],
      ['remote server address', { PB_STUB_ID_ADDR: '10.1.2.3' }, 'CONNECTED_HOST_MISMATCH'],
      ['unix socket (null address)', { PB_STUB_ID_ADDR: '__NULL__' }, 'CONNECTED_HOST_MISMATCH'],
      ['other port', { PB_STUB_ID_PORT: '5433' }, 'CONNECTED_PORT_MISMATCH'],
      ['missing marker', { PB_STUB_ID_MARKER: '__NULL__' }, 'CONNECTED_MARKER_MISMATCH'],
      ['wrong marker', { PB_STUB_ID_MARKER: 'not the disposable copy' }, 'CONNECTED_MARKER_MISMATCH']
    ];
    const runs = await Promise.all(cases.map(([, stub]) => runCli({ entry: 'fixture', expect: NAME, stub, timeoutMs: 100_000 })));
    runs.forEach((r, i) => {
      const [label, , reason] = cases[i];
      expect(r.code, `${label}: ${r.stderr}`).toBe(3);
      expect(r.stdout, label).toBe('');
      expect(r.stderr.trim(), label).toBe(refusalText(reason));
      expectIsolated(r, true);
      expect(count(r.log, 'QUERY'), label).toBe(1);
      expect(count(r.log, 'DISCONNECT'), label).toBe(1);
    });
  });

  it('FIXTURE ENTRY: a missing expectation in the process is refused even when a .env file defines it (configuration never imported)', { timeout: 120_000 }, async () => {
    const r = await runCli({ entry: 'fixture', expect: null, dotenv: `${ENV}=${NAME}\n`, timeoutMs: 100_000 });
    expectRefusedBeforeImport('fixture + .env', r, 'EXPECTATION_MISSING');
  });

  it('FIXTURE ENTRY U1/U2/U3: a guard query that never settles exits 1 without disconnecting or starting work; late resolve/reject cannot resume it', { timeout: 120_000 }, async () => {
    const [u1, u2, u3] = await Promise.all([
      runCli({ entry: 'fixture', expect: NAME, mode: 'NEVER', timeoutMs: 100_000 }),
      runCli({ entry: 'fixture', expect: NAME, mode: 'LATE_RESOLVE', patchExit: true, timeoutMs: 100_000 }),
      runCli({ entry: 'fixture', expect: NAME, mode: 'LATE_REJECT', patchExit: true, timeoutMs: 100_000 })
    ]);
    for (const [label, r] of [['U1', u1], ['U2', u2], ['U3', u3]] as const) {
      expect(r.code, `${label}: ${r.stderr}`).toBe(1);
      expect(r.stdout, label).toBe('');
      expect(r.stderr.trim(), label).toBe('payments:reconcile failed: target guard did not complete');
      expectIsolated(r, true);
      expect(count(r.log, 'QUERY'), label).toBe(1);
      expect(count(r.log, 'DISCONNECT'), label).toBe(0); // never disconnected under the unresolved query
      expect(r.ms, label).toBeGreaterThanOrEqual(14_500);
      expect(r.stderr, label).not.toMatch(/LEAKSECRET|leakuser|postgresql:|unhandled|uncaught/);
    }
    expect(count(u1.log, 'EXIT')).toBe(0); // U1 used the real, unpatched exit
    for (const r of [u2, u3]) {
      expect(count(r.log, 'EXIT')).toBe(1); // exactly one exit decision (latched), taken before the late settlement
      expect(r.log.find((l) => l.startsWith('EXIT'))).toMatch(/^EXIT 1 /);
    }
  });

  it('FIXTURE ENTRY: a REAL uncaught exception / unhandled rejection while the guard query is pending: exit 1 through the fatal handler, no disconnect, no work, no secret', { timeout: 120_000 }, async () => {
    const [ex, rej] = await Promise.all([
      runCli({ entry: 'fixture', expect: NAME, mode: 'NEVER', fatal: 'exception', timeoutMs: 100_000 }),
      runCli({ entry: 'fixture', expect: NAME, mode: 'NEVER', fatal: 'rejection', timeoutMs: 100_000 })
    ]);
    for (const [label, r, line] of [['exception', ex, 'payments:reconcile failed: uncaught exception'], ['rejection', rej, 'payments:reconcile failed: unhandled promise rejection']] as const) {
      expect(r.code, `${label}: ${r.stderr}`).toBe(1);
      expect(r.stdout, label).toBe('');
      expect(r.stderr.trim().split(/\r?\n/), label).toEqual([line, 'payments:reconcile terminated by emergency exit']);
      expectIsolated(r, true);
      expect(count(r.log, 'QUERY'), label).toBe(1);
      expect(count(r.log, 'DISCONNECT'), label).toBe(0);
      expect(r.ms, label).toBeGreaterThanOrEqual(3_000);
      expect(r.ms, label).toBeLessThan(14_500); // exited by the backstop, not by the 15 s guard deadline
      expect(r.stderr, label).not.toMatch(/LEAKSECRET|leakuser|postgresql:/);
    }
  });
});

// ------------------------------------------------------------------------------------------------ L. static checks
describe('L. static checks of the temporary files', () => {
  const read = (p: string) => fs.readFileSync(path.join(serverDir, p), 'utf8');
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const guardSrc = read('src/modules/payment/reconcileTargetGuard.ts');
  const cliSrc = read('src/modules/payment/reconcileCli.ts');
  const scriptSrc = read('scripts/reconcilePayments.ts');
  const fixtureSrc = read('src/tests/fixtures/reconcileTestEntry.ts');
  const stubSrc = read('src/tests/fixtures/reconcileStubPrisma.cjs');
  const files = [
    'src/modules/payment/reconcileTargetGuard.ts',
    'src/modules/payment/reconcileCli.ts',
    'scripts/reconcilePayments.ts',
    'src/tests/p11c2.reconcileGuard.test.ts',
    'src/tests/fixtures/reconcileStubPrisma.cjs',
    'src/tests/fixtures/reconcileTestEntry.ts'
  ];
  const between = (src: string, from: string, to: string) => {
    const a = src.indexOf(from);
    const b = src.indexOf(to, a + from.length);
    return a >= 0 && b > a ? src.slice(a, b) : '';
  };

  it('every temporary file carries the marker and the target database is hard-coded exactly once', () => {
    expect(files).toHaveLength(6);
    for (const f of files) expect(read(f), f).toContain('TEMPORARY-H1-DO-NOT-MERGE');
    expect(guardSrc.match(/'pb_p11c_recon_20261022'/g)).toHaveLength(1);
    for (const src of [cliSrc, scriptSrc, fixtureSrc, stubSrc]) expect(src).not.toContain('pb_p11c_recon_20261022');
  });
  it('the stub marker equals the guard marker', () => {
    expect(/DEFAULT_MARKER = '([^']+)'/.exec(stubSrc)?.[1]).toBe(MARKER);
  });
  it('there is a single exit site and a single disconnect owner', () => {
    expect(cliSrc.match(/\.exit\(/g)).toHaveLength(1);
    for (const src of [scriptSrc, fixtureSrc]) expect(src).not.toMatch(/process\.exit|\$disconnect/);
    expect(guardSrc).not.toMatch(/exit\(|disconnect/i);
    // two textual $disconnect() calls: the bootstrap's owner closure and runReconcileMain's own owner (only used when no owner was passed in)
    expect(cliSrc.match(/\$disconnect\(\)/g)).toHaveLength(2);
    expect(cliSrc.match(/owner\.disconnectOnce\(\)/g)).toHaveLength(1);
    const handlers = between(cliSrc, 'export function installShutdownHandlers', 'argument parsing (identical');
    expect(handlers.length).toBeGreaterThan(0);
    expect(handlers).not.toMatch(/disconnect/i);
    expect(between(cliSrc, 'export async function runReconcileCli', 'wiring (used by')).toContain('owner.disconnectOnce()');
  });
  it('every refusal precedes every use of the reconciliation dependencies', () => {
    const execute = between(cliSrc, 'async function execute', 'export async function runReconcileCli');
    const firstWork = Math.min(...['d.runOnce(', 'd.reviewReport(', 'd.sleep(', 'd.log('].map((s) => execute.indexOf(s)));
    for (const marker of ['preflightTarget(d.expectation, d.urlCheck)', "refusalLine('DATABASE_URL_CHANGED')", 'refusalLine(outcome.result.reason)', "outcome.kind === 'DEADLINE'"]) {
      expect(execute.indexOf(marker), marker).toBeGreaterThan(0);
      expect(execute.indexOf(marker), marker).toBeLessThan(firstWork);
    }
    expect(execute.indexOf('preflightTarget(d.expectation, d.urlCheck)')).toBeLessThan(execute.indexOf('d.queryIdentity()'));
  });
  it('the CLI and guard modules import neither the application database / env nor Prisma, and the CLI never reads process.env', () => {
    expect(strip(cliSrc)).not.toMatch(/process\.env|config\/database|config\/env|new PrismaClient|@prisma\/client/);
    expect(strip(guardSrc)).not.toMatch(/config\/database|config\/env|new PrismaClient|@prisma\/client/);
    expect(cliSrc).toContain("from './reconcileTargetGuard.js'");
  });
  it('the real entry imports the CLI first, imports configuration / Prisma / the service only dynamically, and cannot be handed a target', () => {
    const code = strip(scriptSrc);
    const imports = code.split('\n').filter((l) => /^\s*import\b/.test(l));
    expect(imports).toHaveLength(1);
    expect(imports[0]).toContain('reconcileCli.js');
    expect(code).not.toMatch(/^\s*import .*(config\/database|paymentReconciliation|@prisma\/client)/m);
    expect(code.match(/await import\(/g)).toHaveLength(2);
    expect(code).toContain("import('../src/config/database.js')");
    expect(code).toContain("import('../src/modules/payment/paymentReconciliation.service.js')");
    expect(code).not.toMatch(/\btarget\b|urlCheck|urlUnchanged|expectation|PROCESS_TARGET|captureProcessTarget/);
    expect(code).not.toMatch(/process\.env/);
  });
  it('only the test fixture passes a target, and nothing but the tests references the fixture', () => {
    expect(strip(fixtureSrc)).toMatch(/target:\s*\{ expectation: process\.env\[RECONCILE_EXPECTED_DATABASE_ENV\], urlCheck: \{ ok: true \}/);
    expect(read('package.json')).not.toMatch(/reconcileTestEntry|reconcileStubPrisma/);
    for (const f of ['scripts/reconcilePayments.ts', 'src/modules/payment/reconcileCli.ts', 'src/modules/payment/reconcileTargetGuard.ts']) expect(read(f), f).not.toMatch(/reconcileTestEntry|fixtures\//);
  });
  it('only the entry points import the CLI module and the application never imports the temporary modules', () => {
    expect(scriptSrc).toContain("from '../src/modules/payment/reconcileCli.js'");
    expect(fixtureSrc).toContain("from '../../modules/payment/reconcileCli.js'");
    expect(cliSrc).toContain("from './reconcileTargetGuard.js'");
    for (const f of ['src/modules/payment/paymentReconciliation.service.ts', 'src/app.ts', 'src/server.ts'].filter((x) => fs.existsSync(path.join(serverDir, x)))) {
      expect(read(f), f).not.toMatch(/reconcileCli|reconcileTargetGuard/);
    }
  });
  it('config/database.ts still honours the prismaGlobal hook the stub relies on', () => {
    expect(read('src/config/database.ts')).toContain('globalThis.prismaGlobal ?? new PrismaClient');
  });
});

// ------------------------------------------------------------------------------------------------ M. competing events through the REAL wiring
// These drive runReconcileMain (the real owner, handlers, CLI core and exit path) with a fake process emitter and fake timers, so signals and
// fatal errors arrive WHILE the real CLI is mid-flight and race its normal completion. They are still simulations of the OS events (the
// emitter stands in for the process); the only real-process competing events are the subprocess tests in group K.
describe('M. signals and fatal errors competing with the real CLI flow', () => {
  const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  function wired(o: { argv?: string[]; runOnce?: () => Promise<unknown>; disconnect?: () => Promise<unknown>; query?: () => Promise<unknown> } = {}) {
    vi.useFakeTimers();
    const proc = fakeProc(o.argv ?? []);
    const out: string[] = [];
    const err: string[] = [];
    const db = {
      $queryRaw: vi.fn(o.query ?? (async () => [GOOD_ID])),
      $disconnect: vi.fn(o.disconnect ?? (async () => undefined))
    };
    const service = { runOnce: vi.fn(o.runOnce ?? (async () => ({}))), reviewReport: vi.fn(async () => ({ total: 0 })) };
    const main = runReconcileMain({ proc, console: { log: (l) => out.push(l), error: (l) => err.push(l) }, db, service, target: okTarget() });
    return { proc, out, err, db, service, main };
  }

  it('a fatal error while the final disconnect is in flight still ends in exit 1 even though the run itself succeeded', async () => {
    const d = deferred<void>();
    const w = wired({ disconnect: () => d.promise });
    await settle();
    expect(w.service.runOnce).toHaveBeenCalledTimes(1);
    expect(w.db.$disconnect).toHaveBeenCalledTimes(1); // the CLI is in cleanup
    w.proc.emit('uncaughtException', new Error('postgresql://leakuser:LEAKSECRET@h/db'));
    d.resolve();
    await w.main;
    expect(w.proc.exits).toEqual([1]);
    expect(w.proc.exitCode).toBe(1);
    expect(w.out).toHaveLength(1); // the completed pass was still reported
    expect(w.err).toEqual(['payments:reconcile failed: uncaught exception']);
    expect(w.db.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('a fatal error during work lets the pass finish, then exits 1 (never 0)', async () => {
    const run = deferred<unknown>();
    const w = wired({ runOnce: () => run.promise });
    await settle();
    w.proc.emit('unhandledRejection', new Error('LEAKSECRET'));
    run.resolve({});
    await w.main;
    expect(w.proc.exits).toEqual([1]);
    expect(w.out).toHaveLength(1);
    expect(w.err.join('\n')).not.toContain('LEAKSECRET');
  });

  it('a fatal error while the work never finishes ends at the 3 s backstop: exit 1, no disconnect', async () => {
    const w = wired({ runOnce: () => new Promise(() => undefined) });
    await settle();
    w.proc.emit('uncaughtException', new Error('x'));
    await vi.advanceTimersByTimeAsync(2_999);
    expect(w.proc.exits).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(w.proc.exits).toEqual([1]);
    expect(w.err).toEqual(['payments:reconcile failed: uncaught exception', 'payments:reconcile terminated by emergency exit']);
    expect(w.db.$disconnect).not.toHaveBeenCalled();
  });

  it('a first signal during work lets the pass complete and exit once with the pass result (graceful)', async () => {
    const run = deferred<unknown>();
    const w = wired({ runOnce: () => run.promise });
    await settle();
    w.proc.emit('SIGINT');
    expect(w.proc.exits).toEqual([]);
    run.resolve({});
    await w.main;
    expect(w.proc.exits).toEqual([0]);
    expect(w.db.$disconnect).toHaveBeenCalledTimes(1);
    expect(w.err).toEqual([]);
  });

  it('a second signal during work is an immediate emergency exit; the later normal completion cannot exit again', async () => {
    const run = deferred<unknown>();
    const w = wired({ runOnce: () => run.promise });
    await settle();
    w.proc.emit('SIGINT');
    w.proc.emit('SIGTERM');
    expect(w.proc.exits).toEqual([1]);
    run.resolve({});
    await w.main;
    expect(w.proc.exits).toEqual([1]); // latched: the completion's own exitWith(0) is ignored
  });

  it('the 20 s grace expiry racing a slow pass exits once with 1; completion afterwards cannot exit again', async () => {
    const run = deferred<unknown>();
    const w = wired({ runOnce: () => run.promise });
    await settle();
    w.proc.emit('SIGINT');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(w.proc.exits).toEqual([1]);
    run.resolve({});
    await w.main;
    expect(w.proc.exits).toEqual([1]);
    expect(w.err).toEqual(['payments:reconcile terminated by emergency exit']);
  });

  it('a second signal while the disconnect is in flight exits at once; the later disconnect cannot change it', async () => {
    const d = deferred<void>();
    const w = wired({ disconnect: () => d.promise });
    await settle();
    w.proc.emit('SIGINT');
    w.proc.emit('SIGINT');
    expect(w.proc.exits).toEqual([1]);
    d.resolve();
    await w.main;
    expect(w.proc.exits).toEqual([1]);
  });

  it('a signal during the guard wait: the guard is waited for, then no work and exit 1 (a single exit)', async () => {
    const q = deferred<unknown>();
    const w = wired({ query: () => q.promise });
    await settle();
    w.proc.emit('SIGINT');
    await settle();
    expect(w.db.$disconnect).not.toHaveBeenCalled();
    q.resolve([GOOD_ID]);
    await w.main;
    expect(w.proc.exits).toEqual([1]);
    expect(w.service.runOnce).not.toHaveBeenCalled();
    expect(w.db.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('a signal during the guard wait with the query never settling: exit 1 by the deadline, no disconnect, a single exit', async () => {
    const w = wired({ query: () => new Promise(() => undefined) });
    await settle();
    w.proc.emit('SIGINT');
    await vi.advanceTimersByTimeAsync(15_000);
    await w.main;
    expect(w.proc.exits).toEqual([1]);
    expect(w.db.$disconnect).not.toHaveBeenCalled();
    expect(w.service.runOnce).not.toHaveBeenCalled();
    expect(w.err).toEqual(['payments:reconcile failed: target guard did not complete']);
  });

  it('a signal and a fatal error together during work: one exit, code 1, no disconnect underneath unfinished work', async () => {
    const w = wired({ runOnce: () => new Promise(() => undefined) });
    await settle();
    w.proc.emit('SIGINT');
    w.proc.emit('uncaughtException', new Error('x'));
    w.proc.emit('SIGTERM');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(w.proc.exits).toEqual([1]);
    expect(w.proc.exitCode).toBe(1);
    expect(w.db.$disconnect).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------------------------------------------ N. bootstrap: handlers first, pre-import refusals, bounded load
describe('N. bootstrapReconcile: handlers before import, refusal before import, safe load failures', () => {
  type Deps = { db: { $queryRaw: ReturnType<typeof vi.fn>; $disconnect: ReturnType<typeof vi.fn> }; service: { runOnce: ReturnType<typeof vi.fn>; reviewReport: ReturnType<typeof vi.fn> } };
  function boot(o: { target?: CapturedTarget; load?: (d: Deps) => Promise<Deps>; query?: () => Promise<unknown>; loadDeadlineMs?: number } = {}) {
    vi.useFakeTimers();
    const proc = fakeProc();
    const events: string[] = [];
    const baseOn = proc.on.bind(proc);
    proc.on = (e, l) => {
      events.push(`on:${e}`);
      return baseOn(e, l);
    };
    const out: string[] = [];
    const err: string[] = [];
    const db = { $queryRaw: vi.fn(o.query ?? (async () => [GOOD_ID])), $disconnect: vi.fn(async () => undefined) };
    const service = { runOnce: vi.fn(async () => ({})), reviewReport: vi.fn(async () => ({ total: 0 })) };
    const load = vi.fn(async () => {
      events.push('load');
      return o.load ? o.load({ db, service }) : { db, service };
    });
    const done = bootstrapReconcile({
      proc,
      console: { log: (l) => out.push(l), error: (l) => err.push(l) },
      load: load as never,
      target: o.target ?? okTarget(),
      loadDeadlineMs: o.loadDeadlineMs
    });
    return { proc, events, out, err, db, service, load, done };
  }
  const HANDLERS = ['on:SIGINT', 'on:SIGTERM', 'on:unhandledRejection', 'on:uncaughtException'];

  it('installs the signal and fatal handlers BEFORE it loads configuration, then runs the guarded pass', async () => {
    const b = boot();
    await b.done;
    expect(b.events.slice(0, 4)).toEqual(HANDLERS);
    expect(b.events[4]).toBe('load');
    expect(b.load).toHaveBeenCalledTimes(1);
    expect(b.service.runOnce).toHaveBeenCalledTimes(1);
    expect(b.proc.exits).toEqual([0]);
    expect(b.out).toHaveLength(1);
  });

  const refusals: Array<[string, CapturedTarget, string]> = [
    ['no operator expectation', { expectation: undefined, urlCheck: OK_URL, urlUnchanged: () => true }, 'EXPECTATION_MISSING'],
    ['empty expectation', { expectation: '', urlCheck: OK_URL, urlUnchanged: () => true }, 'EXPECTATION_EMPTY'],
    ['wrong expectation', { expectation: 'protein_bowl_db', urlCheck: OK_URL, urlUnchanged: () => true }, 'EXPECTATION_NOT_ALLOWED'],
    ['missing DATABASE_URL', { expectation: NAME, urlCheck: { ok: false, reason: 'DATABASE_URL_MISSING' }, urlUnchanged: () => true }, 'DATABASE_URL_MISSING'],
    ['unsupported DATABASE_URL', { expectation: NAME, urlCheck: { ok: false, reason: 'DATABASE_URL_NOT_ALLOWED' }, urlUnchanged: () => true }, 'DATABASE_URL_NOT_ALLOWED'],
    ['bad expectation AND bad URL: the expectation is reported', { expectation: undefined, urlCheck: { ok: false, reason: 'DATABASE_URL_NOT_ALLOWED' }, urlUnchanged: () => true }, 'EXPECTATION_MISSING']
  ];
  it.each(refusals)('%s: exit 3 and configuration / Prisma are never loaded', async (_n, target, reason) => {
    const b = boot({ target });
    await b.done;
    expect(b.load).not.toHaveBeenCalled();
    expect(b.events).toEqual(HANDLERS); // handlers were installed, nothing else happened
    expect(b.proc.exits).toEqual([3]);
    expect(b.err).toEqual([`payments:reconcile refused (${reason}): no reconciliation work was performed`]);
    expect(b.db.$queryRaw).not.toHaveBeenCalled();
    expect(b.db.$disconnect).not.toHaveBeenCalled();
    expect(b.service.runOnce).not.toHaveBeenCalled();
    expect(b.out).toEqual([]);
  });

  it('a configuration load failure prints only a class name and exits 1 without touching Prisma or the service', async () => {
    const boom = Object.assign(new Error('Invalid environment variables postgresql://leakuser:LEAKSECRET@h/db password=hunter2'), { code: 'ESECRETCODE' });
    const b = boot({ load: async () => { throw boom; } });
    await b.done;
    expect(b.proc.exits).toEqual([1]);
    expect(b.err).toEqual(['payments:reconcile failed while loading configuration: Error']);
    expect(b.err.join('\n')).not.toMatch(/LEAKSECRET|leakuser|hunter2|ESECRETCODE|Invalid environment/);
    expect(b.db.$queryRaw).not.toHaveBeenCalled();
    expect(b.db.$disconnect).not.toHaveBeenCalled();
    expect(b.service.runOnce).not.toHaveBeenCalled();
  });
  it('a load that throws synchronously is handled the same way', async () => {
    const b = boot({ load: () => { throw new Error('LEAKSECRET'); } });
    await b.done;
    expect(b.proc.exits).toEqual([1]);
    expect(b.err).toEqual(['payments:reconcile failed while loading configuration: Error']);
  });
  it('a load that never finishes is abandoned at the deadline: exit 1, nothing connected, nothing run', async () => {
    const b = boot({ load: () => new Promise(() => undefined) });
    await vi.advanceTimersByTimeAsync(14_999);
    expect(b.proc.exits).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await b.done;
    expect(b.proc.exits).toEqual([1]);
    expect(b.err).toEqual(['payments:reconcile failed: configuration did not load']);
    expect(b.db.$disconnect).not.toHaveBeenCalled();
    expect(b.service.runOnce).not.toHaveBeenCalled();
  });
  it('a fatal error while configuration is loading is handled (the handlers exist before the import): exit 1 at the backstop', async () => {
    const b = boot({ load: () => new Promise(() => undefined) });
    await vi.advanceTimersByTimeAsync(10);
    b.proc.emit('uncaughtException', new Error('postgresql://leakuser:LEAKSECRET@h/db'));
    await vi.advanceTimersByTimeAsync(3_000);
    expect(b.proc.exits).toEqual([1]);
    expect(b.err).toEqual(['payments:reconcile failed: uncaught exception', 'payments:reconcile terminated by emergency exit']);
    expect(b.err.join('\n')).not.toContain('LEAKSECRET');
  });
  it('two signals while configuration is loading end in one exit(1)', async () => {
    const b = boot({ load: () => new Promise(() => undefined) });
    await vi.advanceTimersByTimeAsync(10);
    b.proc.emit('SIGINT');
    b.proc.emit('SIGINT');
    expect(b.proc.exits).toEqual([1]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(b.proc.exits).toEqual([1]);
  });
  it('a signal while loading stops the run before any query once the load finishes (exit 1, no work)', async () => {
    const gate = deferred<void>();
    const b = boot({ load: async (d) => { await gate.promise; return d; } });
    await vi.advanceTimersByTimeAsync(10);
    b.proc.emit('SIGINT');
    gate.resolve();
    await b.done;
    expect(b.proc.exits).toEqual([1]);
    expect(b.err).toEqual(['payments:reconcile interrupted before the target guard started: no reconciliation work was performed']);
    expect(b.db.$queryRaw).not.toHaveBeenCalled();
    expect(b.db.$disconnect).not.toHaveBeenCalled();
    expect(b.service.runOnce).not.toHaveBeenCalled();
  });
  it('a DATABASE_URL that changed after the capture is refused after the load, before any query (exit 3)', async () => {
    let unchanged = true;
    const target: CapturedTarget = { expectation: NAME, urlCheck: OK_URL, urlUnchanged: () => unchanged };
    const b = boot({
      target,
      load: async (d) => {
        unchanged = false; // e.g. something rewrote process.env.DATABASE_URL while the configuration loaded
        return d;
      }
    });
    await b.done;
    expect(b.proc.exits).toEqual([3]);
    expect(b.err).toEqual(['payments:reconcile refused (DATABASE_URL_CHANGED): no reconciliation work was performed']);
    expect(b.db.$queryRaw).not.toHaveBeenCalled();
    expect(b.db.$disconnect).not.toHaveBeenCalled();
    expect(b.service.runOnce).not.toHaveBeenCalled();
  });
  it('an identity mismatch after the load is refused (exit 3) and Prisma is disconnected once', async () => {
    const b = boot({ query: async () => [{ ...GOOD_ID, marker: null }] });
    await b.done;
    expect(b.proc.exits).toEqual([3]);
    expect(b.db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(b.db.$disconnect).toHaveBeenCalledTimes(1);
    expect(b.service.runOnce).not.toHaveBeenCalled();
    expect(b.err).toEqual(['payments:reconcile refused (CONNECTED_MARKER_MISMATCH): no reconciliation work was performed']);
  });
});
