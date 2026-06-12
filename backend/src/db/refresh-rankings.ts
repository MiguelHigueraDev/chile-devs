import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

async function refreshRankings() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  const countRows = await client<{ ranked_count: string }[]>`
    SELECT COUNT(*)::text AS ranked_count
    FROM developers
    WHERE rank_score IS NOT NULL
  `;
  const rankedCount = countRows[0]?.ranked_count ?? '0';

  console.log(
    `Refreshing rankings for ${rankedCount} developer(s) with a rank score...`,
  );

  const result = await db.execute(sql`
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
  `);

  console.log(`Done. Updated ${result.count} row(s).`);

  await client.end();
}

refreshRankings().catch((error) => {
  console.error('Refresh rankings failed:', error);
  process.exit(1);
});
