-- 개인앱 고객사 검색에서 숨길 거래처 표시
ALTER TABLE "Partner" ADD COLUMN "hideInSearch" BOOLEAN NOT NULL DEFAULT false;

-- 중서남부=본사, 중앙=관리자, 담당자=관리자 인 고객사는 모두에게 숨긴다
UPDATE "Partner"
SET "hideInSearch" = true
WHERE "regionGroup" = '본사'
  AND "centerName" = '관리자'
  AND "contactName" = '관리자';
