import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LOCATION_SEEDS } from '../db/locations.data';
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
const SEARCH_MAX_PAGES = 20;
const SLICE_THRESHOLD = 950;
const ENRICHMENT_BATCH_SIZE = 5;
const LANGUAGES_REPO_LIMIT = 30;
const TOP_LANGUAGES_COUNT = 5;
const GITHUB_SEARCH_START = new Date('2008-01-01');
const MAX_GRAPHQL_RETRIES = 3;

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
  totalStars: number;
  topLanguages: TopLanguage[];
};

export type GitHubUserResult = GitHubSearchHit & GitHubEnrichment;

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);
  private readonly token: string;
  private rateLimitState: RateLimit | null = null;

  constructor(private readonly config: ConfigService) {
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
    const stats = enrichment.get(node.login) ?? {
      contributions: 0,
      totalStars: 0,
      topLanguages: [],
    };

    return { ...this.toSearchHit(node), ...stats };
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

    for (let i = 0; i < logins.length; i += ENRICHMENT_BATCH_SIZE) {
      const batch = logins.slice(i, i + ENRICHMENT_BATCH_SIZE);
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
        const stats: GitHubEnrichment = {
          contributions:
            user?.contributionsCollection?.contributionCalendar
              .totalContributions ?? 0,
          totalStars: this.sumPublicRepoStars(user?.starRepos?.nodes),
          topLanguages: this.aggregateTopLanguages(user?.langRepos?.nodes),
        };
        enrichment.set(login, stats);
        this.logger.log(
          `Enriched @${login}: ${stats.contributions} contributions, ${stats.totalStars} stars, languages=[${stats.topLanguages.map((l) => l.name).join(', ')}]`,
        );
      });
    }

    return enrichment;
  }

  private async searchDateRange(
    locationTerm: string,
    start: Date,
    end: Date,
    onPage: (users: GitHubSearchHit[]) => Promise<void>,
  ): Promise<void> {
    const query = this.buildLocationQuery(locationTerm, start, end);
    const probe = await this.fetchSearchPage(query, null);

    if (
      probe.userCount > SLICE_THRESHOLD &&
      this.canSplitDateRange(start, end)
    ) {
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

    await this.paginateSearch(query, onPage);
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
  ): string {
    const escaped = locationTerm.replace(/"/g, '\\"');
    const base = `location:"${escaped}"`;
    const startStr = this.formatDate(start);
    const endStr = this.formatDate(end);

    if (startStr === endStr) {
      return `${base} created:${startStr}`;
    }

    return `${base} created:${startStr}..${endStr}`;
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

    if (this.isCountryLevel(normalized)) {
      return country;
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
    return countryTerms.some(
      (term) => normalized === term || normalized.includes(term),
    );
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

    if (response.status === 403 || response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      if (retryAfter) {
        const waitMs = Number(retryAfter) * 1000 + 1000;
        this.logger.warn(
          `Secondary rate limit hit (HTTP ${response.status}), waiting ${Math.ceil(waitMs / 1000)}s before retry`,
        );
        await this.sleep(waitMs);
        return this.graphql(query, variables, attempt);
      }

      const resetHeader = response.headers.get('x-ratelimit-reset');
      if (resetHeader) {
        const resetAt = new Date(Number(resetHeader) * 1000).toISOString();
        this.logger.warn(
          `Primary rate limit hit (HTTP ${response.status}), waiting until ${resetAt}`,
        );
        await this.waitForRateLimit(resetAt);
        return this.graphql(query, variables, attempt);
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
