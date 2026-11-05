import { defineConfig } from 'vitest/config';

// ONLY the migration suites. Needs PB_MIGRATION_PG_ADMIN_URL (a disposable local PostgreSQL instance, see server/TESTING.md).
export default defineConfig({
  test: {
    fileParallelism: false,
    globals: true,
    environment: 'node',
    setupFiles: ['./src/tests/setup.ts'],
    testTimeout: 120000,
    hookTimeout: 180000,
    include: ['src/tests/**/*.migration.test.ts', 'src/tests/p6b.isolated.test.ts'],
  },
});
