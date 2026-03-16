DELETE FROM "knowledge"
WHERE "deleted_at" IS NOT NULL;--> statement-breakpoint

DELETE FROM "link_source"
WHERE "deleted_at" IS NOT NULL;--> statement-breakpoint

UPDATE "link_source" AS "ls"
SET
	"crawled_pages_count" = COALESCE(
		(
			SELECT COUNT(*)::integer
			FROM "knowledge" AS "k"
			WHERE
				"k"."link_source_id" = "ls"."id"
				AND "k"."type" = 'url'
				AND "k"."deleted_at" IS NULL
		),
		0
	),
	"total_size_bytes" = COALESCE(
		(
			SELECT SUM("k"."size_bytes")
			FROM "knowledge" AS "k"
			WHERE
				"k"."link_source_id" = "ls"."id"
				AND "k"."type" = 'url'
				AND "k"."deleted_at" IS NULL
		),
		0
	)
WHERE "ls"."deleted_at" IS NULL;
