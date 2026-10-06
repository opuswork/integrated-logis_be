-- 엑셀 일괄업로드 추가 항목: 단가노출여부 / 소매 / 슈퍼 납품가 / 급식 / 비과세 (기존 행은 null)
ALTER TABLE "stock_inventory" ADD COLUMN "unit_price_show" BOOLEAN;
ALTER TABLE "stock_inventory" ADD COLUMN "retail_price" DOUBLE PRECISION;
ALTER TABLE "stock_inventory" ADD COLUMN "supermarket_price" DOUBLE PRECISION;
ALTER TABLE "stock_inventory" ADD COLUMN "school_serve_price" DOUBLE PRECISION;
ALTER TABLE "stock_inventory" ADD COLUMN "tax_exemption" BOOLEAN;
