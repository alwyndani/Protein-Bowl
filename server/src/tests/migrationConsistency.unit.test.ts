import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static consistency of the hand-written migration `20261031120000_trainer_procurement_foundation` with schema.prisma:
 * every new model has its table, every scalar column, every index / unique constraint and every foreign key (with its explicit ON DELETE rule),
 * and the folder sorts after the rest of the chain. This does NOT replace `prisma migrate diff` / replaying the chain on a disposable database
 * (see server/TESTING.md); it catches omissions in the SQL without touching a database.
 */
const SERVER = process.cwd();
const schema = fs.readFileSync(path.join(SERVER, 'prisma', 'schema.prisma'), 'utf8');
const MIGRATIONS = path.join(SERVER, 'prisma', 'migrations');
const NEW_DIR = '20261031120000_trainer_procurement_foundation';
const sql = fs.readFileSync(path.join(MIGRATIONS, NEW_DIR, 'migration.sql'), 'utf8');

const NEW_MODELS = ['TrainerAssignment', 'WorkoutLog', 'Supplier', 'PurchaseOrder', 'PurchaseOrderLine', 'GoodsReceipt', 'GoodsReceiptLine', 'PasswordResetToken', 'CancellationRequest'];
const SCALARS = new Set(['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Decimal', 'Json', 'BigInt']);
const MODEL_NAMES = new Set([...schema.matchAll(/^model (\w+) \{/gm)].map((m) => m[1]));

function modelBlock(name: string): string {
  const m = schema.match(new RegExp(`^model ${name} \\{([\\s\\S]*?)^\\}`, 'm'));
  if (!m) throw new Error(`model ${name} not found`);
  return m[1];
}

interface Parsed {
  table: string;
  columns: string[];
  uniqueFields: string[];
  indexes: string[][];
  uniques: string[][];
  relations: Array<{ field: string; onDelete?: string }>;
}

function parse(name: string): Parsed {
  const body = modelBlock(name);
  const table = body.match(/@@map\("([^"]+)"\)/)![1];
  const columns: string[] = [];
  const uniqueFields: string[] = [];
  const relations: Parsed['relations'] = [];
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('@@') || line.startsWith('///')) continue;
    const m = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/);
    if (!m) continue;
    const [, field, type, list, , rest] = m;
    if (SCALARS.has(type) && !list) {
      columns.push(field);
      if (/@unique\b/.test(rest)) uniqueFields.push(field);
    } else if (MODEL_NAMES.has(type)) {
      const rel = rest.match(/@relation\([^)]*fields:\s*\[(\w+)\][^)]*\)/);
      if (rel) relations.push({ field: rel[1], onDelete: rest.match(/onDelete:\s*(\w+)/)?.[1] });
    }
  }
  const lists = (re: RegExp) => [...body.matchAll(re)].map((x) => x[1].split(',').map((s) => s.trim()));
  return { table, columns, uniqueFields, indexes: lists(/@@index\(\[([^\]]+)\]/g), uniques: lists(/@@unique\(\[([^\]]+)\]/g), relations };
}

const SQL_ON_DELETE: Record<string, string> = { Cascade: 'CASCADE', Restrict: 'RESTRICT', SetNull: 'SET NULL' };

describe('migration 20261031120000 matches schema.prisma', () => {
  it('sanity: the schema parser really extracts columns, indexes and relations (the checks below are not vacuous)', () => {
    const po = parse('PurchaseOrder');
    expect(po.table).toBe('purchase_orders');
    expect(po.columns).toEqual(expect.arrayContaining(['poNumber', 'branchId', 'supplierId', 'status', 'createdAt', 'updatedAt']));
    expect(po.relations.map((r) => r.field).sort()).toEqual(['branchId', 'createdByUserId', 'supplierId']);
    expect(po.indexes).toContainEqual(['branchId', 'status']);
    expect(po.uniqueFields).toEqual(['poNumber']);
    expect(parse('TrainerAssignment').uniques).toContainEqual(['trainerUserId', 'customerProfileId']);
    expect(parse('CancellationRequest').relations).toHaveLength(3);
  });

  it('sorts after every other migration folder', () => {
    const dirs = fs.readdirSync(MIGRATIONS).filter((d) => /^\d{14}_/.test(d)).sort();
    // the only folder allowed after it is the later prepared migration (health_exercise_unanswered)
    expect(dirs.slice(dirs.indexOf(NEW_DIR) + 1)).toEqual(['20261101120000_health_exercise_unanswered']);
  });

  for (const model of NEW_MODELS) {
    const p = parse(model);
    describe(`${model} -> ${p.table}`, () => {
      const create = sql.match(new RegExp(`CREATE TABLE "${p.table}" \\(([\\s\\S]*?)\\n\\);`));

      it('has its CREATE TABLE and every scalar column', () => {
        expect(create, `CREATE TABLE "${p.table}"`).not.toBeNull();
        for (const c of p.columns) expect(create![1], `${p.table}.${c}`).toContain(`"${c}"`);
        expect(create![1]).toContain(`CONSTRAINT "${p.table}_pkey" PRIMARY KEY ("id")`);
      });

      it('has every index and unique constraint with Prisma\'s names', () => {
        for (const cols of p.indexes) expect(sql, `index ${cols}`).toContain(`"${p.table}_${cols.join('_')}_idx"`);
        for (const cols of p.uniques) expect(sql, `unique ${cols}`).toContain(`"${p.table}_${cols.join('_')}_key"`);
        for (const f of p.uniqueFields) expect(sql, `unique ${f}`).toContain(`"${p.table}_${f}_key"`);
      });

      it('has every foreign key, with the explicit ON DELETE rule', () => {
        for (const r of p.relations) {
          const fk = sql.match(new RegExp(`ADD CONSTRAINT "${p.table}_${r.field}_fkey" FOREIGN KEY \\("${r.field}"\\) REFERENCES "\\w+"\\("id"\\) ON DELETE ([A-Z ]+?) ON UPDATE CASCADE;`));
          expect(fk, `${p.table}.${r.field} foreign key`).not.toBeNull();
          if (r.onDelete) expect(fk![1], `${p.table}.${r.field} ON DELETE`).toBe(SQL_ON_DELETE[r.onDelete]);
        }
      });
    });
  }

  it('the two unmodelled additions exist: workout_plans indexes and the cancellation partial unique index', () => {
    expect(sql).toContain('"workout_plans_customerProfileId_idx"');
    expect(sql).toContain('"workout_plans_trainerId_idx"');
    expect(sql).toContain('"cancellation_requests_one_pending_per_order"');
    expect(sql).toMatch(/WHERE "status" = 'PENDING'/);
  });

  it('is purely additive: no DROP, no destructive ALTER, no data rewrite', () => {
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|INDEX|CONSTRAINT)|\bDELETE\s+FROM|\bTRUNCATE|\bUPDATE\s+"/i);
    expect(sql).not.toMatch(/ALTER TABLE "(?!workout_plans|trainer_assignments|workout_logs|purchase_orders|purchase_order_lines|goods_receipts|goods_receipt_lines|password_reset_tokens|cancellation_requests)/);
  });

  it('CHECK constraints guard the status vocabularies', () => {
    for (const c of ['trainer_assignments_status_ck', 'purchase_orders_status_ck', 'cancellation_requests_status_ck', 'cancellation_requests_decision_ck', 'purchase_order_lines_qty_ck']) expect(sql).toContain(c);
  });
});
