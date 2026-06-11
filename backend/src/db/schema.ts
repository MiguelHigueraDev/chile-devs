import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
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

export const developers = pgTable('developers', {
  githubId: text('github_id').primaryKey(),
  login: text('login').notNull(),
  name: text('name'),
  avatarUrl: text('avatar_url').notNull(),
  rawLocation: text('raw_location'),
  locationId: integer('location_id')
    .notNull()
    .references(() => locations.id),
  followers: integer('followers').notNull().default(0),
  contributions: integer('contributions').notNull().default(0),
  totalStars: integer('total_stars').notNull().default(0),
  topLanguages: jsonb('top_languages')
    .$type<TopLanguage[]>()
    .notNull()
    .default([]),
  profileUrl: text('profile_url').notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const syncRuns = pgTable('sync_runs', {
  id: serial('id').primaryKey(),
  startedAt: timestamp('started_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  usersUpserted: integer('users_upserted').notNull().default(0),
  status: syncStatusEnum('status').notNull().default('running'),
  errorMessage: text('error_message'),
});

export type Location = typeof locations.$inferSelect;
export type Developer = typeof developers.$inferSelect;
export type SyncRun = typeof syncRuns.$inferSelect;
