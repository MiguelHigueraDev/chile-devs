import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LOCATION_SEEDS } from '../db/locations.data';
import type { Location } from '../db/schema';

type GitHubSearchUser = {
  id: string;
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
  errors?: Array<{ message: string }>;
};

type RateLimit = {
  remaining: number;
  resetAt: string;
};

type ContributionsUser = {
  contributionsCollection: {
    contributionCalendar: {
      totalContributions: number;
    };
  } | null;
} | null;

type StarsUser = {
  repositories: {
    nodes: Array<{ stargazerCount: number } | null>;
  } | null;
} | null;

const SEARCH_PAGE_SIZE = 50;
const CONTRIBUTIONS_BATCH_SIZE = 10;
const STARS_BATCH_SIZE = 5;

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
          id
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

export type GitHubUserResult = {
  githubId: string;
  login: string;
  name: string | null;
  avatarUrl: string;
  rawLocation: string | null;
  followers: number;
  contributions: number;
  totalStars: number;
  profileUrl: string;
};

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);
  private readonly token: string;

  constructor(private readonly config: ConfigService) {
    this.token = this.config.getOrThrow<string>('GITHUB_TOKEN');
  }

  async searchUsersByLocation(
    locationTerm: string,
    onPage?: (users: GitHubUserResult[]) => Promise<void>,
  ): Promise<GitHubUserResult[]> {
    const query = `location:"${locationTerm.replace(/"/g, '\\"')}"`;
    const allUsers: GitHubUserResult[] = [];
    let cursor: string | null = null;
    let page = 0;
    const maxPages = 10; // GitHub caps at ~1000 results

    while (page < maxPages) {
      const response: SearchResponse = await this.graphql<SearchResponse>(
        SEARCH_QUERY,
        { query, cursor },
      );

      if (response.errors?.length) {
        throw new Error(this.formatGraphqlErrors(response.errors));
      }

      const search = response.data?.search;
      const rateLimit = response.data?.rateLimit;

      if (!search) {
        break;
      }

      const baseUsers = search.nodes.filter((node) => node?.login);
      const contributions = await this.fetchContributionsBatch(
        baseUsers.map((u) => u.login),
        rateLimit,
      );
      const totalStars = await this.fetchStarsBatch(
        baseUsers.map((u) => u.login),
        rateLimit,
      );

      const users = baseUsers.map((node) =>
        this.toUserResult(
          node,
          contributions.get(node.login) ?? 0,
          totalStars.get(node.login) ?? 0,
        ),
      );

      if (onPage) {
        await onPage(users);
      } else {
        allUsers.push(...users);
      }

      if (rateLimit && rateLimit.remaining < 50) {
        await this.waitForRateLimit(rateLimit.resetAt);
      }

      if (!search.pageInfo.hasNextPage || !search.pageInfo.endCursor) {
        break;
      }

      cursor = search.pageInfo.endCursor;
      page += 1;
      await this.sleep(300);
    }

    return allUsers;
  }

  private async fetchContributionsBatch(
    logins: string[],
    priorRateLimit?: RateLimit,
  ): Promise<Map<string, number>> {
    const contributions = new Map<string, number>();

    for (let i = 0; i < logins.length; i += CONTRIBUTIONS_BATCH_SIZE) {
      const batch = logins.slice(i, i + CONTRIBUTIONS_BATCH_SIZE);
      const query = this.buildContributionsQuery(batch);

      const response = await this.graphql<{
        data?: Record<string, ContributionsUser> & { rateLimit?: RateLimit };
        errors?: Array<{ message: string }>;
      }>(query, {});

      if (response.errors?.length) {
        this.logger.warn(
          `Contributions batch failed for ${batch.join(', ')}: ${this.formatGraphqlErrors(response.errors)}`,
        );
        continue;
      }

      batch.forEach((login, index) => {
        const user = response.data?.[`u${index}`];
        contributions.set(
          login,
          user?.contributionsCollection?.contributionCalendar
            .totalContributions ?? 0,
        );
      });

      const rateLimit = response.data?.rateLimit ?? priorRateLimit;
      if (rateLimit && rateLimit.remaining < 50) {
        await this.waitForRateLimit(rateLimit.resetAt);
      }

      if (i + CONTRIBUTIONS_BATCH_SIZE < logins.length) {
        await this.sleep(200);
      }
    }

    return contributions;
  }

  private async fetchStarsBatch(
    logins: string[],
    priorRateLimit?: RateLimit,
  ): Promise<Map<string, number>> {
    const stars = new Map<string, number>();

    for (let i = 0; i < logins.length; i += STARS_BATCH_SIZE) {
      const batch = logins.slice(i, i + STARS_BATCH_SIZE);
      const query = this.buildStarsQuery(batch);

      const response = await this.graphql<{
        data?: Record<string, StarsUser> & { rateLimit?: RateLimit };
        errors?: Array<{ message: string }>;
      }>(query, {});

      if (response.errors?.length) {
        this.logger.warn(
          `Stars batch failed for ${batch.join(', ')}: ${this.formatGraphqlErrors(response.errors)}`,
        );
        continue;
      }

      batch.forEach((login, index) => {
        const user = response.data?.[`u${index}`];
        stars.set(login, this.sumPublicRepoStars(user?.repositories?.nodes));
      });

      const rateLimit = response.data?.rateLimit ?? priorRateLimit;
      if (rateLimit && rateLimit.remaining < 50) {
        await this.waitForRateLimit(rateLimit.resetAt);
      }

      if (i + STARS_BATCH_SIZE < logins.length) {
        await this.sleep(200);
      }
    }

    return stars;
  }

  private buildStarsQuery(logins: string[]): string {
    const userFields = logins
      .map(
        (login, index) => `
      u${index}: user(login: ${JSON.stringify(login)}) {
        repositories(
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
      }`,
      )
      .join('\n');

    return `
      query BatchStars {
        ${userFields}
        rateLimit {
          remaining
          resetAt
        }
      }
    `;
  }

  private sumPublicRepoStars(
    nodes: Array<{ stargazerCount: number } | null> | undefined,
  ): number {
    if (!nodes?.length) {
      return 0;
    }

    return nodes.reduce((sum, repo) => sum + (repo?.stargazerCount ?? 0), 0);
  }

  private buildContributionsQuery(logins: string[]): string {
    const userFields = logins
      .map(
        (login, index) => `
      u${index}: user(login: ${JSON.stringify(login)}) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
          }
        }
      }`,
      )
      .join('\n');

    return `
      query BatchContributions {
        ${userFields}
        rateLimit {
          remaining
          resetAt
        }
      }
    `;
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

  private toUserResult(
    node: GitHubSearchUser,
    contributions: number,
    totalStars: number,
  ): GitHubUserResult {
    return {
      githubId: node.id,
      login: node.login,
      name: node.name,
      avatarUrl: node.avatarUrl,
      rawLocation: node.location,
      followers: node.followers.totalCount,
      contributions,
      totalStars,
      profileUrl: node.url,
    };
  }

  private formatGraphqlErrors(errors: Array<{ message: string }>): string {
    const unique = [...new Set(errors.map((e) => e.message))];
    return unique.join('; ');
  }

  private async graphql<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
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
      const resetHeader = response.headers.get('x-ratelimit-reset');
      if (resetHeader) {
        const resetAt = new Date(Number(resetHeader) * 1000).toISOString();
        await this.waitForRateLimit(resetAt);
        return this.graphql(query, variables);
      }
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API error ${response.status}: ${text}`);
    }

    return response.json() as Promise<T>;
  }

  private async waitForRateLimit(resetAt: string): Promise<void> {
    const resetTime = new Date(resetAt).getTime();
    const waitMs = Math.max(resetTime - Date.now() + 1000, 1000);
    this.logger.warn(`Rate limit low, waiting ${Math.ceil(waitMs / 1000)}s...`);
    await this.sleep(waitMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
