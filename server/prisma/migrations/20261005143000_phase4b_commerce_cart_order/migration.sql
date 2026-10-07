-- AlterTable
ALTER TABLE "customer_addresses" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "containerDeposit" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "sku" TEXT,
ADD COLUMN     "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "taxRate" DECIMAL(5,4) NOT NULL DEFAULT 0.0500,
ADD COLUMN     "variantName" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "containerDepositTotal" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "deliveryAddressSnapshot" JSONB,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "packagingFee" DECIMAL(10,2) NOT NULL DEFAULT 0.00;

-- AlterTable
ALTER TABLE "product_categories" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "containerDeposit" DECIMAL(10,2),
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "containerDeposit" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "recipeId" TEXT,
ADD COLUMN     "taxRate" DECIMAL(5,4) NOT NULL DEFAULT 0.0500;

-- CreateTable
CREATE TABLE "carts" (
    "id" TEXT NOT NULL,
    "customerProfileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "carts_customerProfileId_key" ON "carts"("customerProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotencyKey_key" ON "orders"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "customer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
