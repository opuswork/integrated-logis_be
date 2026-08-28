-- CreateTable
CREATE TABLE IF NOT EXISTS "Partner" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "email" TEXT,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Partner_userId_idx" ON "Partner"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Partner_userId_name_idx" ON "Partner"("userId", "name");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Partner" ADD CONSTRAINT "Partner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
