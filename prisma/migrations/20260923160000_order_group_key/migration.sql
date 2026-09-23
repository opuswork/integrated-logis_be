-- 분할 주문 형제 관계를 주문번호 문자열 파싱이 아니라 컬럼으로 표현한다.
-- 기존 데이터가 남아 있어도 안전하도록 NULL 허용으로 추가한 뒤 채우고 NOT NULL 로 조인다.
ALTER TABLE "Order" ADD COLUMN "order_group_key" TEXT;
UPDATE "Order" SET "order_group_key" = "orderNumber" WHERE "order_group_key" IS NULL;
ALTER TABLE "Order" ALTER COLUMN "order_group_key" SET NOT NULL;

ALTER TABLE "Order" ADD COLUMN "split_index" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "Order_order_group_key_idx" ON "Order"("order_group_key");
