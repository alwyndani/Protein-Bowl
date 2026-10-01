-- AlterTable
ALTER TABLE "ingredients" ALTER COLUMN "costPerUnit" DROP NOT NULL,
ALTER COLUMN "costPerUnit" SET DEFAULT 0.0000;

-- AlterTable
ALTER TABLE "recipes" ADD COLUMN     "cuisine" TEXT NOT NULL DEFAULT 'Kerala Traditional',
ADD COLUMN     "dietaryTag" TEXT NOT NULL DEFAULT 'non-veg',
ADD COLUMN     "flourGrainPreference" TEXT,
ADD COLUMN     "image" TEXT,
ADD COLUMN     "prepSteps" JSONB,
ADD COLUMN     "rating" DOUBLE PRECISION NOT NULL DEFAULT 4.8,
ADD COLUMN     "servingGrams" INTEGER NOT NULL DEFAULT 200,
ADD COLUMN     "servingSize" TEXT NOT NULL DEFAULT '1 Portion',
ADD COLUMN     "spiceLevel" TEXT,
ALTER COLUMN "costPerPortion" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "recipes_category_idx" ON "recipes"("category");

-- CreateIndex
CREATE INDEX "recipes_dietaryTag_idx" ON "recipes"("dietaryTag");

-- CreateIndex
CREATE INDEX "recipes_cuisine_idx" ON "recipes"("cuisine");

-- CreateIndex
CREATE INDEX "recipes_isPublished_idx" ON "recipes"("isPublished");
