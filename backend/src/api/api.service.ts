import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
  sum,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DRIZZLE, type DrizzleDB } from '../db/db.module';
import { developers, locations, repoCandidates, syncRuns } from '../db/schema';
import { expandLocationSlugs } from '../search/geo.data';
import type { ReposListInput, ReposViewportInput } from './repos.dto';
import type { UpdateProfileInput } from './update-profile.dto';

const MAX_DEVELOPERS_PAGE_SIZE = 10;
const MAX_REPOS_PAGE_SIZE = 10;

export const DEVELOPER_SORT_KEYS = [
  'contributions',
  'followers',
  'stars',
  'rank',
] as const;

export type DeveloperSortKey = (typeof DEVELOPER_SORT_KEYS)[number];

export const DEFAULT_DEVELOPER_SORT: DeveloperSortKey = 'rank';

const SORT_COLUMNS: Record<DeveloperSortKey, AnyColumn> = {
  contributions: developers.contributions,
  followers: developers.followers,
  stars: developers.totalStars,
  rank: developers.rankScore,
};

type DeveloperCursor = {
  sort: DeveloperSortKey;
  value: number | null;
  githubId: string;
};

export function encodeCursor(
  sort: DeveloperSortKey,
  value: number | null,
  githubId: string,
): string {
  const encodedValue = value === null ? 'null' : String(value);
  return Buffer.from(`${sort}:${encodedValue}:${githubId}`).toString(
    'base64url',
  );
}

export function decodeCursor(
  cursor: string,
  expectedSort: DeveloperSortKey,
): DeveloperCursor | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const firstSep = decoded.indexOf(':');
    const lastSep = decoded.lastIndexOf(':');
    if (firstSep === -1 || lastSep === firstSep) {
      return null;
    }

    const sort = decoded.slice(0, firstSep) as DeveloperSortKey;
    const valueRaw = decoded.slice(firstSep + 1, lastSep);
    const value = valueRaw === 'null' ? null : Number(valueRaw);
    const githubId = decoded.slice(lastSep + 1);
    if (
      sort !== expectedSort ||
      !githubId ||
      !DEVELOPER_SORT_KEYS.includes(sort) ||
      (value !== null && !Number.isFinite(value)) ||
      (value === null && sort !== 'rank')
    ) {
      return null;
    }

    return { sort, value, githubId };
  } catch {
    return null;
  }
}

function buildDeveloperCursorFilter(
  sort: DeveloperSortKey,
  sortColumn: AnyColumn,
  decodedCursor: DeveloperCursor,
): SQL {
  const sortAscending = sort === 'rank';
  const { value, githubId } = decodedCursor;

  if (sort === 'rank' && sortAscending) {
    if (value === null) {
      return and(isNull(sortColumn), gt(developers.githubId, githubId))!;
    }
    return or(
      gt(sortColumn, value),
      and(eq(sortColumn, value), gt(developers.githubId, githubId)),
      isNull(sortColumn),
    )!;
  }

  const numericValue = value as number;
  return sortAscending
    ? or(
        gt(sortColumn, numericValue),
        and(eq(sortColumn, numericValue), gt(developers.githubId, githubId)),
      )!
    : or(
        lt(sortColumn, numericValue),
        and(eq(sortColumn, numericValue), gt(developers.githubId, githubId)),
      )!;
}

export function parseDeveloperSort(sort?: string): DeveloperSortKey {
  if (
    sort === 'contributions' ||
    sort === 'followers' ||
    sort === 'stars' ||
    sort === 'rank'
  ) {
    return sort;
  }
  return DEFAULT_DEVELOPER_SORT;
}

type RepoCursor = {
  stars: number;
  repoGithubId: string;
};

export function encodeRepoCursor(stars: number, repoGithubId: string): string {
  return Buffer.from(`stars:${stars}:${repoGithubId}`).toString('base64url');
}

export function decodeRepoCursor(cursor: string): RepoCursor | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const firstSep = decoded.indexOf(':');
    const lastSep = decoded.lastIndexOf(':');
    if (firstSep === -1 || lastSep === firstSep) {
      return null;
    }

    const sort = decoded.slice(0, firstSep);
    const stars = Number(decoded.slice(firstSep + 1, lastSep));
    const repoGithubId = decoded.slice(lastSep + 1);
    if (sort !== 'stars' || !Number.isFinite(stars) || !repoGithubId) {
      return null;
    }

    return { stars, repoGithubId };
  } catch {
    return null;
  }
}

