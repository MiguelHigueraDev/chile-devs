ALTER TABLE "repo_candidates" ADD COLUMN "scatter_lat" double precision;
ALTER TABLE "repo_candidates" ADD COLUMN "scatter_lng" double precision;
CREATE INDEX "idx_repo_candidates_scatter_lat" ON "repo_candidates" USING btree ("scatter_lat");
CREATE INDEX "idx_repo_candidates_scatter_lng" ON "repo_candidates" USING btree ("scatter_lng");
