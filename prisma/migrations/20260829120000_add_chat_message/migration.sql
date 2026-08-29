-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ChatMessageKind" AS ENUM ('MESSAGE', 'SYSTEM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ChatMessage" (
    "id" SERIAL NOT NULL,
    "kind" "ChatMessageKind" NOT NULL DEFAULT 'MESSAGE',
    "body" TEXT NOT NULL,
    "sender_name" TEXT NOT NULL,
    "sender_label" TEXT NOT NULL,
    "sender_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChatMessage_created_at_idx" ON "ChatMessage"("created_at");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
