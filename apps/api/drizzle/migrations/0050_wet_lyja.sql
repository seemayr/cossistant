ALTER TABLE "knowledge_clarification_request" ALTER COLUMN "max_steps" SET DEFAULT 3;--> statement-breakpoint
ALTER TABLE "knowledge_clarification_request" ADD COLUMN "context_snapshot" jsonb;