/**
 * Pre-flight for verify-isolated.sh: proves that a CHILD process (the same kind that runs the seed and vitest) really received the
 * verified isolated-database URL. Prints host/port/database only (never the password). Exits 1 when anything is missing or different.
 */
import { checkTestDatabaseUrl } from '../src/tests/testDatabase.js';

const test = process.env.TEST_DATABASE_URL;
const app = process.env.DATABASE_URL;
const check = checkTestDatabaseUrl(test);

const describe = (raw: string | undefined): string => {
  if (!raw) return '(not set)';
  try {
    const u = new URL(raw);
    return `${u.hostname}:${u.port}${u.pathname}`;
  } catch {
    return '(not a URL)';
  }
};

console.log(`child sees TEST_DATABASE_URL -> ${describe(test)}`);
console.log(`child sees DATABASE_URL      -> ${describe(app)}`);

if (!check.ok) {
  console.error(`PRE-FLIGHT FAILED: ${check.reason}. The child process did not receive the isolated database URL, so no step may run.`);
  process.exit(1);
}
if (!app || app.trim() !== test!.trim()) {
  console.error('PRE-FLIGHT FAILED: DATABASE_URL differs from TEST_DATABASE_URL in the child process.');
  process.exit(1);
}
console.log(`pre-flight OK: database "${check.database}"`);
