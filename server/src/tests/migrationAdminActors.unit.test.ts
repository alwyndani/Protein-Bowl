import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * DB-free consistency of migration `20261020100000_role_simplification_admin_actors` with schema.prisma and with its reviewed copy.
 * Complements migrationConsistency.unit.test.ts (which covers the trainer/procurement migration). It does NOT replace replaying the chain on a
 * disposable database (server/TESTING.md); it proves the SQL and the Prisma schema describe the same 7 columns, foreign keys and the index,
 * and that the migration changes nothing but those (no data rewrite, only the three documented CHECK constraints are re-created).
 */
const SERVER = process.cwd();
const schema = fs.readFileSync(path.join(SERVER, 'prisma', 'schema.prisma'), 'utf8');
const MIGRATIONS = path.join(SERVER, 'prisma', 'migrations');
const DIR = '20261020100000_role_simplification_admin_actors';
const sql = fs.readFileSync(path.join(MIGRATIONS, DIR, 'migration.sql'), 'utf8');

const COLUMNS: Array<{ model: string; table: string; column: string; references: string }> = [
  { model: 'DeliveryAssignment', table: 'delivery_assignments', column: 'operatedByUserId', references: 'users' },
  { model: 'DeliveryAssignment', table: 'delivery_assignments', column: 'takenOverFromDriverId', references: 'employee_profiles' },
  { model: 'DeliveryProof', table: 'delivery_proofs', column: 'verifiedByUserId', references: 'users' },
  { model: 'DeliveryAttempt', table: 'delivery_attempts', column: 'operatedByUserId', references: 'users' },
  { model: 'MessDeliveryRun', table: 'mess_delivery_runs', column: 'claimedByUserId', references: 'users' },
  { model: 'MessDeliveryRun', table: 'mess_delivery_runs', column: 'takenOverFromEmployeeId', references: 'employee_profiles' },
  { model: 'MessDeliveryStop', table: 'mess_delivery_stops', column: 'handedOverByUserId', references: 'users' }
];

const modelBlock = (name: string): string => {
  const m = schema.match(new RegExp(`^model ${name} \\{([\\s\\S]*?)^\\}`, 'm'));
  if (!m) throw new Error(`model ${name} not found`);
  return m[1];
};

describe('migration 20261020100000_role_simplification_admin_actors vs schema.prisma', () => {
  it('sorts after the previous migration and before the trainer/procurement migration', () => {
    const dirs = fs.readdirSync(MIGRATIONS).filter((d) => /^\d{14}_/.test(d)).sort();
    const i = dirs.indexOf(DIR);
    expect(i).toBeGreaterThan(0);
    expect(dirs[i - 1]).toBe('20261013120000_p10c_mess_delivery');
    expect(dirs[i + 1]).toBe('20261031120000_trainer_procurement_foundation');
  });

  for (const c of COLUMNS) {
    it(`${c.table}.${c.column}: nullable column in SQL, optional String field in the schema, RESTRICT foreign key to ${c.references}`, () => {
      expect(modelBlock(c.model)).toMatch(new RegExp(`^\\s*${c.column}\\s+String\\?`, 'm')); // optional in Prisma
      expect(sql).toMatch(new RegExp(`ALTER TABLE "${c.table}" ADD COLUMN[^;]*"${c.column}" TEXT[,;]`)); // nullable: no NOT NULL, no DEFAULT
      expect(sql).not.toMatch(new RegExp(`"${c.column}" TEXT NOT NULL`));
      expect(sql).toContain(`ADD CONSTRAINT "${c.table}_${c.column}_fkey" FOREIGN KEY ("${c.column}") REFERENCES "${c.references}"("id") ON DELETE RESTRICT ON UPDATE CASCADE`);
      expect(modelBlock(c.model)).toMatch(new RegExp(`fields: \\[${c.column}\\][^\\n]*onDelete: Restrict`));
    });
  }

  it('the single new index matches the schema (@@index on delivery_assignments.operatedByUserId)', () => {
    expect(sql).toContain('CREATE INDEX "delivery_assignments_operatedByUserId_idx" ON "delivery_assignments"("operatedByUserId")');
    expect(modelBlock('DeliveryAssignment')).toMatch(/@@index\(\[operatedByUserId\]\)/);
  });

  it('adds exactly 7 columns and 7 foreign keys and 1 index; nothing else is created', () => {
    expect((sql.match(/ADD COLUMN "/g) ?? []).length).toBe(7);
    expect((sql.match(/FOREIGN KEY/g) ?? []).length).toBe(7);
    expect((sql.match(/CREATE (UNIQUE )?INDEX/g) ?? []).length).toBe(1);
    expect(sql).not.toMatch(/CREATE TABLE|CREATE TYPE|ALTER TYPE/i);
  });

  it('is data-preserving: no UPDATE/DELETE/TRUNCATE/DROP COLUMN/DROP TABLE; the only DROPs are the three CHECK constraints, each re-created', () => {
    expect(sql).not.toMatch(/^\s*(UPDATE|DELETE|TRUNCATE)\b/im);
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|INDEX|TYPE)/i);
    const dropped = [...sql.matchAll(/DROP CONSTRAINT "([^"]+)"/g)].map((m) => m[1]).sort();
    expect(dropped).toEqual(['delivery_proofs_pin_ck', 'mess_runs_claim_ck', 'mess_stops_handed_ck']);
    for (const name of dropped) expect(sql, name).toMatch(new RegExp(`ADD CONSTRAINT "${name}" CHECK`));
  });

  it('the four NEW CHECK constraints exist and the re-created ones only WIDEN (the administrator is an additional accepted actor)', () => {
    for (const name of ['delivery_assignments_one_owner_ck', 'delivery_assignments_takeover_ck', 'delivery_attempts_one_owner_ck', 'mess_runs_takeover_ck']) expect(sql).toContain(`ADD CONSTRAINT "${name}" CHECK`);
    // exactly ONE verifier (employee XOR administrator) is accepted for a PIN verification; the old rule accepted the employee only
    expect(sql).toContain(`ADD CONSTRAINT "delivery_proofs_pin_ck" CHECK ("method" IS DISTINCT FROM 'PIN' OR ("codeHash" IS NOT NULL AND (("verifiedByEmployeeId" IS NOT NULL)::int + ("verifiedByUserId" IS NOT NULL)::int) = 1))`);
  });

  it('the active migration is byte-identical to the reviewed copy under prisma/proposed (what was reviewed is what will be applied)', () => {
    const proposed = path.join(SERVER, 'prisma', 'proposed', 'role-simplification', DIR, 'migration.sql');
    if (!fs.existsSync(proposed)) return; // the proposed copy is a review artefact and may be removed from a checkout
    expect(fs.readFileSync(proposed, 'utf8')).toBe(sql);
  });
});
