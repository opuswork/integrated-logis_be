-- CreateEnum
CREATE TYPE "PackDept" AS ENUM ('FACTORY_PACK', 'SOCK_PACK');

-- AlterEnum AdminActivityAction
ALTER TYPE "AdminActivityAction" ADD VALUE 'SHIP_DATE_SAVE';
ALTER TYPE "AdminActivityAction" ADD VALUE 'PACK_DEPT_SAVE';
ALTER TYPE "AdminActivityAction" ADD VALUE 'PACK_COMPLETE';
ALTER TYPE "AdminActivityAction" ADD VALUE 'RELEASE_COMPLETE';
ALTER TYPE "AdminActivityAction" ADD VALUE 'FINAL_COMPLETE';
ALTER TYPE "AdminActivityAction" ADD VALUE 'FINAL_CONFIRM';

-- AlterTable Order
ALTER TABLE "Order" ADD COLUMN "requestedShipDate" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "packDept" "PackDept";
ALTER TABLE "Order" ADD COLUMN "packDate" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "packPt" TEXT;
ALTER TABLE "Order" ADD COLUMN "storagePlace" TEXT;
ALTER TABLE "Order" ADD COLUMN "packDone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "releaseDone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "releaseDoneAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "finalCompleteDone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "finalConfirmDone" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Order_requestedShipDate_idx" ON "Order"("requestedShipDate");
CREATE INDEX "Order_packDept_idx" ON "Order"("packDept");
