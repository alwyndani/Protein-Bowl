/**
 * Creates and prepares the ISOLATED test database `pb_ci_test` on LOCAL PostgreSQL. Nothing else is ever created, dropped or migrated.
 *
 *   PB_CONFIRM_TARGET_DB=pb_ci_test npx tsx scripts/setupTestDb.ts --migrate
 *
 * Guarantees (all enforced before any connection is opened unless stated):
 *  1. Host must be exactly localhost / 127.0.0.1 and the port must be the expected one (PB_TEST_PG_EXPECT_PORT, default 5432).
 *  2. The operator must CONFIRM the target name: PB_CONFIRM_TARGET_DB must equal "pb_ci_test" (or it is typed at a prompt on a terminal).
 *  3. If pb_ci_test already exists the script STOPS. Re-creating it needs --recreate AND PB_CONFIRM_DROP=pb_ci_test; only that fixed name can be dropped.
 *  4. The one verified URL is the only database URL any child command receives; after creating/connecting, current_database() must equal pb_ci_test.
 *  5. The maintenance connection (database "postgres") is used for exactly two statements: a catalogue read and CREATE/DROP DATABASE "pb_ci_test".
 *     It never reads or writes any other database; development and production databases are never opened.
 */
import { execFileSync } from 'node:child_process';
import readline from 'node:readline/promises';
import { PrismaClient } from '@prisma/client';
import { checkTestDatabaseUrl } from '../src/tests/testDatabase.js';

const TARGET_DB = 'pb_ci_test';
const ALLOWED_HOSTS = ['localhost', '127.0.0.1'];

const user = process.env.PB_TEST_PG_USER ?? 'postgres';
const password = process.env.PB_TEST_PG_PASSWORD ?? 'postgres';
const host = process.env.PB_TEST_PG_HOST ?? 'localhost';
const port = process.env.PB_TEST_PG_PORT ?? '5432';
const expectedPort = process.env.PB_TEST_PG_EXPECT_PORT ?? '5432';

const enc = encodeURIComponent;
const targetUrl = `postgresql://${enc(user)}:${enc(password)}@${host}:${port}/${TARGET_DB}?schema=public`;
const adminUrl = `postgresql://${enc(user)}:${enc(password)}@${host}:${port}/postgres?schema=public`;

const refuse = (why: string): never => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};

async function confirmTarget(): Promise<void> {
  const given = process.env.PB_CONFIRM_TARGET_DB;
  if (given !== undefined) {
    if (given !== TARGET_DB) refuse(`PB_CONFIRM_TARGET_DB must be exactly "${TARGET_DB}"`);
    return;
  }
  if (!process.stdin.isTTY) refuse(`confirmation missing: set PB_CONFIRM_TARGET_DB=${TARGET_DB} (no terminal to ask)`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`Type the target database name to confirm (${TARGET_DB}): `)).trim();
  rl.close();
  if (answer !== TARGET_DB) refuse('the typed name does not match');
}

async function main() {
  // 1. host / port (no connection yet)
  if (!ALLOWED_HOSTS.includes(host)) refuse(`host "${host}" is not allowed (only ${ALLOWED_HOSTS.join(' / ')})`);
  if (!/^\d{2,5}$/.test(port) || port !== expectedPort) refuse(`port "${port}" is not the expected port "${expectedPort}"`);
  const check = checkTestDatabaseUrl(targetUrl);
  if (!check.ok || check.database !== TARGET_DB) refuse(`target is not an isolated test database (${check.ok ? 'unexpected name' : check.reason})`);

  console.log('Target');
  console.log(`  server    : ${host}:${port} (local, port as expected)`);
  console.log(`  database  : ${TARGET_DB}`);
  console.log('  isolated  : yes (name contains "test"; not the development, shared test or system database)');
  console.log('  credentials: not printed');

  // 2. explicit confirmation of the target name
  await confirmTarget();

  const recreate = process.argv.includes('--recreate');
  if (recreate && process.env.PB_CONFIRM_DROP !== TARGET_DB) refuse(`--recreate also needs PB_CONFIRM_DROP=${TARGET_DB}`);

  // 3. create (or stop when it exists)
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  try {
    const exists = (await admin.$queryRaw<Array<{ n: number }>>`SELECT 1 AS n FROM pg_database WHERE datname = ${TARGET_DB}`).length > 0;
    if (exists && !recreate) refuse(`${TARGET_DB} already exists. It is left untouched. To rebuild it deliberately use --recreate with PB_CONFIRM_DROP=${TARGET_DB}.`);
    if (exists && recreate) {
      await admin.$executeRawUnsafe(`DROP DATABASE "${TARGET_DB}" WITH (FORCE)`); // fixed, validated constant
      console.log(`  state     : ${TARGET_DB} dropped (explicit --recreate)`);
    }
    await admin.$executeRawUnsafe(`CREATE DATABASE "${TARGET_DB}"`); // fixed, validated constant
    console.log(`  state     : ${TARGET_DB} created (empty)`);
  } finally {
    await admin.$disconnect();
  }

  // 4. prove the verified URL really reaches pb_ci_test, and that it is empty, before anything is migrated
  const target = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    const db = (await target.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`)[0]?.db;
    if (db !== TARGET_DB) refuse(`connected database is "${db}", expected "${TARGET_DB}"`);
    const tables = await target.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM information_schema.tables WHERE table_schema = 'public'`;
    if (Number(tables[0]?.n ?? 0) !== 0) refuse(`${TARGET_DB} is not empty`);
    console.log('  verified  : current_database() = pb_ci_test, public schema empty');
  } finally {
    await target.$disconnect();
  }

  if (process.argv.includes('--migrate')) {
    console.log(`Applying the migration chain to ${TARGET_DB} ONLY ...`);
    execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['--no-install', 'prisma', 'migrate', 'deploy'], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, DATABASE_URL: targetUrl, TEST_DATABASE_URL: targetUrl }
    });
  }
  console.log(`\nTEST_DATABASE_URL = postgresql://${user}:***@${host}:${port}/${TARGET_DB}?schema=public`);
}

main().catch((e) => {
  console.error('setupTestDb failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
