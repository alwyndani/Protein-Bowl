/**
 * Server selection for the migration suites (`*.migration.test.ts`, `p6b.isolated.test.ts`). They CREATE and DROP their own temporary
 * databases as a PostgreSQL superuser, so they never fall back to a default server: the operator must name a DISPOSABLE instance.
 *
 *   PB_MIGRATION_PG_ADMIN_URL=postgresql://postgres:<password>@localhost:5433/postgres
 *
 * Rules (checked before anything connects): local host only; the maintenance database must be `postgres`; the port must NOT be the
 * default 5432 (where a development database normally lives) unless the operator states that this instance is disposable with
 * PB_MIGRATION_PG_CONFIRM_DISPOSABLE=yes.
 */
const raw = process.env.PB_MIGRATION_PG_ADMIN_URL;

function parse(): URL {
  if (!raw) throw new Error('PB_MIGRATION_PG_ADMIN_URL is not set: the migration suites only run against a disposable PostgreSQL instance you name explicitly (see server/TESTING.md).');
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('PB_MIGRATION_PG_ADMIN_URL is not a valid URL'); }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') throw new Error('PB_MIGRATION_PG_ADMIN_URL must be a postgresql:// URL');
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('PB_MIGRATION_PG_ADMIN_URL must point at localhost');
  if (url.pathname.replace(/^\//, '') !== 'postgres') throw new Error('PB_MIGRATION_PG_ADMIN_URL must name the maintenance database "postgres"');
  const port = url.port || '5432';
  if (port === '5432' && process.env.PB_MIGRATION_PG_CONFIRM_DISPOSABLE !== 'yes') {
    throw new Error('port 5432 is where a development database normally lives: use a separate instance on another port, or set PB_MIGRATION_PG_CONFIRM_DISPOSABLE=yes if this instance really is disposable');
  }
  return url;
}

const base = parse();

/** Connection to the maintenance database (CREATE/DROP DATABASE of the suite's own temporary database only). */
export const ADMIN_URL = `${base.protocol}//${base.username}:${base.password}@${base.hostname}:${base.port || '5432'}/postgres?schema=public`;

/** URL of one of the suite's own temporary databases on that same instance. */
export const urlOf = (db: string): string => `${base.protocol}//${base.username}:${base.password}@${base.hostname}:${base.port || '5432'}/${db}?schema=public`;
