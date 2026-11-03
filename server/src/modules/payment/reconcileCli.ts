/**
 * TEMPORARY-H1-DO-NOT-MERGE
 *
 * Core of the `payments:reconcile` CLI for the P11C-2 isolated reconciliation test, wrapped in the temporary target guard
 * (reconcileTargetGuard.ts). It must never be merged into main.
 *
 * Exit codes: 0 = nothing needs attention, 2 = review items exist, 1 = the run failed or was interrupted (unchanged from the previous CLI),
 * 3 = the target guard REFUSED (and only that). Nothing in this file prints an exception message: only an allow-listed class name and code.
 *
 * Prisma shutdown has ONE owner (`createShutdownOwner().disconnectOnce`), called only by `runReconcileCli`. Signal / fatal handlers only
 * request a stop or exit; they never disconnect. When the guard query is still unresolved at its deadline, Prisma is NEVER disconnected
 * underneath it: the CLI abandons the client and the process exits at once (`exitWith`).
 */
import {
  PROCESS_TARGET,
  checkReconcileExpectation,
  verifyReconcileTarget,
  type CapturedTarget,
  type ConnectedIdentity,
  type ReconcileGuardResult,
  type ReconcileRefusalReason
} from './reconcileTargetGuard.js';

export const RECONCILE_REFUSED_EXIT_CODE = 3;
const FAILED_EXIT_CODE = 1;
const DEFAULT_GUARD_DEADLINE_MS = 15_000;
const DEFAULT_DISCONNECT_MS = 5_000;
const DEFAULT_GRACE_MS = 20_000;
const DEFAULT_FATAL_WAIT_MS = 3_000;

// ------------------------------------------------------------------------------------------------ safe diagnostics
const KNOWN_ERROR_NAMES = new Set([
  'Error', 'TypeError', 'RangeError', 'SyntaxError', 'AppError', 'ZodError', 'ProviderUnknownError', 'ProviderDefiniteError',
  'PrismaClientKnownRequestError', 'PrismaClientUnknownRequestError', 'PrismaClientInitializationError', 'PrismaClientValidationError', 'PrismaClientRustPanicError'
]);
const KNOWN_SYSTEM_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH', 'EACCES', 'ENOENT'
]);
const PRISMA_CODE = /^P[0-9]{4}$/;

/** `Class` or `Class (CODE)`; never the message, stack, cause or any other property. Reading a hostile object must not throw or leak. */
export function safeDiagnostic(err: unknown): string {
  try {
    const rawName = err instanceof Error ? err.name : 'Error';
    const name = typeof rawName === 'string' && KNOWN_ERROR_NAMES.has(rawName) ? rawName : 'Error';
    const code = (err as { code?: unknown } | null | undefined)?.code;
    return typeof code === 'string' && (KNOWN_SYSTEM_CODES.has(code) || PRISMA_CODE.test(code)) ? `${name} (${code})` : name;
  } catch {
    return 'Error';
  }
}

// ------------------------------------------------------------------------------------------------ stop signal and bounded waits
export interface StopSignal {
  readonly requested: boolean;
  request(): void;
}
export function createStopSignal(): StopSignal {
  let requested = false;
  return {
    get requested() {
      return requested;
    },
    request() {
      requested = true;
    }
  };
}

export type BoundedResult = 'OK' | 'FAILED' | 'TIMEOUT';

/** Runs `fn`; resolves OK / FAILED when it settles or TIMEOUT after `ms`. Never rejects; clears its timer. */
export function boundedWait(fn: () => Promise<unknown>, ms: number): Promise<BoundedResult> {
  return new Promise<BoundedResult>((resolve) => {
    let done = false;
    const finish = (r: BoundedResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => finish('TIMEOUT'), ms);
    try {
      Promise.resolve(fn()).then(
        () => finish('OK'),
        () => finish('FAILED')
      );
    } catch {
      finish('FAILED');
    }
  });
}

type GuardOutcome = { kind: 'SETTLED'; result: ReconcileGuardResult } | { kind: 'DEADLINE' };

/** Resolves with the guard result, or DEADLINE when it is still pending after `ms`. The guard promise itself never rejects. */
function guardOrDeadline(guard: Promise<ReconcileGuardResult>, ms: number): Promise<GuardOutcome> {
  return new Promise<GuardOutcome>((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve({ kind: 'DEADLINE' });
    }, ms);
    guard.then(
      (result) => {
        if (done) return; // late result after the deadline decision: dropped
        done = true;
        clearTimeout(timer);
        resolve({ kind: 'SETTLED', result });
      },
      () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ kind: 'SETTLED', result: { ok: false, reason: 'CONNECTED_DATABASE_UNKNOWN' } });
      }
    );
  });
}

