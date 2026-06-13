import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LOCATION_SEEDS } from '../db/locations.data';
import { EnrichmentCacheService } from './enrichment-cache.service';
import type { Location, TopLanguage } from '../db/schema';

type GitHubSearchUser = {
  databaseId: number;
  login: string;
  name: string | null;
  avatarUrl: string;
  location: string | null;
  followers: { totalCount: number };
  url: string;
};

type SearchResponse = {
  data?: {
    search: {
      userCount: number;
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
      nodes: GitHubSearchUser[];
    };
    rateLimit: RateLimit;
  };
  errors?: Array<{ message: string; type?: string }>;
};

type RateLimit = {
  remaining: number;
  resetAt: string;
};

type EnrichmentUser = {
  contributionsCollection: {
    contributionCalendar: {
      totalContributions: number;
    };
    totalCommitContributions: number;
    totalPullRequestReviewContributions: number;
  } | null;
  pullRequests: {
    totalCount: number;
  } | null;
  issues: {
    totalCount: number;
  } | null;
  starRepos: {
    nodes: Array<{ stargazerCount: number } | null>;
  } | null;
  langRepos: {
    nodes: Array<LanguageRepo>;
  } | null;
} | null;

type LanguageRepo = {
  languages: {
    edges: Array<{ size: number; node: { name: string } | null } | null>;
  } | null;
} | null;

const SEARCH_PAGE_SIZE = 50;
const NEIGHBOR_PAGE_SIZE = 100;
const ORG_MEMBER_PAGE_SIZE = 100;
const REST_PAGE_SIZE = 100;
const SEARCH_MAX_PAGES = 20;
const SLICE_THRESHOLD = 950;
const ENRICHMENT_BATCH_SIZE = 5;
const PROFILE_BATCH_SIZE = 20;
const LANGUAGES_REPO_LIMIT = 30;
const TOP_LANGUAGES_COUNT = 5;
const GITHUB_SEARCH_START = new Date('2008-01-01');
const MAX_GRAPHQL_RETRIES = 3;

// Secondary slicing dimension for single-day ranges that still exceed the ~1000
// result cap. Buckets are mutually exclusive and cover the full follower range.
const FOLLOWER_BUCKETS = [
  '0..2',
  '3..10',
  '11..30',
  '31..100',
  '101..500',
  '>500',
];

const USER_QUERY = `
  query FetchUser($login: String!) {
    user(login: $login) {
      databaseId
      login
      name
      avatarUrl
      location
      url
      followers {
        totalCount
      }
    }
    rateLimit {
      remaining
      resetAt
    }
  }
`;

const SEARCH_QUERY = `
  query SearchUsers($query: String!, $cursor: String) {
    search(type: USER, query: $query, first: ${SEARCH_PAGE_SIZE}, after: $cursor) {
      userCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ... on User {
          databaseId
          login
          name
          avatarUrl
          location
          url
          followers {
            totalCount
          }
        }
      }
    }
    rateLimit {
      remaining
      resetAt
    }
  }
`;

const ORG_MEMBERS_QUERY = `
  query OrgMembers($org: String!, $cursor: String) {
    organization(login: $org) {
      membersWithRole(first: ${ORG_MEMBER_PAGE_SIZE}, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          databaseId
          login
        }
      }
    }
    rateLimit {
      remaining
      resetAt
    }
  }
`;

export type GitHubSearchHit = {
  githubId: string;
  login: string;
  name: string | null;
  avatarUrl: string;
  rawLocation: string | null;
  followers: number;
  profileUrl: string;
};

export type GitHubEnrichment = {
  contributions: number;
  commits: number;
  prs: number;
  issues: number;
  reviews: number;
  totalStars: number;
  topLanguages: TopLanguage[];
};

export type GitHubUserResult = GitHubSearchHit & {
  enrichment: GitHubEnrichment | null;
};

// Lightweight profile used by the discovery pipeline to score candidates and to
// upsert accepted ones without a second lookup. Extends the search hit shape with
// the extra fields the Chile-confidence scorer relies on.
export type GitHubProfile = GitHubSearchHit & {
  bio: string | null;
  company: string | null;
  blog: string | null;
  following: number;
};

