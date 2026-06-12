import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export type TopLanguage = {
  name: string;
  share: number;
};

export const locationKindEnum = pgEnum('location_kind', [
  'country',
  'region',
  'city',
]);

export const syncStatusEnum = pgEnum('sync_status', [
  'running',
  'completed',
  'failed',
]);

export const locations = pgTable('locations', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  kind: locationKindEnum('kind').notNull(),
  lat: text('lat').notNull(),
  lng: text('lng').notNull(),
  searchTerms: text('search_terms').array().notNull(),
});

export const developers = pgTable(
  'developers',
  {
    githubId: text('github_id').primaryKey(),
    login: text('login').notNull().unique(),
    name: text('name'),
    avatarUrl: text('avatar_url').notNull(),
    rawLocation: text('raw_location'),
    locationId: integer('location_id')
      .notNull()
      .references(() => locations.id),
    followers: integer('followers').notNull().default(0),
    contributions: integer('contributions').notNull().default(0),
    // Per-metric inputs for rank (see sync/rank.ts). commits/reviews = last 12 months.
    commits: integer('commits').notNull().default(0),
    prs: integer('prs').notNull().default(0),
    issues: integer('issues').notNull().default(0),
    reviews: integer('reviews').notNull().default(0),
    totalStars: integer('total_stars').notNull().default(0),
    topLanguages: jsonb('top_languages')
      .$type<TopLanguage[]>()
      .notNull()
      .default([]),
    // rankScore: 0–100, lower is better. rankLevel: S (best) through C (worst).
    // percentileCl: local standing among indexed Chilean devs (0 = #1, 100 = last).
    rankScore: doublePrecision('rank_score'),
    rankLevel: text('rank_level'),
    percentileCl: doublePrecision('percentile_cl'),
    profileUrl: text('profile_url').notNull(),
    portfolioUrl: text('portfolio_url'),
    description: text('description'),
    role: text('role'),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('idx_developers_rank_score').on(table.rankScore)],
);

export const developerLanguages = pgTable(
  'developer_languages',
  {
    developerGithubId: text('developer_github_id')
      .notNull()
      .references(() => developers.githubId, { onDelete: 'cascade' }),
    language: text('language').notNull(),
    share: integer('share').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.developerGithubId, table.language],
    }),
    index('idx_dev_lang_share').on(table.language, table.share),
  ],
);

export const syncRuns = pgTable('sync_runs', {
  id: serial('id').primaryKey(),
  startedAt: timestamp('started_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  usersUpserted: integer('users_upserted').notNull().default(0),
  usersDiscovered: integer('users_discovered').notNull().default(0),
  usersUpdated: integer('users_updated').notNull().default(0),
  completedTerms: jsonb('completed_terms')
    .$type<string[]>()
    .notNull()
    .default([]),
  status: syncStatusEnum('status').notNull().default('running'),
  errorMessage: text('error_message'),
  lastLocationId: integer('last_location_id').references(() => locations.id, {
    onDelete: 'set null',
  }),
});

export type Location = typeof locations.$inferSelect;
export type Developer = typeof developers.$inferSelect;
export type DeveloperLanguage = typeof developerLanguages.$inferSelect;
export type SyncRun = typeof syncRuns.$inferSelect;
