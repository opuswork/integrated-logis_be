-- 개인앱 고객사 검색 범위: 사람 담당자 / 지역 담당자, 본사 전용 계정
-- 값은 scripts/backfill-partner-owners.mjs 로 채운다
ALTER TABLE "Partner" ADD COLUMN "ownerName" TEXT;
ALTER TABLE "Partner" ADD COLUMN "ownerRegion" TEXT;
CREATE INDEX "Partner_ownerName_idx" ON "Partner"("ownerName");
CREATE INDEX "Partner_ownerRegion_idx" ON "Partner"("ownerRegion");

ALTER TABLE "User" ADD COLUMN "hqPartnerAccess" BOOLEAN NOT NULL DEFAULT false;
