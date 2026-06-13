# Drizzle SQL files (reference only)

These SQL files and `meta/` snapshots are **not** used to set up or update databases in this project.

Use the TypeScript schema in `src/db/schema.ts` and sync with:

```bash
pnpm db:push
```

Do not run `pnpm db:migrate`. The migration journal here is incomplete (for example, two conflicting `0001_*` files, with only one registered in `_journal.json`), so a clean database may miss columns that later migrations or the app expect.

`pnpm db:generate` may refresh these files after schema changes, but they serve as history/reference only—not as the source of truth for deployments or local onboarding.
