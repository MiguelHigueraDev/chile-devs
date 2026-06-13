import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// Schema sync uses `pnpm db:push`, not `pnpm db:migrate`.
// See backend/drizzle/README.md and the root README "Database schema" section.
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
