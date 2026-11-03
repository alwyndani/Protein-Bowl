/**
 * Isolation rules for the database-dependent server tests. Pure functions (no I/O) so they can be unit-tested.
 * The suite never falls back to a default database: without TEST_DATABASE_URL no database is contacted at all.
 */

/** Names that must never be a test target: the development database, the SHARED test database and system databases. */
export const FORBIDDEN_DATABASES: readonly string[] = ['protein_bowl_db', 'protein_bowl_test_db', 'postgres', 'template0', 'template1'];

/** Sentinel used when no isolated database is configured: nothing listens on port 1, so DB-dependent suites fail fast and safely. */
export const NO_DATABASE_URL = 'postgresql://pb_none:pb_none@127.0.0.1:1/pb_no_database_configured?schema=public';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const NAME_RULE = /^[a-z][a-z0-9_]{2,62}$/;

export type TestDbCheck = { ok: true; database: string } | { ok: false; reason: string };

export function checkTestDatabaseUrl(raw: string | undefined): TestDbCheck {
  if (!raw || !raw.trim()) return { ok: false, reason: 'TEST_DATABASE_URL is not set' };
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: 'TEST_DATABASE_URL is not a valid URL' };
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') return { ok: false, reason: 'TEST_DATABASE_URL must be a postgresql:// URL' };
  if (!LOCAL_HOSTS.has(url.hostname.toLowerCase())) return { ok: false, reason: 'the test database host must be localhost' };
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!NAME_RULE.test(database)) return { ok: false, reason: 'the test database name is missing or malformed' };
  if (FORBIDDEN_DATABASES.includes(database)) return { ok: false, reason: `"${database}" is the development, shared or a system database` };
  if (!/(test|scratch|isolated)/.test(database)) return { ok: false, reason: 'the test database name must contain "test", "scratch" or "isolated"' };
  return { ok: true, database };
}

/** Post-connect check: the server must report exactly the database that was validated. */
export function connectedDatabaseMatches(expected: string, reported: string | null | undefined): boolean {
  return !!reported && reported === expected && !FORBIDDEN_DATABASES.includes(reported);
}
