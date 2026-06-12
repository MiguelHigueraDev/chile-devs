import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  buildClearStaleRankingsSql,
  buildRankingUpdateSql,
} from './ranking-sql';

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

  const cleared = await db.execute(buildClearStaleRankingsSql());
  const result = await db.execute(buildRankingUpdateSql());

  console.log(
    `Done. Cleared ${cleared.count} stale row(s), updated ${result.count} row(s).`,
  );

  await client.end();
}

refreshRankings().catch((error) => {
  console.error('Refresh rankings failed:', error);
  process.exit(1);
});