// ------------------------------------------------------------------------------------------------ process abstraction and shutdown owner
export interface ProcLike {
  argv: readonly string[];
  env: Record<string, string | undefined>;
  pid: number;
  exitCode?: number | string | null | undefined;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  exit(code?: number): unknown;
}

export type Phase = 'start' | 'guard' | 'work' | 'cleanup' | 'abandoned' | 'done';

export interface ShutdownOwner {
  readonly stop: StopSignal;
  readonly phase: Phase;
  setPhase(p: Phase): void;
  readonly dbTouched: boolean;
  markDbTouched(): void;
  /** The guard query is unresolved: Prisma must NOT be disconnected; the process exits. */
  readonly abandoned: boolean;
  abandon(): void;
  readonly fatalSeen: boolean;
  markFatal(): void;
  /** The ONLY disconnect of the Prisma client. Memoized, bounded, never rejects. Called only by runReconcileCli. */
  disconnectOnce(): Promise<BoundedResult>;
  markCliDone(): void;
  whenCliDone(): Promise<void>;
  /** The ONLY place the process is told to exit. Latched: the first call decides. A fatal error forces 1. */
  exitWith(code: number): void;
  emergencyExit(): void;
}

export function createShutdownOwner(o: { proc: ProcLike; disconnect: () => Promise<unknown>; error: (line: string) => void; disconnectMs?: number }): ShutdownOwner {
  const stop = createStopSignal();
  let phase: Phase = 'start';
  let dbTouched = false;
  let abandoned = false;
  let fatal = false;
  let exited = false;
  let disconnecting: Promise<BoundedResult> | null = null;
  let cliDone = false;
  let releaseDone!: () => void;
  const donePromise = new Promise<void>((resolve) => {
    releaseDone = resolve;
  });
  const owner: ShutdownOwner = {
    stop,
    get phase() {
      return phase;
    },
    setPhase(p) {
      phase = p;
    },
    get dbTouched() {
      return dbTouched;
    },
    markDbTouched() {
      dbTouched = true;
    },
    get abandoned() {
      return abandoned;
    },
    abandon() {
      abandoned = true;
      phase = 'abandoned';
    },
    get fatalSeen() {
      return fatal;
    },
    markFatal() {
      fatal = true;
      o.proc.exitCode = 1;
    },
    disconnectOnce() {
      if (!disconnecting) disconnecting = boundedWait(o.disconnect, o.disconnectMs ?? DEFAULT_DISCONNECT_MS);
      return disconnecting;
    },
    markCliDone() {
      if (cliDone) return;
      cliDone = true;
      if (phase !== 'abandoned') phase = 'done';
      releaseDone();
    },
    whenCliDone: () => donePromise,
    exitWith(code) {
      if (exited) return;
      exited = true;
      const final = fatal ? FAILED_EXIT_CODE : code;
      o.proc.exitCode = final;
      o.proc.exit(final);
    },
    emergencyExit() {
      if (exited) return;
      o.error('payments:reconcile terminated by emergency exit');
      owner.exitWith(FAILED_EXIT_CODE);
    }
  };
  return owner;
}

// ------------------------------------------------------------------------------------------------ signals and fatal errors
/** Handlers only REQUEST a stop or an exit. They never disconnect Prisma and never read an error object. */
export function installShutdownHandlers(o: { proc: ProcLike; owner: ShutdownOwner; error: (line: string) => void; graceMs?: number; fatalWaitMs?: number }): void {
  const graceMs = o.graceMs ?? DEFAULT_GRACE_MS;
  const fatalWaitMs = o.fatalWaitMs ?? DEFAULT_FATAL_WAIT_MS;
  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms) as unknown as { unref?: () => void };
    t.unref?.();
  };
  let signals = 0;
  let fatalHandled = false;

  const onSignal = () => {
    signals += 1;
    if (o.owner.abandoned) return; // the exit is already decided
    if (signals > 1) {
      o.owner.emergencyExit();
      return;
    }
    o.owner.stop.request();
    later(() => {
      const p = o.owner.phase;
      if (p === 'start' || p === 'guard' || p === 'work') o.owner.emergencyExit(); // bounded last resort, never during bounded cleanup
    }, graceMs);
  };
  o.proc.on('SIGINT', onSignal);
  o.proc.on('SIGTERM', onSignal);

  const onFatal = (kind: string) => () => {
    if (fatalHandled) return;
    fatalHandled = true;
    o.owner.markFatal();
    o.owner.stop.request();
    o.error(`payments:reconcile failed: ${kind}`);
    later(() => o.owner.emergencyExit(), fatalWaitMs);
    void o.owner.whenCliDone().then(() => o.owner.exitWith(FAILED_EXIT_CODE));
  };
  o.proc.on('unhandledRejection', onFatal('unhandled promise rejection'));
  o.proc.on('uncaughtException', onFatal('uncaught exception'));
}

