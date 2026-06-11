import 'dotenv/config';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import {
  isGithubDatabaseId,
  parseGithubDatabaseIdFromNodeId,
} from '../src/lib/github-id';
import { developerLanguages, developers } from '../src/db/schema';

const BATCH_SIZE = 50;

type DatabaseIdResponse = {
  data?: Record<string, { databaseId?: number | null } | null>;
  errors?: Array<{ type?: string; message: string }>;
};

async function fetchDatabaseIds(
  token: string,
  nodeIds: string[],
): Promise<Map<string, string>> {
  // The legacy githubId values are GraphQL node global IDs, so resolve them
  // directly instead of via login, which goes stale when users rename.
  const nodeFields = nodeIds
    .map(
      (nodeId, index) => `
    n${index}: node(id: ${JSON.stringify(nodeId)}) {
      ... on User {
        databaseId
      }
    }`,
    )
    .join('\n');

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      query: `query BatchDatabaseIds { ${nodeFields} }`,
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL error ${response.status}`);
  }

  const payload = (await response.json()) as DatabaseIdResponse;
  // NOT_FOUND errors (deleted accounts) leave their alias null in data;
  // those rows are skipped individually instead of failing the batch.
  const fatalErrors = (payload.errors ?? []).filter(
    (error) => error.type !== 'NOT_FOUND',
  );
  if (fatalErrors.length > 0) {
    throw new Error(fatalErrors.map((error) => error.message).join(', '));
  }

  const results = new Map<string, string>();
  nodeIds.forEach((nodeId, index) => {
    const databaseId = payload.data?.[`n${index}`]?.databaseId;
    if (databaseId != null) {
      results.set(nodeId, String(databaseId));
    }
  });

  return results;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const token = process.env.GITHUB_TOKEN;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  if (!token) {
    throw new Error('GITHUB_TOKEN is required');
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client);

  const rows = await db
    .select({
      githubId: developers.githubId,
      login: developers.login,
    })
    .from(developers);

  const pending = rows.filter((row) => !isGithubDatabaseId(row.githubId));
  if (pending.length === 0) {
    console.log('All developer github_id values are already numeric.');
    await client.end();
    return;
  }

  console.log(`Migrating ${pending.length} developer github_id values...`);

  let migrated = 0;
  for (let index = 0; index < pending.length; index += BATCH_SIZE) {
    const batch = pending.slice(index, index + BATCH_SIZE);
    const resolvedIds = new Map<string, string>();

    for (const row of batch) {
      const parsed = parseGithubDatabaseIdFromNodeId(row.githubId);
      if (parsed) {
        resolvedIds.set(row.githubId, parsed);
      }
    }

    const unresolved = batch.filter((row) => !resolvedIds.has(row.githubId));
    if (unresolved.length > 0) {
      const fetched = await fetchDatabaseIds(
        token,
        unresolved.map((row) => row.githubId),
      );

      for (const row of unresolved) {
        const databaseId = fetched.get(row.githubId);
        if (databaseId) {
          resolvedIds.set(row.githubId, databaseId);
        }
      }
    }

    for (const row of batch) {
      const nextGithubId = resolvedIds.get(row.githubId);
      if (!nextGithubId || nextGithubId === row.githubId) {
        console.warn(
          `Skipping ${row.login}: could not resolve databaseId for ${row.githubId}`,
        );
        continue;
      }

      const existing = await db
        .select({ githubId: developers.githubId })
        .from(developers)
        .where(eq(developers.githubId, nextGithubId))
        .limit(1);

      if (existing.length > 0) {
        // Same user already exists under the numeric id; merge the legacy row
        // into it so reruns converge instead of skipping forever.
        await db.transaction(async (tx) => {
          const legacyLanguageRows = await tx
            .select()
            .from(developerLanguages)
            .where(eq(developerLanguages.developerGithubId, row.githubId));

          if (legacyLanguageRows.length > 0) {
            await tx
              .insert(developerLanguages)
              .values(
                legacyLanguageRows.map((languageRow) => ({
                  developerGithubId: nextGithubId,
                  language: languageRow.language,
                  share: languageRow.share,
                })),
              )
              .onConflictDoNothing();
          }

          // Cascade removes the legacy developer_languages rows.
          await tx
            .delete(developers)
            .where(eq(developers.githubId, row.githubId));
        });

        migrated += 1;
        console.log(
          `Merged ${row.login}: ${row.githubId} into existing ${nextGithubId}`,
        );
        continue;
      }

      const languageRows = await db
        .select()
        .from(developerLanguages)
        .where(eq(developerLanguages.developerGithubId, row.githubId));

      await db.transaction(async (tx) => {
        await tx
          .delete(developerLanguages)
          .where(eq(developerLanguages.developerGithubId, row.githubId));

        await tx
          .update(developers)
          .set({ githubId: nextGithubId })
          .where(eq(developers.githubId, row.githubId));

        if (languageRows.length > 0) {
          await tx.insert(developerLanguages).values(
            languageRows.map((languageRow) => ({
              developerGithubId: nextGithubId,
              language: languageRow.language,
              share: languageRow.share,
            })),
          );
        }
      });

      migrated += 1;
      console.log(`Migrated ${row.login}: ${row.githubId} -> ${nextGithubId}`);
    }
  }

  console.log(`Done. Migrated ${migrated} developers.`);
  await client.end();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
