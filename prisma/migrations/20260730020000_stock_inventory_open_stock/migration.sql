-- AlterTable
ALTER TABLE "stock_inventory" ADD COLUMN "open_stock" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "stock_inventory_open_stock_idx" ON "stock_inventory"("open_stock");
