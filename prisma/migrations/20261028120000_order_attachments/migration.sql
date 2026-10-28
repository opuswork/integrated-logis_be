-- 주문 첨부 사진 (대량 택배 명단 촬영 등)
CREATE TABLE "order_attachment" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "image_url" TEXT NOT NULL,
    "stored_name" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "uploaded_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_attachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_attachment_order_id_idx" ON "order_attachment"("order_id");

ALTER TABLE "order_attachment" ADD CONSTRAINT "order_attachment_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
