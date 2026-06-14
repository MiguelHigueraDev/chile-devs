import 'dotenv/config';
import { eq, isNotNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { alias } from 'drizzle-orm/pg-core';
import { locations, repoCandidates } from './schema';
import { scatterRepoCoordinate } from '../search/scatter';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const sql = postgres(databaseUrl, { max: 1 });
  const db = drizzle(sql);
  const regionLocations = alias(locations, 'region_locations');

  const rows = await db
    .select({
      repoGithubId: repoCandidates.repoGithubId,
      regionSlug: regionLocations.slug,
    })
    .from(repoCandidates)
    .leftJoin(
      regionLocations,
      eq(repoCandidates.regionLocationId, regionLocations.id),
    )
    .where(eq(repoCandidates.status, 'promoted'));

  let updated = 0;

  for (const row of rows) {
    const regionSlug = row.regionSlug ?? null;
    const coordinate = scatterRepoCoordinate({
      repoGithubId: row.repoGithubId,
      regionSlug,
    });

    await db
      .update(repoCandidates)
      .set({
        scatterLat: coordinate.lat,
        scatterLng: coordinate.lng,
      })
      .where(eq(repoCandidates.repoGithubId, row.repoGithubId));

    updated += 1;
  }

  console.log(`Backfilled scatter coordinates for ${updated} promoted repos`);
  await sql.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
