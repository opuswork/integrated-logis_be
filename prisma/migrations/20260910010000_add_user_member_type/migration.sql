-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "MemberType" AS ENUM ('관장', '일반', '총무', '사장', '부사장', '상무');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "member_type" "MemberType" NOT NULL DEFAULT '관장';

-- Backfill
UPDATE "User" SET "member_type" = '총무' WHERE fullname LIKE '%(총무)%';
UPDATE "User" SET "member_type" = '일반' WHERE fullname = '인사장담당';
