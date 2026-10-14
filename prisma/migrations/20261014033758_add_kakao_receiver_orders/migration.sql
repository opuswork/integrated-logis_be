-- CreateTable
CREATE TABLE "kakao_receiver_orders" (
    "id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "preview" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "order_no" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL DEFAULT (now() + '00:15:00'::interval),

    CONSTRAINT "kakao_receiver_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kakao_receiver_orders_fingerprint_key" ON "kakao_receiver_orders"("fingerprint");

-- AddCheckConstraint (manual: Prisma schema cannot express CHECK)
ALTER TABLE "kakao_receiver_orders"
    ADD CONSTRAINT "kakao_receiver_orders_status_check"
    CHECK ("status" IN ('draft', 'posting', 'submitted', 'unknown', 'rejected', 'cancelled'));
