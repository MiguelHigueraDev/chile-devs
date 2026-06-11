ALTER TABLE "sync_runs" DROP CONSTRAINT "sync_runs_last_location_id_locations_id_fk";--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_last_location_id_locations_id_fk" FOREIGN KEY ("last_location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
