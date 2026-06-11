-- Remove duplicate logins before adding the unique constraint.
-- Canonical row per login: claimed profile > most recently seen > lowest github_id.
WITH ranked AS (
  SELECT
    github_id,
    ROW_NUMBER() OVER (
      PARTITION BY login
      ORDER BY
        (claimed_at IS NOT NULL) DESC,
        last_seen_at DESC,
        github_id ASC
    ) AS rn
  FROM developers
),
duplicates AS (
  SELECT github_id FROM ranked WHERE rn > 1
)
DELETE FROM developers
WHERE github_id IN (SELECT github_id FROM duplicates);
--> statement-breakpoint
ALTER TABLE "developers" ADD CONSTRAINT "developers_login_unique" UNIQUE("login");
