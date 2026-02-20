ALTER TABLE "invitation" ADD COLUMN "created_at" timestamp;
--> statement-breakpoint
UPDATE "invitation"
SET "created_at" = NOW()
WHERE "created_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "invitation" ALTER COLUMN "created_at" SET NOT NULL;
