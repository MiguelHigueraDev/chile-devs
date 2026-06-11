-- Remove duplicate logins before adding the unique constraint.
-- Canonical row per login: claimed profile > most recently seen > lowest github_id.
-- Merge duplicate profile/stats into the canonical row, then delete the rest.
WITH ranked AS (
  SELECT
    d.*,
    ROW_number() OVER (
      PARTITION BY login
      ORDER BY
        (claimed_at IS NOT NULL) DESC,
        last_seen_at DESC,
        github_id ASC
    ) AS rn
  FROM developers d
),
duplicates AS (
  SELECT github_id FROM ranked WHERE rn > 1
),
merged AS (
  SELECT
    MAX(CASE WHEN rn = 1 THEN github_id END) AS canonical_github_id,
    COALESCE(
      MAX(CASE WHEN rn = 1 THEN name END),
      (array_agg(name ORDER BY last_seen_at DESC NULLS LAST)
        FILTER (WHERE name IS NOT NULL))[1]
    ) AS merged_name,
    COALESCE(
      MAX(CASE WHEN rn = 1 THEN avatar_url END),
      (array_agg(avatar_url ORDER BY last_seen_at DESC)
        FILTER (WHERE avatar_url IS NOT NULL))[1]
    ) AS merged_avatar_url,
    COALESCE(
      MAX(CASE WHEN rn = 1 THEN raw_location END),
      (array_agg(raw_location ORDER BY last_seen_at DESC NULLS LAST)
        FILTER (WHERE raw_location IS NOT NULL))[1]
    ) AS merged_raw_location,
    MAX(followers) AS merged_followers,
    MAX(contributions) AS merged_contributions,
    MAX(total_stars) AS merged_total_stars,
    COALESCE(
      NULLIF(MAX(CASE WHEN rn = 1 THEN top_languages END), '[]'::jsonb),
      (array_agg(top_languages ORDER BY last_seen_at DESC)
        FILTER (WHERE top_languages IS NOT NULL AND top_languages <> '[]'::jsonb))[1],
      '[]'::jsonb
    ) AS merged_top_languages,
    COALESCE(
      MAX(CASE WHEN rn = 1 THEN profile_url END),
      (array_agg(profile_url ORDER BY last_seen_at DESC)
        FILTER (WHERE profile_url IS NOT NULL))[1]
    ) AS merged_profile_url,
    COALESCE(
      MAX(CASE WHEN rn = 1 THEN portfolio_url END),
      (array_agg(portfolio_url ORDER BY last_seen_at DESC NULLS LAST)
        FILTER (WHERE portfolio_url IS NOT NULL))[1]
    ) AS merged_portfolio_url,
    COALESCE(
      MAX(CASE WHEN rn = 1 THEN description END),
      (array_agg(description ORDER BY last_seen_at DESC NULLS LAST)
        FILTER (WHERE description IS NOT NULL))[1]
    ) AS merged_description,
    COALESCE(
      MAX(CASE WHEN rn = 1 THEN role END),
      (array_agg(role ORDER BY last_seen_at DESC NULLS LAST)
        FILTER (WHERE role IS NOT NULL))[1]
    ) AS merged_role,
    COALESCE(
      MAX(CASE WHEN rn = 1 THEN claimed_at END),
      MAX(claimed_at)
    ) AS merged_claimed_at,
    MAX(last_seen_at) AS merged_last_seen_at
  FROM ranked
  GROUP BY login
  HAVING COUNT(*) > 1
),
_updated AS (
  UPDATE developers AS d
  SET
    name = m.merged_name,
    avatar_url = m.merged_avatar_url,
    raw_location = m.merged_raw_location,
    followers = m.merged_followers,
    contributions = m.merged_contributions,
    total_stars = m.merged_total_stars,
    top_languages = m.merged_top_languages,
    profile_url = m.merged_profile_url,
    portfolio_url = m.merged_portfolio_url,
    description = m.merged_description,
    role = m.merged_role,
    claimed_at = m.merged_claimed_at,
    last_seen_at = m.merged_last_seen_at
  FROM merged m
  WHERE d.github_id = m.canonical_github_id
)
DELETE FROM developers
WHERE github_id IN (SELECT github_id FROM duplicates);
--> statement-breakpoint
ALTER TABLE "developers" ADD CONSTRAINT "developers_login_unique" UNIQUE("login");
