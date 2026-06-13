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

export const discoverySourceEnum = pgEnum('discovery_source', [
  'location_search',
  'follower_graph',
  'following_graph',
  'org_contributor',
  'repo_contributor',
]);

export const candidateStatusEnum = pgEnum('candidate_status', [
  'pending',
  'accepted',
  'rejected',
  'excluded',
]);

export type CandidateSignals = {
  // Human-readable signal keys that fired during scoring (for transparency/debugging).
  reasons: string[];
  // Number of already-verified Chilean devs whose follower/following graph points
  // at this candidate. Accumulated by the social-graph snowball source.
  neighborOverlap?: number;
};

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
    // rankLocation: integer position within the developer's own location (1 = best).
    // rankCountry: integer position among all indexed Chilean devs (1 = best).
    rankScore: doublePrecision('rank_score'),
    rankLevel: text('rank_level'),
    percentileCl: doublePrecision('percentile_cl'),
    rankLocation: integer('rank_location'),
    rankCountry: integer('rank_country'),
    profileUrl: text('profile_url').notNull(),
    portfolioUrl: text('portfolio_url'),
    description: text('description'),
    role: text('role'),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // When this developer was last expanded as a seed by the social-graph
    // snowball crawler. Null means never expanded.
    lastGraphCrawlAt: timestamp('last_graph_crawl_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_developers_rank_score').on(table.rankScore),
    index('idx_developers_location_rank').on(table.locationId, table.rankScore),
    index('idx_developers_graph_crawl').on(table.lastGraphCrawlAt),
  ],
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

export const excludedUsers = pgTable('excluded_users', {
  githubId: text('github_id').primaryKey(),
  login: text('login').notNull(),
  excludedAt: timestamp('excluded_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const discoveryCandidates = pgTable(
  'discovery_candidates',
  {
    githubId: text('github_id').primaryKey(),
    login: text('login').notNull(),
    rawLocation: text('raw_location'),
    bio: text('bio'),
    company: text('company'),
    blog: text('blog'),
    source: discoverySourceEnum('source').notNull(),
    // Where the candidate came from: a seed login, org login, or owner/repo.
    discoveredVia: text('discovered_via'),
    confidence: doublePrecision('confidence'),
    signals: jsonb('signals')
      .$type<CandidateSignals>()
      .notNull()
      .default({ reasons: [] }),
    status: candidateStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastEvaluatedAt: timestamp('last_evaluated_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_candidates_status').on(table.status),
    index('idx_candidates_confidence').on(table.confidence),
  ],
);

export const discoveryRuns = pgTable('discovery_runs', {
  id: serial('id').primaryKey(),
  startedAt: timestamp('started_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  // Total candidates newly enqueued this run, broken down per source.
  candidatesDiscovered: integer('candidates_discovered').notNull().default(0),
  candidatesEvaluated: integer('candidates_evaluated').notNull().default(0),
  candidatesAccepted: integer('candidates_accepted').notNull().default(0),
  candidatesRejected: integer('candidates_rejected').notNull().default(0),
  // Per-source breakdown: { [source]: { discovered, accepted } }.
  sourceStats: jsonb('source_stats')
    .$type<Record<string, { discovered: number; accepted: number }>>()
    .notNull()
    .default({}),
  dryRun: integer('dry_run').notNull().default(0),
  status: syncStatusEnum('status').notNull().default('running'),
  errorMessage: text('error_message'),
});

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
export type ExcludedUser = typeof excludedUsers.$inferSelect;
export type Developer = typeof developers.$inferSelect;
export type DeveloperLanguage = typeof developerLanguages.$inferSelect;
export type SyncRun = typeof syncRuns.$inferSelect;
export type DiscoveryCandidate = typeof discoveryCandidates.$inferSelect;
export type DiscoveryRun = typeof discoveryRuns.$inferSelect;
export type DiscoverySource = (typeof discoverySourceEnum.enumValues)[number];
export type CandidateStatus = (typeof candidateStatusEnum.enumValues)[number];
