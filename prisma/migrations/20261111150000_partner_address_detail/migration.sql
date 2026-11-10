-- 거래처 상세주소 칸 추가
ALTER TABLE "Partner" ADD COLUMN "addressDetail" TEXT;

-- 기존 주소에서 도로명+건물번호(+참고항목) 뒤의 층·호수·건물명을 상세주소로 옮긴다
-- 예) '울산 중구 염포로 26 3층' → address '울산 중구 염포로 26', addressDetail '3층'
-- 지번주소 등 도로명 형식이 아닌 주소는 그대로 둔다
UPDATE "Partner" AS p
SET
  "address" = s.m[1],
  "addressDetail" = NULLIF(btrim(s.m[2], ' ,.'), '')
FROM (
  SELECT
    id,
    regexp_match(
      "address",
      '^(.*?(?:로|길)\s?\d+(?:-\d+)?(?:\s?\([^)]*\))?)(?:[\s,]+(.*))?$'
    ) AS m
  FROM "Partner"
) AS s
WHERE s.id = p.id
  AND s.m IS NOT NULL
  AND s.m[2] IS NOT NULL;
