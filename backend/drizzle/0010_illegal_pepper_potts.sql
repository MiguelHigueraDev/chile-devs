CREATE TYPE "public"."candidate_status" AS ENUM('pending', 'accepted', 'rejected', 'excluded');--> statement-breakpoint
CREATE TYPE "public"."discovery_source" AS ENUM('location_search', 'follower_graph', 'following_graph', 'org_contributor', 'repo_contributor');--> statement-breakpoint
CREATE TABLE "discovery_candidates" (
	"github_id" text PRIMARY KEY NOT NULL,
	"login" text NOT NULL,
	"raw_location" text,
	"bio" text,
	"company" text,
	"blog" text,
	"source" "discovery_source" NOT NULL,
	"discovered_via" text,
	"confidence" double precision,
	"signals" jsonb DEFAULT '{"reasons":[]}'::jsonb NOT NULL,
	"status" "candidate_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_evaluated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "discovery_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"candidates_discovered" integer DEFAULT 0 NOT NULL,
	"candidates_evaluated" integer DEFAULT 0 NOT NULL,
	"candidates_accepted" integer DEFAULT 0 NOT NULL,
	"candidates_rejected" integer DEFAULT 0 NOT NULL,
	"source_stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dry_run" integer DEFAULT 0 NOT NULL,
	"status" "sync_status" DEFAULT 'running' NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "excluded_users" (
	"github_id" text PRIMARY KEY NOT NULL,
	"login" text NOT NULL,
	"excluded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "last_graph_crawl_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_candidates_status" ON "discovery_candidates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_candidates_confidence" ON "discovery_candidates" USING btree ("confidence");--> statement-breakpoint
CREATE INDEX "idx_developers_graph_crawl" ON "developers" USING btree ("last_graph_crawl_at");