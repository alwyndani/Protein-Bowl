/**
 * Starts the real API (src/server.ts) against the ISOLATED test database for manual / browser end-to-end checks.
 *
 *   npm run e2e:api            (port 5000, mock payment provider, emails logged to the console, nothing leaves the machine)
 *
 * Safety: the target database is fixed to pb_ci_test on localhost and validated with the same checker the tests use BEFORE the application
 * (and its Prisma client) is imported; the development database in .env can never be selected because the process environment wins over .env.
 */
import { PrismaClient } from '@prisma/client';
import { checkTestDatabaseUrl, connectedDatabaseMatches } from '../src/tests/testDatabase.js';

// This mode carries public, fixed signing secrets: it can never run as (or next to) a production configuration.
if (process.env.NODE_ENV === 'production') {
  console.error('REFUSED: the isolated E2E API uses development-only secrets and must never run with NODE_ENV=production');
  process.exit(1);
}

const user = process.env.PB_TEST_PG_USER ?? 'postgres';
const password = process.env.PB_TEST_PG_PASSWORD ?? 'postgres';
const port = process.env.PB_TEST_PG_PORT ?? '5432';
const url = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@localhost:${port}/pb_ci_test?schema=public`;

const check = checkTestDatabaseUrl(url);
if (!check.ok || check.database !== 'pb_ci_test') {
  console.error(`REFUSED: ${check.ok ? 'unexpected database' : check.reason}`);
  process.exit(1);
}

// Prove the connection really lands on pb_ci_test BEFORE the application is imported (same check the test suite performs).
const probe = new PrismaClient({ datasources: { db: { url } } });
try {
  const reported = (await probe.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`)[0]?.db;
  if (!connectedDatabaseMatches('pb_ci_test', reported)) {
    console.error(`REFUSED: the server reports database "${reported}", expected "pb_ci_test"`);
    process.exit(1);
  }
} catch (e) {
  console.error(`REFUSED: cannot reach pb_ci_test on localhost:${port} (${e instanceof Error ? e.message.split('\n').pop() : 'error'}). Is PostgreSQL running, and is PB_TEST_PG_PASSWORD correct?`);
  process.exit(1);
} finally {
  await probe.$disconnect();
}

process.env.DATABASE_URL = url;
process.env.TEST_DATABASE_URL = url;
// Local-only signing secrets for this mode: tokens from any other environment are invalid here and these are valid nowhere else.
process.env.JWT_ACCESS_SECRET = 'e2e-isolated-access-secret-valid-only-for-this-local-run';
process.env.JWT_REFRESH_SECRET = 'e2e-isolated-refresh-secret-valid-only-for-this-local-run';
process.env.NODE_ENV = 'development';
process.env.PORT = process.env.E2E_API_PORT ?? '5000'; // the web app's default API address (src/services/apiClient.ts)
process.env.CLIENT_URL = 'http://localhost:3000';
process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000,http://localhost:3100';
process.env.PAYMENT_PROVIDER = 'mock'; // never a live or test gateway in this mode
process.env.EMAIL_PROVIDER = 'log';
process.env.PAYMENT_REFUND_INLINE_SUBMIT = 'true';
process.env.WEB_BASE_URL = 'http://localhost:3000';

console.log(`[e2e] database: localhost:${port}/pb_ci_test (validated isolated), payments: mock, email: log, api port ${process.env.PORT}`);
await import('../src/server.js');
