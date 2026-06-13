import 'dotenv/config';
import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { GithubService } from '../sync/github.service';
import {
  buildClearStaleRankingsSql,
  buildRankingUpdateSql,
} from './ranking-sql';
import { developers, locations } from './schema';

const apply = process.argv.includes('--apply');

async function removeInvalidLocations() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);
  const github = new GithubService(
    { getOrThrow: () => 'unused' } as never,
    {} as never,
  );

  const allLocations = await db.select().from(locations);
  const allDevelopers = await db
    .select({
      githubId: developers.githubId,
      login: developers.login,
      rawLocation: developers.rawLocation,
    })
    .from(developers);

  const toRemove = allDevelopers.filter(
    (developer) =>
      !github.classifyLocation(developer.rawLocation, allLocations),
  );

  console.log(
    `Scanned ${allDevelopers.length} developer(s); ${toRemove.length} have invalid locations.`,
  );

  if (toRemove.length === 0) {
    await client.end();
    return;
  }

  for (const developer of toRemove) {
    console.log(
      `  @${developer.login} (${developer.rawLocation ?? 'no location'})`,
    );
  }

  if (!apply) {
    console.log('\nDry run — pass --apply to delete these developers.');
    await client.end();
    return;
  }

  const githubIds = toRemove.map((developer) => developer.githubId);

  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(developers)
      .where(inArray(developers.githubId, githubIds))
      .returning({ githubId: developers.githubId });

    await tx.execute(buildClearStaleRankingsSql());
    await tx.execute(buildRankingUpdateSql());

    console.log(
      `\nDeleted ${deleted.length} developer(s) and refreshed rankings.`,
    );
  });

  await client.end();
}

removeInvalidLocations().catch((error) => {
  console.error('Remove invalid locations failed:', error);
  process.exit(1);
});
