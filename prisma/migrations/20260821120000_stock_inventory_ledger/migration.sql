-- CreateEnum
CREATE TYPE "StockLedgerType" AS ENUM ('INITIAL', 'ADDITION', 'ORDER_DEDUCT');

-- CreateTable
CREATE TABLE "stock_inventory_ledger" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "productName" TEXT NOT NULL,
    "type" "StockLedgerType" NOT NULL,
    "delta" INTEGER NOT NULL,
    "actorLabel" TEXT NOT NULL,
    "orderId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_inventory_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_inventory_ledger_productId_type_idx" ON "stock_inventory_ledger"("productId", "type");

-- CreateIndex
CREATE INDEX "stock_inventory_ledger_createdAt_idx" ON "stock_inventory_ledger"("createdAt");

-- AddForeignKey
ALTER TABLE "stock_inventory_ledger" ADD CONSTRAINT "stock_inventory_ledger_productId_fkey" FOREIGN KEY ("productId") REFERENCES "stock_inventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed: treat current tracked stock as INITIAL snapshot (no historical order backfill)
INSERT INTO "stock_inventory_ledger" ("productId", "productName", "type", "delta", "actorLabel", "createdAt")
SELECT
  s."id",
  s."productName",
  'INITIAL'::"StockLedgerType",
  s."stock",
  '공장 관리자',
  NOW()
FROM "stock_inventory" s
WHERE s."stock" IS NOT NULL;
