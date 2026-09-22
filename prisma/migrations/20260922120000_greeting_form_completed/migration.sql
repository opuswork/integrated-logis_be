-- 인사장관리 "완료" 처리 시각/처리자
ALTER TABLE "greeting_form" ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP(3);
ALTER TABLE "greeting_form" ADD COLUMN IF NOT EXISTS "completed_by" TEXT;
