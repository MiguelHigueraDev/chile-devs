import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { LOCATION_SEEDS } from './locations.data';
import { locations } from './schema';

async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  console.log('Seeding locations...');
  await db
    .insert(locations)
    .values(LOCATION_SEEDS)
    .onConflictDoNothing({ target: locations.slug });

  const result = await db.select().from(locations);
  console.log(`Seeded ${result.length} locations.`);

  await client.end();
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
