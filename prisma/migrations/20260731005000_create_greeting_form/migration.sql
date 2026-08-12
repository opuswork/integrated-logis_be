-- CreateTable (was applied via db push locally; missing from migration history)
CREATE TABLE IF NOT EXISTS "greeting_form" (
    "id" SERIAL NOT NULL,
    "greetingNumber" TEXT NOT NULL,
    "includeSelf" BOOLEAN NOT NULL DEFAULT false,
    "imageUrl" TEXT NOT NULL,
    "imageStoredName" TEXT NOT NULL,
    "imageOriginalName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "size" TEXT NOT NULL,
    "productName" TEXT,
    "receivePlace" TEXT NOT NULL,
    "specialNote" TEXT,
    "ordererName" TEXT,
    "churchName" TEXT,
    "phone" TEXT,
    "linkedToOrder" BOOLEAN NOT NULL,
    "submitted" BOOLEAN NOT NULL DEFAULT false,
    "orderId" INTEGER,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "greeting_form_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "greeting_form_linkedToOrder_idx" ON "greeting_form"("linkedToOrder");
CREATE INDEX IF NOT EXISTS "greeting_form_orderId_idx" ON "greeting_form"("orderId");
CREATE INDEX IF NOT EXISTS "greeting_form_createdAt_idx" ON "greeting_form"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'greeting_form_orderId_fkey'
  ) THEN
    ALTER TABLE "greeting_form"
      ADD CONSTRAINT "greeting_form_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'greeting_form_userId_fkey'
  ) THEN
    ALTER TABLE "greeting_form"
      ADD CONSTRAINT "greeting_form_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
