-- 관리자 거래처 목록: ORDER BY source DESC, name, id DESC + LIMIT 를 정렬 없이 인덱스로 처리
CREATE INDEX "Partner_source_name_id_idx" ON "Partner"("source" DESC, "name", "id" DESC);
