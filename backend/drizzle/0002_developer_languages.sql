CREATE TABLE "developer_languages" (
	"developer_github_id" text NOT NULL,
	"language" text NOT NULL,
	"share" integer NOT NULL,
	CONSTRAINT "developer_languages_developer_github_id_language_pk" PRIMARY KEY("developer_github_id","language")
);
--> statement-breakpoint
ALTER TABLE "developer_languages" ADD CONSTRAINT "developer_languages_developer_github_id_developers_github_id_fk" FOREIGN KEY ("developer_github_id") REFERENCES "public"."developers"("github_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_dev_lang_share" ON "developer_languages" USING btree ("language","share" DESC);
--> statement-breakpoint
INSERT INTO "developer_languages" ("developer_github_id", "language", "share")
SELECT
	d.github_id,
	lower(lang->>'name'),
	(lang->>'share')::integer
FROM developers d
CROSS JOIN LATERAL jsonb_array_elements(d.top_languages) AS lang
ON CONFLICT DO NOTHING;
