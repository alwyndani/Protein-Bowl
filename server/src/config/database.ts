import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

export const prisma = globalThis.prismaGlobal ?? new PrismaClient({
  log: env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn']
});

if (env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;
}
