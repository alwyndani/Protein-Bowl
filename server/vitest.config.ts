import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    // Several suites share ONE PostgreSQL test database and some of them run the (global) reconciliation worker, so files run one at a time.
    fileParallelism: false,
    globals: true,
    environment: 'node',
    setupFiles: ['./src/tests/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // The migration suites create and drop their own databases as a PostgreSQL superuser: they run only through
    // `npm run test:migrations` (vitest.migrations.config.ts) against a disposable instance named by PB_MIGRATION_PG_ADMIN_URL.
    exclude: [...configDefaults.exclude, '**/*.migration.test.ts', '**/p6b.isolated.test.ts'],
  },
});