// ------------------------------------------------------------------------------------------------ argument parsing (identical semantics to the previous CLI)
export function arg(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}
export const flag = (argv: readonly string[], name: string) => argv.includes(`--${name}`);

export async function sleepInterruptible(ms: number, stop: StopSignal) {
  const end = Date.now() + ms;
  while (!stop.requested && Date.now() < end) await new Promise((r) => setTimeout(r, Math.min(500, end - Date.now())));
}

// ------------------------------------------------------------------------------------------------ the CLI core
export interface ReconcileCliDeps {
  /** The operator's expectation as CAPTURED from the process environment before any config import (never read from live process.env here). */
  expectation: string | undefined;
  /** Result of the pre-connection DATABASE_URL grammar check, taken from the same capture. */
  urlCheck: ReconcileGuardResult;
  /** False when the process's DATABASE_URL changed since capture (refused as DATABASE_URL_CHANGED before any query). */
  targetUnchanged?: () => boolean;
  argv: readonly string[];
  pid: number;
  /** Asked through the SAME Prisma client the worker uses. */
  queryIdentity: () => Promise<ConnectedIdentity | null | undefined>;
  runOnce: (opts: { workerId: string; limit?: number }) => Promise<unknown>;
  reviewReport: () => Promise<{ total: number }>;
  sleep: (ms: number) => Promise<void>;
  owner: ShutdownOwner;
  now: () => Date;
  log: (line: string) => void;
  error: (line: string) => void;
  onGuardPassed?: () => void;
  guardDeadlineMs?: number;
}

export interface ReconcileCliResult {
  code: number;
  /** The guard query was still pending at its deadline: the client was NOT disconnected and the process must exit. */
  queryUnresolved: boolean;
}

const refusalLine = (reason: ReconcileRefusalReason) => `payments:reconcile refused (${reason}): no reconciliation work was performed`;
const interruptedLine = (when: string) => `payments:reconcile interrupted ${when}: no reconciliation work was performed`;
const failed = (code = FAILED_EXIT_CODE): ReconcileCliResult => ({ code, queryUnresolved: false });

/** Everything that can be decided without a database: the operator's expectation, then the DATABASE_URL grammar. */
function preflightTarget(expectation: string | undefined, urlCheck: ReconcileGuardResult): ReconcileGuardResult {
  const e = checkReconcileExpectation(expectation);
  return e.ok ? urlCheck : e;
}

async function execute(d: ReconcileCliDeps): Promise<ReconcileCliResult> {
  const { owner } = d;
  if (owner.stop.requested) {
    d.error(interruptedLine('before the target guard started'));
    return failed();
  }

  const preflight = preflightTarget(d.expectation, d.urlCheck);
  if (!preflight.ok) {
    d.error(refusalLine(preflight.reason)); // no database access at all
    return failed(RECONCILE_REFUSED_EXIT_CODE);
  }
  if (d.targetUnchanged && !d.targetUnchanged()) {
    d.error(refusalLine('DATABASE_URL_CHANGED'));
    return failed(RECONCILE_REFUSED_EXIT_CODE);
  }

  owner.setPhase('guard');
  const guard = verifyReconcileTarget(d.expectation, d.urlCheck, () => {
    owner.markDbTouched();
    return d.queryIdentity();
  });
  const outcome = await guardOrDeadline(guard, d.guardDeadlineMs ?? DEFAULT_GUARD_DEADLINE_MS);

  if (outcome.kind === 'DEADLINE') {
    // The query may still be running: abandon the client (no disconnect), start no work, and let the caller exit the process.
    owner.abandon();
    d.error('payments:reconcile failed: target guard did not complete');
    return { code: FAILED_EXIT_CODE, queryUnresolved: true };
  }
  if (!outcome.result.ok) {
    d.error(refusalLine(outcome.result.reason));
    return failed(RECONCILE_REFUSED_EXIT_CODE);
  }
  if (owner.stop.requested) {
    d.error(interruptedLine('while the target guard was running'));
    return failed();
  }

  owner.setPhase('work');
  d.onGuardPassed?.();

  const workerId = arg(d.argv, 'worker') ?? `cli-${d.pid}`;
  const limit = arg(d.argv, 'limit') ? Number(arg(d.argv, 'limit')) : undefined;
  const loop = flag(d.argv, 'loop');
  const intervalMs = Math.max(5, Number(arg(d.argv, 'interval') ?? 60)) * 1000;
  let exit = 0;
  let passes = 0;

  for (;;) {
    if (owner.stop.requested) {
      if (passes === 0) {
        d.error(interruptedLine('before the first pass'));
        return failed();
      }
      break;
    }
    const stats = await d.runOnce({ workerId, limit });
    const report = await d.reviewReport();
    d.log(JSON.stringify({ at: d.now().toISOString(), stats, review: report }));
    passes += 1;
    if (report.total > 0) exit = 2;
    if (!loop) break;
    await d.sleep(intervalMs);
  }
  return { code: exit, queryUnresolved: false };
}

