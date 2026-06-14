ALTER TABLE "repo_candidates" ADD COLUMN "region_location_id" integer;--> statement-breakpoint
ALTER TABLE "repo_candidates" ADD CONSTRAINT "repo_candidates_region_location_id_locations_id_fk" FOREIGN KEY ("region_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_repo_candidates_region_location" ON "repo_candidates" USING btree ("region_location_id");
