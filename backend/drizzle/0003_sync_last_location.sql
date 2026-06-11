ALTER TABLE "sync_runs" ADD COLUMN "last_location_id" integer;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_last_location_id_locations_id_fk" FOREIGN KEY ("last_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;
