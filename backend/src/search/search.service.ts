import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  countDistinct,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../db/db.module';
import {
  developerLanguages,
  developers,
  locations,
  type TopLanguage,
} from '../db/schema';
import {
  LOCATION_CATALOG,
  LOCATION_SLUGS,
  resolveLocationSlugs,
} from './geo.data';
import {
  MAX_SEARCH_RESULTS,
  normalizeSearchInput,
  type ParsedQuery,
  type SearchFacetsResponse,
  type SearchInterpretation,
  ZONE_LABELS,
} from './search.types';

const NO_MATCHING_LOCATION_ID = -1;

type DeveloperRow = {
  login: string;
  name: string | null;
  avatarUrl: string;
  contributions: number;
  followers: number;
  totalStars: number;
  topLanguages: TopLanguage[];
  rankLevel: string | null;
  rankScore: number | null;
  percentileCl: number | null;
  rankLocation: number | null;
  rankCountry: number | null;
  profileUrl: string;
  rawLocation: string | null;
};

const developerSelect = {
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
} as const;

@Injectable()
export class SearchService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async search(parsedInput: ParsedQuery) {
    const parsed = this.validateAndNormalize(parsedInput);
    const resolvedLocationSlugs = [
      ...resolveLocationSlugs(parsed.locationSlugs, parsed.zone),
    ];
    const interpretation = this.buildInterpretation(
      parsed,
      resolvedLocationSlugs,
    );
    const developersResult = await this.executeSearch(
      parsed,
      resolvedLocationSlugs,
    );

    return {
      interpretation,
      developers: developersResult,
    };
  }

  async getFacets(): Promise<SearchFacetsResponse> {
    const languageRows = await this.db
      .select({
        name: developerLanguages.language,
        count: countDistinct(developerLanguages.developerGithubId),
      })
      .from(developerLanguages)
      .groupBy(developerLanguages.language)
      .orderBy(desc(countDistinct(developerLanguages.developerGithubId)));

    const validSlugs = new Set(LOCATION_SLUGS);

    return {
      languages: languageRows.map((row) => ({
        name: row.name,
        count: Number(row.count),
      })),
      locations: LOCATION_CATALOG.filter(
        (location) =>
          location.kind !== 'country' && validSlugs.has(location.slug),
      ).map((location) => ({
        slug: location.slug,
        name: location.name,
        kind: location.kind as 'region' | 'city',
      })),
      zones: (['north', 'central', 'south'] as const).map((zone) => ({
        id: zone,
        label: ZONE_LABELS[zone],
      })),
    };
  }

  private validateAndNormalize(parsedInput: ParsedQuery): ParsedQuery {
    const normalized = normalizeSearchInput(parsedInput);
    const validSlugs = new Set(LOCATION_SLUGS);

    return {
      ...normalized,
      locationSlugs: normalized.locationSlugs.filter((slug) =>
        validSlugs.has(slug),
      ),
    };
  }

  private buildInterpretation(
    parsed: ParsedQuery,
    resolvedLocationSlugs: string[],
  ): SearchInterpretation {
    return {
      ...parsed,
      resolvedLocationSlugs,
    };
  }

  private async executeSearch(
    parsed: ParsedQuery,
    resolvedLocationSlugs: string[],
  ): Promise<DeveloperRow[]> {
    const filters: SQL[] = [];
    const languageFilters = this.buildLanguageFilters(parsed);
    if (languageFilters) {
      filters.push(languageFilters);
    }

    const locationFilter = await this.buildLocationFilter(
      resolvedLocationSlugs,
    );
    if (locationFilter) {
      filters.push(locationFilter);
    }

    const personFilter = this.buildPersonFilter(parsed);
    if (personFilter) {
      filters.push(personFilter);
    }

    const shareLanguage = this.resolveShareLanguage(parsed);
    const whereClause =
      filters.length === 0
        ? undefined
        : filters.length === 1
          ? filters[0]
          : and(...filters);

    if (parsed.sort === 'languageShare' && shareLanguage) {
      const rows = await this.db
        .select(developerSelect)
        .from(developers)
        .innerJoin(
          developerLanguages,
          and(
            eq(developerLanguages.developerGithubId, developers.githubId),
            eq(developerLanguages.language, shareLanguage),
          ),
        )
        .where(whereClause)
        .orderBy(
          desc(developerLanguages.share),
          desc(developers.totalStars),
          asc(developers.login),
        )
        .limit(MAX_SEARCH_RESULTS);

      return rows;
    }

    const sortColumn =
      parsed.sort === 'followers'
        ? developers.followers
        : parsed.sort === 'stars'
          ? developers.totalStars
          : parsed.sort === 'rank'
            ? developers.rankScore
            : developers.contributions;

    const rows = await this.db
      .select(developerSelect)
      .from(developers)
      .where(whereClause)
      .orderBy(
        ...(parsed.sort === 'rank'
          ? [
              asc(developers.rankScore),
              desc(developers.totalStars),
              desc(developers.followers),
              desc(developers.contributions),
              asc(developers.login),
            ]
          : [desc(sortColumn), asc(developers.login)]),
      )
      .limit(MAX_SEARCH_RESULTS);

    return rows;
  }

  private buildLanguageFilters(parsed: ParsedQuery): SQL | undefined {
    if (parsed.languages.length === 0) {
      return undefined;
    }

    const perLanguage = parsed.languages.map((language) =>
      exists(
        this.db
          .select({ one: sql`1` })
          .from(developerLanguages)
          .where(
            and(
              eq(developerLanguages.developerGithubId, developers.githubId),
              eq(developerLanguages.language, language),
            ),
          ),
      ),
    );

    if (parsed.languageMode === 'all') {
      return and(...perLanguage);
    }

    return perLanguage.length === 1 ? perLanguage[0] : or(...perLanguage);
  }

  private async buildLocationFilter(
    resolvedLocationSlugs: string[],
  ): Promise<SQL | undefined> {
    if (resolvedLocationSlugs.length === 0) {
      return undefined;
    }

    const matchedLocations = await this.db
      .select({ id: locations.id })
      .from(locations)
      .where(inArray(locations.slug, [...resolvedLocationSlugs]));

    if (matchedLocations.length === 0) {
      return eq(developers.locationId, NO_MATCHING_LOCATION_ID);
    }

    return inArray(
      developers.locationId,
      matchedLocations.map((location) => location.id),
    );
  }

  private buildPersonFilter(parsed: ParsedQuery): SQL | undefined {
    const clauses: SQL[] = [];

    if (parsed.username) {
      clauses.push(
        ilike(developers.login, `%${escapeLikePattern(parsed.username)}%`),
      );
    }

    if (parsed.displayName) {
      clauses.push(
        ilike(developers.name, `%${escapeLikePattern(parsed.displayName)}%`),
      );
    }

    if (clauses.length === 0) {
      return undefined;
    }

    return clauses.length === 1 ? clauses[0] : or(...clauses);
  }

  private resolveShareLanguage(parsed: ParsedQuery): string | null {
    if (parsed.shareLanguage) {
      return parsed.shareLanguage;
    }

    if (parsed.sort === 'languageShare' && parsed.languages.length === 1) {
      return parsed.languages[0] ?? null;
    }

    return null;
  }
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
