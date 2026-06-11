import { Inject, Injectable } from '@nestjs/common';
import { count, desc, eq, ne, sql, sum } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../db/db.module';
import { developers, locations } from '../db/schema';

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

  async getLocationDevelopers(slug: string, limit = 10) {
    const [location] = await this.db
      .select()
      .from(locations)
      .where(eq(locations.slug, slug))
      .limit(1);

    if (!location) {
      return null;
    }

    const devs = await this.db
      .select({
        login: developers.login,
        name: developers.name,
        avatarUrl: developers.avatarUrl,
        contributions: developers.contributions,
        followers: developers.followers,
        profileUrl: developers.profileUrl,
        rawLocation: developers.rawLocation,
      })
      .from(developers)
      .where(eq(developers.locationId, location.id))
      .orderBy(desc(developers.contributions))
      .limit(limit);

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
      developers: devs,
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
