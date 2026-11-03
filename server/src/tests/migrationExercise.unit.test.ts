import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * DB-free: migration `20261101120000_health_exercise_unanswered` and schema.prisma agree (health_biometrics.hasExercise is NULLABLE with no default),
 * the migration changes nothing else, rewrites no data, and sorts last.
 */
const SERVER = process.cwd();
const schema = fs.readFileSync(path.join(SERVER, 'prisma', 'schema.prisma'), 'utf8');
const DIR = '20261101120000_health_exercise_unanswered';
const sql = fs.readFileSync(path.join(SERVER, 'prisma', 'migrations', DIR, 'migration.sql'), 'utf8');
const statements = sql.split('\n').filter((l) => !/^\s*--/.test(l) && l.trim() !== '').join('\n');

describe('migration 20261101120000_health_exercise_unanswered', () => {
  it('schema.prisma: hasExercise is an optional Boolean with no default (NULL = not answered)', () => {
    const bio = schema.match(/^model HealthBiometrics \{([\s\S]*?)^\}/m)![1];
    const line = bio.split('\n').find((l) => /^\s*hasExercise\s/.test(l))!;
    expect(line).toMatch(/hasExercise\s+Boolean\?/);
    expect(line).not.toMatch(/@default/);
  });

  it('is exactly two ALTER COLUMN statements on health_biometrics."hasExercise": DROP NOT NULL and DROP DEFAULT', () => {
    expect(statements.split(';').map((s) => s.trim()).filter(Boolean)).toEqual([
      'ALTER TABLE "health_biometrics" ALTER COLUMN "hasExercise" DROP NOT NULL',
      'ALTER TABLE "health_biometrics" ALTER COLUMN "hasExercise" DROP DEFAULT'
    ]);
  });

  it('is data-preserving: no UPDATE / DELETE / TRUNCATE / DROP TABLE / DROP COLUMN / SET NOT NULL in the executable statements', () => {
    expect(statements).not.toMatch(/\b(UPDATE|DELETE|TRUNCATE|INSERT)\b|DROP\s+(TABLE|COLUMN)|SET\s+NOT\s+NULL|SET\s+DEFAULT/i);
  });

  it('sorts after every other migration folder', () => {
    const dirs = fs.readdirSync(path.join(SERVER, 'prisma', 'migrations')).filter((d) => /^\d{14}_/.test(d)).sort();
    expect(dirs[dirs.length - 1]).toBe(DIR);
  });

  it('the rollback note is present and warns that NOT NULL can only be restored once no NULL has been written', () => {
    expect(sql).toMatch(/Rollback/);
    expect(sql).toMatch(/only if no NULL has been written/);
  });
});
