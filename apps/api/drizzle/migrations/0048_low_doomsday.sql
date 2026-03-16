CREATE TYPE "public"."knowledge_clarification_source" AS ENUM('conversation', 'faq');--> statement-breakpoint
CREATE TYPE "public"."knowledge_clarification_status" AS ENUM('analyzing', 'awaiting_answer', 'draft_ready', 'deferred', 'applied', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."knowledge_clarification_turn_role" AS ENUM('ai_question', 'human_answer');--> statement-breakpoint
CREATE TABLE "knowledge_clarification_request" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"organization_id" varchar(26) NOT NULL,
	"website_id" varchar(26) NOT NULL,
	"ai_agent_id" varchar(26) NOT NULL,
	"conversation_id" varchar(18),
	"source" "knowledge_clarification_source" NOT NULL,
	"status" "knowledge_clarification_status" DEFAULT 'awaiting_answer' NOT NULL,
	"topic_summary" text NOT NULL,
	"step_index" integer DEFAULT 0 NOT NULL,
	"max_steps" integer DEFAULT 5 NOT NULL,
	"target_knowledge_id" varchar(26),
	"draft_faq_payload" jsonb,
	"last_error" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_clarification_turn" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"request_id" varchar(26) NOT NULL,
	"role" "knowledge_clarification_turn_role" NOT NULL,
	"question" text,
	"suggested_answers" text[],
	"selected_answer" text,
	"free_answer" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_clarification_request" ADD CONSTRAINT "knowledge_clarification_request_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_clarification_request" ADD CONSTRAINT "knowledge_clarification_request_website_id_website_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."website"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_clarification_request" ADD CONSTRAINT "knowledge_clarification_request_ai_agent_id_ai_agent_id_fk" FOREIGN KEY ("ai_agent_id") REFERENCES "public"."ai_agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_clarification_request" ADD CONSTRAINT "knowledge_clarification_request_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_clarification_request" ADD CONSTRAINT "knowledge_clarification_request_target_knowledge_id_knowledge_id_fk" FOREIGN KEY ("target_knowledge_id") REFERENCES "public"."knowledge"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_clarification_turn" ADD CONSTRAINT "knowledge_clarification_turn_request_id_knowledge_clarification_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."knowledge_clarification_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_clarification_request_website_idx" ON "knowledge_clarification_request" USING btree ("website_id");--> statement-breakpoint
CREATE INDEX "knowledge_clarification_request_ai_agent_idx" ON "knowledge_clarification_request" USING btree ("ai_agent_id");--> statement-breakpoint
CREATE INDEX "knowledge_clarification_request_conversation_idx" ON "knowledge_clarification_request" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "knowledge_clarification_request_status_idx" ON "knowledge_clarification_request" USING btree ("status");--> statement-breakpoint
CREATE INDEX "knowledge_clarification_request_target_knowledge_idx" ON "knowledge_clarification_request" USING btree ("target_knowledge_id");--> statement-breakpoint
CREATE INDEX "knowledge_clarification_turn_request_idx" ON "knowledge_clarification_turn" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "knowledge_clarification_turn_role_idx" ON "knowledge_clarification_turn" USING btree ("role");