-- AlterTable
ALTER TABLE "Church" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "stock_inventory" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "imageUrl" TEXT,
    "productName" TEXT NOT NULL,
    "spec" TEXT,
    "unit" INTEGER NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "priceOver500man" DOUBLE PRECISION NOT NULL,
    "priceOver100man" DOUBLE PRECISION NOT NULL,
    "wholesalePrice" DOUBLE PRECISION NOT NULL,
    "associatePrice" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_inventory_code_key" ON "stock_inventory"("code");

-- CreateIndex
CREATE INDEX "stock_inventory_category_idx" ON "stock_inventory"("category");

-- CreateIndex
CREATE INDEX "stock_inventory_productName_idx" ON "stock_inventory"("productName");