type PromotedRepoRow = {
  repoGithubId: string;
  nameWithOwner: string;
  name: string;
  description: string | null;
  url: string;
  primaryLanguage: string | null;
  stars: number;
  forks: number;
  regionRank: number | null;
  countryRank: number | null;
  scatterLat: number | null;
  scatterLng: number | null;
  ownerLogin: string;
  ownerName: string | null;
  ownerAvatarUrl: string;
  ownerProfileUrl: string;
  regionSlug: string | null;
  regionName: string | null;
};

function mapPromotedRepoRow(row: PromotedRepoRow) {
  return {
    repoGithubId: row.repoGithubId,
    nameWithOwner: row.nameWithOwner,
    name: row.name,
    description: row.description,
    url: row.url,
    primaryLanguage: row.primaryLanguage,
    stars: row.stars,
    forks: row.forks,
    regionRank: row.regionRank,
    countryRank: row.countryRank,
    scope:
      row.regionRank != null ? ('regional' as const) : ('national' as const),
    lat: row.scatterLat ?? 0,
    lng: row.scatterLng ?? 0,
    owner: {
      login: row.ownerLogin,
      name: row.ownerName,
      avatarUrl: row.ownerAvatarUrl,
      profileUrl: row.ownerProfileUrl,
    },
    region:
      row.regionSlug && row.regionName
        ? {
            slug: row.regionSlug,
            name: row.regionName,
          }
        : null,
  };
}

function buildRepoCursorFilter(decodedCursor: RepoCursor): SQL {
  const { stars, repoGithubId } = decodedCursor;
  return or(
    lt(repoCandidates.stars, stars),
    and(
      eq(repoCandidates.stars, stars),
      gt(repoCandidates.repoGithubId, repoGithubId),
    ),
  )!;
}

