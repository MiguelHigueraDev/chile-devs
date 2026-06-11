import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  lt,
  ne,
  or,
  sql,
  sum,
} from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../db/db.module';
import { developers, locations } from '../db/schema';

const MAX_DEVELOPERS_PAGE_SIZE = 10;

type DeveloperCursor = {
  contributions: number;
  githubId: string;
};

function encodeCursor(contributions: number, githubId: string): string {
  return Buffer.from(`${contributions}:${githubId}`).toString('base64url');
}

function decodeCursor(cursor: string): DeveloperCursor | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const separatorIndex = decoded.lastIndexOf(':');
    if (separatorIndex === -1) {
      return null;
    }

    const contributions = Number(decoded.slice(0, separatorIndex));
    const githubId = decoded.slice(separatorIndex + 1);
    if (!Number.isFinite(contributions) || !githubId) {
      return null;
    }

    return { contributions, githubId };
  } catch {
    return null;
  }
}

@Injectable()
export class ApiService {
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

  async getLocationDevelopers(
    slug: string,
    limit = MAX_DEVELOPERS_PAGE_SIZE,
    cursor?: string,
  ) {
    const pageSize = Math.min(limit, MAX_DEVELOPERS_PAGE_SIZE);
    const decodedCursor = cursor ? decodeCursor(cursor) : null;

    const [location] = await this.db
      .select()
      .from(locations)
      .where(eq(locations.slug, slug))
      .limit(1);

    if (!location) {
      return null;
    }

    const locationFilter = eq(developers.locationId, location.id);
    const cursorFilter = decodedCursor
      ? or(
          lt(developers.contributions, decodedCursor.contributions),
          and(
            eq(developers.contributions, decodedCursor.contributions),
            gt(developers.githubId, decodedCursor.githubId),
          ),
        )
      : undefined;

    const devs = await this.db
      .select({
        githubId: developers.githubId,
        login: developers.login,
        name: developers.name,
        avatarUrl: developers.avatarUrl,
        contributions: developers.contributions,
        followers: developers.followers,
        profileUrl: developers.profileUrl,
        rawLocation: developers.rawLocation,
      })
      .from(developers)
      .where(cursorFilter ? and(locationFilter, cursorFilter) : locationFilter)
      .orderBy(desc(developers.contributions), asc(developers.githubId))
      .limit(pageSize + 1);

    const hasMore = devs.length > pageSize;
    const pageDevs = hasMore ? devs.slice(0, pageSize) : devs;
    const lastDev = pageDevs.at(-1);
    const nextCursor =
      hasMore && lastDev
        ? encodeCursor(lastDev.contributions, lastDev.githubId)
        : null;

    const developersResponse = pageDevs.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ githubId: _githubId, ...developer }) => developer,
    );

    if (decodedCursor) {
      return {
        developers: developersResponse,
        nextCursor,
        hasMore,
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
      developers: developersResponse,
      nextCursor,
      hasMore,
    };
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

    return {
      totalDevs: Number(totalDevs),
      totalContributions: Number(totalContributions ?? 0),
      countryLevelDevs: Number(countryLevelDevs[0]?.devCount ?? 0),
      locationsWithDevs: mapLocations.length,
    };
  }
}
