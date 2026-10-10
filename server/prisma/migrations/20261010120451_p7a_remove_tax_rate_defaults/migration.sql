-- P7A correction: remove the silent 5 % tax defaults.
-- Product.taxRate and OrderItem.taxRate stay NOT NULL, but a row can no longer receive a tax rate the caller did not
-- explicitly supply. This only drops the column DEFAULTs: every stored value is preserved, nothing is rewritten, and no
-- other rate is introduced. (Kept as a separate migration because the previous P7A migration is already applied to the
-- development/test databases and applied migrations are never edited.)

-- AlterTable
ALTER TABLE "order_items" ALTER COLUMN "taxRate" DROP DEFAULT;

-- AlterTable
ALTER TABLE "products" ALTER COLUMN "taxRate" DROP DEFAULT;
