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
  isNull,
  lt,
  ne,
  or,
  sql,
  sum,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../db/db.module';
import { developers, locations, syncRuns } from '../db/schema';
import type { UpdateProfileInput } from './update-profile.dto';

const MAX_DEVELOPERS_PAGE_SIZE = 10;

export const DEVELOPER_SORT_KEYS = [
  'contributions',
  'followers',
  'stars',
  'rank',
] as const;

export type DeveloperSortKey = (typeof DEVELOPER_SORT_KEYS)[number];

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
  if (!sort || sort === 'contributions') {
    return 'contributions';
  }
  if (sort === 'followers' || sort === 'stars' || sort === 'rank') {
    return sort;
  }
  return 'contributions';
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
    locationId?: number,
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
      locationId != null ? eq(developers.locationId, locationId) : undefined;
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
        profileUrl: developers.profileUrl,
        rawLocation: developers.rawLocation,
      })
      .from(developers)
      .where(whereClause)
      .orderBy(
        sortAscending ? asc(sortColumn) : desc(sortColumn),
        asc(developers.githubId),
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

  async getLocationDevelopers(
    slug: string,
    limit = MAX_DEVELOPERS_PAGE_SIZE,
    cursor?: string,
    sort: DeveloperSortKey = 'contributions',
  ) {
    const [location] = await this.db
      .select()
      .from(locations)
      .where(eq(locations.slug, slug))
      .limit(1);

    if (!location) {
      return null;
    }

    const page = await this.paginateDevelopers(
      limit,
      cursor,
      sort,
      location.id,
    );

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
      .from(developers)
      .where(eq(developers.locationId, location.id));

    const [{ totalContributions }] = await this.db
      .select({ totalContributions: sum(developers.contributions) })
      .from(developers)
      .where(eq(developers.locationId, location.id));

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
    sort: DeveloperSortKey = 'contributions',
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
    profileUrl: string;
    rawLocation: string | null;
    portfolioUrl: string | null;
    description: string | null;
    role: string | null;
    claimedAt: Date | null;
    locationName: string;
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
      profileUrl: row.profileUrl,
      rawLocation: row.rawLocation,
      locationName: row.locationName,
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
        profileUrl: developers.profileUrl,
        rawLocation: developers.rawLocation,
        portfolioUrl: developers.portfolioUrl,
        description: developers.description,
        role: developers.role,
        claimedAt: developers.claimedAt,
        locationName: locations.name,
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
        profileUrl: developers.profileUrl,
        rawLocation: developers.rawLocation,
        portfolioUrl: developers.portfolioUrl,
        description: developers.description,
        role: developers.role,
        claimedAt: developers.claimedAt,
        locationName: locations.name,
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
}
