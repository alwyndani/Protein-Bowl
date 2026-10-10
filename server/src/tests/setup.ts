import { beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/protein_bowl_test_db?schema=public';
process.env.JWT_ACCESS_SECRET = 'test_access_secret_key_1234567890_super_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_key_1234567890_super_secret';
process.env.JWT_ACCESS_EXPIRATION = '15m';
process.env.JWT_REFRESH_EXPIRATION = '7d';
process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000,https://app.proteinbowl.test';

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

// Deterministic commerce policy for the whole test run, independent of any developer .env.
// These are TEST FIXTURE values (they keep the pre-P7A expectations such as a 40.00 delivery fee under a 499.00 threshold
// stable); they are not Protein Bowl business policy.
process.env.COMMERCE_TAX_MODE = 'EXCLUSIVE';
process.env.COMMERCE_DELIVERY_FEE = '40.00';
process.env.COMMERCE_FREE_DELIVERY_ENABLED = 'true';
process.env.COMMERCE_FREE_DELIVERY_THRESHOLD = '499.00';
process.env.COMMERCE_PACKAGING_FEE = '0.00';
process.env.COMMERCE_MIN_ORDER_VALUE = '0';
process.env.COMMERCE_DELIVERY_TAXABLE = 'false';
process.env.COMMERCE_PACKAGING_TAXABLE = 'false';
process.env.COMMERCE_MAX_LINE_QUANTITY = '20';
process.env.COMMERCE_MAX_CART_UNITS = '50';
process.env.COMMERCE_COD_ENABLED = 'false';
