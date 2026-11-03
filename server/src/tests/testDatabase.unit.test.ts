import { describe, expect, it } from 'vitest';
import { checkTestDatabaseUrl, connectedDatabaseMatches, NO_DATABASE_URL } from './testDatabase.js';

const U = (host: string, db: string, proto = 'postgresql') => `${proto}://u:p@${host}:5432/${db}?schema=public`;

describe('test database isolation rules', () => {
  it('accepts a local database whose name marks it as a test/scratch/isolated database', () => {
    for (const db of ['pb_ci_test', 'protein_bowl_scratch_1', 'pb_isolated_20261031']) {
      expect(checkTestDatabaseUrl(U('localhost', db))).toEqual({ ok: true, database: db });
    }
    expect(checkTestDatabaseUrl(U('127.0.0.1', 'pb_ci_test')).ok).toBe(true);
  });

  it('refuses the development, the shared test and system databases', () => {
    for (const db of ['protein_bowl_db', 'protein_bowl_test_db', 'postgres', 'template1']) {
      expect(checkTestDatabaseUrl(U('localhost', db)).ok).toBe(false);
    }
  });

  it('refuses missing, malformed, remote or unmarked targets', () => {
    expect(checkTestDatabaseUrl(undefined).ok).toBe(false);
    expect(checkTestDatabaseUrl('   ').ok).toBe(false);
    expect(checkTestDatabaseUrl('not a url').ok).toBe(false);
    expect(checkTestDatabaseUrl(U('db.example.com', 'pb_ci_test')).ok).toBe(false);
    expect(checkTestDatabaseUrl(U('localhost', 'pb_ci_test', 'mysql')).ok).toBe(false);
    expect(checkTestDatabaseUrl(U('localhost', 'orders')).ok).toBe(false);
    expect(checkTestDatabaseUrl('postgresql://u:p@localhost:5432/').ok).toBe(false);
  });

  it('never echoes credentials in a refusal', () => {
    const r = checkTestDatabaseUrl('postgresql://leak:SECRET@evil.example:5432/pb_ci_test');
    expect(JSON.stringify(r)).not.toContain('SECRET');
  });

  it('the connected database must be exactly the validated one', () => {
    expect(connectedDatabaseMatches('pb_ci_test', 'pb_ci_test')).toBe(true);
    expect(connectedDatabaseMatches('pb_ci_test', 'protein_bowl_db')).toBe(false);
    expect(connectedDatabaseMatches('pb_ci_test', undefined)).toBe(false);
  });

  it('the sentinel is local, on a dead port, and not a valid target', () => {
    expect(NO_DATABASE_URL).toContain('127.0.0.1:1/');
    expect(checkTestDatabaseUrl(NO_DATABASE_URL).ok).toBe(false);
  });
});
