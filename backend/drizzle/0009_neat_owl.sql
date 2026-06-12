ALTER TABLE "developers" ADD COLUMN "rank_location" integer;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "rank_country" integer;--> statement-breakpoint
CREATE INDEX "idx_developers_location_rank" ON "developers" USING btree ("location_id","rank_score");
