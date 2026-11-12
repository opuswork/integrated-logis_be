-- 중서남부=본사 고객사는 중앙·담당자와 관계없이 개인앱 고객사 검색에서 모두에게 숨긴다
-- (이전 규칙: 본사 + 중앙 관리자 + 담당자 관리자 만 숨김)
UPDATE "Partner"
SET "hideInSearch" = true
WHERE "regionGroup" = '본사';
