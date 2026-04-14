ALTER TABLE "website"
ADD COLUMN "default_language" varchar(20) DEFAULT 'en' NOT NULL;

ALTER TABLE "conversation"
ADD COLUMN "visitor_title" text;

ALTER TABLE "conversation"
ADD COLUMN "visitor_title_language" text;

ALTER TABLE "conversation"
ADD COLUMN "visitor_language" text;

ALTER TABLE "conversation"
ADD COLUMN "translation_activated_at" timestamp;

ALTER TABLE "conversation"
ADD COLUMN "translation_charged_at" timestamp;
