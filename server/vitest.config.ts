import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Several suites share ONE PostgreSQL test database and some of them run the (global) reconciliation worker, so files run one at a time.
    fileParallelism: false,
    globals: true,
    environment: 'node',
    setupFiles: ['./src/tests/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
