import { beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { NO_DATABASE_URL, checkTestDatabaseUrl, connectedDatabaseMatches } from './testDatabase.js';

process.env.NODE_ENV = 'test';

// Database isolation: the target comes ONLY from TEST_DATABASE_URL and is validated before anything connects.
// Never the development or shared test database. Without it, DATABASE_URL points at a dead sentinel and no database is contacted.
const dbCheck = checkTestDatabaseUrl(process.env.TEST_DATABASE_URL);
if (process.env.TEST_DATABASE_URL && !dbCheck.ok) {
  throw new Error(`Refusing to run server tests: ${dbCheck.reason}. See server/TESTING.md.`);
}
process.env.DATABASE_URL = dbCheck.ok ? process.env.TEST_DATABASE_URL!.trim() : NO_DATABASE_URL;
if (!dbCheck.ok) {
  // Deliberate safeguard, stated plainly: database-dependent suites will fail with "Can't reach database server at 127.0.0.1:1".
  console.warn(`[test setup] ${dbCheck.reason}: no database is contacted (sentinel 127.0.0.1:1). Set TEST_DATABASE_URL to the isolated database; see server/TESTING.md.`);
}
process.env.JWT_ACCESS_SECRET = 'test_access_secret_key_1234567890_super_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_key_1234567890_super_secret';
process.env.JWT_ACCESS_EXPIRATION = '15m';
process.env.JWT_REFRESH_EXPIRATION = '7d';
process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000,https://app.proteinbowl.test';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

beforeAll(async () => {
  if (!dbCheck.ok) return; // database-free run: pure unit tests only; DB suites fail on the dead sentinel
  await prisma.$connect();
  const rows = await prisma.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  if (!connectedDatabaseMatches(dbCheck.database, rows[0]?.db)) {
    await prisma.$disconnect();
    throw new Error('Refusing to run server tests: the connected database is not the validated isolated test database.');
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

// Deterministic commerce policy for the whole test run, independent of any developer .env.
// These are TEST FIXTURE values (they keep the pre-P7A expectations such as a 40.00 delivery fee under a 499.00 threshold
// stable); they are not Protein Bowl business policy.
process.env.COMMERCE_TAX_MODE = 'EXCLUSIVE';
process.env.COMMERCE_DELIVERY_FEE = '40.00';
process.env.COMMERCE_FREE_DELIVERY_ENABLED = 'true';
process.env.COMMERCE_FREE_DELIVERY_THRESHOLD = '499.00';
process.env.COMMERCE_PACKAGING_FEE = '0.00';
process.env.COMMERCE_MIN_ORDER_VALUE = '0';
process.env.COMMERCE_DELIVERY_TAXABLE = 'false';
process.env.COMMERCE_PACKAGING_TAXABLE = 'false';
process.env.COMMERCE_MAX_LINE_QUANTITY = '20';
process.env.COMMERCE_MAX_CART_UNITS = '50';
process.env.COMMERCE_COD_ENABLED = 'false';

// P9B: fixture value for the Delivery Code HMAC secret (>= 32 chars). A TEST FIXTURE, not a deployment secret.
process.env.DELIVERY_PROOF_SECRET = 'test-fixture-delivery-proof-secret-0123456789';

// Payments (P7B): the tests always run against the in-process MockPaymentProvider with the default (approved) timings.
process.env.PAYMENT_PROVIDER = 'mock';

// Password reset: tests request several links for one account in quick succession; the cooldown has its own test.
process.env.PASSWORD_RESET_COOLDOWN_SECONDS = '0';
process.env.EMAIL_PROVIDER = 'log';

// P7C: tests drive refund submission explicitly (the worker/service), never as a background side effect of a cancellation.
process.env.PAYMENT_REFUND_INLINE_SUBMIT = 'false';
