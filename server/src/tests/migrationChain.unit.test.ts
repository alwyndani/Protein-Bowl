import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * DB-free review of the whole chain with the three prepared migrations at its tail: order, dependencies and agreement with schema.prisma.
 * Replays the chain symbolically (which tables exist after each folder) so a migration that references a table that does not exist yet, or a
 * table the schema does not know, is caught without any database.
 */
const SERVER = process.cwd();
const MIGRATIONS = path.join(SERVER, 'prisma', 'migrations');
const folders = fs.readdirSync(MIGRATIONS).filter((d) => /^\d{14}_/.test(d)).sort();
const PREPARED = ['20261020100000_role_simplification_admin_actors', '20261031120000_trainer_procurement_foundation', '20261101120000_health_exercise_unanswered'];
const read = (d: string) => fs.readFileSync(path.join(MIGRATIONS, d, 'migration.sql'), 'utf8').replace(/--.*$/gm, '');
const schema = fs.readFileSync(path.join(SERVER, 'prisma', 'schema.prisma'), 'utf8');

/** tables existing after each folder, replayed from CREATE TABLE / DROP TABLE / RENAME */
const tablesAfter: Array<Set<string>> = [];
{
  const cur = new Set<string>();
  for (const f of folders) {
    const sql = read(f);
    for (const m of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"([^"]+)"/gi)) cur.add(m[1]);
    for (const m of sql.matchAll(/DROP TABLE (?:IF EXISTS )?"([^"]+)"/gi)) cur.delete(m[1]);
    for (const m of sql.matchAll(/ALTER TABLE "([^"]+)" RENAME TO "([^"]+)"/gi)) {
      cur.delete(m[1]);
      cur.add(m[2]);
    }
    tablesAfter.push(new Set(cur));
  }
}

describe('the prepared migrations at the tail of the chain', () => {
  it('are the last three folders, in this order, after the last applied migration (p10c)', () => {
    expect(folders.slice(-4)).toEqual(['20261013120000_p10c_mess_delivery', ...PREPARED]);
    expect(new Set(folders).size).toBe(folders.length);
  });

  it('every table they ALTER or REFERENCE exists by then (created in the same or an earlier folder), so the order is dependency-safe', () => {
    for (const f of PREPARED) {
      const existing = tablesAfter[folders.indexOf(f)];
      const sql = read(f);
      for (const m of sql.matchAll(/ALTER TABLE "([^"]+)"/g)) expect(existing.has(m[1]), `${f}: ALTER TABLE "${m[1]}"`).toBe(true);
      for (const m of sql.matchAll(/REFERENCES "([^"]+)"/g)) expect(existing.has(m[1]), `${f}: REFERENCES "${m[1]}"`).toBe(true);
      for (const m of sql.matchAll(/CREATE (?:UNIQUE )?INDEX "[^"]+" ON "([^"]+)"/g)) expect(existing.has(m[1]), `${f}: INDEX ON "${m[1]}"`).toBe(true);
    }
  });

  it('an earlier prepared migration never depends on a table a LATER one creates', () => {
    const created = (f: string) => [...read(f).matchAll(/CREATE TABLE "([^"]+)"/g)].map((m) => m[1]);
    for (let a = 0; a < PREPARED.length; a++) {
      const sql = read(PREPARED[a]);
      for (let b = a + 1; b < PREPARED.length; b++) for (const t of created(PREPARED[b])) expect(sql, `${PREPARED[a]} must not use ${t}`).not.toContain(`"${t}"`);
    }
  });

  it('the replayed chain creates exactly the tables schema.prisma maps (no table missing, none unknown to the schema)', () => {
    const fromSchema = new Set([...schema.matchAll(/@@map\("([^"]+)"\)/g)].map((m) => m[1]));
    const replayed = tablesAfter[tablesAfter.length - 1];
    expect([...fromSchema].filter((t) => !replayed.has(t)), 'tables in schema.prisma that no migration creates').toEqual([]);
    expect([...replayed].filter((t) => !fromSchema.has(t)), 'tables created by migrations that schema.prisma does not know').toEqual([]);
  });

  it('every earlier folder is untouched history that sorts before the prepared ones', () => {
    const earlier = folders.slice(0, -3);
    expect(earlier.length).toBeGreaterThanOrEqual(18);
    for (const f of earlier) expect(f < PREPARED[0], f).toBe(true);
  });

  it('none of the prepared migrations drops a table or column, deletes or rewrites data (the only DROPs are the three re-created CHECKs and the hasExercise NOT NULL / DEFAULT)', () => {
    for (const f of PREPARED) {
      const sql = read(f);
      expect(sql, f).not.toMatch(/DROP\s+(TABLE|COLUMN|INDEX|TYPE)|^\s*(UPDATE|DELETE|TRUNCATE)\b/im);
    }
  });

  it('the third migration only relaxes hasExercise: no existing Yes/No is rewritten, so a stored false stays false (NOT converted to unanswered)', () => {
    const sql = read(PREPARED[2]).replace(/\s+/g, ' ').trim();
    expect(sql).toBe('ALTER TABLE "health_biometrics" ALTER COLUMN "hasExercise" DROP NOT NULL; ALTER TABLE "health_biometrics" ALTER COLUMN "hasExercise" DROP DEFAULT;');
    expect(sql).not.toMatch(/\bSET\b|USING|UPDATE|=\s*NULL/i);
  });
});
