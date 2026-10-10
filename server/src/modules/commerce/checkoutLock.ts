import { Prisma } from '@prisma/client';

/**
 * Serializes everything that reads or changes one customer's cart / checkout state (cart mutations and order creation).
 *
 * It is a PostgreSQL row lock (`SELECT ... FOR UPDATE` on the customer's profile row), held until the surrounding
 * transaction ends - NOT an in-process mutex - so it holds across server processes. While a checkout transaction owns
 * the lock, a second checkout for the same customer (same key or different key) and any concurrent cart edit wait, then
 * see the committed result (an existing order for the key, or an empty cart).
 */
export async function lockCustomerCheckout(tx: Prisma.TransactionClient, customerProfileId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "customer_profiles" WHERE "id" = ${customerProfileId} FOR UPDATE`;
}