type ProfileUser = {
  databaseId: number | null;
  login: string;
  name: string | null;
  avatarUrl: string;
  location: string | null;
  bio: string | null;
  company: string | null;
  websiteUrl: string | null;
  url: string;
  followers: { totalCount: number };
  following: { totalCount: number };
} | null;

export type NeighborDirection = 'followers' | 'following';

export type GitHubNeighbor = {
  githubId: string;
  login: string;
};

type ConnectionNode = { databaseId: number | null; login: string } | null;

type UserConnection = {
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  nodes: ConnectionNode[];
};

type NeighborResponse = {
  data?: {
    user: Record<NeighborDirection, UserConnection> | null;
    rateLimit?: RateLimit;
  };
  errors?: Array<{ message: string }>;
};

type OrgMembersResponse = {
  data?: {
    organization: { membersWithRole: UserConnection } | null;
    rateLimit?: RateLimit;
  };
  errors?: Array<{ message: string }>;
};

type RepoContributor = { id: number; login: string; type: string };

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);
  private readonly token: string;
  private rateLimitState: RateLimit | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly enrichmentCache: EnrichmentCacheService,
  ) {
    this.token = this.config.getOrThrow<string>('GITHUB_TOKEN');
  }

  async fetchUserByLogin(login: string): Promise<GitHubUserResult | null> {
    const response = await this.graphql<{
      data?: {
        user: GitHubSearchUser | null;
        rateLimit?: RateLimit;
      };
      errors?: Array<{ message: string }>;
    }>(USER_QUERY, { login });

    if (response.errors?.length) {
      throw new Error(this.formatGraphqlErrors(response.errors));
    }

    const node = response.data?.user;
    if (!node?.login) {
      return null;
    }

    const enrichment = await this.enrichUsers([node.login]);
    const hit = this.toSearchHit(node);

    if (!enrichment.has(node.login)) {
      this.logger.warn(`Enrichment missing for @${node.login}`);
      return { ...hit, enrichment: null };
    }

    return { ...hit, enrichment: enrichment.get(node.login)! };
  }

  async searchUsersByLocation(
    locationTerm: string,
    onPage?: (users: GitHubSearchHit[]) => Promise<void>,
  ): Promise<GitHubSearchHit[]> {
    const allUsers: GitHubSearchHit[] = [];

    const collectPage = async (users: GitHubSearchHit[]) => {
      if (onPage) {
        await onPage(users);
      } else {
        allUsers.push(...users);
      }
    };

    await this.searchDateRange(
      locationTerm,
      GITHUB_SEARCH_START,
      new Date(),
      collectPage,
    );

    return allUsers;
  }

  async enrichUsers(logins: string[]): Promise<Map<string, GitHubEnrichment>> {
    const enrichment = new Map<string, GitHubEnrichment>();
    if (logins.length === 0) {
      return enrichment;
    }

    let cached = new Map<string, GitHubEnrichment>();
    try {
      cached = await this.enrichmentCache.getMany(logins);
    } catch (error) {
      this.logger.warn(
        `Enrichment cache read failed, continuing without cache: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    const misses: string[] = [];

    for (const login of logins) {
      const hit = cached.get(login);
      if (hit) {
        enrichment.set(login, hit);
        this.logger.debug(`Enrichment cache hit for @${login}`);
      } else {
        misses.push(login);
      }
    }

    const newlyFetched = new Map<string, GitHubEnrichment>();

    for (let i = 0; i < misses.length; i += ENRICHMENT_BATCH_SIZE) {
      const batch = misses.slice(i, i + ENRICHMENT_BATCH_SIZE);
      const query = this.buildEnrichmentQuery(batch);

      const response = await this.graphql<{
        data?: Record<string, EnrichmentUser> & { rateLimit?: RateLimit };
        errors?: Array<{ message: string }>;
      }>(query, {});

      if (response.errors?.length) {
        this.logger.warn(
          `Enrichment batch failed for ${batch.join(', ')}: ${this.formatGraphqlErrors(response.errors)}`,
        );
        continue;
      }

      batch.forEach((login, index) => {
        const user = response.data?.[`u${index}`];
        if (!user) {
          this.logger.warn(`Enrichment data missing for @${login}`);
          return;
        }

        const stats: GitHubEnrichment = {
          contributions:
            user?.contributionsCollection?.contributionCalendar
              .totalContributions ?? 0,
          commits: user?.contributionsCollection?.totalCommitContributions ?? 0,
          prs: user?.pullRequests?.totalCount ?? 0,
          issues: user?.issues?.totalCount ?? 0,
          reviews:
            user?.contributionsCollection
              ?.totalPullRequestReviewContributions ?? 0,
          totalStars: this.sumPublicRepoStars(user?.starRepos?.nodes),
          topLanguages: this.aggregateTopLanguages(user?.langRepos?.nodes),
        };
        enrichment.set(login, stats);
        newlyFetched.set(login, stats);
        this.logger.log(
          `Enriched @${login}: ${stats.commits} commits, ${stats.prs} PRs, ${stats.reviews} reviews, ${stats.contributions} contributions, ${stats.totalStars} stars, languages=[${stats.topLanguages.map((l) => l.name).join(', ')}]`,
        );
      });
    }

    if (newlyFetched.size > 0) {
      try {
        await this.enrichmentCache.setMany(newlyFetched);
      } catch (error) {
        this.logger.warn(
          `Enrichment cache write failed, continuing with fresh data: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return enrichment;
  }

  /**
   * Batch-fetch lightweight profiles (location, bio, company, website, follower
   * counts) for a set of logins. Used by the discovery pipeline to score
   * candidates cheaply (1 GraphQL point per user) before deciding to enrich.
   */
  async fetchProfiles(logins: string[]): Promise<Map<string, GitHubProfile>> {
    const profiles = new Map<string, GitHubProfile>();
    if (logins.length === 0) {
      return profiles;
    }

    for (let i = 0; i < logins.length; i += PROFILE_BATCH_SIZE) {
      const batch = logins.slice(i, i + PROFILE_BATCH_SIZE);
      const query = this.buildProfileQuery(batch);

      const response = await this.graphql<{
        data?: Record<string, ProfileUser> & { rateLimit?: RateLimit };
        errors?: Array<{ message: string }>;
      }>(query, {});

      if (response.errors?.length) {
        this.logger.warn(
          `Profile batch failed for ${batch.join(', ')}: ${this.formatGraphqlErrors(response.errors)}`,
        );
        continue;
      }

      batch.forEach((login, index) => {
        const user = response.data?.[`u${index}`];
        if (!user?.databaseId) {
          return;
        }

        profiles.set(login, {
          githubId: String(user.databaseId),
          login: user.login,
          name: user.name,
          avatarUrl: user.avatarUrl,
          rawLocation: user.location,
          followers: user.followers.totalCount,
          following: user.following.totalCount,
          profileUrl: user.url,
          bio: user.bio,
          company: user.company,
          blog: user.websiteUrl,
        });
      });
    }

    return profiles;
  }

  /**
   * Fetch the followers or following of a single user (the social-graph snowball).
   * Bounded by `maxPages` to keep per-seed cost predictable.
   */
  async fetchNeighbors(
    login: string,
    direction: NeighborDirection,
    maxPages: number,
  ): Promise<GitHubNeighbor[]> {
    const neighbors: GitHubNeighbor[] = [];
    let cursor: string | null = null;
    let page = 0;

    const query = this.buildNeighborQuery(direction);

    while (page < maxPages) {
      const response: NeighborResponse = await this.graphql<NeighborResponse>(
        query,
        { login, cursor },
      );

      if (response.errors?.length) {
        this.logger.warn(
          `Neighbor fetch failed for @${login} (${direction}): ${this.formatGraphqlErrors(response.errors)}`,
        );
        break;
      }

      const connection = response.data?.user?.[direction];
      if (!connection) {
        break;
      }

      for (const node of connection.nodes) {
        if (node?.databaseId && node.login) {
          neighbors.push({
            githubId: String(node.databaseId),
            login: node.login,
          });
        }
      }

      if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) {
        break;
      }

      cursor = connection.pageInfo.endCursor;
      page += 1;
    }

    return neighbors;
  }

  /** Fetch the visible members of a GitHub organization. */
  async fetchOrgMembers(
    org: string,
    maxPages: number,
  ): Promise<GitHubNeighbor[]> {
    const members: GitHubNeighbor[] = [];
    let cursor: string | null = null;
    let page = 0;

    while (page < maxPages) {
      const response: OrgMembersResponse =
        await this.graphql<OrgMembersResponse>(ORG_MEMBERS_QUERY, {
          org,
          cursor,
        });

      if (response.errors?.length) {
        this.logger.warn(
          `Org member fetch failed for ${org}: ${this.formatGraphqlErrors(response.errors)}`,
        );
        break;
      }

      const connection = response.data?.organization?.membersWithRole;
      if (!connection) {
        break;
      }

      for (const node of connection.nodes) {
        if (node?.databaseId && node.login) {
          members.push({
            githubId: String(node.databaseId),
            login: node.login,
          });
        }
      }

      if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) {
        break;
      }

      cursor = connection.pageInfo.endCursor;
      page += 1;
    }

    return members;
  }

  /**
   * Fetch contributors of a public repository via the REST API (the GraphQL API
   * has no contributors connection). Returns logins + numeric ids.
   */
  async fetchRepoContributors(
    ownerRepo: string,
    maxPages: number,
  ): Promise<GitHubNeighbor[]> {
    const [owner, repo] = ownerRepo.split('/');
    if (!owner || !repo) {
      this.logger.warn(`Invalid repo seed "${ownerRepo}", expected owner/repo`);
      return [];
    }

    const contributors: GitHubNeighbor[] = [];

    for (let page = 1; page <= maxPages; page += 1) {
      const url = `https://api.github.com/repos/${owner}/${repo}/contributors?per_page=${REST_PAGE_SIZE}&page=${page}&anon=false`;
      const rows = await this.restGet<RepoContributor[]>(url);

      if (!rows || rows.length === 0) {
        break;
      }

      for (const row of rows) {
        if (row.type === 'User' && row.login && row.id) {
          contributors.push({ githubId: String(row.id), login: row.login });
        }
      }

      if (rows.length < REST_PAGE_SIZE) {
        break;
      }
    }

    return contributors;
  }

  private buildNeighborQuery(direction: NeighborDirection): string {
    return `
      query Neighbors($login: String!, $cursor: String) {
        user(login: $login) {
          ${direction}(first: ${NEIGHBOR_PAGE_SIZE}, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              databaseId
              login
            }
          }
        }
        rateLimit {
          remaining
          resetAt
        }
      }
    `;
  }

  private buildProfileQuery(logins: string[]): string {
    const userFields = logins
      .map(
        (login, index) => `
      u${index}: user(login: ${JSON.stringify(login)}) {
        databaseId
        login
        name
        avatarUrl
        location
        bio
        company
        websiteUrl
        url
        followers {
          totalCount
        }
        following {
          totalCount
        }
      }`,
      )
      .join('\n');

    return `
      query BatchProfiles {
        ${userFields}
        rateLimit {
          remaining
          resetAt
        }
      }
    `;
  }

  private async searchDateRange(
    locationTerm: string,
    start: Date,
    end: Date,
    onPage: (users: GitHubSearchHit[]) => Promise<void>,
  ): Promise<void> {
    const query = this.buildLocationQuery(locationTerm, start, end);
    const probe = await this.fetchSearchPage(query, null);

    if (probe.userCount > SLICE_THRESHOLD) {
      if (this.canSplitDateRange(start, end)) {
        const mid = this.midpointDate(start, end);
        const nextDay = this.addDays(mid, 1);

        this.logger.debug(
          `Splitting "${locationTerm}" (${probe.userCount} users) ${this.formatDate(start)}..${this.formatDate(end)}`,
        );

        await this.searchDateRange(locationTerm, start, mid, onPage);
        if (nextDay <= end) {
          await this.searchDateRange(locationTerm, nextDay, end, onPage);
        }
        return;
      }

      // The date range is already a single day but still exceeds GitHub's ~1000
      // result cap. Slice along a second dimension (follower count) so we can
      // reach users that pagination alone would truncate.
      this.logger.debug(
        `Date range exhausted for "${locationTerm}" (${probe.userCount} users on ${this.formatDate(start)}), slicing by followers`,
      );
      await this.searchByFollowerBuckets(locationTerm, start, end, onPage);
      return;
    }

    await this.paginateSearch(query, onPage);
  }

  private async searchByFollowerBuckets(
    locationTerm: string,
    start: Date,
    end: Date,
    onPage: (users: GitHubSearchHit[]) => Promise<void>,
  ): Promise<void> {
    for (const bucket of FOLLOWER_BUCKETS) {
      const query = this.buildLocationQuery(locationTerm, start, end, bucket);
      await this.paginateSearch(query, onPage);
    }
  }

  private async paginateSearch(
    query: string,
    onPage: (users: GitHubSearchHit[]) => Promise<void>,
  ): Promise<void> {
    let cursor: string | null = null;
    let page = 0;

    while (page < SEARCH_MAX_PAGES) {
      const result = await this.fetchSearchPage(query, cursor);
      const hits = result.nodes
        .filter((node) => node?.login)
        .map((node) => this.toSearchHit(node));

      if (hits.length > 0) {
        await onPage(hits);
      }

      if (!result.hasNextPage || !result.endCursor) {
        break;
      }

      cursor = result.endCursor;
      page += 1;
    }
  }

  private async fetchSearchPage(
    query: string,
    cursor: string | null,
  ): Promise<{
    userCount: number;
    nodes: GitHubSearchUser[];
    hasNextPage: boolean;
    endCursor: string | null;
  }> {
    const response: SearchResponse = await this.graphql<SearchResponse>(
      SEARCH_QUERY,
      { query, cursor },
    );

    if (response.errors?.length) {
      throw new Error(this.formatGraphqlErrors(response.errors));
    }

    const search = response.data?.search;
    if (!search) {
      return {
        userCount: 0,
        nodes: [],
        hasNextPage: false,
        endCursor: null,
      };
    }

    return {
      userCount: search.userCount,
      nodes: search.nodes,
      hasNextPage: search.pageInfo.hasNextPage,
      endCursor: search.pageInfo.endCursor,
    };
  }

  private buildLocationQuery(
    locationTerm: string,
    start: Date,
    end: Date,
    followersClause?: string,
  ): string {
    const escaped = locationTerm.replace(/"/g, '\\"');
    const base = `location:"${escaped}"`;
    const startStr = this.formatDate(start);
    const endStr = this.formatDate(end);
    const followers = followersClause ? ` followers:${followersClause}` : '';

    if (startStr === endStr) {
      return `${base} created:${startStr}${followers}`;
    }

    return `${base} created:${startStr}..${endStr}${followers}`;
  }

  private buildEnrichmentQuery(logins: string[]): string {
    const userFields = logins
      .map(
        (login, index) => `
      u${index}: user(login: ${JSON.stringify(login)}) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
          }
          totalCommitContributions
          totalPullRequestReviewContributions
        }
        pullRequests {
          totalCount
        }
        issues {
          totalCount
        }
        starRepos: repositories(
          ownerAffiliations: OWNER
          isFork: false
          privacy: PUBLIC
          first: 100
          orderBy: {field: STARGAZERS, direction: DESC}
        ) {
          nodes {
            stargazerCount
          }
        }
        langRepos: repositories(
          ownerAffiliations: OWNER
          isFork: false
          privacy: PUBLIC
          first: ${LANGUAGES_REPO_LIMIT}
          orderBy: {field: STARGAZERS, direction: DESC}
        ) {
          nodes {
            languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
              edges {
                size
                node {
                  name
                }
              }
            }
          }
        }
      }`,
      )
      .join('\n');

    return `
      query BatchEnrich {
        ${userFields}
        rateLimit {
          remaining
          resetAt
        }
      }
    `;
  }

  private aggregateTopLanguages(
    nodes: Array<LanguageRepo> | undefined,
  ): TopLanguage[] {
    const byteTotals = new Map<string, number>();

    for (const repo of nodes ?? []) {
      for (const edge of repo?.languages?.edges ?? []) {
        const name = edge?.node?.name;
        if (!name) {
          continue;
        }

        byteTotals.set(name, (byteTotals.get(name) ?? 0) + edge.size);
      }
    }

    const totalBytes = [...byteTotals.values()].reduce(
      (sum, bytes) => sum + bytes,
      0,
    );
    if (totalBytes === 0) {
      return [];
    }

    return [...byteTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_LANGUAGES_COUNT)
      .map(([name, bytes]) => ({
        name,
        share: Math.round((bytes / totalBytes) * 100),
      }));
  }

  private sumPublicRepoStars(
    nodes: Array<{ stargazerCount: number } | null> | undefined,
  ): number {
    if (!nodes?.length) {
      return 0;
    }

    return nodes.reduce((sum, repo) => sum + (repo?.stargazerCount ?? 0), 0);
  }

  classifyLocation(
    rawLocation: string | null,
    allLocations: Location[],
  ): Location {
    const country = allLocations.find((l) => l.slug === 'chile')!;

    if (!rawLocation) {
      return country;
    }

    const normalized = this.normalize(rawLocation);

    if (this.isCountryLevel(normalized)) {
      return country;
    }

    const cities = allLocations.filter((l) => l.kind === 'city');
    const regions = allLocations.filter((l) => l.kind === 'region');

    for (const city of cities) {
      if (this.matchesLocation(normalized, city)) {
        return city;
      }
    }

    for (const region of regions) {
      if (this.matchesLocation(normalized, region)) {
        return region;
      }
    }

    return country;
  }

  private matchesLocation(normalized: string, location: Location): boolean {
    const terms = [
      this.normalize(location.name),
      ...location.searchTerms.map((t) => this.normalize(t)),
    ];

    return terms.some(
      (term) =>
        normalized.includes(term) ||
        term.includes(normalized) ||
        this.fuzzyMatch(normalized, term),
    );
  }

  private fuzzyMatch(a: string, b: string): boolean {
    if (a.length < 3 || b.length < 3) {
      return false;
    }
    return a.startsWith(b) || b.startsWith(a);
  }

  private isCountryLevel(normalized: string): boolean {
    const countryTerms = LOCATION_SEEDS.find(
      (l) => l.slug === 'chile',
    )!.searchTerms.map((t) => this.normalize(t));
    // Exact match only — "Santiago, Chile" must not be treated as country-only.
    return countryTerms.some((term) => normalized === term);
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private toSearchHit(node: GitHubSearchUser): GitHubSearchHit {
    return {
      githubId: String(node.databaseId),
      login: node.login,
      name: node.name,
      avatarUrl: node.avatarUrl,
      rawLocation: node.location,
      followers: node.followers.totalCount,
      profileUrl: node.url,
    };
  }

  private canSplitDateRange(start: Date, end: Date): boolean {
    return this.formatDate(start) !== this.formatDate(end);
  }

  private midpointDate(start: Date, end: Date): Date {
    const midpointMs = Math.floor((start.getTime() + end.getTime()) / 2);
    return new Date(midpointMs);
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private formatGraphqlErrors(errors: Array<{ message: string }>): string {
    const unique = [...new Set(errors.map((e) => e.message))];
    return unique.join('; ');
  }

  private async paceBeforeRequest(): Promise<void> {
    const state = this.rateLimitState;
    if (!state) {
      return;
    }

    if (state.remaining < 50) {
      this.logger.warn(
        `Rate limit critical: ${state.remaining} points remaining, pausing until ${state.resetAt}`,
      );
      await this.waitForRateLimit(state.resetAt);
      return;
    }

    if (state.remaining < 200) {
      this.logger.warn(
        `Rate limit low: ${state.remaining} points remaining, throttling 300ms`,
      );
      await this.sleep(300);
    } else if (state.remaining < 500) {
      this.logger.warn(
        `Rate limit moderate: ${state.remaining} points remaining, throttling 100ms`,
      );
      await this.sleep(100);
    }
  }

  private updateRateLimit(rateLimit?: RateLimit): void {
    if (rateLimit) {
      this.rateLimitState = rateLimit;
    }
  }

  private async graphql<T>(
    query: string,
    variables: Record<string, unknown>,
    attempt = 0,
  ): Promise<T> {
    await this.paceBeforeRequest();

    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'chile-devs',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (
      (response.status === 403 || response.status === 429) &&
      attempt < MAX_GRAPHQL_RETRIES
    ) {
      const retryAfter = response.headers.get('retry-after');
      if (retryAfter) {
        const waitMs = Number(retryAfter) * 1000 + 1000;
        this.logger.warn(
          `Secondary rate limit hit (HTTP ${response.status}), waiting ${Math.ceil(waitMs / 1000)}s before retry (attempt ${attempt + 1}/${MAX_GRAPHQL_RETRIES})`,
        );
        await this.sleep(waitMs);
        return this.graphql(query, variables, attempt + 1);
      }

      const resetHeader = response.headers.get('x-ratelimit-reset');
      if (resetHeader) {
        const resetAt = new Date(Number(resetHeader) * 1000).toISOString();
        this.logger.warn(
          `Primary rate limit hit (HTTP ${response.status}), waiting until ${resetAt} (attempt ${attempt + 1}/${MAX_GRAPHQL_RETRIES})`,
        );
        await this.waitForRateLimit(resetAt);
        return this.graphql(query, variables, attempt + 1);
      }

      this.logger.warn(
        `Rate limit response (HTTP ${response.status}) with no Retry-After or x-ratelimit-reset header`,
      );
    }

    if (response.status >= 500 && attempt < MAX_GRAPHQL_RETRIES) {
      const backoffMs = Math.min(1000 * 2 ** attempt, 10_000);
      this.logger.warn(
        `GitHub API ${response.status}, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${MAX_GRAPHQL_RETRIES})`,
      );
      await this.sleep(backoffMs);
      return this.graphql(query, variables, attempt + 1);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API error ${response.status}: ${text}`);
    }

    const body = (await response.json()) as T & {
      data?: { rateLimit?: RateLimit };
      errors?: Array<{ message: string; type?: string }>;
    };

    if (body.data?.rateLimit) {
      this.updateRateLimit(body.data.rateLimit);
    }

    if (
      body.errors?.some((error) => error.type === 'RATE_LIMITED') &&
      attempt < MAX_GRAPHQL_RETRIES
    ) {
      const backoffMs = 5000 * (attempt + 1);
      this.logger.warn(
        `GraphQL RATE_LIMITED, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${MAX_GRAPHQL_RETRIES})`,
      );
      await this.sleep(backoffMs);
      return this.graphql(query, variables, attempt + 1);
    }

    return body;
  }

  private async restGet<T>(url: string, attempt = 0): Promise<T | null> {
    await this.paceBeforeRequest();

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'chile-devs',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (
      (response.status === 403 || response.status === 429) &&
      attempt < MAX_GRAPHQL_RETRIES
    ) {
      const retryAfter = response.headers.get('retry-after');
      if (retryAfter) {
        await this.sleep(Number(retryAfter) * 1000 + 1000);
        return this.restGet<T>(url, attempt + 1);
      }

      const resetHeader = response.headers.get('x-ratelimit-reset');
      if (resetHeader) {
        await this.waitForRateLimit(
          new Date(Number(resetHeader) * 1000).toISOString(),
        );
        return this.restGet<T>(url, attempt + 1);
      }
    }

    if (response.status >= 500 && attempt < MAX_GRAPHQL_RETRIES) {
      await this.sleep(Math.min(1000 * 2 ** attempt, 10_000));
      return this.restGet<T>(url, attempt + 1);
    }

    if (!response.ok) {
      this.logger.warn(`REST GET ${url} failed: HTTP ${response.status}`);
      return null;
    }

    return (await response.json()) as T;
  }

  private async waitForRateLimit(resetAt: string): Promise<void> {
    const resetTime = new Date(resetAt).getTime();
    const waitMs = Math.max(resetTime - Date.now() + 1000, 1000);
    const remaining = this.rateLimitState?.remaining;
    this.logger.warn(
      `Rate limit exhausted${remaining != null ? ` (${remaining} points left)` : ''}, waiting ${Math.ceil(waitMs / 1000)}s until ${resetAt}`,
    );
    await this.sleep(waitMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
