import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const TESTS = __dirname;
const SUITES = fs.readdirSync(TESTS).filter((f) => f.endsWith('.migration.test.ts') || f === 'p6b.isolated.test.ts');
const saved = { url: process.env.PB_MIGRATION_PG_ADMIN_URL, ok: process.env.PB_MIGRATION_PG_CONFIRM_DISPOSABLE };

afterEach(() => {
  if (saved.url === undefined) delete process.env.PB_MIGRATION_PG_ADMIN_URL; else process.env.PB_MIGRATION_PG_ADMIN_URL = saved.url;
  if (saved.ok === undefined) delete process.env.PB_MIGRATION_PG_CONFIRM_DISPOSABLE; else process.env.PB_MIGRATION_PG_CONFIRM_DISPOSABLE = saved.ok;
  vi.resetModules();
});

const load = async (url?: string, confirm?: string) => {
  vi.resetModules();
  if (url === undefined) delete process.env.PB_MIGRATION_PG_ADMIN_URL; else process.env.PB_MIGRATION_PG_ADMIN_URL = url;
  if (confirm === undefined) delete process.env.PB_MIGRATION_PG_CONFIRM_DISPOSABLE; else process.env.PB_MIGRATION_PG_CONFIRM_DISPOSABLE = confirm;
  return import('./migrationDb.js');
};

describe('migration suites never choose a server by themselves', () => {
  it('all nine suites exist (incl. preparedMigrations: fresh replay + schema diff), use the shared selector and hard-code no server', () => {
    expect(SUITES).toHaveLength(9);
    expect(SUITES).toContain('preparedMigrations.migration.test.ts');
    for (const f of SUITES) {
      const src = fs.readFileSync(path.join(TESTS, f), 'utf8');
      expect(src, f).toContain("from './migrationDb.js'");
      expect(src, f).not.toMatch(/localhost:5432|postgres:postgres@/);
    }
  });

  it('they are excluded from the default run and have their own config', () => {
    const base = fs.readFileSync(path.join(TESTS, '..', '..', 'vitest.config.ts'), 'utf8');
    expect(base).toContain("'**/*.migration.test.ts'");
    expect(base).toContain("'**/p6b.isolated.test.ts'");
    expect(fs.existsSync(path.join(TESTS, '..', '..', 'vitest.migrations.config.ts'))).toBe(true);
  });

  it('refuses without an explicit URL', async () => {
    await expect(load(undefined)).rejects.toThrow(/PB_MIGRATION_PG_ADMIN_URL is not set/);
  });

  it('refuses remote hosts, a non-postgres maintenance database and a non-postgres scheme', async () => {
    await expect(load('postgresql://postgres:x@db.example.com:5433/postgres')).rejects.toThrow(/localhost/);
    await expect(load('postgresql://postgres:x@localhost:5433/protein_bowl_db')).rejects.toThrow(/maintenance database/);
    await expect(load('mysql://postgres:x@localhost:5433/postgres')).rejects.toThrow(/postgresql/);
  });

  it('refuses the default port 5432 (where the development database lives) unless the instance is declared disposable', async () => {
    await expect(load('postgresql://postgres:x@localhost:5432/postgres')).rejects.toThrow(/5432/);
    await expect(load('postgresql://postgres:x@localhost/postgres')).rejects.toThrow(/5432/);
    const ok = await load('postgresql://postgres:x@localhost:5432/postgres', 'yes');
    expect(ok.ADMIN_URL).toContain('localhost:5432/postgres');
  });

  it('accepts a separate instance and builds URLs only on that instance', async () => {
    const m = await load('postgresql://postgres:x@localhost:5433/postgres');
    expect(m.ADMIN_URL).toBe('postgresql://postgres:x@localhost:5433/postgres?schema=public');
    expect(m.urlOf('pb_tmp_1')).toBe('postgresql://postgres:x@localhost:5433/pb_tmp_1?schema=public');
  });
});
