-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "AccountSource" AS ENUM ('SELF_SIGNUP', 'ADMIN_ORDER', 'BULK_IMPORT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "account_source" "AccountSource" NOT NULL DEFAULT 'SELF_SIGNUP';
