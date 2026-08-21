-- AlterTable
ALTER TABLE "stock_inventory" ADD COLUMN "box_name" TEXT;
ALTER TABLE "stock_inventory" ADD COLUMN "post_weight" INTEGER;

-- Seed box mapping (productName contains). Longer/more specific keys first.
UPDATE "stock_inventory" SET "box_name" = '신앙촌 1호', "post_weight" = 2
WHERE "productName" LIKE '%정성4호%'
   OR "productName" LIKE '%특선1호%'
   OR "productName" LIKE '%특선2호%'
   OR "productName" LIKE '%특선3호%'
   OR "productName" LIKE '%특선4호%'
   OR "productName" LIKE '%감사1호%'
   OR "productName" LIKE '%드림2호%';

UPDATE "stock_inventory" SET "box_name" = '신앙촌 3호', "post_weight" = 2
WHERE "productName" LIKE '%명품S1호%'
   OR "productName" LIKE '%명품S2호%'
   OR "productName" LIKE '%진13호%'
   OR "productName" LIKE '%진4호%'
   OR "productName" LIKE '%진3호%'
   OR "productName" LIKE '%진2호%'
   OR "productName" LIKE '%기쁨2-1호%'
   OR "productName" LIKE '%기쁨2호%'
   OR "productName" LIKE '%기쁨3호%'
   OR "productName" LIKE '%미소2호%';

UPDATE "stock_inventory" SET "box_name" = '신앙촌 4호', "post_weight" = 5
WHERE "productName" LIKE '%발효명가3호%'
   OR "productName" LIKE '%명품S5호%';

UPDATE "stock_inventory" SET "box_name" = '신앙촌 5호', "post_weight" = 2
WHERE "productName" LIKE '%진6호%';

UPDATE "stock_inventory" SET "box_name" = '신앙촌 7호', "post_weight" = 5
WHERE "productName" LIKE '%정성5호%';

UPDATE "stock_inventory" SET "box_name" = '신앙촌 8호', "post_weight" = 5
WHERE "productName" LIKE '%명진1호%'
   OR "productName" LIKE '%명진6호%'
   OR "productName" LIKE '%프리미엄2호%';

UPDATE "stock_inventory" SET "box_name" = '다용도 3호', "post_weight" = 5
WHERE "productName" LIKE '%진10호%';
