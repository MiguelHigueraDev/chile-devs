import { sql } from 'drizzle-orm';

/** Clears derived ranking columns for developers without a rank score. */
export function buildClearStaleRankingsSql() {
  return sql`
    UPDATE developers
    SET
      percentile_cl = NULL,
      rank_location = NULL,
      rank_country = NULL
    WHERE rank_score IS NULL
  `;
}

// rank_score ASC → best devs have the lowest score.
// PERCENT_RANK × 100 → 0 for #1, ~100 for last place (percentileCl).
// ROW_NUMBER → integer position 1, 2, 3… within location and country.
export function buildRankingUpdateSql() {
  return sql`
    UPDATE developers AS d
    SET
      percentile_cl = ranked.pct,
      rank_location = ranked.rank_location,
      rank_country = ranked.rank_country
    FROM (
      SELECT
        github_id,
        PERCENT_RANK() OVER (ORDER BY rank_score ASC) * 100 AS pct,
        ROW_NUMBER() OVER (
          PARTITION BY location_id
          ORDER BY rank_score ASC, total_stars DESC, followers DESC, contributions DESC, github_id ASC
        ) AS rank_location,
        ROW_NUMBER() OVER (
          ORDER BY rank_score ASC, total_stars DESC, followers DESC, contributions DESC, github_id ASC
        ) AS rank_country
      FROM developers
      WHERE rank_score IS NOT NULL
    ) AS ranked
    WHERE d.github_id = ranked.github_id
  `;
}
