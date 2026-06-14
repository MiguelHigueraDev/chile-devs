import 'dotenv/config';
import postgres from 'postgres';

/**
 * Drops discovery tables from the previous developer-centric schema so
 * `pnpm db:push` can recreate `repo_candidates` keyed by repo_github_id.
 *
 * Keeps `admins` and the `candidate_status` enum — both are still used.
 */
async function dropOldDiscoveryTables() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const client = postgres(connectionString, { max: 1 });

  try {
    const tablesToDrop = ['repo_candidates', 'candidates'] as const;

    console.log('Checking for old discovery tables...');

    const existing = await client<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY(${tablesToDrop})
      ORDER BY table_name
    `;

    if (existing.length === 0) {
      console.log('No old discovery tables found. Nothing to drop.');
      return;
    }

    console.log(`Found: ${existing.map((row) => row.table_name).join(', ')}`);
    console.log('Dropping old discovery tables (admins table is kept)...');

    for (const table of tablesToDrop) {
      const result = await client.unsafe(
        `DROP TABLE IF EXISTS "${table}" CASCADE`,
      );
      console.log(
        `  DROP TABLE IF EXISTS ${table} — ${result.count} statement(s)`,
      );
    }

    const remaining = await client<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY(${tablesToDrop})
    `;

    if (remaining.length > 0) {
      throw new Error(
        `Failed to drop: ${remaining.map((row) => row.table_name).join(', ')}`,
      );
    }

    console.log(
      'Done. Run `pnpm db:push` to create the new repo_candidates table.',
    );
  } finally {
    await client.end();
  }
}

dropOldDiscoveryTables().catch((error) => {
  console.error('Drop old discovery tables failed:', error);
  process.exit(1);
});
