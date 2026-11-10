-- 거래처 엑셀 일괄입력(금융권 고객사) + 영업앱 매핑 준비
ALTER TABLE "Partner" ALTER COLUMN "phone" DROP NOT NULL;
ALTER TABLE "Partner" ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "Partner" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "Partner" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Partner" ADD COLUMN "category" TEXT;
ALTER TABLE "Partner" ADD COLUMN "subCategory" TEXT;
ALTER TABLE "Partner" ADD COLUMN "centerName" TEXT;
ALTER TABLE "Partner" ADD COLUMN "salesRepName" TEXT;
ALTER TABLE "Partner" ADD COLUMN "salesUserId" INTEGER;

CREATE INDEX "Partner_source_idx" ON "Partner"("source");
CREATE INDEX "Partner_centerName_idx" ON "Partner"("centerName");
CREATE INDEX "Partner_salesUserId_idx" ON "Partner"("salesUserId");

ALTER TABLE "Partner" ADD CONSTRAINT "Partner_salesUserId_fkey" FOREIGN KEY ("salesUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