@Injectable()
export class ApiService {
  private readonly logger = new Logger(ApiService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async getMapData() {
    const rows = await this.db
      .select({
        slug: locations.slug,
        name: locations.name,
        kind: locations.kind,
        lat: locations.lat,
        lng: locations.lng,
        devCount: count(developers.githubId),
        totalContributions: sum(developers.contributions),
      })
      .from(locations)
      .leftJoin(developers, eq(developers.locationId, locations.id))
      .where(ne(locations.kind, 'country'))
      .groupBy(
        locations.id,
        locations.slug,
        locations.name,
        locations.kind,
        locations.lat,
        locations.lng,
      )
      .having(sql`count(${developers.githubId}) > 0`);

    return rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      kind: row.kind,
      lat: Number(row.lat),
      lng: Number(row.lng),
      devCount: Number(row.devCount),
      totalContributions: Number(row.totalContributions ?? 0),
    }));
  }

  private async paginateDevelopers(
    limit: number,
    cursor: string | undefined,
    sort: DeveloperSortKey,
    locationIds?: number[],
  ) {
    const pageSize = Math.max(1, Math.min(limit, MAX_DEVELOPERS_PAGE_SIZE));
    let decodedCursor: DeveloperCursor | null = null;
    if (cursor) {
      decodedCursor = decodeCursor(cursor, sort);
      if (!decodedCursor) {
        throw new BadRequestException(
          'Invalid or mismatched pagination cursor',
        );
      }
    }
    const sortColumn = SORT_COLUMNS[sort];
    // rankScore is lower-is-better (S grade ≈ low score), unlike contributions/followers/stars.
    const sortAscending = sort === 'rank';

    const locationFilter =
      locationIds != null && locationIds.length > 0
        ? inArray(developers.locationId, locationIds)
        : undefined;
    const cursorFilter = decodedCursor
      ? buildDeveloperCursorFilter(sort, sortColumn, decodedCursor)
      : undefined;

    const filters = [locationFilter, cursorFilter].filter(Boolean);
    const whereClause =
      filters.length === 0
        ? undefined
        : filters.length === 1
          ? filters[0]
          : and(...filters);

    const devs = await this.db
      .select({
        githubId: developers.githubId,
        login: developers.login,
        name: developers.name,
        avatarUrl: developers.avatarUrl,
        contributions: developers.contributions,
        followers: developers.followers,
        totalStars: developers.totalStars,
        topLanguages: developers.topLanguages,
        rankLevel: developers.rankLevel,
        rankScore: developers.rankScore,
        percentileCl: developers.percentileCl,
        rankLocation: developers.rankLocation,
        rankCountry: developers.rankCountry,
        profileUrl: developers.profileUrl,
        rawLocation: developers.rawLocation,
      })
      .from(developers)
      .where(whereClause)
      .orderBy(
        ...(sort === 'rank'
          ? [
              asc(developers.rankScore),
              desc(developers.totalStars),
              desc(developers.followers),
              desc(developers.contributions),
              asc(developers.githubId),
            ]
          : [
              sortAscending ? asc(sortColumn) : desc(sortColumn),
              asc(developers.githubId),
            ]),
      )
      .limit(pageSize + 1);

    const hasMore = devs.length > pageSize;
    const pageDevs = hasMore ? devs.slice(0, pageSize) : devs;
    const lastDev = pageDevs.at(-1);
    const lastDevSortValue =
      sort === 'contributions'
        ? lastDev?.contributions
        : sort === 'followers'
          ? lastDev?.followers
          : sort === 'stars'
            ? lastDev?.totalStars
            : lastDev?.rankScore;
    const nextCursor =
      hasMore && lastDev && (lastDevSortValue != null || sort === 'rank')
        ? encodeCursor(
            sort,
            sort === 'rank' ? (lastDev.rankScore ?? null) : lastDevSortValue!,
            lastDev.githubId,
          )
        : null;

    const developersResponse = pageDevs.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ githubId: _githubId, ...developer }) => developer,
    );

    return {
      developers: developersResponse,
      nextCursor,
      hasMore,
      sort,
      isFirstPage: !decodedCursor,
    };
  }

  private async resolveLocationIdsForSlug(
    slug: string,
    kind: 'country' | 'region' | 'city',
  ): Promise<number[]> {
    const slugsToResolve =
      kind === 'region' ? [...expandLocationSlugs([slug])] : [slug];
    const rows = await this.db
      .select({ id: locations.id })
      .from(locations)
      .where(inArray(locations.slug, slugsToResolve));

    return rows.map((row) => row.id);
  }

  async getLocationDevelopers(
    slug: string,
    limit = MAX_DEVELOPERS_PAGE_SIZE,
    cursor?: string,
    sort: DeveloperSortKey = DEFAULT_DEVELOPER_SORT,
  ) {
    const [location] = await this.db
      .select()
      .from(locations)
      .where(eq(locations.slug, slug))
      .limit(1);

    if (!location) {
      return null;
    }

    const locationIds = await this.resolveLocationIdsForSlug(
      location.slug,
      location.kind,
    );

    if (locationIds.length === 0) {
      return null;
    }

    const page = await this.paginateDevelopers(
      limit,
      cursor,
      sort,
      locationIds,
    );

    if (!page.isFirstPage) {
      return {
        developers: page.developers,
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
        sort: page.sort,
      };
    }

    const locationFilter = inArray(developers.locationId, locationIds);

    const [{ devCount }] = await this.db
      .select({ devCount: count() })
      .from(developers)
      .where(locationFilter);

    const [{ totalContributions }] = await this.db
      .select({ totalContributions: sum(developers.contributions) })
      .from(developers)
      .where(locationFilter);

    return {
      location: {
        slug: location.slug,
        name: location.name,
        kind: location.kind,
        lat: Number(location.lat),
        lng: Number(location.lng),
      },
      devCount: Number(devCount),
      totalContributions: Number(totalContributions ?? 0),
      developers: page.developers,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      sort: page.sort,
    };
  }

  async getCountryDevelopers(
    limit = MAX_DEVELOPERS_PAGE_SIZE,
    cursor?: string,
    sort: DeveloperSortKey = DEFAULT_DEVELOPER_SORT,
  ) {
    const page = await this.paginateDevelopers(limit, cursor, sort);

    if (!page.isFirstPage) {
      return {
        developers: page.developers,
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
        sort: page.sort,
      };
    }

    const [{ devCount }] = await this.db
      .select({ devCount: count() })
      .from(developers);

    const [{ totalContributions }] = await this.db
      .select({ totalContributions: sum(developers.contributions) })
      .from(developers);

    return {
      devCount: Number(devCount),
      totalContributions: Number(totalContributions ?? 0),
      developers: page.developers,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      sort: page.sort,
    };
  }

  private mapDeveloperDetail(row: {
    login: string;
    name: string | null;
    avatarUrl: string;
    contributions: number;
    followers: number;
    totalStars: number;
    topLanguages: (typeof developers.$inferSelect)['topLanguages'];
    rankLevel: string | null;
    rankScore: number | null;
    percentileCl: number | null;
    rankLocation: number | null;
    rankCountry: number | null;
    profileUrl: string;
    rawLocation: string | null;
    portfolioUrl: string | null;
    description: string | null;
    role: string | null;
    claimedAt: Date | null;
    locationName: string;
    locationKind: 'country' | 'region' | 'city';
  }) {
    return {
      login: row.login,
      name: row.name,
      avatarUrl: row.avatarUrl,
      contributions: row.contributions,
      followers: row.followers,
      totalStars: row.totalStars,
      topLanguages: row.topLanguages,
      rankLevel: row.rankLevel,
      rankScore: row.rankScore,
      percentileCl: row.percentileCl,
      rankLocation: row.rankLocation,
      rankCountry: row.rankCountry,
      profileUrl: row.profileUrl,
      rawLocation: row.rawLocation,
      locationName: row.locationName,
      locationKind: row.locationKind,
      portfolioUrl: row.portfolioUrl,
      description: row.description,
      role: row.role,
      claimed: row.claimedAt != null,
    };
  }

  async getDeveloperByLogin(login: string) {
    const rows = await this.db
      .select({
        login: developers.login,
        name: developers.name,
        avatarUrl: developers.avatarUrl,
        contributions: developers.contributions,
        followers: developers.followers,
        totalStars: developers.totalStars,
        topLanguages: developers.topLanguages,
        rankLevel: developers.rankLevel,
        rankScore: developers.rankScore,
        percentileCl: developers.percentileCl,
        rankLocation: developers.rankLocation,
        rankCountry: developers.rankCountry,
        profileUrl: developers.profileUrl,
        rawLocation: developers.rawLocation,
        portfolioUrl: developers.portfolioUrl,
        description: developers.description,
        role: developers.role,
        claimedAt: developers.claimedAt,
        locationName: locations.name,
        locationKind: locations.kind,
      })
      .from(developers)
      .innerJoin(locations, eq(developers.locationId, locations.id))
      .where(eq(developers.login, login))
      .limit(2);

    if (rows.length > 1) {
      this.logger.error(
        `Duplicate developer login "${login}" (${rows.length} rows); run migration 0006`,
      );
      throw new InternalServerErrorException(
        'Duplicate developer login; data migration required',
      );
    }

    const [row] = rows;

    if (!row) {
      return null;
    }

    return this.mapDeveloperDetail(row);
  }

  async updateMyProfile(githubId: string, input: UpdateProfileInput) {
    const [existing] = await this.db
      .select({ githubId: developers.githubId })
      .from(developers)
      .where(eq(developers.githubId, githubId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Your profile is not indexed yet');
    }

    const updates: Partial<typeof developers.$inferInsert> = {};
    if (input.portfolioUrl !== undefined) {
      updates.portfolioUrl = input.portfolioUrl;
    }
    if (input.description !== undefined) {
      updates.description = input.description;
    }
    if (input.role !== undefined) {
      updates.role = input.role;
    }

    if (Object.keys(updates).length === 0) {
      throw new BadRequestException('No profile fields provided');
    }

    await this.db
      .update(developers)
      .set(updates)
      .where(eq(developers.githubId, githubId));

    const [row] = await this.db
      .select({
        login: developers.login,
        name: developers.name,
        avatarUrl: developers.avatarUrl,
        contributions: developers.contributions,
        followers: developers.followers,
        totalStars: developers.totalStars,
        topLanguages: developers.topLanguages,
        rankLevel: developers.rankLevel,
        rankScore: developers.rankScore,
        percentileCl: developers.percentileCl,
        rankLocation: developers.rankLocation,
        rankCountry: developers.rankCountry,
        profileUrl: developers.profileUrl,
        rawLocation: developers.rawLocation,
        portfolioUrl: developers.portfolioUrl,
        description: developers.description,
        role: developers.role,
        claimedAt: developers.claimedAt,
        locationName: locations.name,
        locationKind: locations.kind,
      })
      .from(developers)
      .innerJoin(locations, eq(developers.locationId, locations.id))
      .where(eq(developers.githubId, githubId))
      .limit(1);

    return this.mapDeveloperDetail(row);
  }

  async getStats() {
    const [country] = await this.db
      .select()
      .from(locations)
      .where(eq(locations.slug, 'chile'))
      .limit(1);

    const [{ totalDevs }] = await this.db
      .select({ totalDevs: count() })
      .from(developers);

    const [{ totalContributions }] = await this.db
      .select({ totalContributions: sum(developers.contributions) })
      .from(developers);

    const countryLevelDevs = country
      ? await this.db
          .select({ devCount: count() })
          .from(developers)
          .where(eq(developers.locationId, country.id))
      : [{ devCount: 0 }];

    const mapLocations = await this.getMapData();

    const [lastSync] = await this.db
      .select({
        finishedAt: syncRuns.finishedAt,
        locationName: locations.name,
      })
      .from(syncRuns)
      .leftJoin(locations, eq(syncRuns.lastLocationId, locations.id))
      .where(eq(syncRuns.status, 'completed'))
      .orderBy(desc(syncRuns.finishedAt))
      .limit(1);

    return {
      totalDevs: Number(totalDevs),
      totalContributions: Number(totalContributions ?? 0),
      countryLevelDevs: Number(countryLevelDevs[0]?.devCount ?? 0),
      locationsWithDevs: mapLocations.length,
      lastUpdate:
        lastSync?.finishedAt != null
          ? {
              at: lastSync.finishedAt.toISOString(),
              location: lastSync.locationName ?? null,
            }
          : null,
    };
  }

  async getPromotedReposInViewport(input: ReposViewportInput) {
    const { bbox, limit } = input;
    const regionLocations = alias(locations, 'region_locations');

    const rows = await this.db
      .select({
        repoGithubId: repoCandidates.repoGithubId,
        nameWithOwner: repoCandidates.nameWithOwner,
        name: repoCandidates.name,
        description: repoCandidates.description,
        url: repoCandidates.url,
        primaryLanguage: repoCandidates.primaryLanguage,
        stars: repoCandidates.stars,
        forks: repoCandidates.forks,
        regionRank: repoCandidates.regionRank,
        countryRank: repoCandidates.countryRank,
        scatterLat: repoCandidates.scatterLat,
        scatterLng: repoCandidates.scatterLng,
        ownerLogin: developers.login,
        ownerName: developers.name,
        ownerAvatarUrl: developers.avatarUrl,
        ownerProfileUrl: developers.profileUrl,
        regionSlug: regionLocations.slug,
        regionName: regionLocations.name,
      })
      .from(repoCandidates)
      .innerJoin(
        developers,
        eq(repoCandidates.ownerGithubId, developers.githubId),
      )
      .leftJoin(
        regionLocations,
        eq(repoCandidates.regionLocationId, regionLocations.id),
      )
      .where(
        and(
          eq(repoCandidates.status, 'promoted'),
          isNotNull(repoCandidates.scatterLat),
          isNotNull(repoCandidates.scatterLng),
          gte(repoCandidates.scatterLng, bbox.minLng),
          lte(repoCandidates.scatterLng, bbox.maxLng),
          gte(repoCandidates.scatterLat, bbox.minLat),
          lte(repoCandidates.scatterLat, bbox.maxLat),
        ),
      )
      .orderBy(desc(repoCandidates.stars), asc(repoCandidates.repoGithubId))
      .limit(limit);

    return rows.map((row) => mapPromotedRepoRow(row));
  }

  async getPromotedReposList(input: ReposListInput) {
    const pageSize = Math.max(1, Math.min(input.limit, MAX_REPOS_PAGE_SIZE));
    let decodedCursor: RepoCursor | null = null;

    if (input.cursor) {
      decodedCursor = decodeRepoCursor(input.cursor);
      if (!decodedCursor) {
        throw new BadRequestException('Invalid pagination cursor');
      }
    }

    const regionLocations = alias(locations, 'region_locations');
    const filters: SQL[] = [eq(repoCandidates.status, 'promoted')];

    if (input.regionSlug) {
      const [region] = await this.db
        .select({ id: locations.id, slug: locations.slug, name: locations.name })
        .from(locations)
        .where(
          and(eq(locations.slug, input.regionSlug), eq(locations.kind, 'region')),
        )
        .limit(1);

      if (!region) {
        throw new NotFoundException(`Region "${input.regionSlug}" not found`);
      }

      filters.push(eq(repoCandidates.regionLocationId, region.id));
    }

    if (decodedCursor) {
      filters.push(buildRepoCursorFilter(decodedCursor));
    }

    const whereClause = and(...filters);

    const rows = await this.db
      .select({
        repoGithubId: repoCandidates.repoGithubId,
        nameWithOwner: repoCandidates.nameWithOwner,
        name: repoCandidates.name,
        description: repoCandidates.description,
        url: repoCandidates.url,
        primaryLanguage: repoCandidates.primaryLanguage,
        stars: repoCandidates.stars,
        forks: repoCandidates.forks,
        regionRank: repoCandidates.regionRank,
        countryRank: repoCandidates.countryRank,
        scatterLat: repoCandidates.scatterLat,
        scatterLng: repoCandidates.scatterLng,
        ownerLogin: developers.login,
        ownerName: developers.name,
        ownerAvatarUrl: developers.avatarUrl,
        ownerProfileUrl: developers.profileUrl,
        regionSlug: regionLocations.slug,
        regionName: regionLocations.name,
      })
      .from(repoCandidates)
      .innerJoin(
        developers,
        eq(repoCandidates.ownerGithubId, developers.githubId),
      )
      .leftJoin(
        regionLocations,
        eq(repoCandidates.regionLocationId, regionLocations.id),
      )
      .where(whereClause)
      .orderBy(desc(repoCandidates.stars), asc(repoCandidates.repoGithubId))
      .limit(pageSize + 1);

    const hasMore = rows.length > pageSize;
    const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
    const lastRow = pageRows.at(-1);
    const nextCursor =
      hasMore && lastRow
        ? encodeRepoCursor(lastRow.stars, lastRow.repoGithubId)
        : null;

    const response: {
      repos: ReturnType<typeof mapPromotedRepoRow>[];
      nextCursor: string | null;
      hasMore: boolean;
      total?: number;
      region?: { slug: string; name: string } | null;
    } = {
      repos: pageRows.map((row) => mapPromotedRepoRow(row)),
      nextCursor,
      hasMore,
    };

    if (!decodedCursor) {
      const [{ total }] = await this.db
        .select({ total: count() })
        .from(repoCandidates)
        .where(whereClause);

      response.total = Number(total);

      if (input.regionSlug) {
        const [region] = await this.db
          .select({ slug: locations.slug, name: locations.name })
          .from(locations)
          .where(eq(locations.slug, input.regionSlug))
          .limit(1);
        response.region = region ?? null;
      } else {
        response.region = null;
      }
    }

    return response;
  }

  async getPromotedRepoByNameWithOwner(nameWithOwner: string) {
    const trimmed = nameWithOwner.trim();
    if (!trimmed) {
      return null;
    }

    const regionLocations = alias(locations, 'region_locations');

    const rows = await this.db
      .select({
        repoGithubId: repoCandidates.repoGithubId,
        nameWithOwner: repoCandidates.nameWithOwner,
        name: repoCandidates.name,
        description: repoCandidates.description,
        url: repoCandidates.url,
        primaryLanguage: repoCandidates.primaryLanguage,
        stars: repoCandidates.stars,
        forks: repoCandidates.forks,
        regionRank: repoCandidates.regionRank,
        countryRank: repoCandidates.countryRank,
        scatterLat: repoCandidates.scatterLat,
        scatterLng: repoCandidates.scatterLng,
        ownerLogin: developers.login,
        ownerName: developers.name,
        ownerAvatarUrl: developers.avatarUrl,
        ownerProfileUrl: developers.profileUrl,
        regionSlug: regionLocations.slug,
        regionName: regionLocations.name,
      })
      .from(repoCandidates)
      .innerJoin(
        developers,
        eq(repoCandidates.ownerGithubId, developers.githubId),
      )
      .leftJoin(
        regionLocations,
        eq(repoCandidates.regionLocationId, regionLocations.id),
      )
      .where(
        and(
          eq(repoCandidates.status, 'promoted'),
          eq(repoCandidates.nameWithOwner, trimmed),
        ),
      )
      .limit(1);

    const [row] = rows;
    if (!row) {
      return null;
    }

    return mapPromotedRepoRow(row);
  }
}
