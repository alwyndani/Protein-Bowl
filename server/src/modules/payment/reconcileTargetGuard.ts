/**
 * TEMPORARY-H1-DO-NOT-MERGE
 *
 * Temporary, local-only target guard for the P11C-2 isolated reconciliation test. It is hard-coded to ONE disposable database and
 * makes `payments:reconcile` refuse to run against anything else. It must never be merged into main or into the production CLI.
 *
 * Two layers, both fail closed:
 *  (1) BEFORE anything is imported or connected (captured when this module is first evaluated, i.e. before config/env.ts can run
 *      dotenv.config()): PAYMENTS_RECONCILE_EXPECT_DATABASE must equal the required name and the PROCESS's DATABASE_URL must match the
 *      disposable-target grammar below. A value that only exists in a `.env` file can never satisfy either check.
 *  (2) After connecting, the SAME Prisma client the worker uses must report the exact database name, a loopback server address, the
 *      required port and the exact disposable-copy marker.
 * Diagnostics name only a fixed reason code: never the URL, credentials or any digest of them.
 */
import { createHash } from 'node:crypto';

export const RECONCILE_EXPECTED_DATABASE_ENV = 'PAYMENTS_RECONCILE_EXPECT_DATABASE';
export const RECONCILE_REQUIRED_DATABASE = 'pb_p11c_recon_20261022';
export const RECONCILE_REQUIRED_PORT = '5432';
/** The comment set on the disposable copy by the (separately approved) copy step; no other database carries it. */
export const RECONCILE_REQUIRED_MARKER = 'DISPOSABLE reconciliation test copy of protein_bowl_p11c_test (P11C-2); safe to drop';

/** `localhost` may resolve to either loopback address, so the SERVER-side address may be either. A null address (Unix socket) is refused. */
const LOOPBACK_SERVER_ADDRESSES = new Set(['127.0.0.1', '::1']);

/** Same shape the Pass B runner enforces: local host, explicit port, the exact name, at most `?schema=public`. No other option (host=, hostaddr=, sslmode=...). */
const TARGET_URL = new RegExp(
  `^postgresql:\\/\\/[A-Za-z0-9_.-]+:(?:[A-Za-z0-9._~-]|%[0-9A-Fa-f]{2})*@(?:localhost|127\\.0\\.0\\.1):${RECONCILE_REQUIRED_PORT}\\/${RECONCILE_REQUIRED_DATABASE}(?:\\?schema=public)?$`
);

export type ReconcileRefusalReason =
  | 'EXPECTATION_MISSING'
  | 'EXPECTATION_EMPTY'
  | 'EXPECTATION_NOT_ALLOWED'
  | 'DATABASE_URL_MISSING'
  | 'DATABASE_URL_NOT_ALLOWED'
  | 'DATABASE_URL_CHANGED'
  | 'CONNECTED_DATABASE_UNKNOWN'
  | 'CONNECTED_DATABASE_MISMATCH'
  | 'CONNECTED_HOST_MISMATCH'
  | 'CONNECTED_PORT_MISMATCH'
  | 'CONNECTED_MARKER_MISMATCH';

export type ReconcileGuardResult = { ok: true } | { ok: false; reason: ReconcileRefusalReason };

/** What the connected server reports (all text, any value may be null). */
export interface ConnectedIdentity {
  db: string | null;
  addr: string | null;
  port: string | null;
  marker: string | null;
}

/** Pure check of the operator-provided expectation. A missing value is ALWAYS EXPECTATION_MISSING (including when only a `.env` file defines it). */
export function checkReconcileExpectation(value: string | undefined): ReconcileGuardResult {
  if (value === undefined) return { ok: false, reason: 'EXPECTATION_MISSING' };
  if (value.trim() === '') return { ok: false, reason: 'EXPECTATION_EMPTY' };
  if (value !== RECONCILE_REQUIRED_DATABASE) return { ok: false, reason: 'EXPECTATION_NOT_ALLOWED' };
  return { ok: true };
}

/** Pure grammar check of the connection string. The string is only matched, never parsed, stored or reported. */
export function checkDatabaseUrl(url: string | undefined): ReconcileGuardResult {
  if (typeof url !== 'string' || url === '') return { ok: false, reason: 'DATABASE_URL_MISSING' };
  return TARGET_URL.test(url) ? { ok: true } : { ok: false, reason: 'DATABASE_URL_NOT_ALLOWED' };
}

const digestOf = (value: string | undefined) => (typeof value === 'string' ? createHash('sha256').update(value).digest('hex') : null);

/** The operator's target as it was in the PROCESS environment at capture time. Holds no URL text; the digest stays private to the closure. */
export interface CapturedTarget {
  readonly expectation: string | undefined;
  readonly urlCheck: ReconcileGuardResult;
  /** True while the process's DATABASE_URL is still exactly what was captured. */
  urlUnchanged(env: Record<string, string | undefined>): boolean;
}

export function captureProcessTarget(env: Record<string, string | undefined>): CapturedTarget {
  const url = env.DATABASE_URL;
  const digest = digestOf(url);
  return Object.freeze({
    expectation: env[RECONCILE_EXPECTED_DATABASE_ENV],
    urlCheck: checkDatabaseUrl(url),
    urlUnchanged: (current: Record<string, string | undefined>) => digestOf(current.DATABASE_URL) === digest
  });
}

/**
 * Captured when this module is first evaluated. The real entry point imports the CLI module (and therefore this one) BEFORE it dynamically
 * imports config/database, so dotenv has not run yet: values that only exist in a `.env` file are not in this snapshot.
 */
export const PROCESS_TARGET: CapturedTarget = captureProcessTarget(process.env);

export function verifyConnectedIdentity(id: ConnectedIdentity | null | undefined): ReconcileGuardResult {
  if (!id || typeof id.db !== 'string' || id.db === '') return { ok: false, reason: 'CONNECTED_DATABASE_UNKNOWN' };
  if (id.db !== RECONCILE_REQUIRED_DATABASE) return { ok: false, reason: 'CONNECTED_DATABASE_MISMATCH' };
  if (typeof id.addr !== 'string' || !LOOPBACK_SERVER_ADDRESSES.has(id.addr)) return { ok: false, reason: 'CONNECTED_HOST_MISMATCH' };
  if (id.port !== RECONCILE_REQUIRED_PORT) return { ok: false, reason: 'CONNECTED_PORT_MISMATCH' };
  if (id.marker !== RECONCILE_REQUIRED_MARKER) return { ok: false, reason: 'CONNECTED_MARKER_MISMATCH' };
  return { ok: true };
}

/**
 * Expectation, then URL grammar (neither needs a database), then the live identity. Never rejects: a thrown error or an unusable answer is
 * CONNECTED_DATABASE_UNKNOWN. `queryIdentity` is not called when an earlier check refuses.
 */
export async function verifyReconcileTarget(
  expected: string | undefined,
  urlCheck: ReconcileGuardResult,
  queryIdentity: () => Promise<ConnectedIdentity | null | undefined>
): Promise<ReconcileGuardResult> {
  const expectation = checkReconcileExpectation(expected);
  if (!expectation.ok) return expectation;
  if (!urlCheck.ok) return urlCheck;
  try {
    return verifyConnectedIdentity(await queryIdentity());
  } catch {
    return { ok: false, reason: 'CONNECTED_DATABASE_UNKNOWN' };
  }
}
