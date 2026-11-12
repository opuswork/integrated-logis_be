-- 거래처: 휴대폰 칸과 증거자료(명함·계약서) 이미지 칸
ALTER TABLE "Partner" ADD COLUMN "mobile" TEXT;
ALTER TABLE "Partner" ADD COLUMN "evidenceImageUrl" TEXT;
ALTER TABLE "Partner" ADD COLUMN "evidenceImageName" TEXT;

-- phone 은 이제 유선전화. 휴대폰 번호(01x)가 들어 있던 행은 mobile 로 옮긴다
UPDATE "Partner"
   SET "mobile" = "phone", "phone" = NULL
 WHERE regexp_replace(COALESCE("phone", ''), '\D', '', 'g') ~ '^01[016789][0-9]{7,8}$';
