-- CreateEnum
CREATE TYPE "AdminRegion" AS ENUM ('JUNGBU', 'NAMBU', 'SEOBU');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "adminRegion" "AdminRegion";
