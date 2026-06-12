ALTER TABLE "developers" ADD COLUMN "commits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "prs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "issues" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "reviews" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "rank_score" double precision;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "rank_level" text;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "percentile_cl" double precision;--> statement-breakpoint
CREATE INDEX "idx_developers_rank_score" ON "developers" USING btree ("rank_score");