export async function runReconcileCli(d: ReconcileCliDeps): Promise<ReconcileCliResult> {
  const { owner } = d;
  let result: ReconcileCliResult;
  try {
    result = await execute(d);
  } catch (err) {
    d.error(`payments:reconcile failed: ${safeDiagnostic(err)}`);
    result = failed();
  }

  if (owner.abandoned) {
    owner.markCliDone(); // unresolved guard query: no disconnect, no cleanup
    return result;
  }

  owner.setPhase('cleanup');
  if (owner.dbTouched) {
    const status = await owner.disconnectOnce();
    if (status === 'FAILED' && (result.code === 0 || result.code === 2)) {
      d.error('payments:reconcile failed: database disconnect failed'); // as before: a failed disconnect after success is exit 1
      result = failed();
    } else if (status === 'TIMEOUT') {
      d.error('payments:reconcile warning: database disconnect did not complete');
    }
  }
  owner.markCliDone();
  return result;
}

// ------------------------------------------------------------------------------------------------ wiring (used by scripts/reconcilePayments.ts)
export interface ReconcileMainDeps {
  proc: ProcLike;
  console: { log: (line: string) => void; error: (line: string) => void };
  db: { $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => PromiseLike<unknown>; $disconnect: () => Promise<unknown> };
  service: {
    runOnce: (opts: { workerId?: string; limit?: number }) => Promise<unknown>;
    reviewReport: () => Promise<{ total: number }>;
  };
  /** The captured operator target. The real entry point NEVER passes this: it defaults to the process snapshot taken before any config import. */
  target?: CapturedTarget;
  /** Already-created shutdown owner (with handlers installed) when the caller bootstrapped before loading; otherwise one is created here. */
  owner?: ShutdownOwner;
  now?: () => Date;
  guardDeadlineMs?: number;
  graceMs?: number;
  fatalWaitMs?: number;
  disconnectMs?: number;
  onGuardPassed?: () => void;
}

export function runReconcileMain(d: ReconcileMainDeps): Promise<void> {
  const error = (line: string) => d.console.error(line);
  const target = d.target ?? PROCESS_TARGET;
  let owner = d.owner;
  if (!owner) {
    owner = createShutdownOwner({ proc: d.proc, disconnect: () => d.db.$disconnect(), error, disconnectMs: d.disconnectMs });
    installShutdownHandlers({ proc: d.proc, owner, error, graceMs: d.graceMs, fatalWaitMs: d.fatalWaitMs });
  }
  const own = owner;
  return runReconcileCli({
    expectation: target.expectation,
    urlCheck: target.urlCheck,
    targetUnchanged: () => target.urlUnchanged(d.proc.env),
    argv: d.proc.argv,
    pid: d.proc.pid,
    queryIdentity: async () => {
      const rows = (await d.db
        .$queryRaw`select current_database() as db, host(inet_server_addr()) as addr, inet_server_port()::text as port, shobj_description((select oid from pg_database where datname = current_database()), 'pg_database') as marker`) as ConnectedIdentity[];
      return rows[0] ?? null;
    },
    runOnce: (opts) => d.service.runOnce(opts),
    reviewReport: () => d.service.reviewReport(),
    sleep: (ms) => sleepInterruptible(ms, own.stop),
    owner: own,
    now: d.now ?? (() => new Date()),
    log: (line) => d.console.log(line),
    error,
    onGuardPassed: d.onGuardPassed,
    guardDeadlineMs: d.guardDeadlineMs
  }).then(
    (r) => own.exitWith(r.code),
    (e) => {
      error(`payments:reconcile failed: ${safeDiagnostic(e)}`);
      own.exitWith(FAILED_EXIT_CODE);
    }
  );
}

