-- 사용자 음성 불편·오류 신고 녹음
CREATE TABLE "VoiceRecording" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "orderer_name" TEXT NOT NULL,
    "church_name" TEXT,
    "screen" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "duration_sec" INTEGER,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceRecording_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VoiceRecording_recorded_at_idx" ON "VoiceRecording"("recorded_at");

ALTER TABLE "VoiceRecording" ADD CONSTRAINT "VoiceRecording_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
