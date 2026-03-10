CREATE TYPE "public"."conversation_title_source" AS ENUM('ai', 'user');--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "title_source" "conversation_title_source";
