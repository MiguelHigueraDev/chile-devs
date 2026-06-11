CREATE TYPE "public"."location_kind" AS ENUM('country', 'region', 'city');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "developers" (
	"github_id" text PRIMARY KEY NOT NULL,
	"login" text NOT NULL,
	"name" text,
	"avatar_url" text NOT NULL,
	"raw_location" text,
	"location_id" integer NOT NULL,
	"followers" integer DEFAULT 0 NOT NULL,
	"contributions" integer DEFAULT 0 NOT NULL,
	"profile_url" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" "location_kind" NOT NULL,
	"lat" text NOT NULL,
	"lng" text NOT NULL,
	"search_terms" text[] NOT NULL,
	CONSTRAINT "locations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"users_upserted" integer DEFAULT 0 NOT NULL,
	"status" "sync_status" DEFAULT 'running' NOT NULL,
	"error_message" text
);
--> statement-breakpoint
ALTER TABLE "developers" ADD CONSTRAINT "developers_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;