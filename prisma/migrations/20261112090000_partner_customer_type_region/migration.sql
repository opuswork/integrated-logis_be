-- 거래처: 고객사 구분, 중서남부 칸 추가 (최종 엑셀 입력용)
ALTER TABLE "Partner" ADD COLUMN "customerType" TEXT;
ALTER TABLE "Partner" ADD COLUMN "regionGroup" TEXT;
