ALTER TABLE "visitor" ADD COLUMN "geo_source" varchar(50);--> statement-breakpoint
ALTER TABLE "visitor" ADD COLUMN "geo_accuracy_radius_km" real;--> statement-breakpoint
ALTER TABLE "visitor" ADD COLUMN "geo_resolved_at" timestamp;