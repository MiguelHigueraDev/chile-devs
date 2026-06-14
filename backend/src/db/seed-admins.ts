import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { admins } from './schema';

function parseAdminLogins(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((login) => login.trim())
        .filter((login) => login.length > 0),
    ),
  );
}

async function seedAdmins() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const logins = parseAdminLogins(process.env.ADMIN_GITHUB_LOGINS);
  if (logins.length === 0) {
    console.warn(
      'ADMIN_GITHUB_LOGINS is empty; no admins seeded. Set it to a comma-separated list of GitHub logins.',
    );
    return;
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  console.log(`Seeding ${logins.length} admin(s)...`);
  await db
    .insert(admins)
    .values(logins.map((login) => ({ login })))
    .onConflictDoNothing({ target: admins.login });

  const result = await db.select().from(admins);
  console.log(`Admins table now has ${result.length} row(s).`);

  await client.end();
}

seedAdmins().catch((error) => {
  console.error('Admin seed failed:', error);
  process.exit(1);
});
