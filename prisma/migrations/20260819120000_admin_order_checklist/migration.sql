-- CreateEnum
CREATE TYPE "PackagingWorker" AS ENUM ('STORE', 'FACTORY');

-- CreateEnum
CREATE TYPE "AdminActivityAction" AS ENUM ('ORDER_CONFIRM', 'WORKER_SAVE', 'PAYMENT_SAVE', 'GREETING_SAVE', 'SLIP_SAVE');

-- AlterTable User
ALTER TABLE "User" ADD COLUMN "canApproveGreeting" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable Order
ALTER TABLE "Order" ADD COLUMN "storeRegion" "AdminRegion";
ALTER TABLE "Order" ADD COLUMN "packaging_worker" "PackagingWorker";
ALTER TABLE "Order" ADD COLUMN "orderConfirmedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "orderConfirmedBy" TEXT;
ALTER TABLE "Order" ADD COLUMN "paymentDone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "paymentAuthor" TEXT;
ALTER TABLE "Order" ADD COLUMN "greetingDone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "slipDone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "slipAuthor" TEXT;
ALTER TABLE "Order" ADD COLUMN "readyForShipment" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable AdminActivity
CREATE TABLE "AdminActivity" (
    "id" SERIAL NOT NULL,
    "actorUserId" INTEGER,
    "actorName" TEXT NOT NULL,
    "actorRegion" "AdminRegion",
    "action" "AdminActivityAction" NOT NULL,
    "orderId" INTEGER,
    "orderNumber" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminActivity_createdAt_idx" ON "AdminActivity"("createdAt");
CREATE INDEX "AdminActivity_actorUserId_idx" ON "AdminActivity"("actorUserId");
CREATE INDEX "Order_storeRegion_idx" ON "Order"("storeRegion");
CREATE INDEX "Order_readyForShipment_idx" ON "Order"("readyForShipment");

ALTER TABLE "AdminActivity"
  ADD CONSTRAINT "AdminActivity_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill storeRegion from notes (주문작업지역 / 지부매장)
UPDATE "Order"
SET "storeRegion" = 'NAMBU'
WHERE "storeRegion" IS NULL
  AND (
    notes ~ '주문작업지역:.*남부'
    OR notes ~ '지부매장:.*남부'
  );

UPDATE "Order"
SET "storeRegion" = 'JUNGBU'
WHERE "storeRegion" IS NULL
  AND (
    notes ~ '주문작업지역:.*중부'
    OR notes ~ '지부매장:.*중부'
  );

UPDATE "Order"
SET "storeRegion" = 'SEOBU'
WHERE "storeRegion" IS NULL
  AND (
    notes ~ '주문작업지역:.*서부'
    OR notes ~ '지부매장:.*서부'
  );

-- Factory-G: username 0102964708 can approve greeting completion
UPDATE "User"
SET role = 'FACTORY',
    "canApproveGreeting" = true,
    "adminRegion" = NULL,
    "updatedAt" = NOW()
WHERE username = '0102964708';
