ALTER TABLE "candidates" RENAME TO "repo_candidates";--> statement-breakpoint
ALTER INDEX "idx_candidates_status" RENAME TO "idx_repo_candidates_status";--> statement-breakpoint
ALTER INDEX "idx_candidates_location" RENAME TO "idx_repo_candidates_location";
