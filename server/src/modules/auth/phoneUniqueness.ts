import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * True when ANOTHER account already holds this number. The comparison ignores separators on the STORED value too, so a number saved by an
 * older registration as "+91 98765 43210" still collides with "+919876543210". The database unique constraint remains the final arbiter.
 * `normalized` must come from normalizePhone().
 */
export async function isPhoneTaken(normalized: string, exceptUserId: string | null, db: Db = prisma): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM users
    WHERE phone IS NOT NULL
      AND regexp_replace(phone, '[[:space:]().-]', '', 'g') = ${normalized}
      AND (${exceptUserId}::text IS NULL OR id <> ${exceptUserId})
    LIMIT 1`);
  return rows.length > 0;
}
