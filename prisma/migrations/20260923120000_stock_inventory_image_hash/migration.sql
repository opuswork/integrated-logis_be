-- 엑셀 일괄업로드 시 사진이 실제로 바뀐 경우에만 교체하기 위한 sha256 해시
ALTER TABLE "stock_inventory" ADD COLUMN "image_hash" TEXT;
