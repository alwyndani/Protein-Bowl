import { beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/protein_bowl_test_db?schema=public';
process.env.JWT_ACCESS_SECRET = 'test_access_secret_key_1234567890_super_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_key_1234567890_super_secret';
process.env.JWT_ACCESS_EXPIRATION = '15m';
process.env.JWT_REFRESH_EXPIRATION = '7d';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

beforeAll(async () => {
  // Ensure DB connection is established
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});
