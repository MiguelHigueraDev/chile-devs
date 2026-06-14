ALTER TABLE "repo_candidates" ADD COLUMN "scatter_lat" double precision;
ALTER TABLE "repo_candidates" ADD COLUMN "scatter_lng" double precision;
CREATE INDEX "idx_repo_candidates_promoted_scatter_bbox"
  ON "repo_candidates" USING btree ("scatter_lng", "scatter_lat")
  WHERE "status" = 'promoted'
    AND "scatter_lat" IS NOT NULL
    AND "scatter_lng" IS NOT NULL;
