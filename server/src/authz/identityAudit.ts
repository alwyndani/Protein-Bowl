import { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { CUSTOMER_ROLES, STAFF_ROLES } from './roleScopes.js';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Staff and customer identities must stay separate (decision D5).
 * Returns the ids of users that hold BOTH a customer role (CUSTOMER / MESS_CUSTOMER) and a staff role.
 * Read-only: it reports conflicts and never rewrites roles.
 */
export async function findMixedIdentityUserIds(db: Db = prisma): Promise<string[]> {
  const users = await db.user.findMany({
    where: {
      AND: [
        { roles: { some: { role: { in: [...CUSTOMER_ROLES] } } } },
        { roles: { some: { role: { in: [...STAFF_ROLES] } } } }
      ]
    },
    select: { id: true }
  });
  return users.map((u) => u.id);
}
