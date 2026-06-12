ALTER TABLE "sync_runs" ADD COLUMN "users_discovered" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "users_updated" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "completed_terms" jsonb DEFAULT '[]'::jsonb NOT NULL;