// ------------------------------------------------------------------------------------------------ bootstrap (the entry-point sequence)
type LoadOutcome<T> = { kind: 'LOADED'; value: T } | { kind: 'FAILED'; error: unknown } | { kind: 'DEADLINE' };

/** Runs `fn` (a dynamic import); never rejects. DEADLINE when it is still pending after `ms`. */
function loadOrDeadline<T>(fn: () => Promise<T>, ms: number): Promise<LoadOutcome<T>> {
  return new Promise<LoadOutcome<T>>((resolve) => {
    let done = false;
    const finish = (o: LoadOutcome<T>) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(o);
    };
    const timer = setTimeout(() => finish({ kind: 'DEADLINE' }), ms);
    try {
      Promise.resolve(fn()).then(
        (value) => finish({ kind: 'LOADED', value }),
        (error) => finish({ kind: 'FAILED', error })
      );
    } catch (error) {
      finish({ kind: 'FAILED', error });
    }
  });
}

export interface ReconcileBootstrapDeps {
  proc: ProcLike;
  console: { log: (line: string) => void; error: (line: string) => void };
  /** Dynamically imports configuration + Prisma + the service. Called ONLY after the handlers are installed and the operator's target passed the pre-import checks. */
  load: () => Promise<{ db: ReconcileMainDeps['db']; service: ReconcileMainDeps['service'] }>;
  /** The real entry point NEVER passes this (it defaults to the process snapshot taken before any config import). Test fixtures only. */
  target?: CapturedTarget;
  loadDeadlineMs?: number;
  guardDeadlineMs?: number;
  graceMs?: number;
  fatalWaitMs?: number;
  disconnectMs?: number;
  now?: () => Date;
}

/**
 * 1. install the signal / fatal handlers (before ANY config or Prisma import, so import-time failures are handled and sanitized);
 * 2. refuse (exit 3) on a missing / invalid expectation or DATABASE_URL, WITHOUT importing configuration or Prisma at all;
 * 3. load configuration + Prisma (bounded; a failure prints only a class name and exits 1);
 * 4. run the guarded CLI (identity query on the same client, then reconciliation).
 */
export async function bootstrapReconcile(b: ReconcileBootstrapDeps): Promise<void> {
  const error = (line: string) => b.console.error(line);
  let loaded: Awaited<ReturnType<ReconcileBootstrapDeps['load']>> | null = null;
  const owner = createShutdownOwner({
    proc: b.proc,
    error,
    disconnectMs: b.disconnectMs,
    disconnect: async () => {
      if (loaded) await loaded.db.$disconnect();
    }
  });
  installShutdownHandlers({ proc: b.proc, owner, error, graceMs: b.graceMs, fatalWaitMs: b.fatalWaitMs });
  const target = b.target ?? PROCESS_TARGET;

  const pre = preflightTarget(target.expectation, target.urlCheck);
  if (!pre.ok) {
    error(refusalLine(pre.reason));
    owner.markCliDone();
    owner.exitWith(RECONCILE_REFUSED_EXIT_CODE);
    return;
  }

  const outcome = await loadOrDeadline(b.load, b.loadDeadlineMs ?? DEFAULT_GUARD_DEADLINE_MS);
  if (outcome.kind === 'DEADLINE') {
    owner.abandon(); // nothing was connected; the process simply exits
    error('payments:reconcile failed: configuration did not load');
    owner.markCliDone();
    owner.exitWith(FAILED_EXIT_CODE);
    return;
  }
  if (outcome.kind === 'FAILED') {
    error(`payments:reconcile failed while loading configuration: ${safeDiagnostic(outcome.error)}`);
    owner.markCliDone();
    owner.exitWith(FAILED_EXIT_CODE);
    return;
  }
  loaded = outcome.value;
  await runReconcileMain({
    proc: b.proc,
    console: b.console,
    db: loaded.db,
    service: loaded.service,
    target,
    owner,
    now: b.now,
    guardDeadlineMs: b.guardDeadlineMs
  });
}
