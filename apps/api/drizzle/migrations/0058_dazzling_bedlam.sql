ALTER TABLE "api_key" ADD COLUMN "linked_user_id" varchar(26);--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_linked_user_id_user_id_fk" FOREIGN KEY ("linked_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_key_linked_user_idx" ON "api_key" USING btree ("linked_user_id");