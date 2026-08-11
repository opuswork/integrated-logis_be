-- Fix incorrect prior migration that added User.church (TEXT).
-- Align DB with schema.prisma: Church table + User.churchId FK.

CREATE TABLE IF NOT EXISTS "Church" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "branchCode" TEXT,
    "assigner" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Church_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Church_name_key" ON "Church"("name");

ALTER TABLE "User" DROP COLUMN IF EXISTS "church";

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "churchId" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'User_churchId_fkey'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_churchId_fkey"
      FOREIGN KEY ("churchId") REFERENCES "Church"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
